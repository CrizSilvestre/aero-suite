// src/supervisorTable.mjs — grupos de supervisores → tabla HTML "navy" del correo
// (encabezados azul oscuro, texto blanco centrado, filas numeradas, nombre - teléfono).
import { CONFIG } from './config.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Títulos tal como salen en el correo (mayúsculas).
const NAVY_TITLES = {
  Centro: 'SUPERVISOR DE CENTRO OPERACIONES',
  Rampa1: 'SUPERVISOR DE OPERACIONES RAMPA 1',
  MakeUp: 'SUPERVISOR DE OPERACIONES MAKE UP',
};

export function renderSupervisorTable(groups, { reportDay }) {
  const navy = CONFIG.navyColor;
  const W = CONFIG.table.width;
  const [y, m, d] = reportDay.split('-').map(Number);
  const fecha = `${m}/${d}/${y}`;   // formato del correo (M/D/AAAA)

  // Robustez Outlook Web (OWA) + Outlook escritorio (Word): ambos sanean/mutan el HTML
  // al pegar/renderizar. Reglas:
  //  - fuente EN CADA celda (Word no la hereda del <table> → Times New Roman si falta).
  //  - color de fondo como ATRIBUTO bgcolor (OWA elimina el shorthand "background";
  //    se usa además "background-color" inline).
  //  - alineación y ancho también como ATRIBUTOS (align/width), no solo CSS.
  //  - bordes: border="1" en la tabla + border-collapse + 1px por celda → rejilla de 1px
  //    en todos los clientes aunque uno descarte el CSS (no se duplican por el collapse).
  const f = `font-family:Arial, sans-serif;font-size:${CONFIG.table.fontSize}`;
  // Padding compacto (más estilizado): menos espacio celda-borde que la versión previa.
  const headStyle = `${f};background-color:${navy};color:#ffffff;font-weight:bold;text-align:center;border:1px solid #000000;padding:2px 6px`;
  const cellStyle = `${f};color:#000000;border:1px solid #000000;padding:2px 5px;text-align:center`;
  const nameStyle = `${f};color:#000000;border:1px solid #000000;padding:2px 6px;text-align:left`;

  const th = (html, { colspan, width } = {}) =>
    `<td${colspan ? ` colspan="${colspan}"` : ''}${width ? ` width="${width}"` : ''}`
    + ` align="center" bgcolor="${navy}" style="${headStyle}">${html}</td>`;
  const td = (html, { width } = {}) =>
    `<td${width ? ` width="${width}"` : ''} align="center" style="${cellStyle}">${html}</td>`;
  const tdName = (html) => `<td align="left" style="${nameStyle}">${html}</td>`;

  // título superior + fila de fecha (en una sola celda para que no se parta)
  let rows = `<tr>${th(esc(CONFIG.supervisorTitle), { colspan: 3 })}</tr>`
    + `<tr><td colspan="3" align="left" style="${cellStyle};text-align:left;font-weight:bold">Fecha:&nbsp;&nbsp;${fecha}</td></tr>`;

  for (const g of groups) {
    rows += `<tr>${th(NAVY_TITLES[g.key] || esc(g.title), { colspan: 2 })}${th('HORARIO', { width: 95 })}</tr>`;
    for (const r of g.rows) {
      // ancho por atributo (nº 30 · nombre auto · horario 95) → columnas iguales en OWA/Word.
      rows += `<tr>${td(r.n, { width: 30 })}${tdName(`${esc(r.name)} - ${esc(r.phone)}`)}${td(esc(r.shift), { width: 95 })}</tr>`;
    }
  }
  // total ≈ 530 para que coincida con la firma. Sin colgroup/table-layout:fixed (OWA los
  // descarta); los anchos por atributo en las celdas mandan en todos los clientes.
  return `<table width="${W}" border="1" cellspacing="0" cellpadding="2" bgcolor="#ffffff"`
    + ` style="border-collapse:collapse;width:${W}px;font-family:Arial, sans-serif;`
    + `font-size:${CONFIG.table.fontSize};margin:12px 0">${rows}</table>`;
}
