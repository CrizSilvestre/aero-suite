// src/eml.mjs — .eml multipart/mixed: cuerpo HTML + el Excel ADJUNTO.
// Cabecera X-Unsent:1 → Outlook lo abre como borrador editable con el adjunto.
const CRLF = '\r\n';

function b64FromUtf8(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function b64FromBytes(input) {
  if (typeof Buffer !== 'undefined') return Buffer.from(input).toString('base64');
  const u = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  let bin = ''; const CH = 0x8000;
  for (let i = 0; i < u.length; i += CH) bin += String.fromCharCode.apply(null, u.subarray(i, i + CH));
  return btoa(bin);
}
const wrap76 = (b64) => b64.replace(/(.{76})/g, `$1${CRLF}`);
// Cabeceras no-ASCII: Subject RFC 2047, filename RFC 2231 (+ respaldo ASCII).
const encWord = (s) => (/^[\x00-\x7F]*$/.test(s) ? s : '=?UTF-8?B?' + b64FromUtf8(s) + '?=');
const asciiName = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '_');
const filenameStar = (s) => "UTF-8''" + encodeURIComponent(s).replace(/['()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// attachments: [{ filename, content (Buffer/Uint8Array/ArrayBuffer o base64 string), contentType }]
export function buildEml({ subject = 'Asignación', to = '', bcc = [], html, attachments = [] }) {
  const bnd = 'AIPC_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const L = [];
  L.push('To: ' + (to || ''));
  if (bcc.length) L.push('Bcc: ' + bcc.join(', '));
  L.push('Subject: ' + encWord(subject));
  L.push('X-Unsent: 1');
  L.push('Date: ' + new Date().toUTCString());
  L.push('MIME-Version: 1.0');
  L.push(`Content-Type: multipart/mixed; boundary="${bnd}"`);
  L.push('');
  L.push('--' + bnd);
  L.push('Content-Type: text/html; charset="utf-8"');
  L.push('Content-Transfer-Encoding: base64');
  L.push('');
  L.push(wrap76(b64FromUtf8(html)));
  for (const att of attachments) {
    const data = typeof att.content === 'string' ? att.content : b64FromBytes(att.content);
    L.push('--' + bnd);
    L.push(`Content-Type: ${att.contentType || 'application/octet-stream'}; name="${asciiName(att.filename)}"`);
    L.push('Content-Transfer-Encoding: base64');
    L.push(`Content-Disposition: attachment; filename="${asciiName(att.filename)}"; filename*=${filenameStar(att.filename)}`);
    L.push('');
    L.push(wrap76(data));
  }
  L.push('--' + bnd + '--');
  L.push('');
  return L.join(CRLF);
}

// Navegador: intenta el endpoint local (autolanza Outlook) y cae a descarga.
export async function downloadEml(eml, filename = 'AIPC.eml') {
  try {
    const res = await fetch('/api/open-eml', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: eml });
    if (res.ok) return true;
  } catch { /* sin servidor (GitHub Pages) → descarga */ }
  const blob = new Blob([eml], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return false;
}
