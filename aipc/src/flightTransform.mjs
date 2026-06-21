// src/flightTransform.mjs — registros de vuelo → filas de la plantilla APC.
// Reglas descubiertas (trazables a los archivos del cliente):
//  - VUELO No.  = Llegada & "/" & número(Salida)  (normal; en OVER solo el vuelo que operó)
//  - RUTA       = FROM-PUJ-TO (normal) · PUJ-TO (OVER_IN) · FROM-PUJ (OVER_OUT) · PUJ (OVER doble)
//  - OVER_IN    = STA día anterior → STA="OVER", solo salida, PAX IN/TRÁNSITO = N/A, CORREA = N/A
//  - OVER_OUT   = STD día posterior → STD="OVER", solo llegada, PAX OUT = N/A, GATE = N/A
//  - MADRUGADA  = Si el vuelo cruza UNA medianoche (STD el día siguiente a STA) y SALE
//                 entre 00:00 y 01:59, NO es OVER (no es pernocta real; la regla es por
//                 la hora de SALIDA — llega de noche y sale 00:xx/01:xx = operación
//                 continua que conserva stand/gate/correa/pax). Desde 02:00 → lógica normal.
//  - N/A        = PAX vacío O 0 → "N/A"; CORREA/GATE vacío → "N/A"; STAND obligatorio
import { finalizeDateFormat } from './amsParse.mjs';

const NA = 'N/A';
const isEmpty = (v) => v === null || v === undefined
  || String(v).trim() === '' || String(v).trim().toLowerCase() === 'none';
const naIf = (v) => (isEmpty(v) ? NA : String(v).trim());
// PAX: además de vacío, un 0 también es N/A (parche del personal cuando AMS no acepta
// N/A; un ferry con 0 real lo editan a mano en el Excel).
const naPax = (v) => (isEmpty(v) || String(v).trim() === '0' ? NA : String(v).trim());
const isoDay = (dt) => (dt && dt.y ? `${dt.y}-${String(dt.mo).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}` : null);
const fmtTime = (dt) => (dt && dt.h != null ? `${dt.h}:${String(dt.mi).padStart(2, '0')}` : '');
// Siguiente día calendario (para la excepción de madrugada).
const nextDayISO = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function flightNo(arr, dep) {
  arr = (arr || '').trim(); dep = (dep || '').trim();
  const i = dep.indexOf(' ');
  const num = i >= 0 ? dep.slice(i + 1).trim() : dep;
  return num ? `${arr}/${num}` : arr;
}
// Clave numérica para ordenar por fecha/hora; sin fecha → al final.
const dtNum = (dt) => (dt && dt.y != null
  ? dt.y * 1e8 + dt.mo * 1e6 + dt.d * 1e4 + dt.h * 100 + dt.mi
  : Number.POSITIVE_INFINITY);

// flights → filas APC.
// Orden: los OVER (STA=OVER) van ARRIBA (por STD); el resto por STA ascendente.
export function toApcRows(flights, { reportDay }) {
  // Re-confirma D/M vs M/D usando el día del reporte como ancla (corrige el locale de
  // la PC corporativa y mantiene la detección estable aunque se cambie el día).
  // Idempotente: los componentes crudos _c1/_c2 se conservan en cada fecha.
  const fmt = finalizeDateFormat(flights, reportDay);

  const rows = flights.map((f, i) => {
    const sd = isoDay(f.staDT);
    const dd = isoDay(f.stdDT);
    // Excepción de madrugada: el vuelo cruza UNA medianoche (STD el día siguiente a STA)
    // y SALE entre 00:00 y 01:59 → no es pernocta real, se deja normal. La regla es por la
    // hora de SALIDA (stdH), y aplica venga de OVER en STA o en STD.
    const stdH = f.stdDT?.h;
    const madrugada = !!(sd && dd && dd === nextDayISO(sd) && stdH != null && stdH < 2);
    const overIn  = !!(sd && sd < reportDay) && !madrugada;   // llegó antes del día (sin madrugada)
    const overOut = !!(dd && dd > reportDay) && !madrugada;   // sale después del día (sin madrugada)

    let paxIn = naPax(f.paxIn);
    let paxTransito = naPax(f.paxTransito);
    let paxOut = naPax(f.paxOut);
    if (overIn) { paxIn = NA; paxTransito = NA; }
    if (overOut) { paxOut = NA; }

    // OVER: solo se muestra la dirección que operó (vuelo + ruta).
    const from = (f.from || '').trim();
    const to = (f.to || '').trim();
    let vueloNo;
    let rutaVal;
    if (overIn && overOut) { vueloNo = flightNo(f.arrFlight, f.depFlight); rutaVal = 'PUJ'; }
    else if (overIn) { vueloNo = (f.depFlight || '').trim(); rutaVal = `PUJ-${to}`; }
    else if (overOut) { vueloNo = (f.arrFlight || '').trim(); rutaVal = `${from}-PUJ`; }
    else { vueloNo = flightNo(f.arrFlight, f.depFlight); rutaVal = `${from}-PUJ-${to}`; }

    const correa = overIn ? NA : naIf(f.correa);   // OVER en STA → correa N/A (aduanas no la requiere)
    const gate = overOut ? NA : naIf(f.gate);      // OVER en STD → gate N/A (no lleva puerta)
    // Posible ferry (SOLO aviso/preview, NO toca el Excel): vuelo no-OVER que va vacío
    // sin la facilidad que le tocaría. Ferry-in (llega vacío) no usa correa; ferry-out
    // (sale vacío) no usa gate. Un comercial al que se le olvidó la data tendría gate/correa.
    const ferry = !overIn && !overOut
      && ((paxIn === NA && correa === NA) || (paxOut === NA && gate === NA));

    return {
      aerolinea: (f.airline || '').trim(),
      vueloNo,
      sta: overIn ? 'OVER' : fmtTime(f.staDT),
      std: overOut ? 'OVER' : fmtTime(f.stdDT),
      ruta: rutaVal,
      acType: (f.acType || '').trim(),
      handler: (f.handler || '').trim(),
      paxIn, paxTransito, paxOut,
      correa,
      stand: (f.stand || '').trim(),          // obligatorio (la validación marca si falta)
      gate,
      ckin: (f.ckin || '').trim(),
      over: overIn && overOut ? 'BOTH' : overIn ? 'IN' : overOut ? 'OUT' : null,
      ferry,
      _fid: i,                       // id estable del vuelo (índice en el lote) para ediciones manuales
      _staKey: dtNum(f.staDT),
      _stdKey: dtNum(f.stdDT),
    };
  });

  // Detalle por vuelo (alineado a flights ANTES de ordenar) para el log de diagnóstico.
  const detalle = rows.map((r, i) => ({
    vuelo: r.vueloNo,
    rawSTA: flights[i].sta, rawSTD: flights[i].std,
    staDia: isoDay(flights[i].staDT), stdDia: isoDay(flights[i].stdDT),
    over: r.over || '—',
  }));

  rows.sort((a, b) => {
    const aTop = a.sta === 'OVER';
    const bTop = b.sta === 'OVER';
    if (aTop !== bTop) return aTop ? -1 : 1;   // OVER (STA=OVER) arriba del todo
    if (aTop) return a._stdKey - b._stdKey;    // dentro del grupo OVER, por STD
    return a._staKey - b._staKey;              // el resto, por STA ascendente
  });
  rows.forEach((r, i) => { r.vuelo = i + 1; });

  // Diagnóstico de clasificación (logs en la PC corporativa + advertencia de 0 OVER).
  // No enumerable → no afecta a quien itere el arreglo (Excel/preview/tests).
  const overIn = rows.filter((r) => r.over === 'IN' || r.over === 'BOTH').length;
  const overOut = rows.filter((r) => r.over === 'OUT' || r.over === 'BOTH').length;
  const both = rows.filter((r) => r.over === 'BOTH').length;
  const sinFecha = flights.filter((f) => !isoDay(f.staDT) && !isoDay(f.stdDT)).length;
  Object.defineProperty(rows, 'diag', {
    enumerable: false,
    value: {
      reportDay,
      formato: fmt.dayFirst ? 'D/M (día/mes)' : 'M/D (mes/día)',
      metodo: fmt.method,           // reportDay | votos | defecto
      total: rows.length,
      over: overIn + overOut - both,
      overIn, overOut, sinFecha, detalle,
    },
  });
  return rows;
}
