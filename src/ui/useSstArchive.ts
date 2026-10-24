/**
 * useSstArchive — the ocean's heat for every month since 1950, downloaded once on a gesture and
 * kept on the machine (sstArchive.ts). Once a month is in it, moving the timeline reads nothing
 * from the network: the map draws it at once.
 *
 * Kept in this window's IndexedDB: a cache, not the memory. If the browser storage is cleared
 * (or the cartridge's origin changes), the button offers the download again; nothing breaks.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ARCHIVE_FIRST_YEAR, ersstYearUrl, loadAll, pack, parseErsstAsc, saveYear } from '../data/sstArchive';
import { monthKey } from '../data/months';
import { errText, readViaHost } from './host';

export type ArchiveState =
  | { phase: 'reading' }
  | { phase: 'idle'; months: number; firstYear: number | null; lastYear: number | null; storeError: string | null }
  | { phase: 'downloading'; done: number; total: number; year: number; failed: number[] }
  | { phase: 'stopped' | 'finished'; done: number; total: number; failed: number[] }
  | { phase: 'failed'; error: string };

export interface SstArchive {
  state: ArchiveState;
  /** The packed month, when it is in the archive (synchronous: no wait, no network). */
  month: (y: number, m: number) => Int8Array | undefined;
  /** How many months are in the archive, and its version (changes as years arrive). */
  count: number;
  version: number;
  download: (last: { y: number; m: number }) => void;
  stop: () => void;
}

export function useSstArchive(enabled: boolean): SstArchive {
  const months = useRef(new Map<number, Int8Array>());
  const [state, setState] = useState<ArchiveState>({ phase: 'reading' });
  const [version, setVersion] = useState(0);
  const stopRef = useRef(false);
  const busy = useRef(false);

  const describe = (storeError: string | null): ArchiveState => {
    const keys = [...months.current.keys()];
    return {
      phase: 'idle', months: keys.length, storeError,
      firstYear: keys.length ? Math.floor(Math.min(...keys) / 100) : null,
      lastYear: keys.length ? Math.floor(Math.max(...keys) / 100) : null,
    };
  };

  // what this machine already kept
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadAll()
      .then((r) => {
        if (!alive) return;
        for (const [k, v] of r.months) months.current.set(k, v);
        setVersion((n) => n + 1);
        setState(describe(r.dropped ? `${r.dropped} unreadable year(s) left out` : null));
      })
      .catch((err) => { console.warn('[MnemoClima] archive not read', err); if (alive) setState(describe(errText(err))); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const download = useCallback((last: { y: number; m: number }) => {
    if (busy.current) return;
    busy.current = true;
    stopRef.current = false;
    // every year that is not whole yet; the year under way is asked again (it gains months)
    const years: number[] = [];
    for (let y = ARCHIVE_FIRST_YEAR; y <= last.y; y++) {
      const want = y === last.y ? last.m : 12;
      let have = 0;
      for (let m = 1; m <= want; m++) if (months.current.has(monthKey(y, m))) have++;
      if (have < want) years.push(y);
    }
    const failed: number[] = [];
    void (async () => {
      let done = 0;
      for (const y of years) {
        if (stopRef.current) break;
        setState({ phase: 'downloading', done, total: years.length, year: y, failed: [...failed] });
        try {
          const year = parseErsstAsc(await readViaHost(ersstYearUrl(y, y === last.y ? last.m : 12)));
          const packed = year.values.map(pack);
          year.months.forEach((mm, i) => months.current.set(monthKey(mm.y, mm.m), packed[i]!));
          setVersion((n) => n + 1);
          await saveYear({ year: y, months: year.months, data: packed }).catch((err) => {
            // the year is in memory for this session; only the keeping failed, and it is said
            console.warn('[MnemoClima] year not kept on the machine', y, err);
          });
        } catch (err) {
          console.warn('[MnemoClima] year not downloaded', y, err);
          failed.push(y);
        }
        done++;
      }
      busy.current = false;
      setState({ phase: stopRef.current ? 'stopped' : 'finished', done, total: years.length, failed });
    })().catch((err) => { busy.current = false; setState({ phase: 'failed', error: errText(err) }); });
  }, []);

  const stop = useCallback(() => { stopRef.current = true; }, []);
  const month = useCallback((y: number, m: number) => months.current.get(monthKey(y, m)), []);

  return { state, month, count: months.current.size, version, download, stop };
}
