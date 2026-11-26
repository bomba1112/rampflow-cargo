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

/** The page of the CHAMP LOAD INSTRUCTION REPORT (points) and the part of it that shows the loading diagram. */
export const PAGE = { w: 1180, h: 834, cropTop: 125, cropH: 487 };

/**
 * Known fixed airframe grids, only used to NAME the boxes found on a LIR picture (AR, 11P ...). Shapes always come from the
 * picture itself. Coordinates: points on the cropped page. Flight-specific boxes (PGA, units across the centre line) are not here.
 */
const GRID_400F = [
  { code: 'A1', x: 21, y: 17, w: 44, h: 276 },
  { code: 'A2', x: 66, y: 17, w: 46, h: 276 },
  { code: 'B1', x: 114, y: 17, w: 46, h: 138 },
  { code: 'CR', x: 161, y: 17, w: 60, h: 138 },
  { code: 'DR', x: 222, y: 17, w: 60, h: 138 },
  { code: 'ER', x: 284, y: 17, w: 60, h: 138 },
  { code: 'FR', x: 346, y: 17, w: 59, h: 138 },
  { code: 'GR', x: 406, y: 17, w: 60, h: 138 },
  { code: 'HR', x: 468, y: 17, w: 60, h: 138 },
  { code: 'JR', x: 530, y: 17, w: 60, h: 138 },
  { code: 'KR', x: 590, y: 17, w: 60, h: 138 },
  { code: 'LR', x: 652, y: 17, w: 60, h: 138 },
  { code: 'MR', x: 714, y: 17, w: 59, h: 138 },
  { code: 'PR', x: 774, y: 17, w: 60, h: 138 },
  { code: 'RR', x: 836, y: 17, w: 60, h: 138 },
  { code: 'SR', x: 908, y: 17, w: 60, h: 138 },
  { code: 'TR', x: 970, y: 17, w: 59, h: 138 },
  { code: 'UR', x: 1030, y: 17, w: 60, h: 138 },
  { code: 'X', x: 1092, y: 17, w: 70, h: 138 },
  { code: 'CL', x: 161, y: 156, w: 60, h: 138 },
  { code: 'DL', x: 222, y: 156, w: 60, h: 138 },
  { code: 'EL', x: 284, y: 156, w: 60, h: 138 },
  { code: 'FL', x: 346, y: 156, w: 59, h: 138 },
  { code: 'PL', x: 774, y: 156, w: 60, h: 138 },
  { code: 'RL', x: 836, y: 156, w: 60, h: 138 },
  { code: 'SL', x: 908, y: 156, w: 60, h: 138 },
  { code: 'TL', x: 970, y: 156, w: 59, h: 138 },
  { code: 'UL', x: 1030, y: 156, w: 60, h: 138 },
  { code: 'GL', x: 406, y: 156, w: 60, h: 138 },
  { code: 'HL', x: 468, y: 156, w: 60, h: 138 },
  { code: 'JL', x: 530, y: 156, w: 60, h: 138 },
  { code: 'KL', x: 590, y: 156, w: 60, h: 138 },
  { code: 'LL', x: 652, y: 156, w: 60, h: 138 },
  { code: 'ML', x: 714, y: 156, w: 59, h: 138 },
  { code: '11P', x: 134, y: 305, w: 46, h: 166 },
  { code: '12P', x: 181, y: 305, w: 46, h: 166 },
  { code: '21P', x: 228, y: 305, w: 46, h: 166 },
  { code: '22P', x: 276, y: 305, w: 46, h: 166 },
  { code: '23P', x: 323, y: 305, w: 45, h: 166 },
  { code: '24P', x: 370, y: 305, w: 46, h: 166 },
  { code: '25P', x: 418, y: 305, w: 45, h: 166 },
  { code: '31P', x: 708, y: 305, w: 45, h: 166 },
  { code: '32P', x: 754, y: 305, w: 46, h: 166 },
  { code: '33P', x: 802, y: 305, w: 45, h: 166 },
  { code: '41P', x: 848, y: 305, w: 46, h: 166 },
  { code: '42P', x: 896, y: 305, w: 45, h: 166 },
  { code: '45R', x: 943, y: 305, w: 30, h: 82 },
  { code: '45L', x: 943, y: 388, w: 30, h: 83 },
  { code: '52', x: 976, y: 305, w: 28, h: 166, bulk: true },
  { code: '554', x: 1006, y: 305, w: 56, h: 166, bulk: true },
];

export const NAMED_GRIDS = [
  { key: 'B747_8F', title: 'B747-8F', cells: LAYOUT_B747_8F.sheet.cells.map((c) => ({ code: c.code, bulk: !!c.bulk, ...pageRect(LAYOUT_B747_8F, c) })) },
  { key: 'B747_400F', title: 'B747-400F', cells: GRID_400F },
];

const inside = (c, x, y) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h;

/**
 * Names the boxes found on a picture. Picks the grid most boxes sit in (>= 60 %), else leaves them numbered Z1, Z2 ...
 * Bulk positions are dropped (no ULD there). A second box in the same cell gets a suffix (CL, CL.2).
 * Returns { zones: [{code,x,y,w,h}], grid: key|null, title }.
 */
export function nameZones(found) {
  let best = null;
  let bestN = 0;
  for (const g of NAMED_GRIDS) {
    const n = found.filter((z) => g.cells.some((c) => inside(c, z.x + z.w / 2, z.y + z.h / 2))).length;
    if (n > bestN) { best = g; bestN = n; }
  }
  const use = best && bestN >= found.length * 0.6 ? best : null;
  const used = new Map();
  const zones = [];
  found.forEach((z, i) => {
    let code = 'Z' + (i + 1);
    if (use) {
      const hit = use.cells.filter((c) => inside(c, z.x + z.w / 2, z.y + z.h / 2)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (hit) {
        if (hit.bulk) return;
        const n = (used.get(hit.code) || 0) + 1;
        used.set(hit.code, n);
        code = n === 1 ? hit.code : `${hit.code}.${n}`;
      }
    }
    zones.push({ code, x: z.x, y: z.y, w: z.w, h: z.h });
  });
  return { zones, grid: use ? use.key : null, title: use ? use.title : '' };
}
