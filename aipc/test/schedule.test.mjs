// test/schedule.test.mjs — verifica el parser del PDF (por posición) contra los
// valores que dio pdfplumber para el día 20.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';
import { itemsFromTextContent, parseSchedule } from '../src/pdfSchedule.mjs';

const PDF = '/Users/usuario/Downloads/Horario Airside Junio 2026 - Mandos Medios - 05JUN26-f8bfkaj3nb89fqbqirhtxkefga (1).pdf';
const doc = await getDocument({ data: new Uint8Array(readFileSync(PDF)), useSystemFonts: true, isEvalSupported: false }).promise;
const tc = await (await doc.getPage(1)).getTextContent();
const sched = parseSchedule(itemsFromTextContent(tc));

const byCode = (c) => sched.employees.find((e) => e.code === c);
let fails = 0;
const ok = (n, c) => { console.log(`${c ? '✓' : '✗'} ${n}`); if (!c) fails++; };
console.log(`columnas de día: ${sched.days.length} · empleados: ${sched.employees.length}\n`);

ok('30 columnas de día', sched.days.length === 30);
ok('empleados ≥ 14', sched.employees.length >= 14);

const mary = byCode('9154');
ok('Mary Zaida (9154) detectada', !!mary && /MARY ZAIDA/.test(mary.name));
ok('Mary · día 20 = 08:00-17:00', mary?.shifts[20] === '08:00-17:00');
ok('Mary · día 18 = 08:00-16:00', mary?.shifts[18] === '08:00-16:00');

const juan = byCode('13');
ok('Juan Emilio (13) · día 20 = LIBRE', juan?.shifts[20] === 'LIBRE');
ok('Juan Emilio · día 18 = 07:00-15:00', juan?.shifts[18] === '07:00-15:00');

const manuel = byCode('485');
ok('Manuel Santana (485) · día 20 = 07:00-15:00', manuel?.shifts[20] === '07:00-15:00');
ok('Manuel Santana · día 18 = 08:00-19:00', manuel?.shifts[18] === '08:00-19:00');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
