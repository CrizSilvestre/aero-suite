// src/config.mjs — defaults. The BCC list and signature are user-editable in the
// UI and persisted to localStorage; these are only the shipped fallbacks.
export const CONFIG = {
  subject: 'Weather',
  // Reproduces the corporate sample verbatim (note: ONAMET's wording).
  // Set greetingAuto:true to derive "Buenos días / Buenas tardes / Buenas noches"
  // from the report time instead.
  greeting: 'Buenos tardes,',
  greetingAuto: false,
  intro: 'Vía la presente les enviamos el reporte meteorológico actual.',
  showPronosticoHeading: false, // true => render a "Pronóstico:" heading above the day blocks

  font: { family: 'Arial, sans-serif', size: '12pt' },
  // Ancho por defecto 530 px (= ancho del banner de la firma). El usuario puede
  // ajustarlo con la ruedita; este es solo el valor inicial.
  image: { width: 530, maxHeight: 1100, mime: 'image/png', quality: 0.92 },

  // ⚠️ Vacío a propósito: la lista REAL de distribución NO se versiona.
  // Opciones para cargarla:
  //   a) cada usuario la agrega en la web (se guarda en su navegador), o
  //   b) editas esta línea en tu copia local / despliegue privado.
  // Formato: defaultBcc: ['correo1@dominio.com', 'correo2@dominio.com'],
  defaultBcc: [],

  // No signature is injected into the email. Each sender already has their own
  // signature configured in Outlook, which is what must appear on the final mail.
  // (Optional) an individual agent could paste their personal signature HTML here
  // to embed it, but the default is intentionally empty.
  signatureHtml: '',

  storageKeys: {
    bcc: 'aerowx.bcc',
    signature: 'aerowx.signature',
    options: 'aerowx.options',
  },
};
