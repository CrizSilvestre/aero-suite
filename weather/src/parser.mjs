// src/parser.mjs
// ONAMET "Pronóstico Regional del Este y Marino para Punta Cana" → structured data.
// Pure: input is an array of text lines, output is a report object.
// No DOM / no pdf.js, so it is unit-testable in Node against the real PDF.

const MONTHS = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6,
  agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};
const DAY = 'lunes|martes|miercoles|jueves|viernes|sabado|domingo';

const deaccent = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const key = (s) => deaccent(s).toLowerCase().trim();

// ONAMET letterhead / footer lines we never want in the email.
const BOILERPLATE = [
  /gobierno de la/, /republica dominicana/, /instituto dominicano de meteorologia/,
  /apartado postal/, /los mameyes/, /e-?mail:/, /web:\s*www/, /onamet\.go/,
  /^aeropuerto internacional de punta cana\s*$/, /salida y puesta del sol/,
  /^imagen de satelite/, /^pronosticadores\s*$/,
];
const isBoilerplate = (line) => {
  const d = key(line);
  return d.length === 0 || BOILERPLATE.some((re) => re.test(d));
};

// Section header matchers (run against the de-accented, lowercased line).
const HEADERS = {
  puntaCana: /^punta cana y areas vecinas\s*:/,
  condicionesGenerales: /^condiciones generales\s*:/,
  marino: /^pronostico marino extendido a 3 dias\s*:/,
  // "condiciones maritimas:" but NOT "...maritimas en areas de playa:"
  maritimas: /^condiciones maritimas\s*:(?!.*playa)/,
  playa: /^condiciones maritimas en areas de playa\s*:/,
};
const isDayHeader = (line) =>
  new RegExp(`^(${DAY})(\\s+y\\s+(${DAY}))?\\s*:`).test(key(line));

function findIndex(lines, re) {
  return lines.findIndex((l) => re.test(key(l)));
}

// Content for a header that sits on its own line: take following lines until
// the next boundary index. For headers with trailing text on the same line,
// pass `inlineRest`.
function collectUntil(lines, startIdx, boundaries) {
  const next = boundaries.filter((b) => b > startIdx).sort((a, b) => a - b)[0] ?? lines.length;
  return lines.slice(startIdx + 1, next).map((l) => l.trim()).filter(Boolean);
}

function parseDateline(rawLines) {
  for (const l of rawLines) {
    const d = key(l);
    const m = d.match(new RegExp(`(${DAY})\\s+(\\d{1,2})\\s+de\\s+([a-z]+)\\s+(\\d{4})`));
    if (!m) continue;
    const [, dayName, dd, mon, yyyy] = m;
    const month = MONTHS[mon];
    const tm = d.match(/(\d{1,2}):(\d{2})\s*([ap])\s*\.?\s*m/);
    let reportTime = null;
    if (tm) {
      let hh = parseInt(tm[1], 10);
      const mm = tm[2];
      const mer = tm[3] === 'p' ? 'p.m.' : 'a.m.';
      reportTime = `${hh}:${mm} ${mer}`;
    }
    const date = month != null
      ? { d: +dd, m: month + 1, y: +yyyy, iso: `${yyyy}-${String(month + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}` }
      : null;
    return { dayName: dayName[0].toUpperCase() + dayName.slice(1), date, reportTime, source: 'body' };
  }
  return null;
}

// Filename fallback: "PRONOSTICO EXTENDIDO-18-06-2026-1700Z-FM.pdf"
function parseFilename(filename = '') {
  const m = filename.match(/(\d{2})-(\d{2})-(\d{4})-(\d{2})(\d{2})z/i);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi] = m;
  return {
    dayName: null,
    date: { d: +dd, m: +mm, y: +yyyy, iso: `${yyyy}-${mm}-${dd}` },
    reportTime: `${hh}:${mi} Z`,
    source: 'filename',
  };
}

function parseDays(dayLines) {
  const dias = [];
  let cur = null;
  for (const ln of dayLines) {
    if (isDayHeader(ln)) {
      cur = { day: ln.replace(/\s*:\s*$/, '').trim(), periods: [] };
      dias.push(cur);
      continue;
    }
    if (!cur) continue;
    const pm = ln.match(/^(Mañana|Madrugada|Tarde|Noche)\s*:\s*(.*)$/i);
    if (pm) {
      cur.periods.push({ label: pm[1], text: pm[2].trim() });
    } else if (cur.periods.length) {
      cur.periods[cur.periods.length - 1].text += ' ' + ln.trim();
    } else {
      cur.periods.push({ label: null, text: ln.trim() });
    }
  }
  return dias;
}

function parseSun(rawLines) {
  // The two times sit on a line of their own, e.g. "6:03 19:18".
  for (let i = 0; i < rawLines.length; i++) {
    const m = key(rawLines[i]).match(/^(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s*$/);
    if (m) return { salida: m[1], puesta: m[2] };
  }
  // Fallback: times anywhere near a "salida del sol" mention.
  const blob = rawLines.join(' ');
  const all = blob.match(/\b\d{1,2}:\d{2}\b/g) || [];
  if (all.length >= 2) return { salida: all[all.length - 2], puesta: all[all.length - 1] };
  return { salida: null, puesta: null };
}

export function parseReport(rawLines, { filename = '' } = {}) {
  const meta = parseDateline(rawLines) || parseFilename(filename) || { dayName: null, date: null, reportTime: null, source: 'none' };
  if (meta.source !== 'filename' && (!meta.date)) {
    const fn = parseFilename(filename);
    if (fn) Object.assign(meta, { date: fn.date });
  }

  const lines = rawLines.filter((l) => !isBoilerplate(l));

  const idx = {
    puntaCana: findIndex(lines, HEADERS.puntaCana),
    condicionesGenerales: findIndex(lines, HEADERS.condicionesGenerales),
    marino: findIndex(lines, HEADERS.marino),
    maritimas: findIndex(lines, HEADERS.maritimas),
    playa: findIndex(lines, HEADERS.playa),
  };
  // First day header after "condiciones generales".
  let firstDay = -1;
  for (let i = (idx.condicionesGenerales >= 0 ? idx.condicionesGenerales + 1 : 0); i < lines.length; i++) {
    if (isDayHeader(lines[i])) { firstDay = i; break; }
  }

  const boundaries = [idx.condicionesGenerales, firstDay, idx.marino, idx.maritimas, idx.playa]
    .filter((n) => n >= 0);

  // Helper: inline text after the ":" on a header line + following lines.
  const sectionFromHeader = (i, extraBoundaries = boundaries) => {
    if (i < 0) return '';
    const inline = lines[i].replace(/^[^:]*:\s*/, '').trim();
    const rest = collectUntil(lines, i, extraBoundaries);
    return [inline, ...rest].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  };

  const puntaCana = sectionFromHeader(idx.puntaCana, [idx.condicionesGenerales, firstDay, idx.marino].filter((n) => n >= 0));
  const condicionesLines = idx.condicionesGenerales >= 0
    ? collectUntil(lines, idx.condicionesGenerales, [firstDay, idx.marino].filter((n) => n >= 0))
    : [];

  const dayBlock = (firstDay >= 0 && idx.marino >= 0) ? lines.slice(firstDay, idx.marino)
    : (firstDay >= 0 ? lines.slice(firstDay) : []);

  // Page-2 tail (sun line, forecaster names) must not bleed into "playa".
  const tailIdx = lines.findIndex((l) => /^salida del sol\b/.test(key(l)));

  const marino = sectionFromHeader(idx.marino, [idx.maritimas, idx.playa].filter((n) => n >= 0));
  const maritimas = sectionFromHeader(idx.maritimas, [idx.playa].filter((n) => n >= 0));
  const playa = sectionFromHeader(idx.playa, tailIdx >= 0 ? [tailIdx] : []);

  // Optional: forecasters = the line right before "PRONOSTICADORES".
  const pIdx = rawLines.findIndex((l) => /^pronosticadores\s*$/.test(key(l)));
  const pronosticadores = pIdx > 0 ? rawLines[pIdx - 1].trim() : null;

  const tempMatch = puntaCana.match(/temperatura actual:\s*([\d.,]+)\s*°?\s*c/i);

  const sol = parseSun(rawLines);

  const report = {
    meta: { ...meta, temperaturaActual: tempMatch ? tempMatch[1] : null, pronosticadores },
    secciones: {
      puntaCana,
      condicionesGenerales: condicionesLines,
      pronostico: { dias: parseDays(dayBlock) },
      marino,
      maritimas,
      playa,
    },
    sol,
  };

  // Surface what is missing so the UI checklist can react.
  const warnings = [];
  if (!report.meta.date) warnings.push('date');
  if (!puntaCana) warnings.push('puntaCana');
  if (!condicionesLines.length) warnings.push('condicionesGenerales');
  if (!report.secciones.pronostico.dias.length) warnings.push('pronostico');
  if (!marino) warnings.push('marino');
  if (!sol.salida || !sol.puesta) warnings.push('sol');
  report.warnings = warnings;

  return report;
}
