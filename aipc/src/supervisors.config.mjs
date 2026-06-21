// src/supervisors.config.mjs — directorio de supervisores (editable).
// Fuente única: nombre VISIBLE (como sale en el correo), teléfono y grupo.
// Tomado de "Nueva Asignacion de supervisores en turno.xlsx" + tus listas de grupo.
// El PDF Mandos Medios solo aporta QUIÉN trabaja y su TURNO (se cruza por nombre).

export const GROUP_TITLES = {
  Centro: 'Supervisor de Centro de Operaciones',
  Rampa1: 'Supervisor de Operaciones Rampa 1',
  MakeUp: 'Supervisor de Operaciones Make Up',
};
export const GROUP_ORDER = ['Centro', 'Rampa1', 'MakeUp'];

export const SUPERVISORS = [
  { name: 'MARY ZAIDA CASTILLO', phone: '(809) 206-6038', group: 'Centro' },
  { name: 'VICTOR ISMAEL CEDANO', phone: '(829) 802-4873', group: 'Centro' },
  { name: 'JUAN EMILIO DEL ROSARIO DE LA CRUZ', phone: '(809) 796-6448', group: 'Rampa1' },
  { name: 'MANUEL ALEJANDRO NUÑEZ', phone: '(809) 796-5322', group: 'Rampa1' },
  { name: 'OMAR PEREZ HERNANDEZ', phone: '(829) 257-3738', group: 'Rampa1' },
  { name: 'LORENNY RIJO', phone: '(829) 257-3738', group: 'Rampa1' },
  { name: 'CHRISTIAN CABRAL', phone: '(829) 257-3738', group: 'Rampa1' },
  { name: 'FRANKLYN REYNARDO GONZALEZ', phone: '(829) 257-3738', group: 'Rampa1' },
  { name: 'TONY IMBERT', phone: '(829) 257-3738', group: 'Rampa1' },
  { name: 'CRISTHOFER ROBLES PAEZ', phone: '(809) 390-0890', group: 'MakeUp' },
  { name: 'MANUEL ALEJANDRO SANTANA ABREU', phone: '(809) 769-5519', group: 'MakeUp' },
  { name: 'ALEXANDER SABINO DEL ROSARIO', phone: '(809) 257-6797', group: 'MakeUp' },
  { name: 'DAVID ARTURO GARCIA BRITO', phone: '(829) 761-4580', group: 'MakeUp' },
  { name: 'BERLY VARGAS', phone: '(829) 257-4674', group: 'MakeUp' }, // PDF: "BERLY ALFRANDY VARGAS GARCIA"
];

// Trabaja SOLO si el turno es un rango horario real; el resto (LIBRE/VAC/TRAINING/HE/LHE…) se excluye.
export const isWorkingShift = (s) => /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(String(s || '').trim());
