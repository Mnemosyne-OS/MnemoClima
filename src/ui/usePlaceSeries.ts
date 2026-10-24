/**
 * usePlaceSeries — the NASA POWER series of each point that needs one (a declared place, a shown
 * marker), read once per point and kept on the machine (readCache.ts, 7 days). A point nobody
 * shows is never read.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parsePower, powerUrl, type PlaceSeries } from '../data/power';
import { errText, readDirect } from './host';
import { DAY, cachedRead } from './readCache';
import type { Loadable } from './useClimate';

export interface Point { id: string; lat: number; lon: number }

const keyOf = (p: Point) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;

export function usePlaceSeries(points: Point[]): { series: Record<string, Loadable<PlaceSeries>>; retry: () => void } {
  const [byKey, setByKey] = useState<Record<string, Loadable<PlaceSeries>>>({});
  // asks again for the points whose read failed (a failed read is no longer marked asked)
  const [tick, setTick] = useState(0);
  const asked = useRef(new Set<string>());
  const wanted = points.map(keyOf).join('|');
  // Unmount only: a read started for a point stays wanted when the list of points changes,
  // or it would be marked asked and never land (a point stuck on « reading »).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    // Measured 11/10: asking up to the year under way answers 200 (its future months are -999,
    // read as missing). A 422 for a year POWER refuses is asked once more up to the year before.
    const endYear = new Date().getUTCFullYear();
    for (const p of points) {
      const k = keyOf(p);
      if (asked.current.has(k)) continue;
      asked.current.add(k);
      setByKey((m) => ({ ...m, [k]: { status: 'loading' } }));
      const read = () => readDirect(powerUrl(p.lat, p.lon, endYear))
        .catch((err) => {
          if (/HTTP_422/.test(errText(err))) return readDirect(powerUrl(p.lat, p.lon, endYear - 1));
          throw err;
        });
      const readable = (t: string) => { try { return parsePower(JSON.parse(t)) !== null; } catch (err) { console.warn('[MnemoClima] POWER answer not kept', err); return false; } };
      cachedRead(powerUrl(p.lat, p.lon, endYear), 7 * DAY, read, readable, `power:${k}:${endYear}`)
        .then((text) => {
          const s = parsePower(JSON.parse(text));
          if (!s) throw new Error('UNREADABLE');
          if (mounted.current) setByKey((m) => ({ ...m, [k]: { status: 'ok', data: s, at: new Date().toISOString(), dropped: 0 } }));
        })
        .catch((err) => {
          console.warn('[MnemoClima] POWER not read', err);
          // a failed read is asked again the next time the point is shown
          asked.current.delete(k);
          if (mounted.current) setByKey((m) => ({ ...m, [k]: { status: 'error', error: errText(err), at: new Date().toISOString() } }));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, tick]);

  // stable between renders that change nothing here: the timeline's lanes are memoised on it,
  // and a fresh object each render recomputed 45 years of normals at every drag frame
  const series = useMemo(() => {
    const out: Record<string, Loadable<PlaceSeries>> = {};
    for (const p of points) out[p.id] = byKey[keyOf(p)] ?? { status: 'loading' };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byKey, wanted, points.map((p) => p.id).join('|')]);
  const retry = useCallback(() => setTick((n) => n + 1), []);
  return { series, retry };
}
