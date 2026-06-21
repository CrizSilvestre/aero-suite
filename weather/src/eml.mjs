// src/eml.mjs — assemble a MIME .eml that Outlook opens as a *new editable draft*.
// The key is the `X-Unsent: 1` header, which Outlook honours to open compose mode
// with Subject, Bcc, the HTML body and inline (cid) images pre-filled.
const CRLF = '\r\n';

function b64FromUtf8(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
const wrap76 = (b64) => b64.replace(/(.{76})/g, `$1${CRLF}`);

function dataUrlParts(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('Expected a base64 data URL for the image');
  return { mime: m[1], b64: m[2] };
}

// images: [{ cid, filename, dataUrl }]
export function buildEml({ subject = 'Weather', to = '', bcc = [], html, images = [], from = '' }) {
  const boundary = 'AEROWX_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const L = [];
  if (from) L.push('From: ' + from);
  L.push('To: ' + (to || ''));
  if (bcc.length) L.push('Bcc: ' + bcc.join(', '));
  L.push('Subject: ' + subject);
  L.push('X-Unsent: 1');
  L.push('Date: ' + new Date().toUTCString());
  L.push('MIME-Version: 1.0');
  L.push(`Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`);
  L.push('');
  L.push('--' + boundary);
  L.push('Content-Type: text/html; charset="utf-8"');
  L.push('Content-Transfer-Encoding: base64');
  L.push('');
  L.push(wrap76(b64FromUtf8(html)));
  for (const img of images) {
    const { mime, b64 } = dataUrlParts(img.dataUrl);
    L.push('--' + boundary);
    L.push(`Content-Type: ${mime}; name="${img.filename}"`);
    L.push('Content-Transfer-Encoding: base64');
    L.push(`Content-ID: <${img.cid}>`);
    L.push(`Content-Disposition: inline; filename="${img.filename}"`);
    L.push('');
    L.push(wrap76(b64));
  }
  L.push('--' + boundary + '--');
  L.push('');
  return L.join(CRLF);
}

// Browser: try the local server's open-eml endpoint first (auto-launches
// Outlook), fall back to a plain download if the server isn't available.
export async function downloadEml(eml, filename = 'Weather.eml') {
  try {
    const res = await fetch('/api/open-eml', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: eml,
    });
    if (res.ok) return true;           // server opened it in Outlook
  } catch { /* server not available (GitHub Pages, etc.) */ }

  // Fallback: download the .eml file for the user to open manually.
  const blob = new Blob([eml], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return false;
}
