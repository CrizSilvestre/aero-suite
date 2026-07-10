// test/emailImage.test.mjs — tabla de supervisores como IMAGEN en el correo:
//  - buildEmailHtml con supervisorImg → <img> (cid o data URL) en lugar de la tabla HTML.
//  - buildEml con images → multipart/related anidado + Content-ID (imagen inline de Outlook).
// (El rasterizado real —canvas— es de navegador; aquí se prueba el cableado del correo.)
import { buildEmailHtml } from '../src/emailTemplate.mjs';
import { buildEml } from '../src/eml.mjs';
import { CONFIG } from '../src/config.mjs';

const DAY = '2026-06-20';
const groups = [{ key: 'Centro', title: 'x', rows: [{ n: 1, name: 'MARY ZAIDA CASTILLO', phone: '(809) 206-6038', shift: '08:00-16:00' }] }];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let fails = 0;
const ok = (n, c) => { console.log(`${c ? '✓' : '✗'} ${n}`); if (!c) fails++; };

// --- cuerpo con imagen (cid) ---
const htmlCid = buildEmailHtml(groups, { reportDay: DAY, supervisorImg: { src: 'cid:supervisores@aipc', width: 530, height: 200 } });
ok('cuerpo · usa <img> cid en vez de la tabla HTML', /<img[^>]+src="cid:supervisores@aipc"/.test(htmlCid) && !/SUPERVISOR DE CENTRO OPERACIONES/.test(htmlCid));
ok('cuerpo · <img> con width/height y alt', /width="530"/.test(htmlCid) && /height="200"/.test(htmlCid) && /alt="[^"]+"/.test(htmlCid));

// --- cuerpo con imagen (data URL para pegar en webmail) ---
const htmlData = buildEmailHtml(groups, { reportDay: DAY, supervisorImg: { src: PNG, width: 530, height: 200 } });
ok('cuerpo · data URL en línea para webmail', htmlData.includes(`src="${PNG}"`));

// --- respaldo: sin imagen → tabla HTML navy (compatibilidad) ---
const htmlTable = buildEmailHtml(groups, { reportDay: DAY });
ok('respaldo · sin imagen cae a la tabla HTML navy', /SUPERVISOR DE CENTRO OPERACIONES/.test(htmlTable) && !/<img/.test(htmlTable));

// --- .eml con imagen inline ---
const eml = buildEml({
  subject: CONFIG.subject, bcc: ['a@b.com'], html: htmlCid,
  attachments: [{ filename: 'x.xlsx', content: 'UEs=', contentType: CONFIG.attachmentMime }],
  images: [{ cid: 'supervisores@aipc', filename: 'supervisores.png', dataUrl: PNG }],
});
ok('.eml · multipart/mixed (contenedor)', /Content-Type: multipart\/mixed/.test(eml));
ok('.eml · multipart/related anidado (html + imagen)', /Content-Type: multipart\/related; type="text\/html"/.test(eml));
ok('.eml · imagen con Content-ID + inline', /Content-ID: <supervisores@aipc>/.test(eml) && /Content-Disposition: inline; filename="supervisores.png"/.test(eml));
ok('.eml · adjunto .xlsx sigue presente', /Content-Disposition: attachment; filename="x\.xlsx"/.test(eml));
ok('.eml · X-Unsent (borrador Outlook)', /\r\nX-Unsent: 1\r\n/.test(eml));

// --- .eml sin imágenes → estructura plana (comportamiento previo) ---
const emlFlat = buildEml({ subject: 'x', html: '<p>hola</p>', attachments: [{ filename: 'y.xlsx', content: 'UEs=' }] });
ok('.eml · sin imágenes: multipart/mixed plano (sin related)', /multipart\/mixed/.test(emlFlat) && !/multipart\/related/.test(emlFlat));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
