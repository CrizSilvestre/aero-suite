// src/supervisorEngine.mjs — del horario (PDF) + directorio → asignación del día.
// Cruza el nombre del PDF con el directorio por solape de tokens (tolera variantes:
// "BERLY"≠"Beryl", nombres parciales "…CASTILLO" vs "…CASTILLO MERCEDES").
import { SUPERVISORS, GROUP_TITLES, GROUP_ORDER, isWorkingShift } from './supervisors.config.mjs';

const deaccent = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const tokensOf = (s) => new Set(deaccent(s).toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 2));

function matchSupervisor(empName) {
  const et = tokensOf(empName);
  let best = null; let score = 0;
  for (const sup of SUPERVISORS) {
    const overlap = [...tokensOf(sup.name)].filter((t) => et.has(t)).length;
    if (overlap > score) { score = overlap; best = sup; }
  }
  return score >= 2 ? best : null;   // ≥2 tokens en común para asignar con confianza
}

const startMin = (shift) => {
  const m = String(shift).match(/^(\d{1,2}):(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : 9999;
};

// schedule: salida de parseSchedule. day: número del mes (1..31).
export function buildSupervisorAssignment(schedule, { day }) {
  const buckets = { Centro: [], Rampa1: [], MakeUp: [] };
  const seen = new Set();
  for (const emp of schedule.employees) {
    const shift = (emp.shifts[day] || '').trim();
    if (!isWorkingShift(shift)) continue;          // excluir LIBRE/VAC/TRAINING/HE/…
    const sup = matchSupervisor(emp.name);
    if (!sup || seen.has(sup.name)) continue;      // no es supervisor de las listas / ya contado
    seen.add(sup.name);
    buckets[sup.group].push({ name: sup.name, phone: sup.phone, shift, _start: startMin(shift) });
  }
  return GROUP_ORDER.map((g) => ({
    key: g,
    title: GROUP_TITLES[g],
    rows: buckets[g]
      .sort((a, b) => a._start - b._start)         // dentro del grupo, por hora de inicio
      .map((r, i) => ({ n: i + 1, name: r.name, phone: r.phone, shift: r.shift })),
  }));
}
