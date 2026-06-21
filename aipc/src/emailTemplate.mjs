// src/emailTemplate.mjs — cuerpo del correo corporativo (estructura fija) + tabla
// navy + firma. Reproduce el correo real (asunto, saludo, nota, slots, etc.).
import { CONFIG } from './config.mjs';
import { renderSupervisorTable } from './supervisorTable.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaMedia = (reportDay) => {
  const [y, m, d] = reportDay.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} ${y}`;        // "20 de junio 2026"
};

export function buildEmailHtml(groups, { reportDay, signatureHtml } = {}) {
  const cfg = CONFIG;
  // Outlook de escritorio (Windows) renderiza con el motor de Word, que NO hereda
  // la fuente del <div> padre → sin esto los <p>/<a> caen a Times New Roman y el
  // correo se ve distinto en una PC corporativa. Por eso la fuente va EN CADA
  // elemento, y el interlineado en pt con mso-line-height-rule (Word ignora 1.45).
  const baseFont = `font-family:${cfg.font.family};font-size:${cfg.font.size};color:#000000`;
  const p = (html) => `<p style="${baseFont};line-height:17pt;mso-line-height-rule:exactly;margin:0 0 11pt">${html}</p>`;
  const link = (href, text) => `<a href="${href}" style="font-family:${cfg.font.family};font-size:${cfg.font.size}">${text}</a>`;

  const parts = [
    p('Saludos'),
    p('Estimados,'),
    p(`Adjunto encontrarán la asignación de Correas, Posiciones &amp; Gates AIPC correspondiente al `
      + `<strong>${esc(fechaMedia(reportDay))}</strong> para <strong>${esc(cfg.terminals)}</strong>.`),
    p('Cualquier cambio en la programación les será notificado por las vías correspondientes.'),
    p(`Nota: Información disponible en tiempo real a través de la plataforma `
      + link(cfg.dashboardUrl, cfg.dashboardUrl)),
    p(`Solicite el usuario enviando un correo a `
      + link(`mailto:${cfg.slotsEmail}`, cfg.slotsEmail)),
    renderSupervisorTable(groups, { reportDay }),
    signatureHtml || cfg.signatureHtml || '',
  ];

  return `<div style="${baseFont};line-height:17pt">\n`
    + `${parts.filter(Boolean).join('\n')}\n</div>`;
}
