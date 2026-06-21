// src/pdfSchedule.mjs — parsea la grilla mensual "Mandos Medios" por POSICIÓN
// (coordenadas pdf.js), no por texto. Entrada: items [{s,x,y}]. Sin DOM (testeable).
//
// Geometría real: código@x≈23, nombre@x≈63, columnas de día desde x≈156 (paso ~28px).
// Cada celda son 2 ítems apilados: "08:00-" (arriba) + "16:00" (abajo).
const NAME_MIN_X = 45;
const DAY_MIN_X = 150;
const ROW_TOL = 14;   // alto de banda de un empleado
const COL_TOL = 16;   // media separación entre columnas de día

// Extrae items con posición desde un getTextContent() de pdf.js.
export function itemsFromTextContent(tc) {
  return tc.items
    .filter((i) => i.str.trim())
    .map((i) => ({ s: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }));
}

export function parseSchedule(items) {
  // 1. columnas de día: la fila-encabezado con más números 1..31
  const nums = items.filter((i) => /^\d{1,2}$/.test(i.s) && +i.s >= 1 && +i.s <= 31 && i.x >= DAY_MIN_X);
  const byY = {};
  nums.forEach((n) => { byY[n.y] = (byY[n.y] || 0) + 1; });
  const headerY = +Object.entries(byY).sort((a, b) => b[1] - a[1])[0][0];
  const dayColX = {};
  nums.filter((n) => Math.abs(n.y - headerY) <= 4).forEach((n) => { dayColX[+n.s] = n.x; });
  const days = Object.keys(dayColX).map(Number).sort((a, b) => a - b);

  const nearestDay = (x) => {
    let best = null; let bd = Infinity;
    for (const d of days) { const dd = Math.abs(x - dayColX[d]); if (dd < bd) { bd = dd; best = d; } }
    return bd <= COL_TOL ? best : null;
  };

  // 2. anclas de empleado: códigos numéricos en la columna izquierda (no el encabezado)
  const anchors = items
    .filter((i) => /^\d{1,6}$/.test(i.s) && i.x < NAME_MIN_X && Math.abs(i.y - headerY) > ROW_TOL)
    .sort((a, b) => b.y - a.y);

  // 3. por empleado: nombre + turno de cada día
  const employees = anchors.map((a) => {
    const band = items.filter((i) => Math.abs(i.y - a.y) <= ROW_TOL);
    const name = band
      .filter((i) => i.x >= NAME_MIN_X && i.x < DAY_MIN_X)
      .sort((p, q) => p.x - q.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();

    const cells = {};
    for (const i of band) {
      if (i.x < DAY_MIN_X) continue;
      const d = nearestDay(i.x);
      if (d) (cells[d] = cells[d] || []).push(i);
    }
    const shifts = {};
    for (const d of Object.keys(cells)) {
      shifts[d] = cells[d].sort((p, q) => q.y - p.y).map((i) => i.s).join(' ')
        .replace(/-\s+/g, '-').replace(/\s+/g, ' ').trim();
    }
    return { code: a.s, name, shifts };
  });

  return { dayColX, days, employees };
}
