import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/core/store.js';
import { memoryStorage } from '../src/core/storage.js';
import { T } from '../src/core/model.js';
import * as C from '../src/core/commands.js';
import * as O from '../src/core/ops.js';

const MIN = 60000;
async function mk() {
  let clock = Date.UTC(2026, 10, 26, 10, 0, 0); // 14:00 Baku
  let n = 0;
  const store = await openStore({ storage: memoryStorage(), now: () => clock, newId: () => 'id' + ++n });
  const f = 'f1';
  store.emit(T.FLIGHT_CREATED, f, { flightId: f, number: 'DM900', date: Date.UTC(2026, 10, 25, 20, 0, 0), aircraftType: 'B747-8F', stand: 'C8', std: '15:30' });
  store.emit(T.LIR_LOADED, f, { flightId: f, edno: 1, zones: Array.from({ length: 6 }, (_, i) => ({ code: 'Z' + (i + 1), x: i * 20, y: 0, w: 18, h: 40 })), demo: false, page: true, positions: [] });
  return { store, f, tick: (ms) => (clock += ms), now: () => clock };
}
const fodAll = (store, f) => { for (let i = 0; i < O.FOD_ITEMS; i++) assert.ok(store.run(O.setFod, { flightId: f, idx: i, value: 'ok' }).ok); };
const lmAll = (store, f) => { for (let i = 0; i < O.LM_ITEMS; i++) assert.ok(store.run(O.setLmCheck, { flightId: f, idx: i, value: 'ok' }).ok); };
const reg = (store, f, code) => store.run(C.registerUld, { flightId: f, code, number: '' });

test('chocks ON needs the whole stand check; OFF needs loadmaster readiness', async () => {
  const { store, f } = await mk();
  assert.equal(store.run(O.chocksOn, { flightId: f }).error.code, 'FOD_INCOMPLETE');
  fodAll(store, f);
  assert.ok(store.run(O.chocksOn, { flightId: f }).ok);
  assert.equal(store.run(O.chocksOn, { flightId: f }).error.code, 'CHOCKS_ALREADY_ON');
  assert.equal(store.run(O.setFod, { flightId: f, idx: 0, value: null }).error.code, 'CHOCKS_ALREADY_ON');
  assert.equal(store.run(O.chocksOff, { flightId: f }).error.code, 'NOT_READY');
});

test('service timers: only after chocks, one start, stop once; level goes warn then late', async () => {
  const { store, f, tick, now } = await mk();
  assert.equal(store.run(O.startService, { flightId: f, service: 'fuel' }).error.code, 'CHOCKS_NOT_ON');
  fodAll(store, f); store.run(O.chocksOn, { flightId: f });
  assert.ok(store.run(O.startService, { flightId: f, service: 'fuel' }).ok);
  assert.equal(store.run(O.startService, { flightId: f, service: 'fuel' }).error.code, 'ALREADY_STARTED');
  assert.equal(store.run(O.startService, { flightId: f, service: 'x' }).error.code, 'INVALID_SERVICE');
  tick(20 * MIN);
  assert.equal(O.timersView(store.getState(), f, now()).fuel.level, 'ok');
  tick(5 * MIN); // 25 of 30 min = 83 %
  assert.equal(O.timersView(store.getState(), f, now()).fuel.level, 'warn');
  tick(10 * MIN);
  assert.equal(O.timersView(store.getState(), f, now()).fuel.level, 'late');
  assert.ok(store.run(O.stopService, { flightId: f, service: 'fuel' }).ok);
  assert.equal(O.timersView(store.getState(), f, now()).fuel.state, 'done');
  assert.equal(store.run(O.stopService, { flightId: f, service: 'fuel' }).error.code, 'ALREADY_STOPPED');
});

test('loading timer comes from the existing loading record', async () => {
  const { store, f, tick, now } = await mk();
  assert.equal(O.timersView(store.getState(), f, now()).load.state, 'idle');
  store.run(C.startLoading, { flightId: f });
  tick(30 * MIN);
  const l = O.timersView(store.getState(), f, now()).load;
  assert.equal(l.state, 'run'); assert.equal(Math.round(l.ms / MIN), 30);
});

test('delays: code and minutes validated, decisions, code change keeps history', async () => {
  const { store, f } = await mk();
  assert.equal(store.run(O.reportDelay, { flightId: f, code: '3', minutes: 5 }).error.code, 'INVALID_CODE');
  assert.equal(store.run(O.reportDelay, { flightId: f, code: '33', minutes: 0 }).error.code, 'INVALID_MINUTES');
  const r = store.run(O.reportDelay, { flightId: f, code: '33', minutes: 12, note: ' нет тягача ', photos: 2 });
  assert.ok(r.ok);
  const id = r.events[0].payload.delayId;
  let d = store.getState().delays[id];
  assert.equal(d.status, 'PENDING'); assert.equal(d.note, 'нет тягача'); assert.equal(d.photos, 2);
  assert.equal(O.openDelays(store.getState(), f).length, 1);
  assert.ok(store.run(O.changeDelayCode, { delayId: id, code: '38' }).ok);
  d = store.getState().delays[id];
  assert.equal(d.code, '38'); assert.equal(d.history.length, 1); assert.equal(d.history[0].from, '33');
  assert.equal(store.run(O.changeDelayCode, { delayId: id, code: '38' }).error.code, 'SAME_CODE');
  assert.ok(store.run(O.decideDelay, { delayId: id, decision: 'ESCALATED' }).ok);
  assert.equal(store.run(O.decideDelay, { delayId: id, decision: 'ESCALATED' }).error.code, 'ALREADY_ESCALATED');
  assert.ok(store.run(O.decideDelay, { delayId: id, decision: 'APPROVED' }).ok);
  assert.equal(store.run(O.decideDelay, { delayId: id, decision: 'RETURNED' }).error.code, 'ALREADY_APPROVED');
  assert.equal(O.openDelays(store.getState(), f).length, 0);
});

test('special cargo only on a registered position; change withdraws readiness', async () => {
  const { store, f } = await mk();
  assert.equal(store.run(O.setSpecialCargo, { flightId: f, code: 'Z1', flags: ['DGR'] }).error.code, 'NOT_FOUND');
  reg(store, f, 'Z1');
  assert.equal(store.run(O.setSpecialCargo, { flightId: f, code: 'Z1', flags: ['XXX'] }).error.code, 'INVALID_VALUE');
  assert.ok(store.run(O.setSpecialCargo, { flightId: f, code: 'Z1', flags: ['PER', 'DGR'] }).ok);
  assert.deepEqual(O.opsOf(store.getState(), f).special.Z1, ['DGR', 'PER']);
  assert.ok(store.run(O.setSpecialCargo, { flightId: f, code: 'Z1', flags: [] }).ok);
  assert.equal(O.opsOf(store.getState(), f).special.Z1, undefined);
});

test('readiness: blocked by missing ULD, open checklist, notes and DGR; confirmed; edit withdraws it', async () => {
  const { store, f } = await mk();
  let r = store.run(O.confirmReady, { flightId: f });
  assert.equal(r.error.code, 'READY_BLOCKED');
  assert.ok(r.error.data.issues.some((i) => i.k === 'NO_ULD'));
  reg(store, f, 'Z1');
  lmAll(store, f);
  store.run(O.setSpecialCargo, { flightId: f, code: 'Z1', flags: ['DGR'] });
  store.run(O.setLmCheck, { flightId: f, idx: O.LM_DGR_ITEM, value: 'note' });
  r = store.run(O.confirmReady, { flightId: f });
  const kinds = r.error.data.issues.map((i) => i.k);
  assert.ok(kinds.includes('LM_NOTE') && kinds.includes('DGR'));
  store.run(O.setLmCheck, { flightId: f, idx: O.LM_DGR_ITEM, value: 'ok' });
  assert.ok(store.run(O.confirmReady, { flightId: f }).ok);
  assert.equal(store.run(O.confirmReady, { flightId: f }).error.code, 'ALREADY_READY');
  store.run(O.setLmCheck, { flightId: f, idx: 0, value: 'note' });
  assert.equal(O.opsOf(store.getState(), f).ready, null, 'any change withdraws the confirmation');
});

test('full turnaround: chocks OFF only after readiness; checklist locked afterwards', async () => {
  const { store, f } = await mk();
  reg(store, f, 'Z1'); fodAll(store, f); lmAll(store, f);
  store.run(O.chocksOn, { flightId: f });
  assert.equal(store.run(O.chocksOff, { flightId: f }).error.code, 'NOT_READY');
  assert.ok(store.run(O.confirmReady, { flightId: f }).ok);
  assert.ok(store.run(O.chocksOff, { flightId: f }).ok);
  assert.equal(store.run(O.setLmCheck, { flightId: f, idx: 0, value: null }).error.code, 'CHOCKS_ALREADY_OFF');
  assert.equal(store.run(O.revokeReady, { flightId: f }).error.code, 'CHOCKS_ALREADY_OFF');
});

test('undo removes the last ops action and state is rebuilt from the log', async () => {
  const { store, f } = await mk();
  fodAll(store, f); store.run(O.chocksOn, { flightId: f });
  assert.ok(O.opsOf(store.getState(), f).chocksOn);
  store.undoLast();
  assert.equal(O.opsOf(store.getState(), f).chocksOn, null);
  assert.equal(O.opsOf(store.getState(), f).fod[0], 'ok');
});

test('SLA: STD within 30 / 10 min, open delay, late timer; chocks OFF makes it done', async () => {
  const { store, f, tick, now } = await mk();
  const fl = () => store.getState().flights[f];
  assert.equal(O.stdMs(fl()), Date.UTC(2026, 10, 26, 11, 30, 0)); // 15:30 Baku
  assert.equal(O.slaView(store.getState(), fl(), now()).level, 'ok'); // 90 min to STD
  tick(65 * MIN); // 25 min to STD
  assert.equal(O.slaView(store.getState(), fl(), now()).level, 'warn');
  tick(20 * MIN); // 5 min to STD
  assert.equal(O.slaView(store.getState(), fl(), now()).level, 'late');
  reg(store, f, 'Z1'); fodAll(store, f); lmAll(store, f);
  store.run(O.chocksOn, { flightId: f }); store.run(O.confirmReady, { flightId: f });
  assert.equal(O.slaView(store.getState(), fl(), now()).level, 'ok', 'ready flights are no longer judged by STD');
  store.run(O.reportDelay, { flightId: f, code: '33', minutes: 5 });
  assert.equal(O.slaView(store.getState(), fl(), now()).level, 'warn');
  store.run(O.chocksOff, { flightId: f });
  assert.deepEqual(O.slaView(store.getState(), fl(), now()).why, [{ code: 'DONE' }]);
});

test('handover freezes the summary; shift summary counts', async () => {
  const { store, f, now } = await mk();
  store.run(O.reportDelay, { flightId: f, code: '38', minutes: 10 });
  const sum = O.shiftSummary(store.getState(), now());
  assert.equal(sum.flights, 1); assert.equal(sum.delays, 1); assert.equal(sum.delayMinutes, 10); assert.equal(sum.openDelays, 1);
  assert.ok(store.run(O.sendHandover, { comment: ' DM900 ждёт борт ' }).ok);
  const h = store.getState().handovers;
  assert.equal(h.length, 1); assert.equal(h[0].comment, 'DM900 ждёт борт'); assert.equal(h[0].summary.openDelays, 1);
});
