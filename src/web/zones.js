// Finds the position boxes of a LIR loading diagram FROM THE PICTURE ITSELF, so every LIR is used exactly as printed
// (any aircraft, double-width boxes, units across the centre line). No template is needed for the shapes.
// Pure functions: input is a grey image (Uint8 array, one byte per pixel), output is rectangles in page points.

/** Diagram band of the CHAMP "LOAD INSTRUCTION REPORT" form, in page points (the header boxes are above, notes below). */
export const BAND = { y0: 128, y1: 606 };

/**
 * gray: Uint8Array(W*H), a part of the page rendered at `scale` pixels per point; `top` = page y (points) of its first row.
 * Returns [{x,y,w,h}] in points, relative to the picture (y = 0 is its first row), sorted top-to-bottom then left-to-right (rows of 12pt), without code names.
 */
export function detectZones(gray, W, H, scale, top = 0) {
  const minRun = Math.round(14 * scale); // line = a straight dark run at least 14pt long (text strokes are shorter)
  const dark = new Uint8Array(W * H);
  for (let i = 0; i < dark.length; i++) dark[i] = gray[i] < 190 ? 1 : 0;
  const line = new Uint8Array(W * H);
  // horizontal runs
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!dark[y * W + x]) { x++; continue; }
      let e = x;
      while (e < W && dark[y * W + e]) e++;
      if (e - x >= minRun) for (let k = x; k < e; k++) line[y * W + k] = 1;
      x = e;
    }
  }
  // vertical runs
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!dark[y * W + x]) { y++; continue; }
      let e = y;
      while (e < H && dark[e * W + x]) e++;
      if (e - y >= minRun) for (let k = y; k < e; k++) line[k * W + x] = 1;
      y = e;
    }
  }
  // thicken by one pixel so hairline gaps in the printed lines close
  const wall = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (line[i] || line[i - 1] || line[i + 1] || line[i - W] || line[i + W]) wall[i] = 1;
    }
  }
  // connected white regions
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const out = [];
  const bandY0 = Math.max(0, Math.floor((BAND.y0 - top) * scale));
  const bandY1 = Math.ceil((BAND.y1 - top) * scale);
  for (let sy = bandY0; sy < Math.min(H, bandY1); sy++) {
    for (let sx = 0; sx < W; sx++) {
      const s = sy * W + sx;
      if (wall[s] || seen[s]) continue;
      let sp = 0;
      stack[sp++] = s;
      seen[s] = 1;
      let minX = sx, maxX = sx, minY = sy, maxY = sy, n = 0;
      while (sp) {
        const i = stack[--sp];
        const y = (i / W) | 0;
        const x = i - y * W;
        n++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > 0 && !wall[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
        if (x < W - 1 && !wall[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
        if (y > 0 && !wall[i - W] && !seen[i - W]) { seen[i - W] = 1; stack[sp++] = i - W; }
        if (y < H - 1 && !wall[i + W] && !seen[i + W]) { seen[i + W] = 1; stack[sp++] = i + W; }
      }
      const w = (maxX - minX + 1) / scale;
      const h = (maxY - minY + 1) / scale;
      const fill = n / ((maxX - minX + 1) * (maxY - minY + 1));
      if (w < 14 || h < 28 || w > 260 || h > 330) continue; // not a position box
      if (fill < 0.9) continue; // ring or irregular space between boxes
      out.push({ x: (minX - 1) / scale, y: (minY - 1) / scale, w: w + 2 / scale, h: h + 2 / scale });
    }
  }
  const r = (v) => Math.round(v * 10) / 10;
  return out
    .map((z) => ({ x: r(z.x), y: r(z.y), w: r(z.w), h: r(z.h) }))
    .sort((a, b) => Math.round(a.y / 12) - Math.round(b.y / 12) || a.x - b.x);
}
