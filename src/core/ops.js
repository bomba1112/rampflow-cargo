// Turnaround operations: stand check, chocks, service timers, delays, special cargo, load-readiness, shift handover.
// Added next to the existing core, does not change any existing event or command.
// Same rules as the rest of the core: pure functions, no DOM, commands never change state.

export const OPS_T = Object.freeze({
  FOD_SET: 'FOD_SET',
  CHOCKS_ON: 'CHOCKS_ON',
  CHOCKS_OFF: 'CHOCKS_OFF',
  SERVICE_STARTED: 'SERVICE_STARTED',
  SERVICE_STOPPED: 'SERVICE_STOPPED',
  DELAY_REPORTED: 'DELAY_REPORTED',
  DELAY_DECIDED: 'DELAY_DECIDED',
  SPECIAL_CARGO_SET: 'SPECIAL_CARGO_SET',
  LM_CHECK_SET: 'LM_CHECK_SET',
  READY_CONFIRMED: 'READY_CONFIRMED',
  READY_REVOKED: 'READY_REVOKED',
  HANDOVER_SENT: 'HANDOVER_SENT',
});

/** Checklists. The text lives in the strings; here only how many items there are. */
export const FOD_ITEMS = 6;
export const LM_ITEMS = 8;
export const LM_DGR_ITEM = 5; // "DGR: orientation and segregation"

/** Services that run on a timer. Loading itself is the existing LOADING_STARTED/ENDED. Plan is in minutes. */
export const SERVICES = Object.freeze(['unload', 'fuel', 'cater', 'gse']);
export const SERVICE_PLAN = Object.freeze({ unload: 25, load: 60, fuel: 30, cater: 25, gse: 20 });
export const SPECIAL = Object.freeze(['DGR', 'AVI', 'PER', 'HEA']);
export const WARN_AT = 0.8; // a timer turns "warning" at 80 % of its plan, "late" above 100 %
export const STD_WARN_MIN = 30;
export const STD_LATE_MIN = 10;

/** Starter list of IATA delay codes. The full list comes from the operator (open question). */
export const DELAY_CODES = Object.freeze(['31', '32', '33', '38', '34', '36', '37', '39', '51', '71', '93']);

export function emptyOps() {
  return { fod: {}, chocksOn: null, chocksOff: null, services: {}, special: {}, lm: {}, ready: null };
}
export const opsOf = (s, flightId) => s.ops[flightId] || emptyOps();
const ensure = (s, flightId) => (s.ops[flightId] = s.ops[flightId] || emptyOps());

/** Reducers, merged into the main reducer in model.js. */
export const OPS_HANDLERS = {
  [OPS_T.FOD_SET](s, p) {
    const o = ensure(s, p.flightId);
    if (p.value) o.fod[p.idx] = p.value;
    else delete o.fod[p.idx];
  },
  [OPS_T.CHOCKS_ON](s, p, e) { ensure(s, p.flightId).chocksOn = e.occurredAt; },
  [OPS_T.CHOCKS_OFF](s, p, e) { ensure(s, p.flightId).chocksOff = e.occurredAt; },
  [OPS_T.SERVICE_STARTED](s, p, e) { ensure(s, p.flightId).services[p.service] = { start: e.occurredAt, stop: null }; },
  [OPS_T.SERVICE_STOPPED](s, p, e) {
    const sv = ensure(s, p.flightId).services[p.service];
    if (sv) sv.stop = e.occurredAt;
  },
  [OPS_T.DELAY_REPORTED](s, p, e) {
    s.delays[p.delayId] = {
      id: p.delayId, flightId: p.flightId, code: p.code, minutes: p.minutes, note: p.note || '', photos: p.photos || 0,
      reportedAt: e.occurredAt, status: 'PENDING', decidedAt: null, history: [], seq: Object.keys(s.delays).length + 1,
    };
  },
  [OPS_T.DELAY_DECIDED](s, p, e) {
    const d = s.delays[p.delayId];
    if (!d) return;
    if (p.code && p.code !== d.code) d.history.push({ field: 'code', from: d.code, to: p.code, at: e.occurredAt });
    if (p.code) d.code = p.code;
    d.status = p.decision;
    d.decidedAt = e.occurredAt;
  },
  [OPS_T.SPECIAL_CARGO_SET](s, p) {
    const o = ensure(s, p.flightId);
    if (p.flags && p.flags.length) o.special[p.code] = p.flags.slice();
    else delete o.special[p.code];
    // a changed special-cargo list means DGR/AVI/PER/HEA must be looked at again
    if (o.ready) o.ready = null;
  },
  [OPS_T.LM_CHECK_SET](s, p) {
    const o = ensure(s, p.flightId);
    if (p.value) o.lm[p.idx] = p.value;
    else delete o.lm[p.idx];
    if (o.ready) o.ready = null; // changing the checklist withdraws the confirmation
  },
  [OPS_T.READY_CONFIRMED](s, p, e) { ensure(s, p.flightId).ready = e.occurredAt; },
  [OPS_T.READY_REVOKED](s, p) { ensure(s, p.flightId).ready = null; },
  [OPS_T.HANDOVER_SENT](s, p, e) {
    s.handovers.push({ id: p.handoverId, at: e.occurredAt, comment: p.comment || '', summary: p.summary || null });
  },
};

/* ---------- time helpers ---------- */
const TZ = 'Asia/Baku';
/** STD as a time stamp, from the LIR header ("HH:MM") and the flight date. null if it is not known. */
export function stdMs(flight) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(flight.std || ''));
  if (!m || !flight.date) return null;
  const [y, mo, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(flight.date).split('-').map(Number);
  return Date.UTC(y, mo - 1, d, Number(m[1]) - 4, Number(m[2])); // Baku is UTC+4 all year
}

/* ---------- selectors ---------- */
const elapsedOf = (start, stop, now) => (start == null ? 0 : (stop != null ? stop : now) - start);

/** One timer: idle | run | done, elapsed ms, plan ms and level ok | warn | late. */
export function timerView(startAt, stopAt, planMin, now) {
  const state = startAt == null ? 'idle' : stopAt != null ? 'done' : 'run';
  const ms = elapsedOf(startAt, stopAt, now);
  const plan = planMin * 60000;
  let level = 'ok';
  if (state === 'run') level = ms > plan ? 'late' : ms > plan * WARN_AT ? 'warn' : 'ok';
  return { state, ms, plan, level, startAt, stopAt };
}

/** All timers of a flight. "load" comes from the existing loading record. */
export function timersView(s, flightId, now) {
  const o = opsOf(s, flightId);
  const out = {};
  for (const k of SERVICES) {
    const sv = o.services[k];
    out[k] = timerView(sv ? sv.start : null, sv ? sv.stop : null, SERVICE_PLAN[k], now);
  }
  const l = s.loading[flightId];
  out.load = timerView(l ? l.startedAt : null, l ? l.endedAt : null, SERVICE_PLAN.load, now);
  return out;
}

export function delaysOf(s, flightId) {
  return Object.values(s.delays).filter((d) => !flightId || d.flightId === flightId).sort((a, b) => a.seq - b.seq);
}
export const openDelays = (s, flightId) => delaysOf(s, flightId).filter((d) => d.status === 'PENDING' || d.status === 'ESCALATED');

/** What still blocks "loading ready". Each item: {k:'NO_ULD'} | {k:'LM',idx} | {k:'LM_NOTE',idx} | {k:'DGR'}. */
export function readyIssues(s, flightId) {
  const o = opsOf(s, flightId);
  const out = [];
  const ulds = Object.values(s.positions).filter((p) => p.flightId === flightId && p.uldId);
  if (!ulds.length) out.push({ k: 'NO_ULD' });
  for (let i = 0; i < LM_ITEMS; i++) {
    if (!o.lm[i]) out.push({ k: 'LM', idx: i });
    else if (o.lm[i] === 'note') out.push({ k: 'LM_NOTE', idx: i });
  }
  const dgr = Object.values(o.special).some((f) => f.includes('DGR'));
  if (dgr && o.lm[LM_DGR_ITEM] !== 'ok') out.push({ k: 'DGR' });
  return out;
}

/** Traffic light of a flight: {level:'ok'|'warn'|'late', why:[code,...]}. why holds machine codes the UI translates. */
export function slaView(s, flight, now) {
  const o = opsOf(s, flight.id);
  if (o.chocksOff) return { level: 'ok', why: [{ code: 'DONE' }] };
  const why = [];
  let level = 'ok';
  const up = (l, code, arg) => {
    if (l === 'late' || (l === 'warn' && level === 'ok')) level = l;
    why.push({ code, arg });
  };
  const tv = timersView(s, flight.id, now);
  for (const k of [...SERVICES, 'load']) {
    if (tv[k].level === 'late') up('late', 'TIMER_LATE', k);
    else if (tv[k].level === 'warn') up('warn', 'TIMER_WARN', k);
  }
  if (openDelays(s, flight.id).length) up('warn', 'DELAY_OPEN');
  const std = stdMs(flight);
  if (std != null && !o.ready) {
    const left = std - now;
    if (left < STD_LATE_MIN * 60000) up('late', 'STD_10');
    else if (left < STD_WARN_MIN * 60000) up('warn', 'STD_30');
  }
  if (!why.length) why.push({ code: 'OK' });
  return { level, why };
}

/** Shift summary used by the dashboard and by the handover report. */
export function shiftSummary(s, now) {
  const flights = Object.values(s.flights).sort((a, b) => a.seq - b.seq);
  let ok = 0, warn = 0, late = 0, done = 0;
  for (const f of flights) {
    const o = opsOf(s, f.id);
    if (o.chocksOff) { done++; continue; }
    const v = slaView(s, f, now).level;
    if (v === 'late') late++; else if (v === 'warn') warn++; else ok++;
  }
  const delays = delaysOf(s);
  const minutes = delays.reduce((a, d) => a + (d.minutes || 0), 0);
  const dgr = flights.reduce((a, f) => a + Object.values(opsOf(s, f.id).special).filter((x) => x.includes('DGR')).length, 0);
  return { flights: flights.length, ok, warn, late, done, delays: delays.length, delayMinutes: minutes, openDelays: openDelays(s).length, dgr };
}

/* ---------- commands ---------- */
const ok = (events) => ({ ok: true, events });
const fail = (code, data) => ({ ok: false, error: { code, data } });
const ev = (eventType, aggregateId, payload) => ({ eventType, aggregateId, payload });
const hasFlight = (s, id) => !!s.flights[id];

export function setFod(s, { flightId, idx, value }) {
  if (!hasFlight(s, flightId)) return fail('NO_FLIGHT');
  if (!Number.isInteger(idx) || idx < 0 || idx >= FOD_ITEMS) return fail('INVALID_ITEM');
  if (value !== 'ok' && value !== 'note' && value !== null) return fail('INVALID_VALUE');
  if (opsOf(s, flightId).chocksOn) return fail('CHOCKS_ALREADY_ON');
  return ok([ev(OPS_T.FOD_SET, flightId, { flightId, idx, value })]);
}

export function chocksOn(s, { flightId }) {
  if (!hasFlight(s, flightId)) return fail('NO_FLIGHT');
  const o = opsOf(s, flightId);
  if (o.chocksOn) return fail('CHOCKS_ALREADY_ON');
  for (let i = 0; i < FOD_ITEMS; i++) if (!o.fod[i]) return fail('FOD_INCOMPLETE');
  return ok([ev(OPS_T.CHOCKS_ON, flightId, { flightId })]);
}

/** Chocks OFF only after the loadmaster confirmed readiness. */
export function chocksOff(s, { flightId }) {
  if (!hasFlight(s, flightId)) return fail('NO_FLIGHT');
  const o = opsOf(s, flightId);
  if (!o.chocksOn) return fail('CHOCKS_NOT_ON');
  if (o.chocksOff) return fail('CHOCKS_ALREADY_OFF');
  if (!o.ready) return fail('NOT_READY');
  return ok([ev(OPS_T.CHOCKS_OFF, flightId, { flightId })]);
}

export function startService(s, { flightId, service }) {
  if (!hasFlight(s, flightId)) return fail('NO_FLIGHT');
  if (!SERVICES.includes(service)) return fail('INVALID_SERVICE');
  const o = opsOf(s, flightId);
  if (!o.chocksOn) return fail('CHOCKS_NOT_ON');
  if (o.chocksOff) return fail('CHOCKS_ALREADY_OFF');
  if (o.services[service]) return fail('ALREADY_STARTED');
  return ok([ev(OPS_T.SERVICE_STARTED, flightId, { flightId, service })]);
}

export function stopService(s, { flightId, service }) {
  const sv = opsOf(s, flightId).services[service];
  if (!sv) return fail('NOT_STARTED');
  if (sv.stop != null) return fail('ALREADY_STOPPED');
  return ok([ev(OPS_T.SERVICE_STOPPED, flightId, { flightId, service })]);
}

export const normCode = (raw) => {
  const c = String(raw == null ? '' : raw).trim();
  return /^\d{2}$/.test(c) ? c : null;
};

/** note: free text; photos: how many photos were attached (the files themselves stay on the phone). */
export function reportDelay(s, { flightId, code, minutes, note, photos }, ctx) {
  if (!hasFlight(s, flightId)) return fail('NO_FLIGHT');
  const c = normCode(code);
  if (!c) return fail('INVALID_CODE');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 999) return fail('INVALID_MINUTES');
  const delayId = ctx.newId();
  return ok([ev(OPS_T.DELAY_REPORTED, delayId, { delayId, flightId, code: c, minutes, note: String(note || '').trim(), photos: Math.max(0, Math.min(5, photos | 0)) })]);
}

/** The shift manager decides: APPROVED, RETURNED (back to the author) or ESCALATED. A new code may go with the decision. */
export function decideDelay(s, { delayId, decision, code }) {
  const d = s.delays[delayId];
  if (!d) return fail('NOT_FOUND');
  if (!['APPROVED', 'RETURNED', 'ESCALATED'].includes(decision)) return fail('INVALID_VALUE');
  if (d.status === 'APPROVED') return fail('ALREADY_APPROVED');
  if (decision === 'ESCALATED' && d.status === 'ESCALATED') return fail('ALREADY_ESCALATED');
  let c;
  if (code != null && code !== '') { c = normCode(code); if (!c) return fail('INVALID_CODE'); }
  return ok([ev(OPS_T.DELAY_DECIDED, delayId, { delayId, decision, code: c && c !== d.code ? c : undefined })]);
}

/** Change only the code of a delay that is not approved yet; it goes back to PENDING for a fresh decision. */
export function changeDelayCode(s, { delayId, code }) {
  const d = s.delays[delayId];
  if (!d) return fail('NOT_FOUND');
  if (d.status === 'APPROVED') return fail('ALREADY_APPROVED');
  const c = normCode(code);
  if (!c) return fail('INVALID_CODE');
  if (c === d.code) return fail('SAME_CODE');
  return ok([ev(OPS_T.DELAY_DECIDED, delayId, { delayId, decision: 'PENDING', code: c })]);
}

export function setSpecialCargo(s, { flightId, code, flags }) {
  const pos = s.positions[`${flightId}:${code}`];
  if (!pos || !pos.uldId) return fail('NOT_FOUND');
  const list = Array.isArray(flags) ? flags : [];
  if (list.some((f) => !SPECIAL.includes(f))) return fail('INVALID_VALUE');
  return ok([ev(OPS_T.SPECIAL_CARGO_SET, flightId, { flightId, code, flags: SPECIAL.filter((f) => list.includes(f)) })]);
}

export function setLmCheck(s, { flightId, idx, value }) {
  if (!hasFlight(s, flightId)) return fail('NO_FLIGHT');
  if (!Number.isInteger(idx) || idx < 0 || idx >= LM_ITEMS) return fail('INVALID_ITEM');
  if (value !== 'ok' && value !== 'note' && value !== null) return fail('INVALID_VALUE');
  if (opsOf(s, flightId).chocksOff) return fail('CHOCKS_ALREADY_OFF');
  return ok([ev(OPS_T.LM_CHECK_SET, flightId, { flightId, idx, value })]);
}

export function confirmReady(s, { flightId }) {
  if (!hasFlight(s, flightId)) return fail('NO_FLIGHT');
  const o = opsOf(s, flightId);
  if (o.chocksOff) return fail('CHOCKS_ALREADY_OFF');
  if (o.ready) return fail('ALREADY_READY');
  const issues = readyIssues(s, flightId);
  if (issues.length) return fail('READY_BLOCKED', { issues });
  return ok([ev(OPS_T.READY_CONFIRMED, flightId, { flightId })]);
}

export function revokeReady(s, { flightId }) {
  const o = opsOf(s, flightId);
  if (!o.ready) return fail('NOT_READY');
  if (o.chocksOff) return fail('CHOCKS_ALREADY_OFF');
  return ok([ev(OPS_T.READY_REVOKED, flightId, { flightId })]);
}

/** The summary is frozen into the event, so the report of that moment stays readable later. */
export function sendHandover(s, { comment }, ctx) {
  if (!Object.keys(s.flights).length) return fail('NO_FLIGHT');
  const handoverId = ctx.newId();
  return ok([ev(OPS_T.HANDOVER_SENT, handoverId, { handoverId, comment: String(comment || '').trim(), summary: shiftSummary(s, ctx.now()) })]);
}
