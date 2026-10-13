/**
 * Session persistence for COBRAGUI: per model checksum (states, results, favorites, views,
 * medium presets) in IndexedDB — results with flux vectors are too large for localStorage — and
 * small UI preferences in localStorage. Every access is guarded: storage can be unavailable.
 */
import { storageReady } from '../store/legacy';

const DB = 'gemsmap-lab';
const STORE = 'sessions';

async function open(): Promise<IDBDatabase> {
  await storageReady;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[COBRAGUI] could not persist session', e);
  }
}

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : { ...fallback, ...JSON.parse(v) };
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
}
