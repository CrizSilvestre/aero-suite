// src/emailTemplate.mjs — structured report -> fixed corporate HTML email.
// The STRUCTURE here is the mandated format; only the slot values change.
import { CONFIG } from './config.mjs';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function autoGreeting(reportTime) {
  const m = String(reportTime || '').match(/(\d{1,2}):\d{2}\s*([ap])/i);
  if (!m) return 'Buenas tardes,';
  let h = parseInt(m[1], 10) % 12;
  if (/p/i.test(m[2])) h += 12;
  if (h < 12) return 'Buenos días,';
  if (h < 19) return 'Buenas tardes,';
  return 'Buenas noches,';
}

// Outlook de escritorio (Windows) renderiza con el motor de Word, que NO hereda la
// fuente del <div> padre → sin esto los <p>/<li> caen a Times New Roman en una PC
// corporativa y el correo "se ve más feo". Por eso la fuente va EN CADA elemento, y
// el interlineado en pt con mso-line-height-rule (Word ignora line-height:1.45).
const fontCss = (cfg) => `font-family:${cfg.font.family};font-size:${cfg.font.size};`
  + 'color:#000000;line-height:17pt;mso-line-height-rule:exactly';

const block = (titleHtml, bodyHtml, font) =>
  `<p style="${font};margin:0 0 11pt">${titleHtml ? `<strong>${titleHtml}</strong><br>` : ''}${bodyHtml}</p>`;

function renderDays(dias, showHeading, font) {
  const out = [];
  if (showHeading) out.push(`<p style="${font};margin:0 0 11pt"><strong>Pronóstico:</strong></p>`);
  for (const d of dias) {
    const lines = d.periods.map((p) =>
      p.label ? `${esc(p.label)}: ${esc(p.text)}` : esc(p.text)).join('<br>');
    out.push(block(`${esc(d.day)}:`, lines, font));
  }
  return out.join('\n');
}

function renderCondiciones(lines, bullets, font) {
  if (bullets) {
    const items = lines.map((l) => `<li style="${font}">${esc(l)}</li>`).join('');
    return `<p style="${font};margin:0 0 4pt"><strong>CONDICIONES GENERALES:</strong></p>`
      + `<ul style="${font};margin:0 0 11pt;padding-left:22px">${items}</ul>`;
  }
  return `<p style="${font};margin:0 0 11pt"><strong>CONDICIONES GENERALES:</strong><br>${lines.map(esc).join('<br>')}</p>`;
}

// images: { radar?: {cid}, windy?: {cid} } — only the cid is needed here.
export function buildEmailHtml(report, images = {}, opts = {}) {
  const cfg = { ...CONFIG, ...opts };
  const s = report.secciones;
  const greeting = cfg.greetingAuto ? autoGreeting(report.meta?.reportTime) : cfg.greeting;
  const font = fontCss(cfg);

  // Display width = signature width (configurable). Cap a large source down to
  // that target so it matches the signature; never upscale a smaller one (blurs).
  const imgTag = (im, alt) => {
    const target = cfg.imageWidth || cfg.image.width;
    const w = Math.min(im.width || target, target);
    return `<p style="${font};margin:0 0 11pt"><img src="cid:${im.cid}" alt="${esc(alt)}" width="${w}" ` +
      `style="width:${w}px;max-width:100%;height:auto;display:block;border:0"></p>`;
  };

  const parts = [
    `<p style="${font};margin:0 0 11pt">${esc(greeting)}</p>`,
    `<p style="${font};margin:0 0 11pt">${esc(cfg.intro)}</p>`,
    block('PUNTA CANA Y ÁREAS VECINAS:', esc(s.puntaCana), font),
    renderCondiciones(s.condicionesGenerales, cfg.bulletsCondiciones, font),
    renderDays(s.pronostico.dias, cfg.showPronosticoHeading, font),
    block('PRONOSTICO MARINO EXTENDIDO A 3 DÍAS:', esc(s.marino), font),
    s.maritimas ? block('CONDICIONES MARÍTIMAS:', esc(s.maritimas), font) : '',
    s.playa ? block('CONDICIONES MARÍTIMAS EN ÁREAS DE PLAYA:', esc(s.playa), font) : '',
    block(null,
      `<strong>Salida del Sol:</strong> ${esc(report.sol?.salida || '')}<br>` +
      `<strong>Puesta del Sol:</strong> ${esc(report.sol?.puesta || '')}`, font),
    images.radar ? imgTag(images.radar, 'Radar / satélite') : '',
    images.windy ? imgTag(images.windy, 'Windy') : '',
    cfg.signatureHtml || '',
  ];

  const body = parts.filter(Boolean).join('\n');
  return `<div style="font-family:${cfg.font.family};font-size:${cfg.font.size};` +
    `color:#000000;line-height:17pt">\n${body}\n</div>`;
}
