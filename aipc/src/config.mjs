// src/config.mjs — textos y valores corporativos del correo (editables).
export const CONFIG = {
  subject: 'Asignación de Correas, Posiciones & Gates AIPC',
  terminals: 'Terminal A & Terminal B',
  dashboardUrl: 'https://dashboard.puntacanainternationalairport.com',
  slotsEmail: 'slotspuntacana@ams.com.do',
  navyColor: '#1F3864',          // azul oscuro del encabezado de la tabla de supervisores
  font: { family: 'Arial, sans-serif', size: '12pt' },

  // Tabla de supervisores: título superior + ancho ~530px (coincide con la firma)
  supervisorTitle: 'SUPERVISORES DE OPERACIONES AIRSIDE EN TURNO',
  table: { width: 530, fontSize: '10pt' },

  attachmentName: 'CAE-GOA-F23 Asignación de Correas, Posiciones & Gates AIPC.xlsx',
  attachmentMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  // Editables en la web (como en AeroWeather), NO se versionan:
  defaultRecipients: [],         // To/CCO
  signatureHtml: '',             // cada agente pega su firma una vez

  storageKeys: { recipients: 'aipc.recipients', signature: 'aipc.signature', options: 'aipc.options', schedule: 'aipc.schedule' },
};
