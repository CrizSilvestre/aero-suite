// test/transform.test.mjs — verifica el motor contra los DATOS RAW reales (día 2026-06-20).
import { readFileSync } from 'node:fs';
import { parseAmsClipboard } from '../src/amsParse.mjs';
import { toApcRows } from '../src/flightTransform.mjs';

const tsv = readFileSync(new URL('./datos_raw.tsv', import.meta.url), 'utf8');
const flights = parseAmsClipboard(tsv);
const rows = toApcRows(flights, { reportDay: '2026-06-20' });
const find = (vn) => rows.find((r) => r.vueloNo === vn);

let fails = 0;
const ok = (n, c) => { console.log(`${c ? '✓' : '✗'} ${n}`); if (!c) fails++; };
console.log(`vuelos parseados: ${flights.length} · filas APC: ${rows.length}\n`);

const fft = find('FFT 22/23');
ok('normal · FFT 22/23 existe', !!fft);
ok('normal · RUTA = PHL-PUJ-PHL', fft?.ruta === 'PHL-PUJ-PHL');
ok('normal · no OVER', fft?.sta !== 'OVER' && fft?.std !== 'OVER');
ok('normal · PAX IN = 224', fft?.paxIn === '224');
ok('normal · PAX TRÁNSITO vacío → N/A', fft?.paxTransito === 'N/A');

const shh = find('SHH 816');                    // OVER_IN → solo el vuelo de salida
ok('OVER_IN · SHH 816 (solo salida) · STA = OVER', shh?.sta === 'OVER');
ok('OVER_IN · PAX IN = N/A', shh?.paxIn === 'N/A');
ok('OVER_IN · PAX TRÁNSITO = N/A', shh?.paxTransito === 'N/A');
ok('OVER_IN · PAX OUT = 21 (se mantiene)', shh?.paxOut === '21');
ok('OVER_IN · RUTA = PUJ-HAV (solo salida)', shh?.ruta === 'PUJ-HAV');

const ucg = find('UCG 192');                    // OVER_OUT → solo el vuelo de llegada
ok('OVER_OUT · UCG 192 (solo llegada) · STD = OVER', ucg?.std === 'OVER');
ok('OVER_OUT · PAX OUT = N/A', ucg?.paxOut === 'N/A');
ok('OVER_OUT · STA NO es OVER (llega hoy)', ucg?.sta !== 'OVER');
ok('OVER_OUT · RUTA = MAR-PUJ (solo llegada)', ucg?.ruta === 'MAR-PUJ');
ok('OVER_IN · CORREA = N/A (aduanas no la requiere)', shh?.correa === 'N/A');
ok('OVER_OUT · GATE = N/A (no lleva puerta)', ucg?.gate === 'N/A');
const madr = find('DWI 5101/6264');   // cruza medianoche pero SALE 0:16 (<01:00) → NO es OVER
ok('MADRUGADA · DWI 5101/6264 (sale 0:16) → NORMAL', !!madr && madr.sta !== 'OVER' && madr.std !== 'OVER' && madr.ruta === 'MIA-PUJ-EZE');

const dwi = find('DWI 5104');                    // OVER_IN con PAX OUT=0 en el RAW
ok('PAX 0 → N/A · DWI 5104 · PAX OUT = N/A', dwi?.paxOut === 'N/A');
ok('PAX 0 → N/A · DWI 5104 · RUTA = PUJ-MIA', dwi?.ruta === 'PUJ-MIA');

ok('VUELO numerado secuencial', rows[0].vuelo === 1 && rows[rows.length - 1].vuelo === rows.length);
ok('STAND presente en toda la muestra (obligatorio)', rows.slice(0, 25).every((r) => r.stand && r.stand !== ''));

// orden: OVER (STA=OVER) arriba del todo, luego el resto por STA ascendente
const firstNonOver = rows.findIndex((r) => r.sta !== 'OVER');
ok('orden · todos los OVER (STA) van arriba', firstNonOver > 0 && rows.slice(0, firstNonOver).every((r) => r.sta === 'OVER'));
ok('orden · el resto por STA ascendente', (() => {
  for (let i = firstNonOver + 1; i < rows.length; i++) if (rows[i]._staKey < rows[i - 1]._staKey) return false;
  return true;
})());

// ── Fix corporativo: una PC de trabajo en locale US exporta las fechas como M/D
//    ("6/20/26") en vez de D/M ("20/6/26"). El MISMO vuelo, en los dos formatos,
//    debe dar EXACTAMENTE el mismo OVER (antes: todo salía OVER en la corporativa).
const COLS_OUT = 'MIA\tMIA\t320\tH\t150\t\t40\tC1\tA1\tG1\tT1'; // from..ck-in (sale al día siguiente 14:00 → OVER_OUT)
const dm = toApcRows(parseAmsClipboard(`X\tX 1\tX 1\t20/6/26 13:00\t21/6/26 14:00\t${COLS_OUT}`), { reportDay: '2026-06-20' })[0];
const md = toApcRows(parseAmsClipboard(`X\tX 1\tX 1\t6/20/26 13:00\t6/21/26 14:00\t${COLS_OUT}`), { reportDay: '2026-06-20' })[0];
ok('formato fecha · D/M detecta OVER_OUT (STD=OVER)', dm.std === 'OVER');
ok('formato fecha · M/D (locale US corporativo) da el MISMO resultado', md.std === 'OVER' && md.sta === dm.sta && md.std === dm.std);

// ── Posible ferry (SOLO aviso/preview, no toca el Excel): ferry-out (sale vacío sin
//    gate) y ferry-in (llega vacío sin correa) se marcan; un comercial completo NO.
const ferryTsv = [
  'FRY\tFRY 900\tFRY 900\t20/6/26 10:00\t20/6/26 12:00\tMIA\tMIA\t320\tABC\t150\t\t0\tC1\tA1\t\tT1',   // ferry-out: PAX OUT 0 + sin gate
  'FIN\tFIN 300\tFIN 300\t20/6/26 08:00\t20/6/26 22:00\tBOG\tBOG\t320\tABC\t\t\t90\t\tA3\tG3\tT3',      // ferry-in: PAX IN vacío + sin correa
  'NRM\tNRM 200\tNRM 200\t20/6/26 09:00\t20/6/26 11:00\tJFK\tJFK\t738\tXYZ\t180\t\t175\tC2\tA2\tG2\tT2', // comercial completo: NO ferry
].join('\n');
const fr = toApcRows(parseAmsClipboard(ferryTsv), { reportDay: '2026-06-20' });
const fOut = fr.find((r) => r.vueloNo.startsWith('FRY'));
const fIn = fr.find((r) => r.vueloNo.startsWith('FIN'));
const fNrm = fr.find((r) => r.vueloNo.startsWith('NRM'));
ok('ferry-out · sale vacío sin gate → ferry=true', fOut?.ferry === true);
ok('ferry-in · llega vacío sin correa → ferry=true', fIn?.ferry === true);
ok('comercial completo (con PAX+gate+correa) → NO ferry', fNrm?.ferry === false);
ok('ferry · es SOLO aviso: no marca OVER ni cambia STA/STD', fOut?.sta !== 'OVER' && fOut?.std !== 'OVER');

// ── Ventana madrugada ampliada a 01:59: un vuelo que cruza UNA medianoche y SALE
//    entre 00:00 y 01:59 NO es OVER (operación continua, conserva su data). Desde 02:00 sí.
const mkCross = (stdTime) => `Z\tZ 1\tZ 1\t20/6/26 23:30\t21/6/26 ${stdTime}\tMIA\tMIA\t320\tH\t120\t\t80\tC1\tA1\tG1\tT1`;
for (const t of ['00:15', '00:45', '01:15', '01:59']) {
  const r = toApcRows(parseAmsClipboard(mkCross(t)), { reportDay: '2026-06-21' })[0];
  ok(`madrugada · STD ${t} → NO OVER (operación del mismo día)`, r.sta !== 'OVER' && r.std !== 'OVER');
}
const r0200 = toApcRows(parseAmsClipboard(mkCross('02:00')), { reportDay: '2026-06-21' })[0];
ok('madrugada · STD 02:00 → lógica normal (OVER_IN, STA=OVER)', r0200.sta === 'OVER');

// ── Detección anclada en reportDay: fechas AMBIGUAS (ambos componentes ≤12) que la
//    heurística >12 no puede resolver. M/D real "6/8/26" con reportDay 8-jun: si se
//    leyera D/M (defecto viejo) saldría agosto → OVER falso; anclado en reportDay se
//    lee bien como junio 8 → NO over. (Reproduce el riesgo de la PC corporativa.)
const amb = 'A\tA 1\tA 1\t6/8/26 10:00\t6/8/26 12:00\tMIA\tMIA\t320\tH\t100\t\t90\tC1\tA1\tG1\tT1';
const ar = toApcRows(parseAmsClipboard(amb), { reportDay: '2026-06-08' });
ok('detección anclada · M/D ambiguo se resuelve por reportDay (formato M/D)', ar.diag.formato.startsWith('M/D') && ar.diag.metodo === 'reportDay');
ok('detección anclada · vuelo del día NO sale OVER por mala lectura de fecha', ar[0].sta !== 'OVER' && ar[0].std !== 'OVER');

// ── Diagnóstico adjunto (alimenta logs + advertencia de 0 OVER en la GUI).
ok('diag · expone formato/over/overIn/overOut/sinFecha', rows.diag
  && typeof rows.diag.formato === 'string' && rows.diag.over >= 1
  && rows.diag.overIn >= 1 && rows.diag.overOut >= 1 && rows.diag.sinFecha === 0);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
