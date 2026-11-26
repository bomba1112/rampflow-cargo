import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/core/store.js';
import { memoryStorage } from '../src/core/storage.js';
import { seedDemo } from '../src/core/seed.js';
import { T, ULD_STATUS, LOCATION } from '../src/core/model.js';
import * as C from '../src/core/commands.js';
import * as Q from '../src/core/selectors.js';
import { LAYOUT_B747_8F, pageRect, nameZones, NAMED_GRIDS, PAGE } from '../src/core/layouts.js';
import { detectZones } from '../src/web/zones.js';
import { parseHeader, itemsToText } from '../src/web/lirfile.js';

const MIN = 60000;

/** Fresh store with a controllable clock and deterministic ids. */
async function mk(storage = memoryStorage()) {
  let clock = Date.UTC(2026, 10, 24, 6, 0, 0);
  let n = 0;
  const store = await openStore({ storage, now: () => clock, newId: () => 'id' + ++n });
  return { store, storage, tick: (ms) => (clock += ms), setClock: (v) => (clock = v), now: () => clock };
}

/** One flight with 6 ULD at AL AR BL BR 11P 12P, no dollies. */
async function withFlight(ctx) {
  const { store } = ctx;
  const f = 'f1';
  store.emit(T.FLIGHT_CREATED, f, { flightId: f, number: 'DM900', date: 0, aircraftType: 'B747-8F', stand: 'C8' });
  const codes = ['AL', 'AR', 'BL', 'BR', '11P', '12P'];
  const layout = { title: 't', rows: [{ name: 'r', codes }] };
  store.emit(T.LIR_LOADED, f, {
    flightId: f,
    edno: 1,
    layout,
    demo: true,
    positions: codes.map((code, i) => ({ code, uld: { id: 'u-' + code, number: `PMC${10000 + i * 111}ZZ`, type: 'PMC', weight: 1000 + i, dest: 'DEM' } })),
  });
  return f;
}

const group = (store, f, number, confirmed) => store.run(C.createDollyGroup, { flightId: f, number, confirmed });
const slotRef = (gid, n) => ({ kind: 'slot', id: `${gid}:${n}` });
const labels = (st, f) => Q.groupsView(st, f).flatMap((g) => g.units.map((u) => u.label));

test('1. group 136 creates 136-1..136-4', async () => {
  const c = await mk();
  const f = await withFlight(c);
  const r = group(c.store, f, '136');
  assert.ok(r.ok);
  const g = Q.groupsView(c.store.getState(), f)[0];
  assert.deepEqual(g.units.map((u) => u.label), ['136-1', '136-2', '136-3', '136-4']);
  assert.deepEqual(g.units.map((u) => u.ordinal), [1, 2, 3, 4]);
});

test('2. after 136 a group 908 can be added; 137 is never created', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '136');
  group(c.store, f, '908');
  const all = labels(c.store.getState(), f);
  assert.ok(all.includes('908-1') && all.includes('908-4'));
  assert.ok(!all.some((l) => l.startsWith('137')));
  assert.equal(Q.groupsView(c.store.getState(), f).length, 2);
});

test('3. group 007 keeps its leading zeros as a string', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '007');
  const g = Q.groupsView(c.store.getState(), f)[0];
  assert.equal(g.number, '007');
  assert.equal(typeof g.number, 'string');
  assert.equal(g.units[3].label, '007-4');
  const log = c.store.getEvents().find((e) => e.eventType === T.DOLLY_GROUP_CREATED);
  assert.equal(log.payload.number, '007');
  assert.equal(C.normalizeNumber(' 007 '), '007');
  assert.equal(C.normalizeNumber(''), null);
  assert.equal(C.normalizeNumber('12 345 678 9'), null);
});

test('4. 20 ft dolly 145 is one unit with no suffix', async () => {
  const c = await mk();
  const f = await withFlight(c);
  assert.ok(c.store.run(C.createSingleDolly, { flightId: f, number: '145' }).ok);
  const st = c.store.getState();
  const gs = Q.groupsView(st, f);
  assert.equal(gs.length, 1);
  assert.equal(gs[0].kind, 'SINGLE_20FT');
  assert.equal(gs[0].units.length, 1);
  assert.equal(gs[0].units[0].label, '145');
  assert.equal(gs[0].units[0].ordinal, null);
  assert.equal(Object.keys(st.slots).length, 0);
});

test('5. a 20 ft dolly cannot be added to a four-dolly train', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '136');
  c.store.run(C.createSingleDolly, { flightId: f, number: '145' });
  const st = c.store.getState();
  const gid = Object.keys(st.groups)[0];
  const sid = Object.keys(st.singles)[0];
  const r = C.attachSingleToGroup(st, { singleId: sid, groupId: gid });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'SINGLE_20FT_CANNOT_JOIN');
  assert.equal(Object.values(st.slots).filter((s) => s.groupId === gid).length, 4);
});

test('6. a ULD links to a specific working position of a dolly', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '136');
  const gid = Object.keys(c.store.getState().groups)[0];
  const r = c.store.run(C.linkUld, { uldId: 'u-BL', dolly: slotRef(gid, 3) });
  assert.ok(r.ok);
  const v = Q.uldView(c.store.getState(), 'u-BL');
  assert.equal(v.dolly.label, '136-3');
  assert.equal(v.status, ULD_STATUS.ON_DOLLY);
  assert.equal(c.store.getState().slots[`${gid}:3`].linkedUldId, 'u-BL');
});

test('7. moving the same ULD to another dolly needs explicit confirmation and keeps history', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '136');
  group(c.store, f, '908');
  const st0 = c.store.getState();
  const [g136, g908] = Object.values(st0.groups).sort((a, b) => a.seq - b.seq).map((g) => g.id);
  c.store.run(C.linkUld, { uldId: 'u-AL', dolly: slotRef(g136, 1) });
  const again = c.store.run(C.linkUld, { uldId: 'u-AL', dolly: slotRef(g908, 2) });
  assert.equal(again.ok, false);
  assert.equal(again.confirm.code, 'MOVE_ULD');
  assert.equal(Q.uldView(c.store.getState(), 'u-AL').dolly.label, '136-1'); // unchanged until confirmed
  const moved = c.store.run(C.linkUld, { uldId: 'u-AL', dolly: slotRef(g908, 2), confirmed: true });
  assert.ok(moved.ok);
  const st = c.store.getState();
  assert.equal(Q.uldView(st, 'u-AL').dolly.label, '908-2');
  assert.equal(st.slots[`${g136}:1`].linkedUldId, null);
  const types = c.store.getEvents().filter((e) => e.aggregateId === 'u-AL').map((e) => e.eventType + ':' + (e.payload.reason || ''));
  assert.ok(types.includes('ULD_UNLINKED:MOVE'));
  assert.equal(types.filter((t) => t.startsWith('ULD_LINKED')).length, 2);
  // One ULD is never on two dollies at once
  assert.equal(Object.values(st.slots).filter((s) => s.linkedUldId === 'u-AL').length, 1);
});

test('8. LIR cell shows the digit on top and the group number at the bottom ("007-4")', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '007');
  const gid = Object.keys(c.store.getState().groups)[0];
  c.store.run(C.linkUld, { uldId: 'u-BR', dolly: slotRef(gid, 4) });
  const cell = Q.lirCell(c.store.getState(), f, 'BR');
  assert.equal(cell.top, '4');
  assert.equal(cell.bottom, '007');
  assert.equal(cell.view.dolly.label, '007-4');
  const bare = Q.lirCell(c.store.getState(), f, 'AL');
  assert.equal(bare.top, '');
  assert.equal(bare.bottom, '');
});

test('9. search "007" finds the group and its linked ULD', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '007');
  group(c.store, f, '136');
  const gid = Object.values(c.store.getState().groups).find((g) => g.number === '007').id;
  c.store.run(C.linkUld, { uldId: 'u-AL', dolly: slotRef(gid, 1) });
  c.store.run(C.linkUld, { uldId: 'u-AR', dolly: slotRef(gid, 2) });
  const r = Q.search(c.store.getState(), f, '007');
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].number, '007');
  const ids = r.ulds.map((u) => u.id);
  assert.ok(ids.includes('u-AL') && ids.includes('u-AR'));
  assert.ok(!ids.includes('u-BL'));
  const one = Q.search(c.store.getState(), f, '007-2');
  assert.equal(one.groups[0].focusOrdinal, 2);
  assert.deepEqual(one.ulds.map((u) => u.id), ['u-AR']);
});

test('10. search by full ULD number shows the LIR position and the dolly label', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '908');
  const gid = Object.keys(c.store.getState().groups)[0];
  c.store.run(C.linkUld, { uldId: 'u-BL', dolly: slotRef(gid, 3) });
  const num = c.store.getState().ulds['u-BL'].number;
  const r = Q.search(c.store.getState(), f, num.toLowerCase());
  assert.equal(r.ulds.length, 1);
  assert.equal(r.ulds[0].positionCode, 'BL');
  assert.equal(r.ulds[0].dolly.label, '908-3');
  assert.equal(r.ulds[0].status, ULD_STATUS.ON_DOLLY);
});

test('11. search "12P" opens the right position card', async () => {
  const c = await mk();
  const f = await withFlight(c);
  const r = Q.search(c.store.getState(), f, ' 12p ');
  assert.equal(r.positions.length, 1);
  assert.equal(r.positions[0].code, '12P');
  assert.equal(r.positions[0].uld.id, 'u-12P');
});

test('12. start of loading records date and time', async () => {
  const c = await mk();
  const f = await withFlight(c);
  const t0 = c.now();
  assert.ok(c.store.run(C.startLoading, { flightId: f }).ok);
  const e = c.store.getEvents().find((x) => x.eventType === T.LOADING_STARTED);
  assert.equal(e.occurredAt, t0);
  assert.equal(e.aggregateId, f);
  assert.equal(Q.loadingView(c.store.getState(), f).startedAt, t0);
  assert.equal(c.store.run(C.startLoading, { flightId: f }).error.code, 'ALREADY_STARTED');
});

test('13. end of loading computes the duration', async () => {
  const c = await mk();
  const f = await withFlight(c);
  c.store.run(C.startLoading, { flightId: f });
  c.tick(47 * MIN);
  c.store.run(C.endLoading, { flightId: f });
  const v = Q.loadingView(c.store.getState(), f);
  assert.equal(v.status, 'ENDED');
  assert.equal(v.durationMs, 47 * MIN);
  assert.equal(c.store.getState().flights[f].status, 'DONE');
});

test('14. correcting a time keeps the original record', async () => {
  const c = await mk();
  const f = await withFlight(c);
  c.store.run(C.startLoading, { flightId: f });
  const original = c.now();
  c.tick(60 * MIN);
  c.store.run(C.endLoading, { flightId: f });
  assert.equal(c.store.run(C.correctLoadingTime, { flightId: f, field: 'START', newValue: original - 5 * MIN, reason: '' }).error.code, 'REASON_REQUIRED');
  assert.equal(c.store.run(C.correctLoadingTime, { flightId: f, field: 'START', newValue: c.now() + MIN, reason: 'x' }).error.code, 'TIME_IN_FUTURE');
  assert.equal(c.store.run(C.correctLoadingTime, { flightId: f, field: 'START', newValue: c.now(), reason: 'x' }).error.code, 'START_AFTER_END');
  assert.equal(c.store.run(C.correctLoadingTime, { flightId: f, field: 'END', newValue: original, reason: 'x' }).error.code, 'END_BEFORE_START');
  const r = c.store.run(C.correctLoadingTime, { flightId: f, field: 'START', newValue: original - 5 * MIN, reason: 'Забыл нажать' });
  assert.ok(r.ok);
  const v = Q.loadingView(c.store.getState(), f);
  assert.equal(v.startedAt, original - 5 * MIN);
  assert.equal(v.originalStartedAt, original);
  assert.equal(v.corrections.length, 1);
  assert.equal(v.corrections[0].reason, 'Забыл нажать');
  assert.equal(v.corrections[0].oldValue, original);
  assert.equal(v.durationMs, 65 * MIN);
  // the original event is still in the log
  assert.ok(c.store.getEvents().some((e) => e.eventType === T.LOADING_STARTED && e.occurredAt === original));
});

test('15. data survives an app restart (replay from storage)', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '007');
  const gid = Object.keys(c.store.getState().groups)[0];
  c.store.run(C.linkUld, { uldId: 'u-AL', dolly: slotRef(gid, 1) });
  c.store.run(C.startLoading, { flightId: f });
  await c.store.flush();
  const c2 = await mk(c.storage);
  const st = c2.store.getState();
  assert.equal(Q.groupsView(st, f)[0].number, '007');
  assert.equal(Q.uldView(st, 'u-AL').dolly.label, '007-1');
  assert.equal(Q.loadingView(st, f).status, 'IN_PROGRESS');
  assert.equal(c2.store.getEvents().length, c.store.getEvents().length);
});

test('16. after two ULD go to the high loader the other two keep their dollies', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '136');
  const gid = Object.keys(c.store.getState().groups)[0];
  ['AL', 'AR', 'BL', 'BR'].forEach((code, i) => c.store.run(C.linkUld, { uldId: 'u-' + code, dolly: slotRef(gid, i + 1) }));
  assert.ok(c.store.run(C.presentUld, { uldId: 'u-AL' }).ok);
  assert.ok(c.store.run(C.presentUld, { uldId: 'u-AR' }).ok);
  const st = c.store.getState();
  assert.equal(Q.uldView(st, 'u-BL').dolly.label, '136-3');
  assert.equal(Q.uldView(st, 'u-BR').dolly.label, '136-4');
  assert.equal(Q.uldView(st, 'u-AL').status, ULD_STATUS.PRESENTED);
  assert.equal(Q.uldView(st, 'u-AL').lastDolly.label, '136-1');
  // the group stays, nothing is renumbered
  assert.deepEqual(labels(st, f), ['136-1', '136-2', '136-3', '136-4']);
  assert.equal(Q.counts(st, f).onDolly, 2);
});

test('17. "presented to high loader" never becomes "loaded into the aircraft"', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '136');
  const gid = Object.keys(c.store.getState().groups)[0];
  c.store.run(C.linkUld, { uldId: 'u-AL', dolly: slotRef(gid, 1) });
  c.store.run(C.presentUld, { uldId: 'u-AL' });
  c.store.run(C.startLoading, { flightId: f });
  c.store.run(C.endLoading, { flightId: f });
  const st = c.store.getState();
  assert.equal(st.ulds['u-AL'].status, ULD_STATUS.PRESENTED);
  assert.notEqual(st.ulds['u-AL'].status, ULD_STATUS.LOADED_CONFIRMED);
  for (const e of c.store.getEvents()) assert.notEqual(e.payload && e.payload.status, ULD_STATUS.LOADED_CONFIRMED);
});

test('18. a missing or moved location is shown as unknown, never invented', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '136');
  const gid = Object.keys(c.store.getState().groups)[0];
  assert.equal(Q.locationOf(c.store.getState(), 'group', gid).state, 'NONE');
  c.store.run(C.recordLocation, { entityKind: 'group', entityId: gid, label: LOCATION.NOSE });
  assert.equal(Q.locationOf(c.store.getState(), 'group', gid).state, 'KNOWN');
  c.tick(10 * MIN);
  c.store.run(C.recordLocation, { entityKind: 'group', entityId: gid, label: LOCATION.UNKNOWN });
  const loc = Q.locationOf(c.store.getState(), 'group', gid);
  assert.equal(loc.state, 'UNKNOWN');
  assert.equal(loc.label, null);
  assert.equal(loc.lastKnown.label, LOCATION.NOSE); // old place is offered only as "last confirmed"
  assert.equal(c.store.run(C.recordLocation, { entityKind: 'group', entityId: gid, label: 'SOMEWHERE' }).error.code, 'INVALID_LOCATION');
});

test('19. the same eventId is never applied twice', async () => {
  const c = await mk();
  const f = await withFlight(c);
  const before = c.store.getEvents().length;
  const ev = {
    eventId: 'dup-1', aggregateId: 'g1', eventType: T.DOLLY_GROUP_CREATED,
    payload: { groupId: 'g1', flightId: f, number: '500', dupIndex: 1 },
    occurredAt: c.now(), recordedAt: c.now(), actorId: 'demo-user', schemaVersion: 1,
  };
  assert.equal(c.store.dispatch(ev), true);
  assert.equal(c.store.dispatch(ev), false);
  assert.equal(c.store.dispatch({ ...ev }), false);
  assert.equal(c.store.getEvents().length, before + 1);
  assert.equal(Q.groupsView(c.store.getState(), f).length, 1);
  await c.store.flush();
  assert.equal(c.storage._raw().length, before + 1);
});

test('20. Stage 0 demo data contains no real airline data', async () => {
  const c = await mk();
  seedDemo(c.store, c.now());
  const st = c.store.getState();
  for (const fl of Object.values(st.flights)) assert.match(fl.number, /^DM\d{3}$/);
  for (const u of Object.values(st.ulds)) assert.match(u.number, /^[A-Z]{3}\d{5}ZZ$/);
  for (const fl of Object.values(st.flights)) assert.ok(fl.lir.demo);
  const text = JSON.stringify(c.store.getEvents());
  assert.ok(!/VQ[A-Z]{3}|VP[A-Z]{3}|4K[A-Z]{3,4}|7L\d/.test(text));
});

test('21. a repeated group number needs a confirmation, then creates a second independent group', async () => {
  const c = await mk();
  const f = await withFlight(c);
  assert.ok(group(c.store, f, '145').ok);
  const again = group(c.store, f, '145');
  assert.equal(again.ok, false);
  assert.equal(again.confirm.code, 'DUPLICATE_NUMBER');
  assert.equal(Q.groupsView(c.store.getState(), f).length, 1);
  assert.ok(group(c.store, f, '145', true).ok);
  const gs = Q.groupsView(c.store.getState(), f);
  assert.equal(gs.length, 2);
  assert.deepEqual(gs.map((g) => g.dupIndex).sort(), [1, 2]);
  const r = Q.search(c.store.getState(), f, '145');
  assert.equal(r.groups.length, 2);
  // different dolly types may share a number without a warning
  assert.ok(c.store.run(C.createSingleDolly, { flightId: f, number: '145' }).ok);
});

test('22. a train with three ULD and one empty position is a normal state', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '128');
  const gid = Object.keys(c.store.getState().groups)[0];
  ['AL', 'AR', 'BL'].forEach((code, i) => c.store.run(C.linkUld, { uldId: 'u-' + code, dolly: slotRef(gid, i + 1) }));
  const g = Q.groupsView(c.store.getState(), f)[0];
  assert.equal(g.units.filter((u) => u.linkedUldId).length, 3);
  assert.equal(g.units[3].linkedUldId, null);
  assert.equal(g.units[3].label, '128-4');
  // an empty dolly can be detached; an occupied one cannot; labels of the rest do not change
  assert.equal(c.store.run(C.detachDolly, { dolly: slotRef(gid, 1) }).error.code, 'DOLLY_NOT_EMPTY');
  assert.ok(c.store.run(C.detachDolly, { dolly: slotRef(gid, 4) }).ok);
  assert.deepEqual(labels(c.store.getState(), f), ['128-1', '128-2', '128-3', '128-4']);
  assert.equal(c.store.run(C.linkUld, { uldId: 'u-BR', dolly: slotRef(gid, 4) }).error.code, 'DOLLY_DETACHED');
});

test('extra: unlinking needs confirmation; undo restores the previous state and keeps the log', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '136');
  const gid = Object.keys(c.store.getState().groups)[0];
  c.store.run(C.linkUld, { uldId: 'u-AL', dolly: slotRef(gid, 1) });
  assert.equal(c.store.run(C.unlinkUld, { uldId: 'u-AL' }).confirm.code, 'UNLINK_ULD');
  c.store.run(C.presentUld, { uldId: 'u-AL' });
  assert.equal(c.store.getState().ulds['u-AL'].status, ULD_STATUS.PRESENTED);
  const n = c.store.getEvents().length;
  assert.ok(c.store.undoLast());
  const st = c.store.getState();
  assert.equal(st.ulds['u-AL'].status, ULD_STATUS.ON_DOLLY);
  assert.equal(Q.uldView(st, 'u-AL').dolly.label, '136-1');
  assert.equal(c.store.getEvents().length, n + 1); // nothing deleted, one ACTION_UNDONE appended
  assert.equal(c.store.undoLast(), false);
  // survives a restart too
  await c.store.flush();
  const c2 = await mk(c.storage);
  assert.equal(c2.store.getState().ulds['u-AL'].status, ULD_STATUS.ON_DOLLY);
});

test('extra: a presented ULD cannot be silently re-linked', async () => {
  const c = await mk();
  const f = await withFlight(c);
  group(c.store, f, '136');
  const gid = Object.keys(c.store.getState().groups)[0];
  c.store.run(C.linkUld, { uldId: 'u-AL', dolly: slotRef(gid, 1) });
  c.store.run(C.presentUld, { uldId: 'u-AL' });
  const r = c.store.run(C.linkUld, { uldId: 'u-AL', dolly: slotRef(gid, 2) });
  assert.equal(r.confirm.code, 'REVERT_PRESENTED');
  assert.ok(c.store.run(C.linkUld, { uldId: 'u-AL', dolly: slotRef(gid, 2), confirmed: true }).ok);
  assert.equal(Q.uldView(c.store.getState(), 'u-AL').status, ULD_STATUS.ON_DOLLY);
});

// ---- LIR sheet: geometry of the paper layout ----
import { sheetOf, codesOf } from '../src/core/layouts.js';

test('LIR 1. B747-8F template: cell grid as measured on the paper LIR (39 cells, no overlaps, unique codes)', () => {
  const cells = LAYOUT_B747_8F.sheet.cells;
  assert.equal(cells.length, 39);
  assert.equal(new Set(cells.map((x) => x.code)).size, 39);
  const by = Object.fromEntries(cells.map((x) => [x.code, x]));
  assert.deepEqual([by.AR.x, by.AR.y, by.AR.w, by.AR.h], [10, 5, 82, 143]);
  assert.deepEqual([by.AL.x, by.AL.y], [10, 148]); // left side is the bottom row
  assert.deepEqual([by.R.x, by.R.y, by.R.w, by.R.h], [1096, 5, 64, 287]); // one tall position at the tail
  assert.equal(by.MR.x - (by.LR.x + by.LR.w), 8); // the gap between L and M
  assert.deepEqual([by['11P'].x, by['11P'].y, by['11P'].h], [19, 302, 162]);
  assert.ok(by['51'].bulk && by['52'].bulk);
  // nothing overlaps (touching edges are fine)
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const a = cells[i]; const b = cells[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    assert.ok(!(ox > 0 && oy > 0), `${a.code} overlaps ${b.code}`);
  }
  // bulk compartments hold no ULD; everything else can
  assert.equal(codesOf(LAYOUT_B747_8F).length, 37);
  assert.ok(!codesOf(LAYOUT_B747_8F).includes('51'));
});

test('LIR 2. older layouts (rows, decks) become the same sheet shape', () => {
  const rows = { rows: [{ key: 'MAIN', name: 'x', codes: ['AL', 'AR'] }, { key: 'LOWER', name: 'y', codes: ['11P'] }] };
  const s = sheetOf(rows);
  assert.equal(s.cells.length, 3);
  assert.ok(s.w >= 400 && s.h > 100);
  const decks = { decks: [{ key: 'MAIN', rows: 2, cols: 2, cells: [{ code: 'AR', row: 1, col: 1, span: 1 }, { code: 'AL', row: 2, col: 1, span: 1 }] }] };
  assert.deepEqual(codesOf(decks), ['AR', 'AL']);
});

test('LIR 3. demo DM101 draws double-width and centre-line units in their own boxes; total weight adds up', async () => {
  const c = await mk();
  seedDemo(c.store, c.now());
  const v = Q.lirSheetView(c.store.getState(), 'f-dm101');
  assert.equal(v.ulds.length, 30);
  const er = v.ulds.find((u) => u.code === 'ER');
  assert.ok(er.custom && er.rect.w > 150, 'PGA over ER/FR is one wide box');
  const cl = v.ulds.find((u) => u.code === 'CL');
  assert.ok(cl.custom && cl.showLabel && cl.rect.y < 148 && cl.rect.y + cl.rect.h > 148, 'unit across the centre line');
  const ar = v.ulds.find((u) => u.code === 'AR');
  assert.ok(!ar.custom && ar.rect.x === 10 && ar.rect.w === 82, 'plain unit sits in its own cell');
  assert.equal(ar.cell.label, '136-1'); // dolly shown on the band
  assert.equal(v.totalKg, v.ulds.reduce((s, u) => s + u.cell.view.weight, 0));
  // the sheet for an old-style demo flight still works
  assert.ok(Q.lirSheetView(c.store.getState(), 'f-dm202').ulds.length > 0);
});

test('FILE 1. header text in scattered pdf.js order is read correctly (synthetic data)', () => {
  const it = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });
  const items = [
    it('Date:', 495, 790), it('01Jan2027', 541, 791), it('7L9801 (XY123)', 384, 790), it('Callsign (Flight Nbr.):', 219, 790),
    it('A/C Reg:', 664, 790), it('ABCDE', 739, 791), it('ORIG - DEST:', 861, 790), it('GYD - BGW', 964, 791),
    it('LOAD INSTRUCTION REPORT edno', 31, 819), it('7', 200, 819), it('STD (GMT):', 219, 756), it('02:30', 316, 755),
  ];
  const h = parseHeader(itemsToText(items));
  assert.equal(h.number, 'XY123');
  assert.equal(h.edno, 7);
  assert.equal(h.reg, 'ABCDE');
  assert.equal(h.route, 'GYD - BGW');
  assert.equal(h.std, '02:30');
  assert.equal(h.date, new Date(2027, 0, 1).getTime());
  assert.deepEqual(parseHeader(''), { number: '', date: null, edno: null, reg: '', route: '', std: '' });
});

const ZONES = ['AR', 'BR', 'CR', 'DR', 'ER', 'AL'].map((code, i) => ({ code, x: 10 + i * 60, y: 20, w: 58, h: 138 }));

test('FILE 2. importLirPage: new flight, same edition refused, new edition revises; registerUld marks a position', async () => {
  const c = await mk();
  const args = { number: 'xy 123', date: 100, aircraftType: 'B747-8F', stand: 'C9', edno: 3, reg: 'ABCDE', route: 'A - B', std: '02:30', zones: ZONES, pageSize: { w: 1180, h: 487 } };
  const r = c.store.run(C.importLirPage, args);
  assert.ok(r.ok);
  const fid = r.events[0].payload.flightId;
  const f = c.store.getState().flights[fid];
  assert.equal(f.number, 'XY123');
  assert.equal(f.lir.page, true);
  assert.equal(f.reg, 'ABCDE');
  assert.equal(c.store.run(C.importLirPage, args).error.code, 'SAME_EDITION');
  const r2 = c.store.run(C.importLirPage, { ...args, edno: 4 });
  assert.ok(r2.ok);
  assert.equal(r2.events[0].eventType, T.LIR_REVISED);
  assert.equal(c.store.getState().flights[fid].lir.edno, 4);
  assert.equal(c.store.run(C.importLirPage, { ...args, number: 'AB1', zones: [] }).error.code, 'PAGE_LAYOUT');
  assert.equal(Object.keys(c.store.getState().flights).length, 1);

  assert.equal(c.store.run(C.registerUld, { flightId: fid, code: 'ZZ', number: '' }).error.code, 'NOT_FOUND');
  const u = c.store.run(C.registerUld, { flightId: fid, code: 'AR', number: ' pmc 46472ff ' });
  assert.ok(u.ok);
  const view = Q.lirCell(c.store.getState(), fid, 'AR');
  assert.equal(view.empty, false);
  assert.equal(view.view.number, 'PMC46472FF');
  assert.equal(c.store.run(C.registerUld, { flightId: fid, code: 'AR', number: '' }).error.code, 'ALREADY_REGISTERED');
  // a mark without a number is allowed
  assert.ok(c.store.run(C.registerUld, { flightId: fid, code: 'BR', number: '' }).ok);
  assert.equal(c.store.run(C.registerUld, { flightId: fid, code: 'CR', number: '!!' }).error.code, 'INVALID_NUMBER');
});

test('FILE 3. detectZones finds boxes drawn on a picture (long lines only, text ignored) and nameZones names them from a known grid', () => {
  // synthetic page part: 2 pt = 2 px per point; boxes 60 x 100 pt, a "text" smudge inside the first one must not split it
  const scale = 2, W = 600, H = 700;
  const g = new Uint8Array(W * H).fill(255);
  const rect = (x0, y0, x1, y1) => { for (let x = x0; x <= x1; x++) { g[y0 * W + x] = 0; g[y1 * W + x] = 0; } for (let y = y0; y <= y1; y++) { g[y * W + x0] = 0; g[y * W + x1] = 0; } };
  rect(20, 300, 140, 500); rect(140, 300, 260, 500); rect(260, 300, 380, 500);
  for (let x = 40; x < 130; x++) g[400 * W + x] = 0; // a line of text strokes spanning the box is short per run? no: make it short
  for (let x = 60; x < 70; x++) g[400 * W + x] = 0;
  const z = detectZones(g, W, H, scale, 0);
  assert.ok(z.length >= 3 && z.length <= 4, 'found ' + z.length);
  assert.ok(z.some((q) => Math.abs(q.x - 70) < 3 && Math.abs(q.w - 60) < 3));
  // naming: take the real 8F grid cells as "found" boxes -> names come back, bulk dropped
  const g8 = NAMED_GRIDS.find((x) => x.key === 'B747_8F');
  const found = g8.cells.map((c) => ({ x: c.x + 2, y: c.y + 2, w: c.w - 4, h: c.h - 4 }));
  const n = nameZones(found);
  assert.equal(n.grid, 'B747_8F');
  assert.ok(n.zones.some((q) => q.code === 'AR') && n.zones.some((q) => q.code === '11P'));
  assert.ok(!n.zones.some((q) => q.code === '51' || q.code === '52'), 'bulk is dropped');
  // unknown shapes are only numbered
  const un = nameZones([{ x: 1170, y: 470, w: 8, h: 8 }, { x: 1170, y: 400, w: 8, h: 8 }]);
  assert.deepEqual(un.zones.map((q) => q.code), ['Z1', 'Z2']);
  assert.equal(un.grid, null);
  assert.ok(PAGE.cropH > 400);
});
