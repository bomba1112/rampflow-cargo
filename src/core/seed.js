// Demo data. Entirely fictional: flight numbers DM###, ULD numbers end in ZZ, layouts are NOT official load plans.

import { T, ULD_STATUS, LOCATION } from './model.js';

const MIN = 60000;
const slot = (groupId, n) => ({ kind: 'slot', id: `${groupId}:${n}` });

const LAYOUT_A = {
  title: 'Демо-схема A (не официальная)',
  rows: [
    { name: 'Главная палуба · правая сторона', codes: ['AR', 'BR', 'CR', 'DR'] },
    { name: 'Главная палуба · левая сторона', codes: ['AL', 'BL', 'CL', 'DL'] },
    { name: 'Нижняя палуба', codes: ['11P', '12P', '21P', '22P'] },
  ],
};
const LAYOUT_B = {
  title: 'Демо-схема B (не официальная)',
  rows: [
    { name: 'Главная палуба', codes: ['AL', 'AR', 'BL', 'BR'] },
    { name: 'Нижняя палуба', codes: ['11P', '12P'] },
  ],
};
const LAYOUT_C = {
  title: 'Демо-схема B (не официальная)',
  rows: [{ name: 'Главная палуба', codes: ['AL', 'AR', 'BL', 'BR'] }],
};

function uldList(flightId, numbers, layout, skip = []) {
  const codes = layout.rows.flatMap((r) => r.codes);
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

  const a = ['PMC10417ZZ', 'PMC25863ZZ', 'PMC31952ZZ', 'PMC40786ZZ', 'PMC52349ZZ', 'PMC63571ZZ', 'PMC74208ZZ', 'PMC86194ZZ', 'PMC91635ZZ', 'PMC12072ZZ', 'PMC34580ZZ'];
  emit(T.LIR_LOADED, 'f-dm101', { flightId: 'f-dm101', edno: 2, layout: LAYOUT_A, demo: true, positions: uldList('f-dm101', a, LAYOUT_A, ['DL']) }, 190);

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
