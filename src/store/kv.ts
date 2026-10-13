import { storageReady } from './legacy';

/**
 * Small IndexedDB key-value store (database "gemsmap", store "kv" — shared with the
 * autosave of large models). Used for data that must not compete with the map
 * autosave for the ~5 MB of localStorage (the template library, template drafts).
 * Every call resolves (undefined on failure): storage can be unavailable.
 */
const DB = 'gemsmap', STORE = 'kv';

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return storageReady.then(() => new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(undefined);
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        try {
          const req = fn(open.result.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(undefined);
        } catch { resolve(undefined); }
      };
    } catch { resolve(undefined); }
  }));
}

export const kvGet = <T>(key: string) => run<T>('readonly', (s) => s.get(key));
export const kvPut = (key: string, value: unknown) => run<IDBValidKey>('readwrite', (s) => s.put(value, key));
export const kvDelete = (key: string) => run<undefined>('readwrite', (s) => s.delete(key));
