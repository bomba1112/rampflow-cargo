// Read-only views over the state. Everything the UI shows comes from here.

import { ULD_STATUS, LOCATION, getDolly } from './model.js';

const norm = (s) => String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '');

/** One dolly position as the UI needs it, from a ref {kind:'slot'|'single', id}. */
export function dollyUnitOf(state, ref) {
  if (!ref) return null;
  if (ref.kind === 'slot') {
    const sl = state.slots[ref.id];
    if (!sl) return null;
    const g = state.groups[sl.groupId];
    return {
      ref: { kind: 'slot', id: sl.id },
      kind: 'slot',
      id: sl.id,
      groupId: g.id,
      flightId: g.flightId,
      number: g.number,
      dupIndex: g.dupIndex,
      ordinal: sl.ordinal,
      label: `${g.number}-${sl.ordinal}`,
      linkedUldId: sl.linkedUldId,
      lastUldId: sl.lastUldId,
      detached: sl.detached,
    };
  }
  const si = state.singles[ref.id];
  if (!si) return null;
  return {
    ref: { kind: 'single', id: si.id },
    kind: 'single',
    id: si.id,
    groupId: null,
    flightId: si.flightId,
    number: si.number,
    dupIndex: si.dupIndex,
    ordinal: null,
    label: si.number,
    linkedUldId: si.linkedUldId,
    lastUldId: si.lastUldId,
    detached: false,
  };
}

/**
 * Where a train is. Without an observation the answer is "unknown": the app never invents a place.
 * state: NONE (never recorded) | KNOWN | UNKNOWN (moved after the last recorded place)
 */
export function locationOf(state, entityKind, entityId) {
  const obs = (state.locations[`${entityKind}:${entityId}`] || []).slice().sort((a, b) => a.at - b.at);
  if (!obs.length) return { state: 'NONE', label: null, at: null, lastKnown: null };
  const last = obs[obs.length - 1];
  if (last.label === LOCATION.UNKNOWN) {
    const prev = obs.slice().reverse().find((o) => o.label !== LOCATION.UNKNOWN) || null;
    return { state: 'UNKNOWN', label: null, at: last.at, lastKnown: prev ? { label: prev.label, at: prev.at } : null };
  }
  return { state: 'KNOWN', label: last.label, at: last.at, lastKnown: null };
}

export function locationOfUnit(state, unit) {
  return unit.kind === 'slot' ? locationOf(state, 'group', unit.groupId) : locationOf(state, 'single', unit.id);
}

/** Trains and single dollies of a flight, newest first. Each has its units in order from the tug. */
export function groupsView(state, flightId) {
  const out = [];
  for (const g of Object.values(state.groups)) {
    if (g.flightId !== flightId) continue;
    const units = [1, 2, 3, 4].map((i) => dollyUnitOf(state, { kind: 'slot', id: `${g.id}:${i}` }));
    out.push({ kind: 'STANDARD_4', id: g.id, number: g.number, dupIndex: g.dupIndex, seq: g.seq, units, location: locationOf(state, 'group', g.id) });
  }
  for (const s of Object.values(state.singles)) {
    if (s.flightId !== flightId) continue;
    out.push({ kind: 'SINGLE_20FT', id: s.id, number: s.number, dupIndex: s.dupIndex, seq: s.seq, units: [dollyUnitOf(state, { kind: 'single', id: s.id })], location: locationOf(state, 'single', s.id) });
  }
  return out.sort((a, b) => b.seq - a.seq);
}

export function uldView(state, uldId) {
  const u = state.ulds[uldId];
  if (!u) return null;
  const dolly = u.linked ? dollyUnitOf(state, u.linked) : null;
  const lastDolly = u.lastDolly ? dollyUnitOf(state, u.lastDolly) : null;
  const unit = dolly || lastDolly;
  return {
    id: u.id,
    flightId: u.flightId,
    number: u.number,
    type: u.type,
    weight: u.weight,
    dest: u.dest,
    positionCode: u.positionCode,
    status: u.status,
    dolly, // current dolly, if on one
    lastDolly, // previous dolly after presenting / unlinking
    presentedAt: u.presentedAt,
    location: dolly ? locationOfUnit(state, dolly) : null,
    unit,
  };
}

/** What a LIR cell shows, mirroring the paper: top = order from the tug, bottom = group number. */
export function lirCell(state, flightId, code) {
  const pos = state.positions[`${flightId}:${code}`];
  if (!pos) return { code, empty: true, view: null, top: '', bottom: '' };
  if (!pos.uldId) return { code, empty: true, view: null, top: '', bottom: '' };
  const view = uldView(state, pos.uldId);
  // On a dolly: show it. Handed to the high loader: show where it came from. Otherwise (never linked,
  // or unlinked by hand) the cell stays blank, like an unmarked paper LIR.
  const unit = view.status === ULD_STATUS.ON_DOLLY ? view.dolly : view.status === ULD_STATUS.PRESENTED ? view.lastDolly : null;
  let top = '';
  let bottom = '';
  if (unit) {
    top = unit.kind === 'slot' ? String(unit.ordinal) : '20ft';
    bottom = unit.number + (unit.dupIndex > 1 ? `(${unit.dupIndex})` : '');
  }
  return { code, empty: false, view, top, bottom };
}

export function counts(state, flightId) {
  const r = { total: 0, onDolly: 0, presented: 0, noDolly: 0 };
  for (const u of Object.values(state.ulds)) {
    if (u.flightId !== flightId) continue;
    r.total++;
    if (u.status === ULD_STATUS.ON_DOLLY) r.onDolly++;
    else if (u.status === ULD_STATUS.PRESENTED || u.status === ULD_STATUS.LOADED_CONFIRMED) r.presented++;
    else r.noDolly++;
  }
  return r;
}

export function loadingView(state, flightId) {
  const l = state.loading[flightId];
  if (!l) return { status: 'NOT_STARTED', startedAt: null, endedAt: null, durationMs: null, corrections: [], startCorrected: false, endCorrected: false };
  const valid = l.endedAt && l.endedAt > l.startedAt;
  return {
    status: l.endedAt ? 'ENDED' : 'IN_PROGRESS',
    startedAt: l.startedAt,
    endedAt: l.endedAt,
    originalStartedAt: l.originalStartedAt,
    originalEndedAt: l.originalEndedAt,
    durationMs: valid ? l.endedAt - l.startedAt : null,
    corrections: l.corrections,
    startCorrected: l.corrections.some((c) => c.field === 'START'),
    endCorrected: l.corrections.some((c) => c.field === 'END'),
  };
}

/** ULDs of a flight in LIR order (order of positions as loaded). */
export function uldsOfFlight(state, flightId) {
  return Object.values(state.positions)
    .filter((p) => p.flightId === flightId && p.uldId)
    .map((p) => uldView(state, p.uldId));
}

/**
 * Search by ULD number (full or part), group number, full dolly label ("007-4"), or LIR position ("12P").
 * Result chain for a ULD: ULD -> dolly -> LIR position -> status. Place on the apron stays "unknown" unless recorded.
 */
export function search(state, flightId, raw) {
  const q = norm(raw);
  const out = { query: q, groups: [], ulds: [], positions: [] };
  if (!q) return out;
  const matched = new Map(); // uldId -> Set(reasons)
  const add = (uldId, why) => {
    if (!uldId || !state.ulds[uldId]) return;
    if (!matched.has(uldId)) matched.set(uldId, new Set());
    matched.get(uldId).add(why);
  };

  const label = /^(.+)-([1-4])$/.exec(q);
  for (const g of groupsView(state, flightId)) {
    if (g.number === q) {
      out.groups.push({ ...g, focusOrdinal: null });
      for (const u of g.units) {
        add(u.linkedUldId, 'GROUP');
        add(u.lastUldId, 'GROUP');
      }
    } else if (label && g.kind === 'STANDARD_4' && g.number === label[1]) {
      const ord = Number(label[2]);
      out.groups.push({ ...g, focusOrdinal: ord });
      const u = g.units[ord - 1];
      add(u.linkedUldId, 'DOLLY_LABEL');
      add(u.lastUldId, 'DOLLY_LABEL');
    }
  }

  const qNoDash = q.replace(/-/g, '');
  for (const u of Object.values(state.ulds)) {
    if (u.flightId !== flightId) continue;
    if (qNoDash.length >= 2 && norm(u.number).includes(qNoDash)) add(u.id, 'ULD_NUMBER');
  }

  for (const p of Object.values(state.positions)) {
    if (p.flightId === flightId && norm(p.code) === q) {
      out.positions.push({ code: p.code, uld: p.uldId ? uldView(state, p.uldId) : null });
      add(p.uldId, 'POSITION');
    }
  }

  const rank = { DOLLY_LABEL: 0, GROUP: 1, POSITION: 2, ULD_NUMBER: 3 };
  out.ulds = [...matched.entries()]
    .map(([id, why]) => ({ ...uldView(state, id), matchedBy: [...why] }))
    .sort((a, b) => Math.min(...a.matchedBy.map((r) => rank[r])) - Math.min(...b.matchedBy.map((r) => rank[r])) || a.positionCode.localeCompare(b.positionCode));
  return out;
}
