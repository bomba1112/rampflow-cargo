// LIR sheet templates: the FIXED part of the paper LIR (the cell grid). Pure data, portable to Dart.
// Geometry is in "sheet units": 1 unit = 1 pixel of the paper LIR picture (main area 1170 x 470).
// Each cell: { code, x, y, w, h, deck: 'MAIN'|'LOWER', bulk?: true }. Position label sits in the top-left corner, like on paper.
// Measured from a real LIR page of this aircraft type. Contains no flight data. NOT an official load plan.

const SIDES = [
  ['R', 5, 148], // right side of the aircraft = top row on the paper
  ['L', 148, 292], // left side = bottom row
];
// Column edges. Letters A..L share edges 10..922, then a gap, then M and P (930..1096), then the single tall R position.
const XS_MAIN = [10, 92, 175, 258, 341, 424, 507, 590, 673, 756, 839, 922];
const LETTERS_MAIN = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L'];
const XS_TAIL = [930, 1013, 1096];
const LETTERS_TAIL = ['M', 'P'];

function buildB747_8F() {
  const cells = [];
  for (const [side, y0, y1] of SIDES) {
    LETTERS_MAIN.forEach((l, i) => cells.push({ code: l + side, deck: 'MAIN', x: XS_MAIN[i], y: y0, w: XS_MAIN[i + 1] - XS_MAIN[i], h: y1 - y0 }));
    LETTERS_TAIL.forEach((l, i) => cells.push({ code: l + side, deck: 'MAIN', x: XS_TAIL[i], y: y0, w: XS_TAIL[i + 1] - XS_TAIL[i], h: y1 - y0 }));
    if (side === 'R') cells.push({ code: 'R', deck: 'MAIN', x: 1096, y: 5, w: 64, h: 287 }); // one tall position at the very tail
  }
  const lower = [
    ['11P', 19, 83], ['12P', 83, 147], ['13P', 147, 210], ['21P', 213, 276], ['22P', 276, 340], ['23P', 340, 404],
    ['31P', 690, 753], ['32P', 762, 826], ['41P', 859, 923], ['42P', 923, 986],
  ];
  for (const [code, x0, x1] of lower) cells.push({ code, deck: 'LOWER', x: x0, y: 302, w: x1 - x0, h: 162 });
  cells.push({ code: '51', deck: 'LOWER', x: 990, y: 302, w: 37, h: 162, bulk: true });
  cells.push({ code: '52', deck: 'LOWER', x: 1027, y: 302, w: 79, h: 162, bulk: true });
  return {
    key: 'B747_8F',
    title: 'B747-8F',
    sheet: { w: 1170, h: 470, cells, payload: { x: 475, y: 349, w: 161, rowH: 20 } },
    // Where this sheet sits on the original PDF page (points): the picture starts at (ox, oy) and is a bit smaller than sheet units.
    // The app shows the page from cropTop down cropH points, and puts the tap areas on top of it.
    page: { w: 1180, h: 834, cropTop: 125, cropH: 487, ox: 10, oy: 136, sx: 1162 / 1170, sy: 467 / 470 },
  };
}
export const LAYOUT_B747_8F = buildB747_8F();

/**
 * Older layouts (rows of codes, or decks on a row/col grid) are turned into the same sheet shape,
 * so the screen has ONE way to draw a LIR.
 */
export function sheetOf(layout) {
  if (layout.sheet) return layout.sheet;
  const cells = [];
  const CW = 83;
  if (layout.decks) {
    for (const d of layout.decks) {
      const lower = d.key === 'LOWER';
      for (const c of d.cells) {
        const rs = c.rowSpan || 1;
        const cs = c.span || 1;
        const h = lower ? 162 : 143;
        cells.push({ code: c.code, label: c.label, deck: d.key, x: 10 + (c.col - 1) * CW, y: (lower ? 302 : 5) + (c.row - 1) * h, w: CW * cs, h: h * rs });
      }
    }
  } else {
    layout.rows.forEach((r, ri) => r.codes.forEach((code, i) => cells.push({ code, deck: r.key || 'MAIN', x: 10 + i * CW, y: 5 + ri * 120, w: CW, h: 115 })));
  }
  const w = Math.max(...cells.map((c) => c.x + c.w)) + 10;
  const h = Math.max(...cells.map((c) => c.y + c.h)) + 10;
  return { w: Math.max(w, 400), h, cells, payload: null };
}

/** Position codes that can hold a ULD, in reading order. */
export function codesOf(layout) {
  return sheetOf(layout).cells.filter((c) => !c.bulk).map((c) => c.code);
}

/** A cell as a rectangle on the cropped original page (points, origin = top-left of the crop). Null if the layout has no page mapping. */
export function pageRect(layout, cell) {
  const p = layout.page;
  if (!p) return null;
  return { x: p.ox + cell.x * p.sx, y: p.oy + cell.y * p.sy - p.cropTop, w: cell.w * p.sx, h: cell.h * p.sy };
}
