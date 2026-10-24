/**
 * useMonthLand — the continents' month under the cursor (landTemp.ts). A decade is read once,
 * when the cursor first rests in it, and kept on the machine (readCache.ts): the next 119 months
 * of it draw at once, and the next opening asks nothing. A decade whose read failed waits
 * RETRY_AFTER_MS before it is asked again, or « Read again ».
 */
import { useEffect, useRef, useState } from 'react';
import { decadeOf, landDecadeUrl, landGrid, parseLandAsc, type LandDecade } from '../data/landTemp';
import type { SstGrid } from '../data/sst';
import { errText, readViaHost } from './host';
import { HOUR, cachedRead } from './readCache';
import { DEBOUNCE_MS } from './useMonthSst';

/** How long a failed decade waits before it is asked again on its own. */
export const RETRY_AFTER_MS = 10 * 60_000;

export interface MonthLand { grid: SstGrid | null; loading: boolean; error: string | null; retry: () => void }

export function useMonthLand(cursor: { y: number; m: number }, last: { y: number; m: number } | null, enabled: boolean): MonthLand {
  const decades = useRef(new Map<number, LandDecade>());
  // a decade whose read failed is not asked again at every month crossed: only after this pause,
  // or on « Read again » (Tony, 11/10: « why do you query NOAA all the time? »)
  const failedAt = useRef(new Map<number, { at: number; error: string }>());
  const [grid, setGrid] = useState<SstGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const decade = decadeOf(cursor.y);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const kept = decades.current.get(decade);
    if (kept) { setGrid(landGrid(cursor.y, cursor.m, kept)); setLoading(false); return; }
    const failed = failedAt.current.get(decade);
    if (failed && Date.now() - failed.at < RETRY_AFTER_MS) { setGrid(null); setError(failed.error); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const url = landDecadeUrl(decade, last);
      // a decade that is over does not change: kept 30 days; the one under way, 12 hours
      const maxAge = decade + 10 <= new Date().getUTCFullYear() ? 30 * 24 * HOUR : 12 * HOUR;
      cachedRead(url, maxAge, readViaHost, (t) => { try { parseLandAsc(t); return true; } catch (err) { console.warn('[MnemoClima] continents answer not kept', err); return false; } })
        .then((text) => {
          const d = parseLandAsc(text);
          decades.current.set(decade, d);
          failedAt.current.delete(decade);
          if (alive) { setGrid(landGrid(cursor.y, cursor.m, d)); setError(null); }
        })
        .catch((err) => {
          console.warn('[MnemoClima] continents not read', err);
          failedAt.current.set(decade, { at: Date.now(), error: errText(err) });
          if (alive) { setGrid(null); setError(errText(err)); }
        })
        .finally(() => { if (alive) setLoading(false); });
    }, DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.y, cursor.m, decade, enabled, tick, last?.y, last?.m]);

  return { grid, loading, error, retry: () => { failedAt.current.delete(decade); setTick((n) => n + 1); } };
}
