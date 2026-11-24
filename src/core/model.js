// RampFlow core: event types, state shape and the pure reducer.
// No DOM, no storage, no framework: this file is the part that gets ported to Dart.
//
// Separate things (never merge them):
//   position  = place in the aircraft from the LIR (AR, 11P)       -> state.positions
//   uld       = the pallet itself                                  -> state.ulds
//   group/slot= working position in a coupled train (136-1..136-4) -> state.groups / state.slots
//   single    = one 20 ft dolly, no suffix                         -> state.singles
//   location  = optional manual observation of where a train is   -> state.locations
//   (future)  = physical dolly asset with a permanent ID           -> NOT modelled in Stage 0

export const SCHEMA_VERSION = 1;

export const T = Object.freeze({
  FLIGHT_CREATED: 'FLIGHT_CREATED',
  LIR_LOADED: 'LIR_LOADED',
  DOLLY_GROUP_CREATED: 'DOLLY_GROUP_CREATED',
  SINGLE_DOLLY_CREATED: 'SINGLE_DOLLY_CREATED',
  ULD_LINKED: 'ULD_LINKED',
  ULD_UNLINKED: 'ULD_UNLINKED',
  ULD_STATUS_CHANGED: 'ULD_STATUS_CHANGED',
  DOLLY_DETACHED: 'DOLLY_DETACHED',
  DOLLY_REATTACHED: 'DOLLY_REATTACHED',
  LOCATION_RECORDED: 'LOCATION_RECORDED',
  LOADING_STARTED: 'LOADING_STARTED',
  LOADING_ENDED: 'LOADING_ENDED',
  LOADING_TIME_CORRECTED: 'LOADING_TIME_CORRECTED',
  ACTION_UNDONE: 'ACTION_UNDONE',
});

export const ULD_STATUS = Object.freeze({
  UNKNOWN: 'UNKNOWN', // no dolly known
  ON_DOLLY: 'ON_DOLLY',
  PRESENTED: 'PRESENTED_TO_HILOADER',
  OFF_DOLLY: 'REMOVED_FROM_DOLLY',
  // Reserved for a later stage. No Stage 0 command emits it, and presenting to the
  // high loader must never turn into this status.
  LOADED_CONFIRMED: 'LOADED_CONFIRMED',
});

export const LOCATION = Object.freeze({
  NOSE: 'NOSE',
  TAIL: 'TAIL',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN', // "the train was moved, new place not recorded"
});

export const FLIGHT_STATUS = Object.freeze({ PLANNED: 'PLANNED', LOADING: 'LOADING', DONE: 'DONE' });

export function emptyState() {
  return {
    seq: 0,
    applied: {},
    flights: {},
    positions: {},
    ulds: {},
    groups: {},
    slots: {},
    singles: {},
    locations: {},
    loading: {},
  };
}

export const posId = (flightId, code) => `${flightId}:${code}`;
export const slotId = (groupId, ordinal) => `${groupId}:${ordinal}`;

/** Resolve a dolly reference {kind:'slot'|'single', id} to the stored object. */
export function getDolly(s, ref) {
  if (!ref) return null;
  return (ref.kind === 'slot' ? s.slots[ref.id] : s.singles[ref.id]) || null;
}

const H = {
  [T.FLIGHT_CREATED](s, p) {
    s.flights[p.flightId] = {
      id: p.flightId,
      number: p.number,
      date: p.date,
      aircraftType: p.aircraftType,
      stand: p.stand,
      status: FLIGHT_STATUS.PLANNED,
      lir: null,
      seq: ++s.seq,
    };
  },

  [T.LIR_LOADED](s, p, e) {
    const f = s.flights[p.flightId];
    if (!f) return;
    f.lir = { edno: p.edno, layout: p.layout, loadedAt: e.occurredAt, demo: !!p.demo };
    for (const pos of p.positions) {
      const id = posId(p.flightId, pos.code);
      s.positions[id] = { id, flightId: p.flightId, code: pos.code, uldId: pos.uld ? pos.uld.id : null };
      if (pos.uld) {
        s.ulds[pos.uld.id] = {
          id: pos.uld.id,
          flightId: p.flightId,
          number: pos.uld.number,
          type: pos.uld.type,
          weight: pos.uld.weight,
          dest: pos.uld.dest,
          positionCode: pos.code,
          status: ULD_STATUS.UNKNOWN,
          linked: null, // dolly ref while on a dolly
          lastDolly: null, // dolly ref it was last on (after presenting / unlinking)
          presentedAt: null,
          everLinked: false,
        };
      }
    }
  },

  [T.DOLLY_GROUP_CREATED](s, p, e) {
    s.groups[p.groupId] = {
      id: p.groupId,
      flightId: p.flightId,
      number: p.number, // always a string: "007" must stay "007"
      dupIndex: p.dupIndex || 1,
      type: 'STANDARD_4',
      createdAt: e.occurredAt,
      seq: ++s.seq,
    };
    for (let i = 1; i <= 4; i++) {
      const id = slotId(p.groupId, i);
      s.slots[id] = { id, groupId: p.groupId, ordinal: i, linkedUldId: null, lastUldId: null, detached: false };
    }
  },

  [T.SINGLE_DOLLY_CREATED](s, p, e) {
    s.singles[p.singleId] = {
      id: p.singleId,
      flightId: p.flightId,
      number: p.number,
      dupIndex: p.dupIndex || 1,
      type: '20FT',
      linkedUldId: null,
      lastUldId: null,
      createdAt: e.occurredAt,
      seq: ++s.seq,
    };
  },

  [T.ULD_LINKED](s, p) {
    const u = s.ulds[p.uldId];
    const d = getDolly(s, p.dolly);
    if (!u || !d) return;
    if (u.linked) {
      const old = getDolly(s, u.linked);
      if (old && old.linkedUldId === u.id) old.linkedUldId = null;
    }
    if (d.linkedUldId && d.linkedUldId !== u.id) {
      const other = s.ulds[d.linkedUldId];
      if (other) {
        other.linked = null;
        other.status = ULD_STATUS.OFF_DOLLY;
      }
    }
    d.linkedUldId = u.id;
    d.lastUldId = null;
    u.linked = p.dolly;
    u.status = ULD_STATUS.ON_DOLLY;
    u.presentedAt = null;
    u.everLinked = true;
  },

  [T.ULD_UNLINKED](s, p) {
    const u = s.ulds[p.uldId];
    if (!u) return;
    const d = getDolly(s, p.dolly);
    if (d && d.linkedUldId === u.id) d.linkedUldId = null;
    u.lastDolly = p.dolly;
    u.linked = null;
    if (p.reason !== 'MOVE') u.status = ULD_STATUS.OFF_DOLLY;
  },

  [T.ULD_STATUS_CHANGED](s, p, e) {
    const u = s.ulds[p.uldId];
    if (!u) return;
    u.status = p.status;
    if (p.status === ULD_STATUS.PRESENTED) {
      const from = u.linked || p.fromDolly || null;
      const d = getDolly(s, from);
      if (d && d.linkedUldId === u.id) {
        d.linkedUldId = null;
        d.lastUldId = u.id;
      }
      u.lastDolly = from;
      u.linked = null;
      u.presentedAt = e.occurredAt;
    }
  },

  [T.DOLLY_DETACHED](s, p) {
    const d = getDolly(s, p.dolly);
    if (d) d.detached = true;
  },

  [T.DOLLY_REATTACHED](s, p) {
    const d = getDolly(s, p.dolly);
    if (d) d.detached = false;
  },

  [T.LOCATION_RECORDED](s, p, e) {
    const key = `${p.entityKind}:${p.entityId}`;
    (s.locations[key] = s.locations[key] || []).push({
      label: p.label,
      at: e.occurredAt,
      recordedAt: e.recordedAt,
      source: p.source || 'MANUAL',
    });
  },

  [T.LOADING_STARTED](s, p, e) {
    s.loading[p.flightId] = {
      startedAt: e.occurredAt,
      endedAt: null,
      originalStartedAt: e.occurredAt,
      originalEndedAt: null,
      corrections: [],
    };
    const f = s.flights[p.flightId];
    if (f) f.status = FLIGHT_STATUS.LOADING;
  },

  [T.LOADING_ENDED](s, p, e) {
    const l = s.loading[p.flightId];
    if (!l) return;
    l.endedAt = e.occurredAt;
    l.originalEndedAt = e.occurredAt;
    const f = s.flights[p.flightId];
    if (f) f.status = FLIGHT_STATUS.DONE;
  },

  [T.LOADING_TIME_CORRECTED](s, p, e) {
    const l = s.loading[p.flightId];
    if (!l) return;
    if (p.field === 'START') l.startedAt = p.newValue;
    else l.endedAt = p.newValue;
    l.corrections.push({
      field: p.field,
      oldValue: p.oldValue,
      newValue: p.newValue,
      reason: p.reason,
      correctedAt: e.occurredAt,
      actorId: e.actorId,
    });
  },

  [T.ACTION_UNDONE]() {
    // Handled in buildState: the listed events are skipped on replay.
  },
};

/** Apply one event. Returns false if this eventId was already applied (idempotent). */
export function applyEvent(s, e) {
  if (s.applied[e.eventId]) return false;
  s.applied[e.eventId] = true;
  const h = H[e.eventType];
  if (h) h(s, e.payload || {}, e);
  return true;
}

/** Event ids cancelled by ACTION_UNDONE events. */
export function undoneIds(events) {
  const set = new Set();
  for (const e of events) {
    if (e.eventType === T.ACTION_UNDONE) for (const id of e.payload.eventIds || []) set.add(id);
  }
  return set;
}

/** Rebuild state from the full append-only log. Undone events stay in the log but are skipped. */
export function buildState(events) {
  const undone = undoneIds(events);
  const s = emptyState();
  for (const e of events) {
    if (undone.has(e.eventId)) continue;
    applyEvent(s, e);
  }
  return s;
}
