// src/supervisorImage.mjs — dibuja la tabla de supervisores como IMAGEN (PNG) para el
// cuerpo del correo. Outlook/OWA sanean el HTML y "rompen" el formato de la tabla; una
// imagen conserva EXACTAMENTE la apariencia (encabezados navy, rejilla, horarios) en
// cualquier cliente. Se dibuja a mano en un <canvas> (síncrono, sin librerías, sin
// "tainting" de canvas) respetando el ancho de config (≈530px, coincide con la firma).
import { CONFIG } from './config.mjs';
import { NAVY_TITLES } from './supervisorTable.mjs';

const FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

// Dibuja texto dentro de una celda; si no cabe, reduce el tamaño y por último recorta con "…".
function cellText(ctx, str, { weight = '', size = 13, color = '#000000', align = 'center', x, w, y, h, pad = 6 }) {
  const maxW = w - pad * 2;
  let s = String(str ?? '');
  let sz = size;
  const setFont = () => { ctx.font = `${weight ? weight + ' ' : ''}${sz}px ${FONT}`; };
  setFont();
  while (ctx.measureText(s).width > maxW && sz > 9) { sz -= 0.5; setFont(); }
  if (ctx.measureText(s).width > maxW) {
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    s += '…';
  }
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  if (align === 'center') { ctx.textAlign = 'center'; ctx.fillText(s, x + w / 2, y + h / 2); }
  else { ctx.textAlign = 'left'; ctx.fillText(s, x + pad, y + h / 2); }
}

// groups: [{ key, title, rows:[{ n, name, phone, shift }] }] · reportDay: AAAA-MM-DD
// Devuelve { dataUrl, width, height } (width/height en px CSS para el <img>).
export function renderSupervisorImage(groups, { reportDay }) {
  const W = CONFIG.table.width;          // 530 (coincide con la firma)
  const navy = CONFIG.navyColor;
  const [y, m, d] = reportDay.split('-').map(Number);
  const fecha = `${m}/${d}/${y}`;        // M/D/AAAA como en el correo

  // Columnas: nº · nombre (flexible) · horario. Encabezado de grupo = nº+nombre fusionados.
  const COL_N = 34;
  const COL_H = 92;
  const COL_NAME = W - COL_N - COL_H;
  const NAME_X = COL_N;
  const SHIFT_X = COL_N + COL_NAME;
  const LEFT_W = COL_N + COL_NAME;       // ancho del "colspan 2" del encabezado de grupo

  const H_TITLE = 26;
  const H_ROW = 23;

  // Alto total = título + fecha + por cada grupo (1 encabezado + sus filas).
  let totalH = H_TITLE + H_ROW;
  for (const g of groups) totalH += H_ROW * (1 + g.rows.length);

  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const scale = Math.max(2, Math.round(dpr));   // nítido en pantallas retina
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(totalH * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Fondo blanco.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, totalH);

  const fillCell = (x, yTop, w, h, bg) => { ctx.fillStyle = bg; ctx.fillRect(x, yTop, w, h); };
  const strokeCell = (x, yTop, w, h) => {
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, yTop + 0.5, w - 1, h - 1);   // +0.5 → líneas de 1px nítidas
  };

  let yPos = 0;

  // Título superior (navy, blanco, centrado).
  fillCell(0, yPos, W, H_TITLE, navy);
  strokeCell(0, yPos, W, H_TITLE);
  cellText(ctx, CONFIG.supervisorTitle, { weight: 'bold', size: 14, color: '#ffffff', x: 0, w: W, y: yPos, h: H_TITLE });
  yPos += H_TITLE;

  // Fila de fecha (blanca, negro, alineada a la izquierda, negrita).
  strokeCell(0, yPos, W, H_ROW);
  cellText(ctx, `Fecha:  ${fecha}`, { weight: 'bold', size: 13, align: 'left', x: 0, w: W, y: yPos, h: H_ROW });
  yPos += H_ROW;

  for (const g of groups) {
    // Encabezado de grupo: navy · "SUPERVISOR DE …" (nº+nombre) + "HORARIO".
    fillCell(0, yPos, W, H_ROW, navy);
    strokeCell(0, yPos, LEFT_W, H_ROW);
    strokeCell(SHIFT_X, yPos, COL_H, H_ROW);
    cellText(ctx, NAVY_TITLES[g.key] || g.title, { weight: 'bold', size: 13, color: '#ffffff', x: 0, w: LEFT_W, y: yPos, h: H_ROW });
    cellText(ctx, 'HORARIO', { weight: 'bold', size: 13, color: '#ffffff', x: SHIFT_X, w: COL_H, y: yPos, h: H_ROW });
    yPos += H_ROW;

    // Filas: nº (centro) · nombre - teléfono (izq) · horario (centro).
    for (const r of g.rows) {
      strokeCell(0, yPos, COL_N, H_ROW);
      strokeCell(NAME_X, yPos, COL_NAME, H_ROW);
      strokeCell(SHIFT_X, yPos, COL_H, H_ROW);
      cellText(ctx, r.n, { size: 13, x: 0, w: COL_N, y: yPos, h: H_ROW });
      cellText(ctx, `${r.name} - ${r.phone}`, { size: 13, align: 'left', x: NAME_X, w: COL_NAME, y: yPos, h: H_ROW });
      cellText(ctx, r.shift, { size: 13, x: SHIFT_X, w: COL_H, y: yPos, h: H_ROW });
      yPos += H_ROW;
    }
  }

  return { dataUrl: canvas.toDataURL('image/png'), width: W, height: totalH };
}
