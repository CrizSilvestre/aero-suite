// app.mjs — UI controller. Pure orchestration; all logic lives in src/*.
import * as pdfjs from './vendor/pdf.min.mjs';
import { getPdfLines } from './src/pdfText.mjs';
import { parseReport } from './src/parser.mjs';
import { buildEmailHtml } from './src/emailTemplate.mjs';
import { buildEml, downloadEml } from './src/eml.mjs';
import { resizeImage } from './src/imageResize.mjs';
import { validate, isEmail } from './src/validate.mjs';
import { copyRichHtml, gmailComposeUrl } from './src/share.mjs';
import { CONFIG } from './src/config.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

const $ = (id) => document.getElementById(id);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const state = {
  pdfName: null,
  report: null,
  images: { radar: null, windy: null },     // each: { dataUrl, width, height, cid }
  bcc: load(CONFIG.storageKeys.bcc, CONFIG.defaultBcc.slice()),
  signature: load(CONFIG.storageKeys.signature, ''),
  options: load(CONFIG.storageKeys.options, { greetingAuto: CONFIG.greetingAuto, showPronosticoHeading: CONFIG.showPronosticoHeading }),
};
state.options.dest = state.options.dest || 'outlook';
state.options.imageWidth = state.options.imageWidth || CONFIG.image.width;

// Firma del usuario: el contenteditable ya devuelve HTML, lo envolvemos con
// un margen superior para separar del cuerpo del correo.
function sigToHtml(s) {
  if (!s || !s.trim()) return '';
  return `<div style="margin:14pt 0 0">${s}</div>`;
}
function currentOpts() {
  return {
    greetingAuto: state.options.greetingAuto,
    showPronosticoHeading: state.options.showPronosticoHeading,
    signatureHtml: sigToHtml(state.signature),
    imageWidth: state.options.imageWidth,
    bulletsCondiciones: state.options.bulletsCondiciones,
  };
}

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---- file intake --------------------------------------------------------
async function onPdf(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const lines = await getPdfLines(doc);
    state.report = parseReport(lines, { filename: file.name });
    state.pdfName = file.name;
    const fp = $('drop-pdf');
    fp.classList.add('filled');
    fp.innerHTML = `<div class="name">📄 ${file.name}</div>` +
      `<div class="meta">${state.report.meta.dayName || ''} · ${state.report.meta.date?.iso || 'fecha no detectada'} · ${state.report.meta.reportTime || ''}` +
      `${state.report.warnings.length ? ' · ⚠ ' + state.report.warnings.join(', ') : ' · ✓ secciones completas'}</div>`;
    toast(state.report.warnings.length ? 'PDF procesado con avisos' : 'PDF procesado correctamente');
  } catch (e) {
    console.error(e); toast('No se pudo leer el PDF');
  }
  render();
}

async function onImage(kind, file) {
  if (!file) return;
  try {
    const out = await resizeImage(file);
    state.images[kind] = { ...out, cid: kind };
    const el = $(`drop-${kind}`);
    el.classList.add('filled');
    el.innerHTML = `<div class="name">${kind === 'radar' ? '🛰️' : '🌬️'} ${file.name}</div>` +
      `<div class="meta">${out.width}×${out.height}px · ~${Math.round(out.bytes / 1024)} KB</div>`;
  } catch (e) {
    console.error(e); toast('No se pudo procesar la imagen');
  }
  render();
}

// ---- BCC ----------------------------------------------------------------
const BCC_VISIBLE = 6;
let bccExpanded = false;

function renderBcc() {
  const wrap = $('bcc-chips'); wrap.innerHTML = '';
  const total = state.bcc.length;
  const hidden = total - BCC_VISIBLE;
  const showAll = bccExpanded || total <= BCC_VISIBLE;

  state.bcc.forEach((email, i) => {
    const ok = isEmail(email);
    const chip = document.createElement('span');
    chip.className = 'chip' + (ok ? '' : ' bad');
    if (!showAll && i >= BCC_VISIBLE) chip.classList.add('chip-hidden');
    chip.innerHTML = `${email} <button title="quitar">×</button>`;
    chip.querySelector('button').onclick = () => { state.bcc.splice(i, 1); persistBcc(); };
    wrap.appendChild(chip);
  });

  // Toggle button "...+N más" / "Ver menos"
  if (total > BCC_VISIBLE) {
    const toggle = document.createElement('button');
    toggle.className = 'chip chip-toggle';
    toggle.textContent = showAll ? '⇡ Ver menos' : `⋯ +${hidden} más`;
    toggle.title = showAll ? 'Ocultar correos extra' : `Mostrar ${hidden} correos más`;
    toggle.onclick = () => { bccExpanded = !bccExpanded; renderBcc(); };
    wrap.appendChild(toggle);
  }

  $('tb-bcc').textContent = total;
}
function persistBcc() { save(CONFIG.storageKeys.bcc, state.bcc); renderBcc(); render(); }
function addBcc() {
  const inp = $('bcc-input'); const v = inp.value.trim();
  if (!v) return;
  v.split(/[,;\s]+/).filter(Boolean).forEach((e) => { if (!state.bcc.includes(e)) state.bcc.push(e); });
  inp.value = ''; persistBcc();
}

// ---- preview + validation ----------------------------------------------
function previewHtml() {
  const opts = currentOpts();
  let html = buildEmailHtml(state.report, { radar: state.images.radar, windy: state.images.windy }, opts);
  // swap cid: refs for inline data URLs so the preview shows the images
  for (const k of ['radar', 'windy']) {
    if (state.images[k]) html = html.replaceAll(`cid:${k}`, state.images[k].dataUrl);
  }
  return html;
}

function renderChecklist() {
  const { checks, ready } = validate(state);
  $('checklist').innerHTML = checks.map((c) =>
    `<div class="check ${c.ok ? 'ok' : 'no'}"><span class="ic">${c.ok ? '✓' : ''}</span>` +
    `<span class="lbl">${c.label}</span><span class="det">${c.detail || ''}</span></div>`).join('');
  return ready;
}

function setStep(name, cls) {
  const el = document.querySelector(`.step[data-step="${name}"]`);
  el.classList.remove('done', 'active'); if (cls) el.classList.add(cls);
}

function render() {
  // preview
  if (state.report) $('preview').innerHTML = previewHtml();
  $('mailmeta').innerHTML = state.report
    ? `<b>${state.report.meta.dayName || ''}</b> ${state.report.meta.date?.iso || ''}` : '';
  // checklist + button
  const ready = renderChecklist();
  $('generate').disabled = !ready;
  // pipeline
  setStep('pdf', state.pdfName ? 'done' : 'active');
  setStep('datos', state.report ? 'done' : (state.pdfName ? 'active' : ''));
  setStep('img', (state.images.radar && state.images.windy) ? 'done' : (state.report ? 'active' : ''));
  setStep('valid', ready ? 'done' : ((state.images.radar || state.images.windy) ? 'active' : ''));
  setStep('out', ready ? 'active' : '');
}

// ---- generate -----------------------------------------------------------
async function generate() {
  const bcc = state.bcc.filter(isEmail);

  // Gmail / webmail: copia el correo con formato (imágenes inline) y abre Gmail
  // con Asunto + CCO; el usuario pega una vez (Ctrl/Cmd+V) y envía.
  if (state.options.dest === 'gmail') {
    const ok = await copyRichHtml(previewHtml());
    window.open(gmailComposeUrl({ subject: CONFIG.subject, bcc }), '_blank', 'noopener');
    toast(ok ? 'Correo copiado · pega (Ctrl/Cmd+V) en Gmail y envía'
             : 'Abre Gmail y pega el correo (Ctrl/Cmd+V)');
    return;
  }

  // Outlook escritorio: .eml con X-Unsent (borrador con imágenes y CCO).
  const opts = currentOpts();
  const images = [];
  for (const k of ['radar', 'windy']) {
    if (state.images[k]) {
      const ext = (state.images[k].mime || 'image/png').split('/')[1];
      images.push({ cid: k, filename: `${k}.${ext}`, dataUrl: state.images[k].dataUrl });
    }
  }
  const html = buildEmailHtml(state.report, { radar: state.images.radar, windy: state.images.windy }, opts);
  const eml = buildEml({ subject: CONFIG.subject, bcc, html, images });
  const stamp = state.report.meta.date?.iso || 'reporte';
  const opened = await downloadEml(eml, `Weather-${stamp}.eml`);
  toast(opened
    ? 'Outlook abierto · revisa el borrador y envía'
    : 'Weather.eml descargado · ábrelo para crear el borrador en Outlook');
}

// ---- wiring -------------------------------------------------------------
function wireDrop(dropId, inputId, handler) {
  const drop = $(dropId), input = $(inputId);
  drop.onclick = () => input.click();
  input.onchange = () => handler(input.files[0]);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handler(e.dataTransfer.files[0]));
}

wireDrop('drop-pdf', 'file-pdf', onPdf);
wireDrop('drop-radar', 'file-radar', (f) => onImage('radar', f));
wireDrop('drop-windy', 'file-windy', (f) => onImage('windy', f));

// Pegar imagen del portapapeles (⌘/Ctrl+V) en la zona activa.
let hoverZone = null, lastZone = null;
for (const kind of ['radar', 'windy']) {
  const el = $(`drop-${kind}`);
  el.addEventListener('mouseenter', () => { hoverZone = kind; });
  el.addEventListener('mouseleave', () => { if (hoverZone === kind) hoverZone = null; });
  el.addEventListener('focus', () => { lastZone = kind; });
  el.addEventListener('click', () => { lastZone = kind; });
}
function pasteTarget() {
  if (hoverZone) return hoverZone;
  const ae = document.activeElement;
  if (ae === $('drop-radar')) return 'radar';
  if (ae === $('drop-windy')) return 'windy';
  if (lastZone) return lastZone;
  if (!state.images.radar) return 'radar';
  if (!state.images.windy) return 'windy';
  return 'radar';
}
document.addEventListener('paste', (e) => {
  const items = [...(e.clipboardData?.items || [])];
  const imgItem = items.find((it) => it.type && it.type.startsWith('image/'));
  if (!imgItem) return;                       // no es imagen → no interferir (p. ej. pegar texto en CCO)
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
  const blob = imgItem.getAsFile();
  if (!blob) return;
  e.preventDefault();
  const kind = pasteTarget();
  const file = new File([blob], blob.name || 'pegado.png', { type: blob.type || 'image/png' });
  onImage(kind, file);
  toast(`Imagen pegada en ${kind === 'radar' ? 'Radar / satélite' : 'Windy'}`);
});

$('bcc-add').onclick = addBcc;
$('bcc-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBcc(); } });
$('bcc-reset').onclick = () => { state.bcc = CONFIG.defaultBcc.slice(); persistBcc(); };

$('opt-greeting').checked = state.options.greetingAuto;
$('opt-heading').checked = state.options.showPronosticoHeading;
$('opt-greeting').onchange = (e) => { state.options.greetingAuto = e.target.checked; save(CONFIG.storageKeys.options, state.options); render(); };
$('opt-heading').onchange = (e) => { state.options.showPronosticoHeading = e.target.checked; save(CONFIG.storageKeys.options, state.options); render(); };
$('opt-bullets').checked = state.options.bulletsCondiciones;
$('opt-bullets').onchange = (e) => { state.options.bulletsCondiciones = e.target.checked; save(CONFIG.storageKeys.options, state.options); render(); };

// Signature: contenteditable div that preserves rich HTML from Outlook paste.
const sigEl = $('signature-input');
sigEl.innerHTML = state.signature;
function persistSig() {
  state.signature = sigEl.innerHTML.replace(/^(<br\s*\/?>\s*)+$/i, '');  // treat only <br> as empty
  save(CONFIG.storageKeys.signature, state.signature);
  $('sig-status').textContent = state.signature ? '✓ Firma guardada' : '';
  render();
}
sigEl.addEventListener('input', persistSig);
$('sig-clear').onclick = () => { sigEl.innerHTML = ''; persistSig(); };
$('sig-status').textContent = state.signature ? '✓ Firma guardada' : '';

$('img-width').value = state.options.imageWidth;
$('img-width').addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  if (v >= 100 && v <= 2000) { state.options.imageWidth = v; save(CONFIG.storageKeys.options, state.options); render(); }
});

function updateDestUI() {
  const gmail = state.options.dest === 'gmail';
  $('generate').textContent = gmail ? 'Copiar correo y abrir Gmail' : 'Generar correo y abrir en Outlook';
  $('gen-hint').innerHTML = gmail
    ? 'Se copia el correo con formato e imágenes; pégalo (Ctrl/Cmd+V) en Gmail y envía.'
    : 'Se descargará <b>Weather.eml</b>; ábrelo para que Outlook cree el borrador.';
}
document.querySelectorAll('input[name="dest"]').forEach((r) => {
  r.checked = (r.value === state.options.dest);
  r.onchange = () => { if (r.checked) { state.options.dest = r.value; save(CONFIG.storageKeys.options, state.options); updateDestUI(); } };
});

$('generate').onclick = generate;
document.getElementById('year').textContent = new Date().getFullYear();

updateDestUI();
renderBcc();
render();
