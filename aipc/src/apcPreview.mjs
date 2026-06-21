// src/apcPreview.mjs — vista previa HTML de la tabla APC (mismos datos que el .xlsx).
// Réplica visual: encabezado verde, FECHA, filas OVER, N/A y fila de totales en rojo.
// Celdas editables (edición libre): cada celda salvo VUELO es contenteditable; los
// cambios se guardan por sesión y SÍ van al Excel. Toggle ⛴ por vuelo → FERRY en la PAX vacía.
import { EDITABLE, isFerryable, isFerryMarked } from './cellEdits.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLarga(reportDay) {
  const [y, m, d] = reportDay.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  const s = `${DIAS[wd]}, ${String(d).padStart(2, '0')} de ${MESES[m - 1]} de ${y}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const COLS = [
  ['vuelo', 'VUELO'], ['aerolinea', 'AEROLINEA'], ['vueloNo', 'VUELO No.'], ['sta', 'STA'], ['std', 'STD'],
  ['ruta', 'RUTA'], ['acType', 'A/C TYPE'], ['handler', 'HANDLER'], ['paxIn', 'PAX IN'], ['paxTransito', 'PAX TRANSITO'],
  ['paxOut', 'PAX OUT'], ['correa', 'CORREA'], ['stand', 'STAND'], ['gate', 'GATE'], ['ckin', 'CK-IN TERM'],
];
const sumPax = (rows, key) => rows.reduce((a, r) => a + (/^\d+$/.test(r[key]) ? +r[key] : 0), 0);

export function renderApcTable(apcRows, { reportDay }) {
  if (!apcRows.length) return '<div class="placeholder">Pega los datos de AMS para ver el Excel.</div>';

  const th = 'background:#92D050;border:1px solid #000;padding:4px 6px;font-weight:bold;text-align:center;white-space:nowrap';
  const td = 'border:1px solid #000;padding:2px 6px;text-align:center;white-space:nowrap';
  const totTd = 'border:1px solid #000;padding:3px 6px;text-align:center;font-weight:bold;color:#c00000';

  const head = COLS.map(([, label]) => `<th style="${th}">${label}</th>`).join('');
  const body = apcRows.map((r) => {
    // Posible ferry (auto) → fila resaltada en amarillo, solo como aviso visual.
    const rowBg = r.ferry ? ' style="background:#FFF2CC"' : '';
    const marked = isFerryMarked(r);
    const cells = COLS.map(([k]) => {
      const v = esc(r[k]);
      const extra = v === 'OVER' ? ';font-weight:bold;color:#c00000'
        : v === 'FERRY' ? ';font-weight:bold;color:#9a7d00'
        : (v === 'N/A' ? ';color:#888' : '');
      if (k === 'vuelo') {
        // VUELO (nº) no editable; lleva el toggle de ferry en los vuelos candidatos.
        const btn = isFerryable(r)
          ? ` <button type="button" class="ferry-toggle${marked ? ' on' : ''}" data-fid="${r._fid}"`
            + ` title="${marked ? 'Quitar ferry (vuelve a N/A)' : 'Marcar ferry (PAX vacía → FERRY)'}">⛴</button>`
          : '';
        return `<td style="${td}${extra}">${v}${btn}</td>`;
      }
      // Celda editable (edición libre): contenteditable + data para el override de sesión.
      return EDITABLE.includes(k)
        ? `<td class="px-edit" contenteditable="true" data-fid="${r._fid}" data-col="${k}" style="${td}${extra}">${v}</td>`
        : `<td style="${td}${extra}">${v}</td>`;
    }).join('');
    return `<tr${rowBg}>${cells}</tr>`;
  }).join('');

  const totalsRow = '<tr>'
    + '<td colspan="8" style="border:1px solid #000"></td>'
    + `<td style="${totTd}">${sumPax(apcRows, 'paxIn')}</td>`
    + `<td style="${totTd}">${sumPax(apcRows, 'paxTransito')}</td>`
    + `<td style="${totTd}">${sumPax(apcRows, 'paxOut')}</td>`
    + '<td colspan="4" style="border:1px solid #000"></td></tr>';

  // Leyenda: cuenta OVER y posibles ferry del lote (ambos son SOLO avisos visuales).
  const overCount = apcRows.filter((r) => r.over).length;
  const ferryCount = apcRows.filter((r) => r.ferry).length;
  const chip = (bg, bd, txt, label, n, note) =>
    '<span style="display:inline-flex;align-items:center;gap:6px">'
    + `<span style="width:12px;height:12px;border-radius:2px;background:${bg};border:1px solid ${bd};display:inline-block"></span>`
    + `<b style="color:${txt}">${label}:</b> ${n}${note ? ` <span style="color:#888">${note}</span>` : ''}</span>`;
  const legend = '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin:0 0 10px;font-size:11px">'
    + chip('#c00000', '#c00000', '#c00000', 'OVER', overCount, '')
    + chip('#FFF2CC', '#d9b300', '#9a7d00', 'Posible ferry', ferryCount, '(solo aviso, revisar — no va en el Excel)')
    + '</div>';

  return '<div style="font-size:11px;color:#000">'
    + `<div style="font-weight:bold;font-size:13px;margin:0 0 8px">FECHA: ${esc(fechaLarga(reportDay))}</div>`
    + legend
    + '<table style="border-collapse:collapse;font-family:Arial,sans-serif">'
    + `<thead><tr>${head}</tr></thead><tbody>${body}${totalsRow}</tbody></table>`
    + `<div style="margin-top:8px;color:#888;font-size:11px">${apcRows.length} vuelos · ✏️ clic en una celda para editar`
    + ' · ⛴ marca un vuelo como ferry (PAX vacía → FERRY) · <b>lo que edites aquí va en el Excel adjunto</b></div></div>';
}
