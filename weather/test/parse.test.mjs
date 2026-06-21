// test/parse.test.mjs — verifies the parser against the REAL ONAMET PDF,
// using the same pdf.js text-reconstruction the browser app uses.
//   node test/parse.test.mjs "/path/to/PRONOSTICO ...pdf"
import { readFileSync } from 'node:fs';
import { getDocument } from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { linesFromItems } from '../src/pdfText.mjs';
import { parseReport } from '../src/parser.mjs';

const file = process.argv[2]
  || '/Users/usuario/Downloads/PRONOSTICO EXTENDIDO-18-06-2026-1700Z-FM.pdf';
const filename = file.split('/').pop();

const data = new Uint8Array(readFileSync(file));
const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
const lines = [];
for (let p = 1; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent();
  lines.push(...linesFromItems(tc.items));
}

const r = parseReport(lines, { filename });
console.log(JSON.stringify(r, null, 2));

let fails = 0;
const ok = (name, cond) => { console.log(`${cond ? '✓' : '✗'} ${name}`); if (!cond) fails++; };
console.log('\n--- assertions ---');
ok('date iso 2026-06-18', r.meta.date?.iso === '2026-06-18');
ok('report time present', !!r.meta.reportTime);
ok('temperatura actual 30.0', r.meta.temperaturaActual === '30.0');
ok('puntaCana mentions satelite', /sat[eé]lite/i.test(r.secciones.puntaCana));
ok('condiciones generales >= 4 lines', r.secciones.condicionesGenerales.length >= 4);
ok('4 day blocks', r.secciones.pronostico.dias.length === 4);
ok('has "Domingo y lunes" block', r.secciones.pronostico.dias.some(d => /domingo y lunes/i.test(d.day)));
ok('marino mentions nudos', /nudos/i.test(r.secciones.marino));
ok('maritimas mentions Pedernales', /pedernales/i.test(r.secciones.maritimas));
ok('playa mentions resaca', /resaca/i.test(r.secciones.playa));
ok('sunrise 6:03', r.sol.salida === '6:03');
ok('sunset 19:18', r.sol.puesta === '19:18');
ok('no warnings', r.warnings.length === 0);

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
