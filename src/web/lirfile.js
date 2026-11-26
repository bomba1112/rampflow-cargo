// Reads a LIR PDF on this phone: the header fields (flight, date, edition) and the picture of the loading sheet.
// Everything happens in the browser. The file is never uploaded.

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

/** Header text of the page -> fields. Pure function (tested without a browser). Unknown fields come back empty. */
export function parseHeader(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const out = { number: '', date: null, edno: null, reg: '', route: '', std: '' };
  let m = /Callsign[^:]*:\s*(\S+)\s*\(([^)]+)\)/i.exec(t);
  if (m) out.number = (m[2] || m[1]).replace(/\s+/g, '').toUpperCase();
  m = /Date:\s*(\d{1,2})\s*([A-Za-z]{3})\s*(\d{4})/.exec(t);
  if (m && MONTHS[m[2].toUpperCase()] !== undefined) out.date = new Date(+m[3], MONTHS[m[2].toUpperCase()], +m[1]).getTime();
  m = /edno\s+(\d+)/i.exec(t);
  if (m) out.edno = +m[1];
  m = /A\/C\s*Reg:\s*([A-Z0-9-]+)/i.exec(t);
  if (m) out.reg = m[1].toUpperCase();
  m = /ORIG\s*-\s*DEST:\s*([A-Z]{3,4})\s*-\s*([A-Z]{3,4})/i.exec(t);
  if (m) out.route = `${m[1].toUpperCase()} - ${m[2].toUpperCase()}`;
  m = /STD\s*\(GMT\):\s*(\d{1,2}:\d{2})/i.exec(t);
  if (m) out.std = m[1];
  return out;
}

/** pdf.js items ({str, transform}) -> text in reading order: top line first, left to right, one line per row. Pure. */
export function itemsToText(items) {
  const rows = [];
  for (const it of items) {
    if (!it || !it.str || !it.str.trim() || !it.transform) continue;
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= 3);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x: it.transform[4], str: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).join(' ')).join('\n');
}

let lib = null;
async function pdfjs() {
  if (lib) return lib;
  const base = document.baseURI;
  lib = await import(new URL('./vendor/pdf.min.mjs', base).href);
  lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', base).href;
  return lib;
}

/**
 * Does the picture show THIS layout? Samples the cell borders where the layout expects them and counts dark pixels.
 * A different aircraft layout puts its borders elsewhere, so the ratio drops. Returns 0..1.
 */
export function gridMatch(ctx, layout, scale) {
  const { page, sheet } = layout;
  const cells = sheet.cells.filter((c) => !c.bulk);
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, W, H).data;
  const dark = (x, y) => {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = (py * W + px) * 4;
      if (img[i] + img[i + 1] + img[i + 2] < 390) return true;
    }
    return false;
  };
  const toX = (u) => (page.ox + u * page.sx) * scale;
  const toY = (v) => (page.oy + v * page.sy - page.cropTop) * scale;
  let hit = 0;
  let all = 0;
  for (const c of cells) {
    for (let k = 1; k <= 8; k++) {
      const f = k / 9;
      all += 2;
      if (dark(toX(c.x), toY(c.y + c.h * f))) hit++; // left border
      if (dark(toX(c.x + c.w * f), toY(c.y))) hit++; // top border
    }
  }
  return all ? hit / all : 0;
}

/**
 * file: a LIR PDF. layouts: the layouts we know. Returns { header, blob, layout }.
 * blob = JPEG of the sheet area at 2x, in page points: width page.w, height page.cropH.
 * Errors (Error.message): NOT_PDF, PAGE_SIZE (not the page of this report), PAGE_LAYOUT (no known layout fits the picture).
 */
export async function readLirPdf(file, layouts) {
  const lb = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await lb.getDocument({ data }).promise;
  } catch (e) {
    throw new Error('NOT_PDF');
  }
  try {
    const pg = await doc.getPage(1);
    const [x0, y0, x1, y1] = pg.view;
    const first = layouts[0].page;
    if (Math.abs(x1 - x0 - first.w) > 4 || Math.abs(y1 - y0 - first.h) > 4) throw new Error('PAGE_SIZE');
    const header = parseHeader(itemsToText((await pg.getTextContent()).items));
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(first.w * scale);
    canvas.height = Math.round(first.cropH * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: pg.getViewport({ scale }), transform: [1, 0, 0, 1, 0, -first.cropTop * scale] }).promise;
    let best = null;
    let bestRatio = 0;
    for (const l of layouts) {
      const r = gridMatch(ctx, l, scale);
      if (r > bestRatio) { best = l; bestRatio = r; }
    }
    if (!best || bestRatio < 0.8) throw new Error('PAGE_LAYOUT');
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return { header, blob, layout: best, match: bestRatio };
  } finally {
    try { doc.destroy(); } catch (e) { /* ignore */ }
  }
}
