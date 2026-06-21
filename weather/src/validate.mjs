// src/validate.mjs — pre-flight checklist before the email can be generated.
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim());

// state: { pdfName, report, images:{radar,windy}, bcc:[] }
export function validate(state) {
  const r = state.report;
  const sec = r?.secciones;
  const bcc = (state.bcc || []).map((s) => s.trim()).filter(Boolean);
  const badEmails = bcc.filter((e) => !isEmail(e));

  const checks = [
    ['PDF cargado', !!state.pdfName, state.pdfName || ''],
    ['Fecha encontrada', !!r?.meta?.date, r?.meta?.date ? `${r.meta.dayName ?? ''} ${r.meta.date.iso}` : 'no detectada'],
    ['Punta Cana y áreas vecinas', !!sec?.puntaCana, ''],
    ['Condiciones generales', !!sec?.condicionesGenerales?.length, `${sec?.condicionesGenerales?.length || 0} líneas`],
    ['Pronóstico diario', !!sec?.pronostico?.dias?.length, `${sec?.pronostico?.dias?.length || 0} días`],
    ['Pronóstico marino', !!sec?.marino, ''],
    ['Salida / puesta del sol', !!(r?.sol?.salida && r?.sol?.puesta), r?.sol ? `${r.sol.salida || '?'} / ${r.sol.puesta || '?'}` : ''],
    ['Imagen radar / satélite', !!state.images?.radar, ''],
    ['Imagen Windy', !!state.images?.windy, ''],
    ['BCC configurado', bcc.length > 0 && badEmails.length === 0,
      badEmails.length ? `correos inválidos: ${badEmails.join(', ')}` : `${bcc.length} destinatarios`],
  ].map(([label, ok, detail]) => ({ label, ok, detail }));

  return { checks, ready: checks.every((c) => c.ok) };
}
