// Commands = validation + the events a user action produces.
// A command never changes state. It returns one of:
//   { ok:true, events:[{eventType, aggregateId, payload}] }
//   { ok:false, error:{code} }              hard refusal
//   { ok:false, confirm:{code, data} }      allowed only after an explicit user confirmation
// The store turns the events into full event records (id, times, actor).

import { T, ULD_STATUS, LOCATION, getDolly } from './model.js';
import { codesOf } from './layouts.js';

const ok = (events) => ({ ok: true, events });
const fail = (code, data) => ({ ok: false, error: { code, data } });
const need = (code, data) => ({ ok: false, confirm: { code, data } });
const ev = (eventType, aggregateId, payload) => ({ eventType, aggregateId, payload });

/**
 * A LIR file was opened. New flight (number + date) -> flight with an empty LIR page. The same flight again
 * (a newer edition) -> only the edition changes, nothing already marked is lost.
 */
export function importLirPage(state, { number, date, aircraftType, stand, edno, reg, route, std, zones, pageSize }, ctx) {
  const n = normalizeNumber(number);
  if (!n) return fail('INVALID_NUMBER');
  if (!Array.isArray(zones) || zones.length < 5) return fail('PAGE_LAYOUT');
  const day = typeof date === 'number' && Number.isFinite(date) ? date : ctx.now();
  const same = Object.values(state.flights).find((f) => f.number === n && f.date === day);
  if (same) {
    if (same.lir && same.lir.edno === edno) return fail('SAME_EDITION', { flightId: same.id });
    return ok([ev(T.LIR_REVISED, same.id, { flightId: same.id, edno, zones })]);
  }
  const flightId = ctx.newId();
  return ok([
    ev(T.FLIGHT_CREATED, flightId, { flightId, number: n, date: day, aircraftType: aircraftType || '', stand: stand || '', reg: reg || '', route: route || '', std: std || '' }),
    ev(T.LIR_LOADED, flightId, { flightId, edno: edno || 1, zones, pageSize: pageSize || null, demo: false, page: true, positions: [] }),
  ]);
}

/** Mark a position on the LIR page as holding a ULD. The number is optional. */
export function registerUld(state, { flightId, code, number }, ctx) {
  const f = state.flights[flightId];
  if (!f || !f.lir) return fail('NO_FLIGHT');
  if (typeof code !== 'string' || !code) return fail('NOT_FOUND');
  if (f.lir.zones) { if (!f.lir.zones.some((z) => z.code === code)) return fail('NOT_FOUND'); }
  else if (f.lir.layout && !codesOf(f.lir.layout).includes(code)) return fail('NOT_FOUND');
  const pos = state.positions[`${flightId}:${code}`];
  if (pos && pos.uldId) return fail('ALREADY_REGISTERED', { uldId: pos.uldId });
  const num = String(number == null ? '' : number).trim().toUpperCase().replace(/\s+/g, '');
  if (num && !/^[A-Z0-9]{3,12}$/.test(num)) return fail('INVALID_NUMBER');
  const uldId = `u-${flightId}-${code}`;
  return ok([ev(T.ULD_REGISTERED, uldId, { flightId, code, uldId, number: num })]);
}

/** Group / dolly numbers are strings. Keeps leading zeros. Returns null if invalid. */
export function normalizeNumber(raw) {
  const n = String(raw == null ? '' : raw).trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-Z0-9]{1,8}$/.test(n) ? n : null;
}

export function createDollyGroup(state, { flightId, number, confirmed }, ctx) {
  if (!state.flights[flightId]) return fail('NO_FLIGHT');
  const n = normalizeNumber(number);
  if (!n) return fail('INVALID_NUMBER');
  const same = Object.values(state.groups).filter((g) => g.flightId === flightId && g.number === n).length;
  if (same && !confirmed) return need('DUPLICATE_NUMBER', { number: n, kind: 'STANDARD_4' });
  const groupId = ctx.newId();
  return ok([ev(T.DOLLY_GROUP_CREATED, groupId, { groupId, flightId, number: n, dupIndex: same + 1 })]);
}

export function createSingleDolly(state, { flightId, number, confirmed }, ctx) {
  if (!state.flights[flightId]) return fail('NO_FLIGHT');
  const n = normalizeNumber(number);
  if (!n) return fail('INVALID_NUMBER');
  const same = Object.values(state.singles).filter((g) => g.flightId === flightId && g.number === n).length;
  if (same && !confirmed) return need('DUPLICATE_NUMBER', { number: n, kind: 'SINGLE_20FT' });
  const singleId = ctx.newId();
  return ok([ev(T.SINGLE_DOLLY_CREATED, singleId, { singleId, flightId, number: n, dupIndex: same + 1 })]);
}

/** A 20 ft dolly is always alone. There is deliberately no way to add it to a train. */
export function attachSingleToGroup() {
  return fail('SINGLE_20FT_CANNOT_JOIN');
}

export function linkUld(state, { uldId, dolly, confirmed }) {
  const u = state.ulds[uldId];
  const d = getDolly(state, dolly);
  if (!u || !d) return fail('NOT_FOUND');
  if (u.status === ULD_STATUS.LOADED_CONFIRMED) return fail('ALREADY_LOADED');
  if (d.detached) return fail('DOLLY_DETACHED');
  if (d.linkedUldId === uldId) return fail('ALREADY_LINKED');
  if (d.linkedUldId) return fail('DOLLY_OCCUPIED');
  if (u.linked && !confirmed) return need('MOVE_ULD', { from: u.linked, to: dolly });
  if (u.status === ULD_STATUS.PRESENTED && !confirmed) return need('REVERT_PRESENTED', { to: dolly });
  const events = [];
  if (u.linked) events.push(ev(T.ULD_UNLINKED, uldId, { uldId, dolly: u.linked, reason: 'MOVE' }));
  events.push(ev(T.ULD_LINKED, uldId, { uldId, dolly }));
  return ok(events);
}

export function unlinkUld(state, { uldId, confirmed }) {
  const u = state.ulds[uldId];
  if (!u) return fail('NOT_FOUND');
  if (!u.linked) return fail('NOT_ON_DOLLY');
  if (!confirmed) return need('UNLINK_ULD', { dolly: u.linked });
  return ok([ev(T.ULD_UNLINKED, uldId, { uldId, dolly: u.linked, reason: 'MANUAL' })]);
}

/** ULD handed to the high loader. NOT the same as loaded into the aircraft. */
export function presentUld(state, { uldId }) {
  const u = state.ulds[uldId];
  if (!u) return fail('NOT_FOUND');
  if (!u.linked) return fail('NOT_ON_DOLLY');
  return ok([ev(T.ULD_STATUS_CHANGED, uldId, { uldId, status: ULD_STATUS.PRESENTED, fromDolly: u.linked })]);
}

export function detachDolly(state, { dolly }) {
  const d = getDolly(state, dolly);
  if (!d || dolly.kind !== 'slot') return fail('NOT_FOUND');
  if (d.linkedUldId) return fail('DOLLY_NOT_EMPTY');
  if (d.detached) return fail('ALREADY_DETACHED');
  return ok([ev(T.DOLLY_DETACHED, d.id, { dolly })]);
}

export function reattachDolly(state, { dolly }) {
  const d = getDolly(state, dolly);
  if (!d || dolly.kind !== 'slot') return fail('NOT_FOUND');
  if (!d.detached) return fail('NOT_DETACHED');
  return ok([ev(T.DOLLY_REATTACHED, d.id, { dolly })]);
}

/** entityKind: 'group' (a coupled train) or 'single'. label: a LOCATION value. Optional for the user. */
export function recordLocation(state, { entityKind, entityId, label }) {
  const exists = entityKind === 'group' ? state.groups[entityId] : entityKind === 'single' ? state.singles[entityId] : null;
  if (!exists) return fail('NOT_FOUND');
  if (!Object.values(LOCATION).includes(label)) return fail('INVALID_LOCATION');
  return ok([ev(T.LOCATION_RECORDED, entityId, { entityKind, entityId, label, source: 'MANUAL' })]);
}

export function startLoading(state, { flightId }) {
  if (!state.flights[flightId]) return fail('NO_FLIGHT');
  if (state.loading[flightId]) return fail('ALREADY_STARTED');
  return ok([ev(T.LOADING_STARTED, flightId, { flightId })]);
}

export function endLoading(state, { flightId }) {
  const l = state.loading[flightId];
  if (!l) return fail('NOT_STARTED');
  if (l.endedAt) return fail('ALREADY_ENDED');
  return ok([ev(T.LOADING_ENDED, flightId, { flightId })]);
}

/** Correct a start/end time. The original stays in the log and in state.loading[].corrections. */
export function correctLoadingTime(state, { flightId, field, newValue, reason }, ctx) {
  const l = state.loading[flightId];
  if (!l) return fail('NOT_STARTED');
  if (!reason || !String(reason).trim()) return fail('REASON_REQUIRED');
  if (field !== 'START' && field !== 'END') return fail('INVALID_FIELD');
  if (field === 'END' && !l.endedAt) return fail('NOT_ENDED');
  if (typeof newValue !== 'number' || !Number.isFinite(newValue)) return fail('INVALID_TIME');
  if (newValue > ctx.now()) return fail('TIME_IN_FUTURE');
  if (field === 'START' && l.endedAt && newValue >= l.endedAt) return fail('START_AFTER_END');
  if (field === 'END' && newValue <= l.startedAt) return fail('END_BEFORE_START');
  const oldValue = field === 'START' ? l.startedAt : l.endedAt;
  return ok([ev(T.LOADING_TIME_CORRECTED, flightId, { flightId, field, oldValue, newValue, reason: String(reason).trim() })]);
}
