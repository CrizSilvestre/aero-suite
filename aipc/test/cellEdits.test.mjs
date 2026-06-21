// test/cellEdits.test.mjs — ediciones manuales del preview (edición libre + ferry).
import { parseAmsClipboard } from '../src/amsParse.mjs';
import { toApcRows } from '../src/flightTransform.mjs';
import { applyEdits, isFerryable, isFerryMarked, EDITABLE } from '../src/cellEdits.mjs';

let fails = 0;
const ok = (n, c) => { console.log(`${c ? '✓' : '✗'} ${n}`); if (!c) fails++; };

// comercial completo + posible ferry-out (PAX OUT 0 → N/A, sin gate).
const tsv = [
  'NRM\tNRM 1\tNRM 1\t20/6/26 09:00\t20/6/26 11:00\tJFK\tJFK\t738\tXYZ\t180\t\t175\tC2\tA2\tG2\tT2',
  'FRY\tFRY 9\tFRY 9\t20/6/26 10:00\t20/6/26 12:00\tMIA\tMIA\t320\tABC\t150\t\t0\tC1\tA1\t\tT1',
].join('\n');
const build = () => toApcRows(parseAmsClipboard(tsv), { reportDay: '2026-06-20' });
const rows = build();
const fry = rows.find((r) => r.vueloNo.startsWith('FRY'));
const nrm = rows.find((r) => r.vueloNo.startsWith('NRM'));

ok('VUELO no editable; PAX sí (EDITABLE)', !EDITABLE.includes('vuelo') && EDITABLE.includes('paxOut'));
ok('ferryable · ferry-out con PAX OUT N/A → sí', isFerryable(fry));
ok('ferryable · comercial completo → no', !isFerryable(nrm));
ok('no marcado de inicio', !isFerryMarked(fry));

// edición libre: corregir aerolínea y un PAX (caso "no era ferry, faltaba el número")
const r2 = applyEdits(build(), { [`${fry._fid}:aerolinea`]: 'FRYX', [`${nrm._fid}:paxOut`]: '200' });
ok('edición libre · aerolínea aplicada', r2.find((r) => r._fid === fry._fid).aerolinea === 'FRYX');
ok('edición libre · PAX OUT corregido a número', r2.find((r) => r._fid === nrm._fid).paxOut === '200');

// marcar ferry: FERRY en la PAX vacía (la que estaba N/A); la otra dirección no se toca.
const r3 = applyEdits(build(), { [`${fry._fid}:paxOut`]: 'FERRY' });
const fry3 = r3.find((r) => r._fid === fry._fid);
ok('ferry · PAX OUT vacía → FERRY', fry3.paxOut === 'FERRY');
ok('ferry · queda marcado', isFerryMarked(fry3));
ok('ferry · PAX IN (150) intacto', fry3.paxIn === '150');
ok('ediciones conservan .diag del arreglo', !!r3.diag);

// el id es estable aunque cambie el día (reordena pero sigue al vuelo)
const r4 = applyEdits(toApcRows(parseAmsClipboard(tsv), { reportDay: '2026-06-21' }), { [`${fry._fid}:gate`]: 'Z9' });
ok('id estable · edición sigue al vuelo aunque cambie reportDay', r4.find((r) => r._fid === fry._fid).gate === 'Z9');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
