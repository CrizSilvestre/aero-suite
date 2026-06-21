// src/amsParse.mjs — parsea el pegado de AMS (texto TSV, 16 columnas en orden fijo)
// → registros de vuelo. Sin DOM, testeable en Node.
const COLS = ['airline', 'arrFlight', 'depFlight', 'sta', 'std', 'from', 'to',
  'acType', 'handler', 'paxIn', 'paxTransito', 'paxOut', 'correa', 'stand', 'gate', 'ckin'];

// Acepta ISO/año-primero ("2026-06-20", "2026/06/20") o con barras ("20/6/26",
// "6/20/2026"), con o sin AM/PM. La hora se extrae siempre. En el formato con barras
// NO decide aún día/mes vs mes/día: deja los componentes en _c1/_c2 y el formato lo
// detecta parseAmsClipboard a partir del lote → funciona en cualquier computadora
// (local D/M o corporativa US M/D), sin que todo salga OVER por una fecha mal leída.
export function parseDateTime(s) {
  s = (s || '').trim();
  if (!s) return null;
  const tm = s.match(/(\d{1,2}):(\d{2})/);
  let h = tm ? +tm[1] : null;
  const mi = tm ? +tm[2] : null;
  const ap = (s.match(/\b([AaPp])\.?\s*[Mm]\b/) || [])[1];
  if (ap && h != null) { const pm = /p/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }

  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);        // año primero (ISO)
  if (m) return { y: +m[1], mo: +m[2], d: +m[3], h, mi };

  m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);         // D/M o M/D (se decide por lote)
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    return { y, _c1: +m[1], _c2: +m[2], h, mi };
  }
  return { h, mi, raw: s };   // sin fecha, pero con hora
}

// Decide D/M vs M/D para TODO el lote y completa dt.d / dt.mo. Estrategia robusta
// (mismo resultado en cualquier PC, sin importar el locale de Windows):
//   1) Con reportDay → ANCLA: la mayoría de los vuelos de un reporte son de ese día.
//      Probamos las dos lecturas y elegimos la que hace caer más fechas en reportDay
//      SIN producir meses imposibles (>12). Esto corrige el locale US (M/D) y funciona
//      aunque todas las fechas sean ≤12 (ambiguas), que la heurística >12 no resuelve.
//   2) Sin reportDay → heurística: algún componente >12 delata el formato.
//   3) Empate / sin señal → por defecto D/M.
export function finalizeDateFormat(records, reportDay) {
  const slots = [];
  for (const rec of records) for (const dt of [rec.staDT, rec.stdDT]) if (dt && dt._c1 != null) slots.push(dt);

  let dm = 0; let md = 0;
  for (const dt of slots) {
    if (dt._c1 > 12 && dt._c2 <= 12) dm++;
    else if (dt._c2 > 12 && dt._c1 <= 12) md++;
  }

  // Puntaje de "encaje" con reportDay para una lectura dada (true = día primero).
  const fit = (dayFirst) => {
    let s = 0;
    for (const dt of slots) {
      const d = dayFirst ? dt._c1 : dt._c2;
      const mo = dayFirst ? dt._c2 : dt._c1;
      if (mo < 1 || mo > 12 || d < 1 || d > 31) { s -= 3; continue; }   // lectura imposible
      if (`${dt.y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` === reportDay) s += 2;
    }
    return s;
  };

  let dayFirst; let method;
  if (reportDay && slots.length) {
    const sDM = fit(true); const sMD = fit(false);
    if (sDM !== sMD) { dayFirst = sDM > sMD; method = 'reportDay'; }
    else { dayFirst = !(md > dm); method = (dm || md) ? 'votos' : 'defecto'; }
  } else {
    dayFirst = !(md > dm); method = (dm || md) ? 'votos' : 'defecto';
  }

  for (const dt of slots) {
    dt.d = dayFirst ? dt._c1 : dt._c2;
    dt.mo = dayFirst ? dt._c2 : dt._c1;
  }
  return { dayFirst, dm, md, method, slots: slots.length };
}

export function parseAmsClipboard(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const out = [];
  for (const line of lines) {
    const cells = line.split('\t');
    if (/^airlines?$/i.test((cells[0] || '').trim())) continue; // header
    if (cells.length < 14) continue;                            // no es fila de datos
    const rec = {};
    COLS.forEach((k, i) => { rec[k] = (cells[i] !== undefined ? cells[i] : '').trim(); });
    rec.staDT = parseDateTime(rec.sta);
    rec.stdDT = parseDateTime(rec.std);
    out.push(rec);
  }
  finalizeDateFormat(out);   // decide D/M vs M/D del lote y completa d/mo
  return out;
}
