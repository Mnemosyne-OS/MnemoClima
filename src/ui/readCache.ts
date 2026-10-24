/**
 * readCache — a source read once is kept on the machine (Tony, 11/10: « why do you query NOAA all
 * the time? », then « do it for all the data: the user keeps locally what he visits »). Every
 * source of the cartridge goes through here: what has been seen once opens again without a request.
 *
 * Kept in this window's IndexedDB with the time it was read. Fresh enough (`maxAgeMs`) = no
 * request. Older = read again; if that read fails, the old copy is served and the failure is
 * logged: every source here dates its own content (ONI season, CPC issue date, grid day), so an
 * old copy never passes for today's.
 */
const DB = 'mnemo-clima-cache';
const STORE = 'texts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('NO_INDEXEDDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB_OPEN'));
  });
}

async function get(url: string): Promise<{ at: number; text: string } | null> {
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(url);
        req.onsuccess = () => { const v = req.result as { at?: unknown; text?: unknown } | undefined; resolve(v && typeof v.at === 'number' && typeof v.text === 'string' ? { at: v.at, text: v.text } : null); };
        req.onerror = () => reject(req.error ?? new Error('IDB_READ'));
      });
    } finally { db.close(); }
  } catch (err) {
    console.warn('[MnemoClima] cache not read', err);
    return null;
  }
}

async function put(url: string, text: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ at: Date.now(), text }, url);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IDB_WRITE'));
      });
    } finally { db.close(); }
  } catch (err) {
    console.warn('[MnemoClima] cache not written', err);
  }
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Today as YYYY-MM-DD: the key of a copy whose URL carries the time of the call. */
export const today = (): string => new Date().toISOString().slice(0, 10);

/** A text that parses as JSON. */
export function isJson(text: string): boolean {
  try { JSON.parse(text); return true; } catch (err) { console.warn('[MnemoClima] answer is not JSON, not kept', err); return false; }
}

/**
 * The text of `url`: from the cache when younger than `maxAgeMs`, else read by `read`. `key` names
 * the copy when the URL carries a moment that changes at every call (a « since » to the second).
 */
export async function cachedRead(url: string, maxAgeMs: number, read: (url: string) => Promise<string>, accept: (text: string) => boolean = () => true, key: string = url): Promise<string> {
  const kept = await get(key);
  if (kept && Date.now() - kept.at < maxAgeMs) return kept.text;
  try {
    const text = await read(url);
    // an answer that does not read (a 200 with a header and no data) is never kept
    if (accept(text)) void put(key, text);
    return text;
  } catch (err) {
    if (kept) { console.warn('[MnemoClima] read failed, the copy of', new Date(kept.at).toISOString(), 'is served', err); return kept.text; }
    throw err;
  }
}
