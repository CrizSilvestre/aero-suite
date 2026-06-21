// src/share.mjs — alternativa a Outlook para usuarios de Gmail / webmail.
// Gmail web no abre .eml como borrador y su deep-link sólo acepta cuerpo en
// texto plano. La vía que conserva formato + imágenes es: copiar el correo
// HTML al portapapeles y abrir Gmail con Asunto + CCO; el usuario pega una vez.

export function gmailComposeUrl({ subject = 'Weather', bcc = [] } = {}) {
  const p = new URLSearchParams({ view: 'cm', fs: '1', su: subject });
  if (bcc.length) p.set('bcc', bcc.join(','));
  return 'https://mail.google.com/mail/?' + p.toString();
}

export function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.innerText;
}

// Copia HTML enriquecido (con imágenes inline) al portapapeles.
// Usa la Clipboard API moderna y cae a contenteditable+execCommand si no está
// disponible (p. ej. contexto no seguro / navegador viejo).
export async function copyRichHtml(html) {
  const text = htmlToText(html);
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      return true;
    } catch { /* cae al método de respaldo */ }
  }
  const div = document.createElement('div');
  div.contentEditable = 'true';
  div.innerHTML = html;
  Object.assign(div.style, { position: 'fixed', left: '-9999px', top: '0', whiteSpace: 'pre-wrap' });
  document.body.appendChild(div);
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  sel.removeAllRanges();
  div.remove();
  return ok;
}
