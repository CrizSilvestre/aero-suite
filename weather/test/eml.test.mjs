// test/eml.test.mjs — build the corporate HTML + .eml from the real PDF and
// verify the MIME artifact Outlook will open. Also writes a sample Weather.eml.
import { readFileSync, writeFileSync } from 'node:fs';
import { getDocument } from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { linesFromItems } from '../src/pdfText.mjs';
import { parseReport } from '../src/parser.mjs';
import { buildEmailHtml } from '../src/emailTemplate.mjs';
import { buildEml } from '../src/eml.mjs';

const file = process.argv[2]
  || '/Users/usuario/Downloads/PRONOSTICO EXTENDIDO-18-06-2026-1700Z-FM.pdf';

const data = new Uint8Array(readFileSync(file));
const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
const lines = [];
for (let p = 1; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent();
  lines.push(...linesFromItems(tc.items));
}
const report = parseReport(lines, { filename: file.split('/').pop() });

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const images = { radar: { cid: 'radar' }, windy: { cid: 'windy' } };
const html = buildEmailHtml(report, images);
const eml = buildEml({
  subject: 'Weather',
  bcc: ['ops1@example.com', 'ops2@example.com'],
  html,
  images: [
    { cid: 'radar', filename: 'radar.png', dataUrl: PNG },
    { cid: 'windy', filename: 'windy.png', dataUrl: PNG },
  ],
});

writeFileSync(new URL('./Weather.sample.eml', import.meta.url), eml);

let fails = 0;
const ok = (n, c) => { console.log(`${c ? '✓' : '✗'} ${n}`); if (!c) fails++; };

ok('header X-Unsent: 1 (opens as draft)', /\r\nX-Unsent: 1\r\n/.test(eml));
ok('Subject: Weather', /\r\nSubject: Weather\r\n/.test(eml));
ok('Bcc present', /\r\nBcc: .+@.+\r\n/.test(eml));
ok('multipart/related', /multipart\/related/.test(eml));
ok('inline radar cid', /Content-ID: <radar>/.test(eml) && /Content-Disposition: inline/.test(eml));
ok('CRLF line endings (no bare LF)', eml.includes('\r\n') && !/[^\r]\n/.test(eml) && !/^\n/.test(eml));

const htmlPart = Buffer.from(eml.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString('utf8');
ok('html decodes to Arial 12pt', /font-family:Arial/.test(htmlPart) && /font-size:12pt/.test(htmlPart));
// Continuidad en Outlook de escritorio (motor de Word): la fuente debe ir EN CADA
// <p>, no heredada del <div> — si no, en una PC corporativa el texto cae a Times
// New Roman y el correo "se ve más feo". Esto fija ese blindaje.
const everyPHasFont = (() => { const t = htmlPart.match(/<p\b[^>]*>/g) || []; return t.length > 0 && t.every((x) => /font-family/.test(x)); })();
ok('Word-safe · cada <p> trae font-family (no Times New Roman en Outlook)', everyPHasFont);
ok('Word-safe · interlineado en pt + mso-line-height-rule', /mso-line-height-rule:exactly/.test(htmlPart) && /line-height:17pt/.test(htmlPart));
ok('html has fixed structure', /PUNTA CANA Y ÁREAS VECINAS:/.test(htmlPart) && /PRONOSTICO MARINO EXTENDIDO/.test(htmlPart));
ok('html references inline images', /cid:radar/.test(htmlPart) && /cid:windy/.test(htmlPart));
ok('html has 4 day blocks', (htmlPart.match(/<strong>(Jueves|Viernes|Sábado|Domingo y lunes):<\/strong>/g) || []).length === 4);
ok('html has sun times', /Salida del Sol/.test(htmlPart) && /6:03/.test(htmlPart) && /19:18/.test(htmlPart));

console.log(`\nWrote test/Weather.sample.eml (${eml.length} bytes)`);
console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
