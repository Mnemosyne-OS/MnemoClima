/**
 * useMonthSst — the ocean's heat for the month under the timeline's cursor (ERSST v5).
 *
 * Tony, 11/10: « when I move the timeline the map's colours change nothing? ». The map now shows
 * the month the cursor stands on. A drag crosses a month every few pixels, so a month is asked
 * only once the cursor has rested on it (DEBOUNCE_MS), each month is kept for the session (a
 * small cache, oldest out), and while the next one comes the previous grid stays on screen with
 * its OWN month written in the legend: a grid never wears a month it is not.
 *
 * A month ERSST does not have yet (after its last) is not asked: the map shows the latest daily
 * grid (OISST) instead, and says its day.
 */
import { useEffect, useRef, useState } from 'react';
import { ERSST_FIRST, ersstUrl, parseSst, type SstGrid } from '../data/sst';
import { toGrid } from '../data/sstArchive';
import { monthKey } from '../data/months';
import { errText, readViaHost } from './host';
import { DAY, HOUR, cachedRead } from './readCache';

export const DEBOUNCE_MS = 280;
const CACHE_MAX = 48;

export interface MonthSst {
  /** The grid on screen, with the month it IS (may lag the cursor while the next one loads). */
  grid: SstGrid | null;
  /** The month the cursor asks for. */
  wanted: { y: number; m: number } | null;
  loading: boolean;
  error: string | null;
  /** The cursor is past ERSST's last month: the caller shows the latest daily grid. */
  beyond: boolean;
  retry: () => void;
}

/** The month a grid is, read from its own day ("1997-12-15" → 1997, 12). */
export const monthOfGrid = (g: SstGrid): { y: number; m: number } => ({ y: Number(g.day.slice(0, 4)), m: Number(g.day.slice(5, 7)) });

/**
 * `fromArchive` answers a month kept on the machine (useSstArchive): such a month is drawn at once,
 * with no wait and no network. `archiveVersion` changes as years arrive.
 */
export function useMonthSst(cursor: { y: number; m: number } | null, last: { y: number; m: number } | null, enabled: boolean,
  fromArchive?: (y: number, m: number) => Int8Array | undefined, archiveVersion = 0): MonthSst {
  const cache = useRef(new Map<number, SstGrid>());
  const [grid, setGrid] = useState<SstGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // asks again for the month whose read failed
  const [tick, setTick] = useState(0);

  const key = cursor ? monthKey(cursor.y, cursor.m) : null;
  const beyond = !!cursor && !!last && monthKey(cursor.y, cursor.m) > monthKey(last.y, last.m);
  const before = !!cursor && monthKey(cursor.y, cursor.m) < monthKey(ERSST_FIRST.y, ERSST_FIRST.m);

  useEffect(() => {
    if (!enabled || !cursor || key == null || beyond || before) { setLoading(false); return; }
    const hit = cache.current.get(key);
    if (hit) { setGrid(hit); setLoading(false); setError(null); return; }
    const kept = fromArchive?.(cursor.y, cursor.m);
    if (kept) {
      const g = toGrid(cursor.y, cursor.m, kept);
      cache.current.set(key, g);
      if (cache.current.size > CACHE_MAX) cache.current.delete(cache.current.keys().next().value!);
      setGrid(g); setLoading(false); setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      // a month more than four months old is final at NOAA: kept a year; a recent one, 12 hours
      const age = (new Date().getUTCFullYear() - cursor.y) * 12 + (new Date().getUTCMonth() + 1 - cursor.m);
      cachedRead(ersstUrl(cursor.y, cursor.m), age > 4 ? 365 * DAY : 12 * HOUR, readViaHost, (t) => t.includes('"rows"'))
        .then((text) => {
          const g = parseSst(JSON.parse(text), 2);
          if (!g) throw new Error('UNREADABLE');
          const got = monthOfGrid(g);
          // the server answers the NEAREST month it has: one that is not the month asked is refused
          if (got.y !== cursor.y || got.m !== cursor.m) throw new Error(`MONTH_${got.y}-${got.m}`);
          const month: SstGrid = { ...g, monthly: true };
          cache.current.set(key, month);
          if (cache.current.size > CACHE_MAX) cache.current.delete(cache.current.keys().next().value!);
          if (alive) { setGrid(month); setError(null); }
        })
        .catch((err) => { console.warn('[MnemoClima] month of ocean heat not read', err); if (alive) setError(errText(err)); })
        .finally(() => { if (alive) setLoading(false); });
    }, DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, beyond, before, enabled, tick, archiveVersion]);

  return { grid, wanted: cursor, loading, error, beyond, retry: () => setTick((n) => n + 1) };
}
