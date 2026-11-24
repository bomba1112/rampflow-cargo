// In-memory storage with a JSON round trip, so tests behave like a real disk.
// Browser storage (IndexedDB / localStorage) lives in src/web/storage.js.

const clone = (x) => JSON.parse(JSON.stringify(x));

export function memoryStorage(initial = []) {
  let list = initial.map(clone);
  return {
    async loadAll() {
      return list.map(clone);
    },
    async append(ev) {
      list.push(clone(ev));
    },
    async clear() {
      list = [];
    },
    _raw: () => list,
  };
}
