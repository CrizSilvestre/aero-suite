// test/xlsx.test.mjs — genera el Excel APC desde el RAW real y verifica que
// conserva el formato de la plantilla y los datos transformados.
import { readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { parseAmsClipboard } from '../src/amsParse.mjs';
import { toApcRows } from '../src/flightTransform.mjs';
import { fillApcTemplate } from '../src/xlsxApc.mjs';
import { applyEdits } from '../src/cellEdits.mjs';

const TEMPLATE = '/Users/usuario/Downloads/CAE-GOA-F23 Asignación de Correas, Posiciones & Gates APC-Plantilla.xlsx';
const tsv = readFileSync(new URL('./datos_raw.tsv', import.meta.url), 'utf8');
const rows = toApcRows(parseAmsClipboard(tsv), { reportDay: '2026-06-20' });

const buf = await fillApcTemplate(readFileSync(TEMPLATE), rows, { reportDay: '2026-06-20' });
writeFileSync(new URL('./APC_generado.xlsx', import.meta.url), Buffer.from(buf));

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);
const ws = wb.getWorksheet('Fecha');
const fillOf = (c) => ws.getCell(c).fill?.fgColor?.argb || '';

let fails = 0;
const ok = (n, c) => { console.log(`${c ? '✓' : '✗'} ${n}`); if (!c) fails++; };
console.log(`filas de datos generadas: ${rows.length}\n`);

ok('encabezado A2 = VUELO', ws.getCell('A2').value === 'VUELO');
ok('encabezado verde #92D050 preservado', /92D050/i.test(fillOf('A2')));
ok('encabezado Arial 13 negrita', ws.getCell('A2').font?.name === 'Arial' && ws.getCell('A2').font?.bold === true);
ok('FECHA texto largo, 1ª mayúscula, "20 de junio de 2026"', typeof ws.getCell('K1').value === 'string' && /^[A-ZÁÉÍÓÚ]/.test(ws.getCell('K1').value) && /20 de junio de 2026/.test(ws.getCell('K1').value));
ok('FECHA fuente ≥ 16', (ws.getCell('K1').font?.size || 0) >= 16);
console.log('   → FECHA =', JSON.stringify(ws.getCell('K1').value));
ok('fila3 · VUELO = 1 (número)', ws.getCell('A3').value === 1);
ok('fila3 · es OVER (arriba) con RUTA hacia/desde PUJ', ws.getRow(3).getCell(4).value === 'OVER' && /PUJ/.test(String(ws.getRow(3).getCell(6).value)));

let overFound = false;
ws.eachRow((row, rn) => { if (rn >= 3 && (row.getCell(4).value === 'OVER' || row.getCell(5).value === 'OVER')) overFound = true; });
ok('existe fila OVER en el Excel', overFound);
ok(`última fila de datos = ${rows.length}`, ws.getCell('A' + (2 + rows.length)).value === rows.length);

// formato uniforme: la fila 110 (antes salía chiquita/sin borde) ahora es fila de datos
ok('formato uniforme · fila 110 con borde + Arial 16', !!ws.getCell('B110').border?.top?.style && ws.getCell('B110').font?.size === 16);
ok('uniformidad · PAX IN (col I) ahora a 16 (venía 18)', ws.getCell('I3').font?.size === 16 && ws.getCell('I50').font?.size === 16);
ok('uniformidad · datos centrados (col I y B)', ws.getCell('I3').alignment?.horizontal === 'center' && ws.getCell('B3').alignment?.horizontal === 'center');

// fila de totales dinámica con SUM y estilo rojo/negrita
const lastData = rows.length + 2;
const totalsRow = lastData + 1;
const fI = ws.getCell(`I${totalsRow}`);
const formulaText = fI.formula || fI.value?.formula || '';
ok(`totales en fila ${totalsRow} · =SUM(I3:I${lastData})`, new RegExp(`SUM\\(I3:I${lastData}\\)`, 'i').test(formulaText));
ok('totales · rojo + negrita', fI.font?.bold === true && /FF0000/i.test(fI.font?.color?.argb || ''));

ok('autofiltro presente', !!ws.autoFilter);

// la plantilla venía en "Vista previa de salto de página" (dibuja líneas de límite
// de página sin sentido) → el generado debe salir en vista Normal, sin saltos.
const view = (ws.views || [])[0] || {};
ok('vista Normal (sin pageBreakPreview ni líneas de página)', view.state === 'normal' && view.style !== 'pageBreakPreview');
ok('sin saltos de página manuales heredados', !(ws.model?.rowBreaks?.length) && !(ws.model?.colBreaks?.length));

// la asignación es A–O (15 col): nada después de la columna O (la plantilla traía amarillo en P+).
let beyondO = 0;
for (let r = 1; r <= 130; r++) for (let c = 16; c <= 40; c++) {
  const c2 = ws.getCell(r, c); const f = c2.fill;
  if ((f && f.type === 'pattern' && (f.fgColor?.argb || f.bgColor?.argb)) || (c2.value != null && c2.value !== '')) beyondO++;
}
ok('limpio después de O · sin relleno ni valor en columnas P+ (adiós amarillo)', beyondO === 0);

// Edición manual del preview: lo editado debe ir TAL CUAL al Excel (FERRY en PAX vacía).
const edited = applyEdits(toApcRows(parseAmsClipboard(tsv), { reportDay: '2026-06-20' }), { '0:paxOut': 'FERRY' });
const ebuf = await fillApcTemplate(readFileSync(TEMPLATE), edited, { reportDay: '2026-06-20' });
const ewb = new ExcelJS.Workbook(); await ewb.xlsx.load(ebuf);
let ferryWritten = false;
ewb.getWorksheet('Fecha').eachRow((row, rn) => { if (rn >= 3 && String(row.getCell(11).value) === 'FERRY') ferryWritten = true; });
ok('edición manual · "FERRY" (PAX OUT) escrito tal cual en el Excel', ferryWritten);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS · escrito test/APC_generado.xlsx');
process.exit(fails ? 1 : 0);
