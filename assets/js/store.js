/* store.js — persistence.
 *
 * Why IndexedDB and not localStorage: localStorage is a synchronous ~5MB
 * string bucket. One 90,000-word manuscript is roughly 500KB of prose before
 * you count notes, revisions and a second book — and every keystroke would
 * block the main thread re-serialising the whole project. IndexedDB is async,
 * effectively unbounded, and lets us index by project so a series with three
 * books doesn't load book 2 and 3 to open book 1.
 *
 * A writer must still own their words as files, so exportAll/importAll write
 * plain JSON. The database is a cache; the JSON is the archive.
 */

/* The product is called Writeline. These identifiers are NOT renamed with it.
 * The database name is the address of every word a writer has already put into
 * this application; changing it would open an empty book and call that a
 * rebrand. A rename is a marketing change and must never be a migration event.
 * The same goes for the export format tag below — older backups have to keep
 * importing. */
const DB_NAME = 'novel-platform';
const DB_VERSION = 1;
const STORE = 'records';

let dbPromise = null;
let memoryFallback = null;

function openDb() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no-idb'));

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('type', 'type');
        os.createIndex('projectId', 'projectId');
        os.createIndex('bookId', 'bookId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/* If IndexedDB is blocked (private mode, file:// in some browsers) we degrade
 * to memory + localStorage rather than losing the session outright. The UI
 * surfaces this so nobody writes 4,000 words into a tab that can't persist. */
export const storage = { mode: 'idb', warning: null };

const LS_KEY = 'novel-platform-fallback';

function loadFallback() {
  if (memoryFallback) return memoryFallback;
  memoryFallback = new Map();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) for (const r of JSON.parse(raw)) memoryFallback.set(r.id, r);
  } catch { /* nothing to recover */ }
  return memoryFallback;
}

function saveFallback() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...loadFallback().values()]));
  } catch {
    storage.warning = 'Local storage is full. Export your project to JSON now.';
  }
}

async function tx(mode, fn) {
  if (storage.mode === 'memory') return fn(null);
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      Promise.resolve(fn(store)).then((r) => { result = r; }, reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } catch (err) {
    storage.mode = 'memory';
    storage.warning =
      'IndexedDB is unavailable, so this session is held in memory only. '
      + 'Export to JSON before closing the tab.';
    console.warn(`store: falling back to memory (${err.message})`);
    return fn(null);
  }
}

function reqValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putMany(records) {
  if (!records.length) return records;
  const stamped = records.map((r) => ({ ...r, updatedAt: new Date().toISOString() }));
  await tx('readwrite', (store) => {
    if (!store) {
      const mem = loadFallback();
      stamped.forEach((r) => mem.set(r.id, r));
      saveFallback();
      return null;
    }
    stamped.forEach((r) => store.put(r));
    return null;
  });
  return stamped;
}

export const put = async (record) => (await putMany([record]))[0];

export async function removeMany(ids) {
  if (!ids.length) return;
  await tx('readwrite', (store) => {
    if (!store) {
      const mem = loadFallback();
      ids.forEach((id) => mem.delete(id));
      saveFallback();
      return null;
    }
    ids.forEach((id) => store.delete(id));
    return null;
  });
}

export async function all() {
  return tx('readonly', (store) => {
    if (!store) return [...loadFallback().values()];
    return reqValue(store.getAll());
  });
}

export async function exportAll() {
  return {
    format: 'novel-platform/v1',
    exportedAt: new Date().toISOString(),
    records: await all(),
  };
}

/* mode 'replace' wipes first — used by "restore from backup".
 * mode 'merge' keeps existing records — used by "import a character bible". */
export async function importAll(payload, mode = 'replace') {
  if (!payload || !Array.isArray(payload.records)) {
    throw new Error('That is not a Writeline backup: no records array found.');
  }
  if (mode === 'replace') {
    const existing = await all();
    await removeMany(existing.map((r) => r.id));
  }
  await putMany(payload.records);
  return payload.records.length;
}

export async function wipe() {
  const existing = await all();
  await removeMany(existing.map((r) => r.id));
}
