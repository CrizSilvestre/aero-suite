// src/cellEdits.mjs — ediciones manuales de celdas del preview (edición libre + ferry).
// Se guardan POR SESIÓN (no en localStorage; dependen del lote del día) con la clave
// `${_fid}:${col}` — _fid = índice estable del vuelo en el lote, así la edición sigue al
// vuelo aunque las filas se reordenen. Se aplican sobre las filas YA calculadas, justo
// antes de mostrar el preview y de generar el Excel, para que preview = Excel.

// Columnas editables: todo menos VUELO (el nº es autonumerado por orden).
export const EDITABLE = ['aerolinea', 'vueloNo', 'sta', 'std', 'ruta', 'acType', 'handler',
  'paxIn', 'paxTransito', 'paxOut', 'correa', 'stand', 'gate', 'ckin'];

// Aplica las ediciones sobre las filas (muta y devuelve el mismo arreglo, conserva .diag).
export function applyEdits(rows, edits) {
  if (!edits) return rows;
  for (const r of rows) {
    for (const col of EDITABLE) {
      const k = `${r._fid}:${col}`;
      if (Object.prototype.hasOwnProperty.call(edits, k)) r[col] = edits[k];
    }
  }
  return rows;
}

// ¿La fila admite el atajo de ferry? Solo vuelos NO-OVER con alguna PAX vacía (N/A) o ya
// marcada FERRY (un OVER trae N/A por estructura, no por ir vacío → no es ferry).
export function isFerryable(row) {
  return !row.over && (['N/A', 'FERRY'].includes(row.paxIn) || ['N/A', 'FERRY'].includes(row.paxOut));
}

// ¿Está marcado como ferry ahora mismo? (alguna PAX dice FERRY)
export function isFerryMarked(row) {
  return row.paxIn === 'FERRY' || row.paxOut === 'FERRY';
}
