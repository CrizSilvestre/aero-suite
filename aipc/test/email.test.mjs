// test/email.test.mjs — pipeline completo: RAW + PDF → Excel adjunto + correo navy → .eml.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseAmsClipboard } from '../src/amsParse.mjs';
import { toApcRows } from '../src/flightTransform.mjs';
import { fillApcTemplate } from '../src/xlsxApc.mjs';
import { itemsFromTextContent, parseSchedule } from '../src/pdfSchedule.mjs';
import { buildSupervisorAssignment } from '../src/supervisorEngine.mjs';
import { buildEmailHtml } from '../src/emailTemplate.mjs';
import { buildEml } from '../src/eml.mjs';
import { CONFIG } from '../src/config.mjs';

const TEMPLATE = '/Users/usuario/Downloads/CAE-GOA-F23 Asignación de Correas, Posiciones & Gates APC-Plantilla.xlsx';
const SCHED = '/Users/usuario/Downloads/Horario Airside Junio 2026 - Mandos Medios - 05JUN26-f8bfkaj3nb89fqbqirhtxkefga (1).pdf';
const DAY = '2026-06-20';

// Excel adjunto
const tsv = readFileSync(new URL('./datos_raw.tsv', import.meta.url), 'utf8');
const apcRows = toApcRows(parseAmsClipboard(tsv), { reportDay: DAY });
const xlsxBuf = await fillApcTemplate(readFileSync(TEMPLATE), apcRows, { reportDay: DAY });

// Supervisores
const doc = await getDocument({ data: new Uint8Array(readFileSync(SCHED)), useSystemFonts: true, isEvalSupported: false }).promise;
const sched = parseSchedule(itemsFromTextContent(await (await doc.getPage(1)).getTextContent()));
const groups = buildSupervisorAssignment(sched, { day: 20 });

// Correo + .eml con adjunto
const html = buildEmailHtml(groups, { reportDay: DAY });
const eml = buildEml({
  subject: CONFIG.subject,
  bcc: ['ops1@example.com'],
  html,
  attachments: [{ filename: CONFIG.attachmentName, content: xlsxBuf, contentType: CONFIG.attachmentMime }],
});
writeFileSync('/Users/usuario/Desktop/AIPC-PRUEBA.eml', eml);

let fails = 0;
const ok = (n, c) => { console.log(`${c ? '✓' : '✗'} ${n}`); if (!c) fails++; };

const subjRaw = (eml.match(/\r\nSubject: (.+)\r\n/) || [])[1] || '';
const subjDecoded = /^=\?UTF-8\?B\?/.test(subjRaw) ? Buffer.from(subjRaw.replace(/^=\?UTF-8\?B\?(.+)\?=$/, '$1'), 'base64').toString('utf8') : subjRaw;
ok('asunto correcto (UTF-8 codificado)', subjDecoded === 'Asignación de Correas, Posiciones & Gates AIPC');
ok('X-Unsent (borrador Outlook)', /\r\nX-Unsent: 1\r\n/.test(eml));
ok('multipart/mixed', /multipart\/mixed/.test(eml));
ok('adjunto .xlsx', /Content-Disposition: attachment; filename=".*\.xlsx"/.test(eml));

const htmlPart = Buffer.from(eml.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString('utf8');
ok('cuerpo · Saludos / Estimados', /Saludos/.test(htmlPart) && /Estimados,/.test(htmlPart));
ok('cuerpo · fecha media "20 de junio 2026"', /20 de junio 2026/.test(htmlPart));
ok('cuerpo · Terminal A & Terminal B', /Terminal A &amp; Terminal B/.test(htmlPart));
ok('cuerpo · dashboard + slots', /dashboard\.puntacanainternationalairport\.com/.test(htmlPart) && /slotspuntacana@ams\.com\.do/.test(htmlPart));
ok('tabla navy · encabezado azul + título', new RegExp(CONFIG.navyColor).test(htmlPart) && /SUPERVISOR DE CENTRO OPERACIONES/.test(htmlPart) && /HORARIO/.test(htmlPart));
ok('tabla navy · fila de supervisor con teléfono', /MARY ZAIDA CASTILLO - \(\d{3}\)/.test(htmlPart) && /08:00-17:00/.test(htmlPart));
ok('tabla navy · título superior "SUPERVISORES…AIRSIDE…"', /SUPERVISORES DE OPERACIONES AIRSIDE EN TURNO/.test(htmlPart));
ok('tabla navy · ancho 530px (coincide con la firma)', /width:530px/.test(htmlPart));

// Continuidad en Outlook de escritorio (motor de Word): la fuente debe ir EN CADA
// <p> y <td>, no heredada del contenedor — si no, en la PC del trabajo caen a Times
// New Roman y el correo "se ve más feo". Estas aserciones fijan ese fix.
const tags = (re) => htmlPart.match(re) || [];
const everyHasFont = (arr) => arr.length > 0 && arr.every((t) => /font-family/.test(t));
ok('Word-safe · cada <p> del cuerpo trae font-family', everyHasFont(tags(/<p\b[^>]*>/g)));
ok('Word-safe · cada <td> de la tabla trae font-family', everyHasFont(tags(/<td\b[^>]*>/g)));
ok('Word-safe · cada <a> (enlace) trae font-family', everyHasFont(tags(/<a\b[^>]*>/g)));
ok('Word-safe · interlineado en pt + mso-line-height-rule', /mso-line-height-rule:exactly/.test(htmlPart) && /line-height:17pt/.test(htmlPart));
ok('Word-safe · anchos de columna como atributo (Word ignora colgroup)', /<td width="30"/.test(htmlPart) && /<td width="95"/.test(htmlPart));

// Outlook Web (OWA) sanea el HTML al pegar: el color de fondo debe ir como ATRIBUTO
// bgcolor (no solo shorthand "background"), alineación y bordes como atributos también.
ok('OWA · encabezados navy con bgcolor de atributo', new RegExp(`bgcolor="${CONFIG.navyColor}"`).test(htmlPart));
ok('OWA · sin shorthand "background:" (usa background-color)', !/style="[^"]*background:#/.test(htmlPart) && /background-color:/.test(htmlPart));
ok('OWA · celdas con align (center/left) de atributo', /<td[^>]*align="center"/.test(htmlPart) && /<td[^>]*align="left"/.test(htmlPart));
ok('OWA · tabla con border="1" + border-collapse (rejilla 1px sin duplicar)', /<table[^>]*border="1"[^>]*/.test(htmlPart) && /border-collapse:collapse/.test(htmlPart));

// adjunto: decodificar y comprobar firma ZIP de un .xlsx (PK)
const attSeg = eml.split('Content-Disposition: attachment')[1];   // "; filename=...\r\n\r\n<b64>\r\n--bnd--"
const attB64 = attSeg.split('\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, '');
const attBytes = Buffer.from(attB64, 'base64');
ok('adjunto es un .xlsx válido (firma PK)', attBytes[0] === 0x50 && attBytes[1] === 0x4B);

console.log(`\nEscrito ~/Desktop/AIPC-PRUEBA.eml (${(eml.length / 1024).toFixed(0)} KB)`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
