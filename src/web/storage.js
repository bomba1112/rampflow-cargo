// Browser storage for the event log: IndexedDB first, then localStorage, then memory.
// All three keep the same append-only list of events.

import { memoryStorage } from '../core/storage.js';

const DB = 'rampflow';
const STORE = 'events';
const LS_KEY = 'rampflow.events.v1';

function idbStorage() {
  const open = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  const tx = (db, mode, fn) =>
    new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out && out.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  return open().then((db) => ({
    kind: 'indexeddb',
    loadAll: () => tx(db, 'readonly', (s) => s.getAll()).then((x) => x || []),
    append: (ev) => tx(db, 'readwrite', (s) => s.add(ev)),
    clear: () => tx(db, 'readwrite', (s) => s.clear()),
  }));
}

function lsStorage() {
  const ls = window.localStorage;
  ls.setItem('rampflow.probe', '1');
  ls.removeItem('rampflow.probe');
  const read = () => {
    try {
      return JSON.parse(ls.getItem(LS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  };
  return {
    kind: 'localstorage',
    async loadAll() {
      return read();
    },
    async append(ev) {
      const list = read();
      list.push(ev);
      ls.setItem(LS_KEY, JSON.stringify(list));
    },
    async clear() {
      ls.removeItem(LS_KEY);
    },
  };
}

export async function pickStorage() {
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB) return await idbStorage();
  } catch (e) {
    /* fall through */
  }
  try {
    return lsStorage();
  } catch (e) {
    /* fall through */
  }
  const m = memoryStorage();
  m.kind = 'memory'; // data is lost on reload; the UI says so
  return m;
}
