// Append-only event store. The log is the source of truth; state is rebuilt from it.
// Not distributed event sourcing: one local log, one actor. Sync and conflict rules come with Stage 1.

import { T, SCHEMA_VERSION, buildState, applyEvent, emptyState } from './model.js';

export function defaultId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

/**
 * storage: { loadAll(): Promise<Event[]>, append(ev): Promise<void>, clear(): Promise<void> }
 */
export async function openStore({ storage, now = () => Date.now(), newId = defaultId, actorId = 'demo-user' }) {
  let events = await storage.loadAll();
  const known = new Set(events.map((e) => e.eventId));
  let state = buildState(events);
  let lastAction = null;
  let queue = Promise.resolve();
  const listeners = new Set();

  const notify = () => listeners.forEach((f) => f());
  const persist = (e) => {
    queue = queue.then(() => storage.append(e)).catch(() => {});
    return queue;
  };

  function make(eventType, aggregateId, payload, opts = {}) {
    return {
      eventId: opts.eventId || newId(),
      aggregateId,
      eventType,
      payload,
      occurredAt: opts.occurredAt != null ? opts.occurredAt : now(),
      recordedAt: now(),
      actorId,
      schemaVersion: SCHEMA_VERSION,
    };
  }

  function append(e) {
    if (known.has(e.eventId)) return false; // the same eventId is never applied twice
    known.add(e.eventId);
    events.push(e);
    applyEvent(state, e);
    persist(e);
    return true;
  }

  return {
    getState: () => state,
    getEvents: () => events,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    flush: () => queue,
    canUndo: () => !!lastAction,

    /** Dispatch a ready event record (used for sync later, and in tests). */
    dispatch(e) {
      const r = append(e);
      if (r) notify();
      return r;
    },

    /** Build and dispatch one event. */
    emit(eventType, aggregateId, payload, opts) {
      const e = make(eventType, aggregateId, payload, opts);
      append(e);
      notify();
      return e;
    },

    /** Run a command. See commands.js for the result shapes. */
    run(command, params, opts = {}) {
      const r = command(state, params, { newId, now });
      if (!r.ok) return r;
      const made = r.events.map((x) => make(x.eventType, x.aggregateId, x.payload, opts));
      for (const e of made) append(e);
      lastAction = { eventIds: made.map((e) => e.eventId) };
      notify();
      return { ok: true, events: made };
    },

    /** Cancel the last user action. The events stay in the log; an ACTION_UNDONE event hides them. */
    undoLast() {
      if (!lastAction) return false;
      const ids = lastAction.eventIds;
      lastAction = null;
      const e = make(T.ACTION_UNDONE, ids[0], { eventIds: ids });
      known.add(e.eventId);
      events.push(e);
      persist(e);
      state = buildState(events);
      notify();
      return true;
    },

    async reset() {
      await queue;
      await storage.clear();
      events = [];
      known.clear();
      state = emptyState();
      lastAction = null;
      notify();
    },
  };
}
