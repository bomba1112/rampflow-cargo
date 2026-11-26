// Demo data. Entirely fictional: flight numbers DM###, ULD numbers end in ZZ, layouts are NOT official load plans.

import { T, ULD_STATUS, LOCATION } from './model.js';

const MIN = 60000;
const slot = (groupId, n) => ({ kind: 'slot', id: `${groupId}:${n}` });

// 747F-style demo layout. Cells sit on a grid: row 1 = right side, row 2 = left side, col 1 = nose.
// span:2 means one big unit over two columns (e.g. ER/FR). NOT an official load plan.
const mainCells = [];
const addPair = (col, letters, span = 1, label) => {
  mainCells.push({ code: letters + 'R', row: 1, col, span, label: label && label + 'R' });
  mainCells.push({ code: letters + 'L', row: 2, col, span, label: label && label + 'L' });
};
addPair(1, 'A'); addPair(2, 'B'); addPair(3, 'C'); addPair(4, 'D');
mainCells.push({ code: 'ER', row: 1, col: 5, span: 2, label: 'ER/FR' }, { code: 'EL', row: 2, col: 5, span: 2, label: 'EL/FL' });
mainCells.push({ code: 'GR', row: 1, col: 7, span: 2, label: 'GR/HR' }, { code: 'GL', row: 2, col: 7, span: 2, label: 'GL/HL' });
addPair(9, 'J'); addPair(10, 'K'); addPair(11, 'L'); addPair(12, 'M'); addPair(13, 'P');
mainCells.push({ code: 'R', row: 1, col: 14, span: 1, rowSpan: 2 });
const lowerCols = [['11P', 1], ['12P', 2], ['13P', 3], ['21P', 4], ['22P', 5], ['23P', 6], ['31P', 8], ['32P', 9], ['41P', 11], ['42P', 12]];
const LAYOUT_747 = {
  key: 'DEMO_C',
  title: 'Демо-схема C (не официальная)',
  decks: [
    { key: 'MAIN', rows: 2, cols: 14, cells: mainCells },
    { key: 'LOWER', rows: 1, cols: 12, cells: lowerCols.map(([code, col]) => ({ code, row: 1, col, span: 1 })) },
  ],
};

/** All position codes of a layout, in reading order (old row layouts and new deck layouts). */
export function codesOf(layout) {
  if (layout.decks) return layout.decks.flatMap((d) => d.cells.slice().sort((a, b) => a.row - b.row || a.col - b.col).map((c) => c.code));
  return layout.rows.flatMap((r) => r.codes);
}

const LAYOUT_B = {
  key: 'DEMO_B',
  title: 'Демо-схема B (не официальная)',
  rows: [
    { key: 'MAIN', name: 'Главная палуба', codes: ['AL', 'AR', 'BL', 'BR'] },
    { key: 'LOWER', name: 'Нижняя палуба', codes: ['11P', '12P'] },
  ],
};
const LAYOUT_C = {
  key: 'DEMO_B',
  title: 'Демо-схема B (не официальная)',
  rows: [{ key: 'MAIN', name: 'Главная палуба', codes: ['AL', 'AR', 'BL', 'BR'] }],
};

function uldList(flightId, numbers, layout, skip = []) {
  const codes = codesOf(layout);
  let i = 0;
  return codes.map((code) => {
    if (skip.includes(code) || i >= numbers.length) return { code, uld: null };
    const number = numbers[i++];
    return {
      code,
      uld: {
        id: `u-${flightId}-${code}`,
        number,
        type: number.slice(0, 3),
        weight: 900 + ((i * 377) % 2600),
        dest: 'DEM',
      },
    };
  });
}

export function seedDemo(store, nowMs = Date.now()) {
  const t = (minAgo) => nowMs - minAgo * MIN;
  const date = new Date(nowMs).setHours(0, 0, 0, 0);
  const emit = (type, agg, payload, minAgo) => store.emit(type, agg, payload, { occurredAt: t(minAgo) });

  // Three fictional flights
  emit(T.FLIGHT_CREATED, 'f-dm101', { flightId: 'f-dm101', number: 'DM101', date, aircraftType: 'B747-8F', stand: 'C8' }, 200);
  emit(T.FLIGHT_CREATED, 'f-dm202', { flightId: 'f-dm202', number: 'DM202', date, aircraftType: 'B777F', stand: 'D4' }, 200);
  emit(T.FLIGHT_CREATED, 'f-dm303', { flightId: 'f-dm303', number: 'DM303', date: date - 86400000, aircraftType: 'B747-8F', stand: 'C2' }, 1700);

  const a = Array.from({ length: 40 }, (_, i) => `PMC${i === 0 ? 10417 : 10000 + ((10417 + i * 8231) % 80000)}ZZ`);
  emit(T.LIR_LOADED, 'f-dm101', { flightId: 'f-dm101', edno: 2, layout: LAYOUT_747, demo: true, positions: uldList('f-dm101', a, LAYOUT_747, ['DR', 'MR', 'DL', '23P']) }, 190);

  const b = ['PMC20518ZZ', 'PMC37741ZZ', 'PMC48026ZZ', 'PMC55913ZZ', 'PMC69354ZZ', 'PMC71287ZZ'];
  emit(T.LIR_LOADED, 'f-dm202', { flightId: 'f-dm202', edno: 1, layout: LAYOUT_B, demo: true, positions: uldList('f-dm202', b, LAYOUT_B) }, 190);

  const c = ['PMC81630ZZ', 'PMC92471ZZ', 'PMC13805ZZ', 'PMC24196ZZ'];
  emit(T.LIR_LOADED, 'f-dm303', { flightId: 'f-dm303', edno: 1, layout: LAYOUT_C, demo: true, positions: uldList('f-dm303', c, LAYOUT_C) }, 1690);
  emit(T.LOADING_STARTED, 'f-dm303', { flightId: 'f-dm303' }, 1600);
  emit(T.LOADING_ENDED, 'f-dm303', { flightId: 'f-dm303' }, 1553);

  // DM101: partial unloading of a train. Train 136: four ULD, first two already given to the high loader.
  const g136 = 'g-136';
  const g007 = 'g-007';
  emit(T.DOLLY_GROUP_CREATED, g136, { groupId: g136, flightId: 'f-dm101', number: '136', dupIndex: 1 }, 120);
  const link = (uld, groupId, n, ago) => emit(T.ULD_LINKED, uld, { uldId: uld, dolly: slot(groupId, n) }, ago);
  link('u-f-dm101-AR', g136, 1, 118);
  link('u-f-dm101-BR', g136, 2, 117);
  link('u-f-dm101-CR', g136, 3, 116);
  link('u-f-dm101-AL', g136, 4, 115);
  emit(T.DOLLY_GROUP_CREATED, g007, { groupId: g007, flightId: 'f-dm101', number: '007', dupIndex: 1 }, 100);
  link('u-f-dm101-11P', g007, 1, 98);
  link('u-f-dm101-12P', g007, 2, 97);

  emit(T.LOADING_STARTED, 'f-dm101', { flightId: 'f-dm101' }, 45);
  const present = (uld, groupId, n, ago) =>
    emit(T.ULD_STATUS_CHANGED, uld, { uldId: uld, status: ULD_STATUS.PRESENTED, fromDolly: slot(groupId, n) }, ago);
  present('u-f-dm101-AR', g136, 1, 40);
  present('u-f-dm101-BR', g136, 2, 38);

  // The train 136 was parked at the tail, then moved again with no new place recorded.
  emit(T.LOCATION_RECORDED, g136, { entityKind: 'group', entityId: g136, label: LOCATION.TAIL, source: 'MANUAL' }, 30);
  emit(T.LOCATION_RECORDED, g136, { entityKind: 'group', entityId: g136, label: LOCATION.UNKNOWN, source: 'MANUAL' }, 12);
}
