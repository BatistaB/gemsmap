/**
 * GEMsMAP was called MetMap up to 0.2. Browser storage written under the old name moves to the new
 * one on the first start after the rename, so the autosaved map, user templates, mapping profiles,
 * panel layout and COBRAGUI sessions carry over:
 *  - localStorage keys "metmap.*" / "metmap-*" → "gemsmap.*" / "gemsmap-*" (synchronously, when this
 *    module is evaluated — main.tsx imports it first, before any module reads localStorage);
 *  - IndexedDB databases "metmap" and "metmap-lab" → "gemsmap" and "gemsmap-lab" (copied; every
 *    IndexedDB access waits for `storageReady`). The old databases are left in place as a backup.
 */
const OLD = 'metmap', NEW = 'gemsmap';

function moveLocalStorage() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(OLD)) keys.push(k); }
    for (const k of keys) {
      const to = NEW + k.slice(OLD.length);
      const v = localStorage.getItem(k);
      if (v == null || localStorage.getItem(to) != null) continue;
      // move, not copy: the map autosave can take most of the ~5 MB quota
      localStorage.removeItem(k);
      try { localStorage.setItem(to, v); } catch { localStorage.setItem(k, v); }
    }
  } catch { /* storage unavailable */ }
}

/** Opens a database only if it exists (an open that would create it is aborted). */
function openExisting(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(name);
      req.onupgradeneeded = () => req.transaction?.abort();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
const result = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

async function copyDatabase(from: string, to: string) {
  const existing = await openExisting(to);
  if (existing) { existing.close(); return; }
  const src = await openExisting(from);
  if (!src) return;
  const stores = Array.from(src.objectStoreNames).map((name) => {
    const s = src.transaction(name, 'readonly').objectStore(name);
    return { name, keyPath: s.keyPath, autoIncrement: s.autoIncrement, keys: result(s.getAllKeys()), values: result(s.getAll()) };
  });
  const rows = await Promise.all(stores.map(async (s) => ({ ...s, keys: await s.keys, values: await s.values })));
  const version = src.version;
  src.close();
  const dst = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(to, version);
    req.onupgradeneeded = () => { for (const s of rows) req.result.createObjectStore(s.name, { keyPath: s.keyPath, autoIncrement: s.autoIncrement }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    if (rows.length) {
      const tx = dst.transaction(rows.map((s) => s.name), 'readwrite');
      for (const s of rows) {
        const st = tx.objectStore(s.name);
        s.values.forEach((v, i) => { if (s.keyPath == null) st.put(v, s.keys[i]); else st.put(v); });
      }
      await done(tx);
    }
    dst.close();
  } catch (e) {
    // a half-copied database must not shadow the old one: the next start tries again
    dst.close();
    indexedDB.deleteDatabase(to);
    throw e;
  }
}

async function copyIndexedDb() {
  if (typeof indexedDB === 'undefined') return;
  for (const [from, to] of [[OLD, NEW], [`${OLD}-lab`, `${NEW}-lab`]]) {
    try { await copyDatabase(from, to); } catch (e) { console.warn(`[GEMsMAP] could not move browser database "${from}"`, e); }
  }
}

moveLocalStorage();
/** Resolves once storage from the MetMap era is in place under the new names. */
export const storageReady: Promise<void> = copyIndexedDb();
