// src/xlsxApc.mjs — rellena la plantilla APC real preservando su formato.
// La plantilla está pensada para ~100 vuelos (datos 3-102, TOTALES en fila 106).
// Aquí lo hacemos dinámico: formato de datos uniforme en TODAS las filas y la
// fila de TOTALES (=SUM de PAX) justo debajo de los datos, con su estilo rojo.
// Navegador: exceljs.min.js se carga por <script> (global ExcelJS). Node: import.
const ExcelJS = (typeof globalThis !== 'undefined' && globalThis.ExcelJS)
  ? globalThis.ExcelJS
  : (await import('exceljs')).default;

const COLS = ['vuelo', 'aerolinea', 'vueloNo', 'sta', 'std', 'ruta', 'acType', 'handler',
  'paxIn', 'paxTransito', 'paxOut', 'correa', 'stand', 'gate', 'ckin'];
const NUMERIC = new Set(['vuelo', 'paxIn', 'paxTransito', 'paxOut', 'correa', 'gate']);
const FIRST = 3;            // primera fila de datos
const DATA_STYLE_ROW = 3;   // fila modelo de datos
const TOTALS_STYLE_ROW = 106; // fila modelo de totales (rojo/negrita)

const coerce = (key, v) => {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (NUMERIC.has(key) && /^\d+$/.test(s)) return Number(s);
  return s;
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLargaCap(reportDay) {
  const [y, m, d] = reportDay.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  const s = `${DIAS[wd]}, ${String(d).padStart(2, '0')} de ${MESES[m - 1]} de ${y}`;
  return s.charAt(0).toUpperCase() + s.slice(1);   // "Sábado, 20 de junio de 2026"
}
const colToNum = (s) => s.split('').reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0);
const numToCol = (n) => { let s = ''; let x = n; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); } return s; };

export async function fillApcTemplate(templateBuf, apcRows, { reportDay }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuf);
  const ws = wb.getWorksheet('Fecha') || wb.worksheets[0];

  // FECHA como TEXTO largo en español (1ª letra mayúscula), fusionado en varias
  // celdas para que entre completo (un valor-fecha con formato largo daría "###").
  let fechaCell = ws.getCell('K1');
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
    const v = cell.value;
    if (v && typeof v === 'object' && /today/i.test(v.formula || '')) fechaCell = cell;
  });
  fechaCell.value = fechaLargaCap(reportDay);
  fechaCell.numFmt = 'General';
  fechaCell.font = { ...(fechaCell.font || {}), name: fechaCell.font?.name || 'Arial', size: 16, bold: true };
  fechaCell.alignment = { ...(fechaCell.alignment || {}), horizontal: 'left', vertical: 'middle' };
  const am = (fechaCell.address || 'K1').match(/^([A-Z]+)(\d+)$/);
  if (am) { try { ws.mergeCells(`${am[1]}${am[2]}:${numToCol(colToNum(am[1]) + 2)}${am[2]}`); } catch { /* ya fusionada */ } }
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell) => {   // agrandar también la etiqueta "FECHA"
    if (typeof cell.value === 'string' && cell.value.trim().toUpperCase() === 'FECHA') {
      cell.font = { ...(cell.font || {}), size: 16, bold: true };
    }
  });

  // estilos modelo (por columna) de una fila de datos y de la fila de totales
  const dataStyle = {}; const totalStyle = {};
  for (let c = 1; c <= COLS.length; c++) {
    dataStyle[c] = ws.getRow(DATA_STYLE_ROW).getCell(c).style;
    totalStyle[c] = ws.getRow(TOTALS_STYLE_ROW).getCell(c).style;
  }
  const dataHeight = ws.getRow(DATA_STYLE_ROW).height || 27;
  const totalHeight = ws.getRow(TOTALS_STYLE_ROW).height || 27;

  const N = apcRows.length;
  const lastData = FIRST + N - 1;
  const totalsRow = lastData + 1;

  // datos: formato UNIFORME en todas las filas — Arial 16 y CENTRADO en todas las
  // columnas (la plantilla traía PAX IN en 18). Se conservan bordes/relleno.
  apcRows.forEach((row, idx) => {
    const xr = ws.getRow(FIRST + idx);
    COLS.forEach((k, ci) => {
      const base = dataStyle[ci + 1];
      const cell = xr.getCell(ci + 1);
      cell.value = coerce(k, row[k]);
      cell.style = {
        ...base,
        font: { ...(base.font || {}), name: base.font?.name || 'Arial', size: 16 },
        alignment: { ...(base.alignment || {}), horizontal: 'center', vertical: 'middle', wrapText: false },
      };
    });
    xr.height = Math.max(dataHeight, 33);   // más alto → menos apretado con la fuente 16
  });

  // fila de TOTALES dinámica (suma del rango real de PAX; SUM ignora los "N/A")
  const tr = ws.getRow(totalsRow);
  for (let c = 1; c <= COLS.length; c++) tr.getCell(c).style = { ...totalStyle[c] };
  tr.getCell(9).value = { formula: `SUM(I${FIRST}:I${lastData})` };   // PAX IN
  tr.getCell(10).value = { formula: `SUM(J${FIRST}:J${lastData})` };  // PAX TRANSITO
  tr.getCell(11).value = { formula: `SUM(K${FIRST}:K${lastData})` };  // PAX OUT
  tr.height = totalHeight;

  // limpiar sobrantes (totales viejo en 106, filas pobres 107-120, etc.)
  const clearTo = Math.max(120, totalsRow + 40);
  for (let r = totalsRow + 1; r <= clearTo; r++) {
    const xr = ws.getRow(r);
    for (let c = 1; c <= COLS.length; c++) { const cell = xr.getCell(c); cell.value = null; cell.style = {}; }
  }

  // La plantilla traía FILAS completas en amarillo (57 y 84) cuyo relleno solo asoma DESPUÉS
  // de la columna O (la asignación es A–O; esas celdas no tienen estilo propio y heredan el de
  // la fila). Era un relleno a nivel de FILA, no por celda — por eso no se veía en A–O ni en el
  // escaneo por celdas. Se apaga el relleno de cualquier fila que lo traiga; las celdas con
  // estilo propio (datos, encabezado verde, totales) NO se afectan.
  for (let r = 1; r <= clearTo; r++) {
    const row = ws.getRow(r);
    const rf = row.fill;
    if (rf && rf.type === 'pattern' && (rf.fgColor?.argb || rf.bgColor?.argb)) {
      row.fill = { type: 'pattern', pattern: 'none' };
    }
  }

  // filtro solo sobre encabezado + datos (no la fila de totales)
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: lastData, column: COLS.length } };

  // La plantilla venía guardada en "Vista previa de salto de página" (pageBreakPreview)
  // con saltos manuales y zoom 55% → Excel dibujaba líneas de límite de página sobre la
  // hoja que no tienen sentido en el reporte. Forzamos vista Normal al 100% y limpiamos
  // los saltos para que el generado salga limpio.
  ws.views = [{ state: 'normal', showGridLines: true, zoomScale: 100, zoomScaleNormal: 100 }];
  if (ws.model) { ws.model.rowBreaks = []; ws.model.colBreaks = []; }

  return wb.xlsx.writeBuffer();
}
