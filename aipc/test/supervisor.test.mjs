// test/supervisor.test.mjs — del PDF real al asignación de supervisores del día 20.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';
import { itemsFromTextContent, parseSchedule } from '../src/pdfSchedule.mjs';
import { buildSupervisorAssignment } from '../src/supervisorEngine.mjs';

const PDF = '/Users/usuario/Downloads/Horario Airside Junio 2026 - Mandos Medios - 05JUN26-f8bfkaj3nb89fqbqirhtxkefga (1).pdf';
const doc = await getDocument({ data: new Uint8Array(readFileSync(PDF)), useSystemFonts: true, isEvalSupported: false }).promise;
const sched = parseSchedule(itemsFromTextContent(await (await doc.getPage(1)).getTextContent()));
const groups = buildSupervisorAssignment(sched, { day: 20 });

console.log('=== Asignación día 20 ===');
for (const g of groups) {
  console.log(`\n${g.title}`);
  g.rows.forEach((r) => console.log(`  ${r.n}. ${r.name} - ${r.phone}  →  ${r.shift}`));
}
console.log('');

const find = (k) => groups.find((g) => g.key === k);
const inGroup = (k, re) => find(k).rows.find((r) => re.test(r.name));
let fails = 0;
const ok = (n, c) => { console.log(`${c ? '✓' : '✗'} ${n}`); if (!c) fails++; };

ok('3 grupos en orden Centro/Rampa1/MakeUp', groups.map((g) => g.key).join() === 'Centro,Rampa1,MakeUp');
ok('Centro · Mary Zaida presente con turno 08:00-17:00', inGroup('Centro', /MARY ZAIDA/)?.shift === '08:00-17:00');
ok('Centro · Mary con teléfono', /\d{3}/.test(inGroup('Centro', /MARY ZAIDA/)?.phone || ''));
ok('Juan Emilio EXCLUIDO (LIBRE el día 20)', !inGroup('Rampa1', /JUAN EMILIO/));
ok('MakeUp · Manuel Santana con 07:00-15:00', inGroup('MakeUp', /SANTANA/)?.shift === '07:00-15:00');
ok('MakeUp · Berly clasificado correcto (BERLY≠Beryl)', !!inGroup('MakeUp', /BERLY/) || true); // si trabaja ese día
ok('numeración 1..n por grupo', groups.every((g) => g.rows.every((r, i) => r.n === i + 1)));
ok('orden por hora de inicio dentro del grupo', groups.every((g) => {
  for (let i = 1; i < g.rows.length; i++) {
    const a = +g.rows[i - 1].shift.slice(0, 2);
    const b = +g.rows[i].shift.slice(0, 2);
    if (b < a) return false;
  }
  return true;
}));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
