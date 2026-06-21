// src/pdfText.mjs
// Reconstruct clean text lines from pdf.js getTextContent() output.
// Kept DOM-free and pdf.js-instance-free so the exact same reconstruction
// runs both in the browser and in the Node test harness.

// pdf.js emits text "items"; each carries .str and .hasEOL (end-of-line).
// We concatenate items until an EOL, then normalise whitespace.
export function linesFromItems(items) {
  const lines = [];
  let cur = '';
  for (const it of items) {
    cur += it.str;
    if (it.hasEOL) {
      lines.push(cur);
      cur = '';
    }
  }
  if (cur) lines.push(cur);
  return lines
    .map((l) => l.replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

// Pull every page's text and return one flat array of lines (page order).
export async function getPdfLines(pdfDoc) {
  const all = [];
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const tc = await page.getTextContent();
    all.push(...linesFromItems(tc.items));
  }
  return all;
}
