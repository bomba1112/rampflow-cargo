// Local file store for the original LIR pages (images). Lives only in this browser on this phone: nothing is uploaded anywhere.
// IndexedDB 'files'; if that is not available, memory for the current session only.

const DB = 'rampflow';
const FILES = 'files';
const mem = new Map();

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { autoIncrement: true });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}
const run = (db, mode, fn) =>
  new Promise((resolve, reject) => {
    const t = db.transaction(FILES, mode);
    const r = fn(t.objectStore(FILES));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });

export async function putFile(key, blob) {
  mem.set(key, blob);
  try {
    const db = await open();
    await run(db, 'readwrite', (s) => s.put(blob, key));
    return 'indexeddb';
  } catch (e) {
    return 'memory';
  }
}
export async function getFile(key) {
  try {
    const db = await open();
    const b = await run(db, 'readonly', (s) => s.get(key));
    if (b) return b;
  } catch (e) {
    /* fall through to memory */
  }
  return mem.get(key) || null;
}
export async function clearFiles() {
  mem.clear();
  try {
    const db = await open();
    await run(db, 'readwrite', (s) => s.clear());
  } catch (e) {
    /* nothing stored */
  }
}
