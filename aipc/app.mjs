// app.mjs — orquestación de la GUI (lógica en src/*).
import * as pdfjs from './vendor/pdf.min.mjs';
import { parseAmsClipboard } from './src/amsParse.mjs';
import { toApcRows } from './src/flightTransform.mjs';
import { fillApcTemplate } from './src/xlsxApc.mjs';
import { itemsFromTextContent, parseSchedule } from './src/pdfSchedule.mjs';
import { buildSupervisorAssignment } from './src/supervisorEngine.mjs';
import { buildEmailHtml } from './src/emailTemplate.mjs';
import { renderApcTable } from './src/apcPreview.mjs';
import { applyEdits, isFerryMarked } from './src/cellEdits.mjs';
import { buildEml, downloadEml } from './src/eml.mjs';
import { copyRichHtml, gmailComposeUrl, outlookWebComposeUrl } from './src/share.mjs';
import { CONFIG } from './src/config.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

const $ = (id) => document.getElementById(id);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim());
const tomorrowISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const savedSchedule = load(CONFIG.storageKeys.schedule, null);
const state = {
  flights: [],
  schedule: savedSchedule?.schedule || null,   // el horario (mensual) se guarda en el navegador
  pdfName: savedSchedule?.pdfName || null,
  day: tomorrowISO(),
  bcc: load(CONFIG.storageKeys.recipients, CONFIG.defaultRecipients.slice()),
  signature: load(CONFIG.storageKeys.signature, ''),
  options: load(CONFIG.storageKeys.options, { dest: 'outlook' }),
  cellEdits: {},   // ediciones manuales del preview (edición libre + ferry); por sesión, NO se guardan
};
state.options.dest = state.options.dest || 'outlook';

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800);
}

const dayNum = () => parseInt(state.day.split('-')[2], 10);
const apcRows = () => (state.flights.length ? toApcRows(state.flights, { reportDay: state.day }) : []);
// Filas con las ediciones manuales aplicadas (lo que se ve en el preview y va al Excel).
let lastRows = [];
const editedRows = () => { lastRows = applyEdits(apcRows(), state.cellEdits); return lastRows; };
const groups = () => (state.schedule ? buildSupervisorAssignment(state.schedule, { day: dayNum() }) : []);
const sigHtml = () => state.signature;

// ---- AMS ----------------------------------------------------------------
function onAms(text) {
  state.flights = parseAmsClipboard(text || '');
  state.cellEdits = {};   // datos nuevos → se reinician las ediciones manuales
  $('ams-status').textContent = `${state.flights.length} vuelos`;
  if (state.flights.length) toast(`${state.flights.length} vuelos leídos de AMS`);
  render();
}

// ---- PDF ----------------------------------------------------------------
async function onPdf(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const tc = await (await doc.getPage(1)).getTextContent();
    state.schedule = parseSchedule(itemsFromTextContent(tc));
    state.pdfName = file.name;
    save(CONFIG.storageKeys.schedule, { pdfName: state.pdfName, schedule: state.schedule });
    markPdf();
    toast('Horario procesado y guardado');
  } catch (e) { console.error(e); toast('No se pudo leer el PDF'); }
  render();
}

function truncName(name, max = 45) {
  if (!name || name.length <= max) return name;
  const ext = name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, name.length - ext.length);
  const keep = max - ext.length - 1; // 1 for the ellipsis char
  return base.slice(0, keep) + '…' + ext;
}

function markPdf() {
  if (!state.schedule) return;
  const fp = $('drop-pdf');
  fp.classList.add('filled');
  const displayName = truncName(state.pdfName) || 'Horario';
  fp.innerHTML = `<div class="name" title="${(state.pdfName || '').replace(/"/g, '&quot;')}">📄 ${displayName}</div>`
    + `<div class="meta">${state.schedule.employees.length} empleados · ${state.schedule.days.length} días · guardado ✓</div>`;
  $('pdf-hint').innerHTML = 'Guardado para el mes — no hay que volver a subirlo. <a href="#" id="pdf-clear">Quitar</a>';
  $('pdf-clear').onclick = (e) => { e.preventDefault(); clearPdf(); };
}
function clearPdf() {
  state.schedule = null; state.pdfName = null;
  localStorage.removeItem(CONFIG.storageKeys.schedule);
  const fp = $('drop-pdf'); fp.classList.remove('filled');
  fp.innerHTML = '<div class="big">📄</div><div>Arrastra el <b>PDF del horario</b> (Mandos Medios)<br>o haz clic para seleccionar</div>';
  $('pdf-hint').textContent = 'El turno de cada supervisor sale del PDF según el día.';
  render();
}

// ---- BCC (con colapso: muestra 6 y "⋯ +N más", como AeroWeather) ---------
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

  if (total > BCC_VISIBLE) {
    const toggle = document.createElement('button');
    toggle.className = 'chip chip-toggle';
    toggle.textContent = showAll ? '⇡ Ver menos' : `⋯ +${hidden} más`;
    toggle.title = showAll ? 'Ocultar correos extra' : `Mostrar ${hidden} correos más`;
    toggle.onclick = () => { bccExpanded = !bccExpanded; renderBcc(); };
    wrap.appendChild(toggle);
  }
}
function persistBcc() { save(CONFIG.storageKeys.recipients, state.bcc); renderBcc(); render(); }
function addBcc() {
  const inp = $('bcc-input'); const v = inp.value.trim();
  if (!v) return;
  v.split(/[,;\s]+/).filter(Boolean).forEach((e) => { if (!state.bcc.includes(e)) state.bcc.push(e); });
  inp.value = ''; persistBcc();
}

// ---- validación + preview ----------------------------------------------
function validate() {
  const g = groups();
  const supCount = g.reduce((n, x) => n + x.rows.length, 0);
  const bcc = state.bcc.filter(isEmail);
  const checks = [
    ['Datos de AMS pegados', state.flights.length > 0, `${state.flights.length} vuelos`],
    ['PDF Mandos Medios cargado', !!state.schedule, truncName(state.pdfName, 40) || ''],
    ['Día seleccionado', !!state.day, state.day],
    ['Supervisores detectados', supCount > 0, `${supCount} en turno`],
    ['Destinatarios (CCO)', bcc.length > 0, `${bcc.length}`],
  ].map(([label, ok, detail]) => ({ label, ok, detail }));
  return { checks, ready: checks.every((c) => c.ok) };
}

// Diagnóstico OVER (clave para la PC corporativa): log detallado en consola + aviso en
// pantalla cuando NO se detecta ningún OVER. Permite capturar qué pasa con cada dataset.
function logOverDiag(diag) {
  console.info(`[AIPC OVER] día=${diag.reportDay} · formato=${diag.formato} (${diag.metodo}) · `
    + `vuelos=${diag.total} · OVER=${diag.over} (IN ${diag.overIn}/OUT ${diag.overOut}) · sinFecha=${diag.sinFecha}`);
  if (diag.over === 0 || diag.sinFecha > 0) {
    console.warn('[AIPC OVER] 0 OVER o fechas sin parsear — detalle por vuelo (raw STA/STD → día):');
    (console.table || console.log)(diag.detalle);
  }
}
function overBanner(diag) {
  const sinFecha = diag.sinFecha > 0 ? ` · ${diag.sinFecha} sin fecha` : '';
  const info = `Formato fecha: ${diag.formato} · OVER: ${diag.over} (IN ${diag.overIn} / OUT ${diag.overOut})${sinFecha}`;
  if (diag.over === 0) {
    return '<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:#fff4e5;border:1px solid #f0b37e;color:#8a4b00;font-size:13px">'
      + '⚠️ No se detectaron vuelos OVER. Verificar consistencia de los datos.'
      + `<br><span style="font-size:11px;opacity:.85">${info}</span></div>`;
  }
  return `<div style="margin-top:10px;color:#94a3b8;font-size:11px">${info}</div>`;
}

function render() {
  const rows = editedRows();
  $('preview').innerHTML = buildEmailHtml(groups(), { reportDay: state.day, signatureHtml: sigHtml() });
  $('xlsx-preview').innerHTML = renderApcTable(rows, { reportDay: state.day });
  $('mailmeta').innerHTML = `${rows.length} vuelos · ${state.day}`;
  const { checks, ready } = validate();
  let checklistHtml = checks.map((c) =>
    `<div class="check ${c.ok ? 'ok' : 'no'}"><span class="ic">${c.ok ? '✓' : ''}</span>` +
    `<span class="lbl">${c.label}</span><span class="det">${c.detail || ''}</span></div>`).join('');
  if (state.flights.length && rows.diag) { logOverDiag(rows.diag); checklistHtml += overBanner(rows.diag); }
  $('checklist').innerHTML = checklistHtml;
  $('generate').disabled = !ready;
  const step = (n, c) => { const el = document.querySelector(`.step[data-step="${n}"]`); el.classList.remove('done', 'active'); if (c) el.classList.add(c); };
  step('ams', state.flights.length ? 'done' : 'active');
  step('pdf', state.schedule ? 'done' : (state.flights.length ? 'active' : ''));
  step('dia', state.day ? 'done' : '');
  step('valid', ready ? 'done' : '');
  step('out', ready ? 'active' : '');
}

// ---- generar ------------------------------------------------------------
async function generate() {
  try {
    toast('Generando Excel y correo…');
    const tplBuf = await (await fetch('./assets/template.xlsx')).arrayBuffer();
    const xlsx = await fillApcTemplate(tplBuf, editedRows(), { reportDay: state.day });
    const html = buildEmailHtml(groups(), { reportDay: state.day, signatureHtml: sigHtml() });
    const bcc = state.bcc.filter(isEmail);

    // Gmail / webmail: copia el cuerpo + descarga el Excel (Gmail no adjunta por pegar)
    if (state.options.dest === 'gmail') {
      const ok = await copyRichHtml(html);
      downloadXlsx(xlsx, CONFIG.attachmentName);
      window.open(gmailComposeUrl({ subject: CONFIG.subject, bcc }), '_blank', 'noopener');
      toast(ok ? 'Correo copiado + Excel descargado · pega (Ctrl/Cmd+V) y adjunta el Excel en Gmail'
               : 'Excel descargado · abre Gmail, pega el correo y adjunta el Excel');
      return;
    }

    // Outlook Web (Office 365): mismo patrón que Gmail (el compose web no adjunta por pegar)
    if (state.options.dest === 'outlookweb') {
      const ok = await copyRichHtml(html);
      downloadXlsx(xlsx, CONFIG.attachmentName);
      window.open(outlookWebComposeUrl({ subject: CONFIG.subject, bcc }), '_blank', 'noopener');
      toast(ok ? 'Correo copiado + Excel descargado · pega (Ctrl/Cmd+V) y adjunta el Excel en Outlook Web'
               : 'Excel descargado · abre Outlook Web, pega el correo y adjunta el Excel');
      return;
    }

    // Outlook: .eml con el Excel adjunto
    const eml = buildEml({
      subject: CONFIG.subject, bcc, html,
      attachments: [{ filename: CONFIG.attachmentName, content: xlsx, contentType: CONFIG.attachmentMime }],
    });
    const opened = await downloadEml(eml, `AIPC-${state.day}.eml`);
    toast(opened ? 'Abriendo en Outlook…' : 'AIPC.eml descargado · ábrelo en Outlook');
  } catch (e) { console.error(e); toast('Error al generar: ' + e.message); }
}

function downloadXlsx(bytes, filename) {
  const blob = new Blob([bytes], { type: CONFIG.attachmentMime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---- wiring -------------------------------------------------------------
$('ams-input').addEventListener('input', (e) => onAms(e.target.value));
$('ams-paste-btn').onclick = async () => {
  try { const t = await navigator.clipboard.readText(); $('ams-input').value = t; onAms(t); }
  catch { toast('Permite el portapapeles o pega manual (Ctrl/Cmd+V)'); }
};

const drop = $('drop-pdf'); const input = $('file-pdf');
drop.onclick = () => input.click();
input.onchange = () => onPdf(input.files[0]);
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => onPdf(e.dataTransfer.files[0]));

$('day').value = state.day;
$('day').onchange = (e) => { state.day = e.target.value || tomorrowISO(); render(); };

$('bcc-add').onclick = addBcc;
$('bcc-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBcc(); } });
$('bcc-clear').onclick = () => {
  if (state.bcc.length && confirm(`¿Borrar los ${state.bcc.length} destinatarios?`)) {
    state.bcc = []; bccExpanded = false; persistBcc();
  }
};

const sig = $('signature-input');
sig.innerHTML = state.signature;
function persistSig() {
  state.signature = sig.innerHTML.replace(/^(<br\s*\/?>\s*)+$/i, '');
  save(CONFIG.storageKeys.signature, state.signature);
  $('sig-status').textContent = state.signature ? '✓ Firma guardada' : '';
  render();
}
sig.addEventListener('input', persistSig);
$('sig-clear').onclick = () => { sig.innerHTML = ''; persistSig(); };
$('sig-status').textContent = state.signature ? '✓ Firma guardada' : '';

$('att-name').textContent = CONFIG.attachmentName;
$('year').textContent = new Date().getFullYear();

function updateDestUI() {
  const dest = state.options.dest;
  const webmail = dest === 'gmail' || dest === 'outlookweb';
  const nombre = dest === 'gmail' ? 'Gmail' : 'Outlook Web';
  $('generate').textContent = webmail
    ? `Copiar correo y abrir ${nombre}`
    : 'Generar correo y abrir en Outlook';
  $('gen-hint').innerHTML = webmail
    ? `Copia el cuerpo + descarga el Excel; en ${nombre} pega (Ctrl/Cmd+V) y adjunta el Excel.`
    : 'Genera el Excel APC adjunto + el correo con la tabla de supervisores.';
}
document.querySelectorAll('input[name="dest"]').forEach((r) => {
  r.checked = (r.value === state.options.dest);
  r.onchange = () => { if (r.checked) { state.options.dest = r.value; save(CONFIG.storageKeys.options, state.options); updateDestUI(); } };
});
$('generate').onclick = generate;

// ---- edición manual del preview (edición libre de celdas + toggle ferry) -------
const xlsxPreview = $('xlsx-preview');
function commitEdit(el) {
  const fid = el.getAttribute('data-fid'); const col = el.getAttribute('data-col');
  if (fid == null || !col) return;
  state.cellEdits[`${fid}:${col}`] = el.textContent.replace(/\s+/g, ' ').trim();
}
xlsxPreview.addEventListener('focusout', (e) => {
  const el = e.target.closest?.('.px-edit'); if (!el) return;
  commitEdit(el);
  // Re-render SOLO al salir del área editable (no entre celda y celda, para no cortar la edición).
  const next = e.relatedTarget;
  if (!(next && next.closest && next.closest('.px-edit'))) setTimeout(render, 0);
});
xlsxPreview.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.closest?.('.px-edit')) { e.preventDefault(); e.target.blur(); }
});
xlsxPreview.addEventListener('click', (e) => {
  const btn = e.target.closest?.('.ferry-toggle'); if (!btn) return;
  const fid = +btn.getAttribute('data-fid');
  const row = lastRows.find((r) => r._fid === fid); if (!row) return;
  const marked = isFerryMarked(row);     // toggle: marca FERRY en la PAX vacía, o lo quita
  for (const c of ['paxIn', 'paxOut']) {
    const k = `${fid}:${c}`;
    if (marked) { if (state.cellEdits[k] === 'FERRY') delete state.cellEdits[k]; }
    else if (row[c] === 'N/A') state.cellEdits[k] = 'FERRY';
  }
  render();
});
document.querySelectorAll('.tab').forEach((t) => {
  t.onclick = () => {
    const v = t.dataset.view;
    $('view-correo').style.display = v === 'correo' ? '' : 'none';
    $('view-excel').style.display = v === 'excel' ? '' : 'none';
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
  };
});

updateDestUI();
markPdf();   // restaura el horario guardado (si lo hay)
renderBcc();
render();
