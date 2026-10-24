/**
 * readCache — a fresh copy asks nothing, an old one is read again, a failed re-read serves the old
 * copy, and an answer that does not read is never kept. A minimal in-memory IndexedDB stands in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUR, cachedRead } from './readCache';

function fakeIdb(): { rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  const later = (fn: () => void) => setTimeout(fn, 0);
  const db = {
    close: () => {},
    transaction: () => {
      const tx: { oncomplete?: () => void; onerror?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          get: (key: string) => { const req: { result?: unknown; onsuccess?: () => void } = {}; later(() => { req.result = rows.get(key); req.onsuccess?.(); }); return req; },
          put: (value: unknown, key: string) => { rows.set(key, value); later(() => tx.oncomplete?.()); },
        }),
      };
      return tx;
    },
  };
  vi.stubGlobal('indexedDB', {
    open: () => { const req: { result?: unknown; onsuccess?: () => void } = {}; later(() => { req.result = db; req.onsuccess?.(); }); return req; },
  });
  return { rows };
}

const flush = () => new Promise((r) => setTimeout(r, 5));

describe('cachedRead', () => {
  let store: { rows: Map<string, unknown> };
  beforeEach(() => { store = fakeIdb(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('a fresh copy asks nothing', async () => {
    const read = vi.fn(async () => 'oni');
    expect(await cachedRead('u', HOUR, read)).toBe('oni');
    await flush();
    expect(await cachedRead('u', HOUR, read)).toBe('oni');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('an old copy is read again', async () => {
    store.rows.set('u', { at: Date.now() - 2 * HOUR, text: 'old' });
    const read = vi.fn(async () => 'new');
    expect(await cachedRead('u', HOUR, read)).toBe('new');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a failed re-read serves the old copy', async () => {
    store.rows.set('u', { at: Date.now() - 2 * HOUR, text: 'old' });
    expect(await cachedRead('u', HOUR, async () => { throw new Error('HTTP_429'); })).toBe('old');
  });

  it('with no copy, the failure is the caller\'s', async () => {
    await expect(cachedRead('u', HOUR, async () => { throw new Error('HTTP_404'); })).rejects.toThrow('HTTP_404');
  });

  it('an answer that does not read is never kept', async () => {
    const read = vi.fn(async () => 'header only');
    await cachedRead('u', HOUR, read, (t) => t.includes('rows'));
    await flush();
    expect(store.rows.has('u')).toBe(false);
    await cachedRead('u', HOUR, read, (t) => t.includes('rows'));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a key names the copy when the URL carries the time of the call', async () => {
    const read = vi.fn(async () => 'quakes');
    await cachedRead('u?since=12:00:01', HOUR, read, () => true, 'usgs:day');
    await flush();
    expect(await cachedRead('u?since=12:00:09', HOUR, read, () => true, 'usgs:day')).toBe('quakes');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
