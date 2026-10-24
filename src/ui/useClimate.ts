/**
 * useClimate — every source MnemoClima reads on opening, each with its own three states
 * (rule 11): reading, could not read (with why), read (with when). A source that fails never
 * hides the others, and never reads as "nothing" (doc 147 §2).
 */
import { useCallback, useEffect, useState } from 'react';
import { CPC_DISCUSSION_URL, parseDiscussion, type Discussion } from '../data/cpc';
import { EONET_URL, GDACS_URL, byTime, parseEonet, parseUsgs, readGdacsPages, usgsUrl, type Hazard } from '../data/hazards';
import { GISTEMP_URL, IOD_URL, PDO_URL, parseGistemp, parsePslTable } from '../data/indices';
import type { MonthValue } from '../data/months';
import { ONI_URL, parseOni, type OniRow } from '../data/oni';
import { parseSst, sstUrl, type SstGrid } from '../data/sst';
import { errText, readDirect, readViaHost } from './host';
import { HOUR, cachedRead, isJson, today } from './readCache';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string; at?: string }
  | { status: 'ok'; data: T; at: string; dropped: number };

/** One source, read once and again on `reload`. */
export function useLoad<T>(load: () => Promise<{ data: T; dropped?: number }>, enabled = true): [Loadable<T>, () => void] {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState({ status: 'loading' });
    load()
      .then((r) => { if (alive) setState({ status: 'ok', data: r.data, at: new Date().toISOString(), dropped: r.dropped ?? 0 }); })
      .catch((err) => {
        console.warn('[MnemoClima] source not read', err);
        if (alive) setState({ status: 'error', error: errText(err), at: new Date().toISOString() });
      });
    return () => { alive = false; };
    // `load` is a stable module-level function per call site; `tick` asks again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, enabled]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return [state, reload];
}

const loadOni = async () => {
  const { rows, dropped } = parseOni(await cachedRead(ONI_URL, 12 * HOUR, readViaHost));
  if (rows.length === 0) throw new Error('EMPTY');
  return { data: rows, dropped };
};
const loadCpc = async () => ({ data: parseDiscussion(await cachedRead(CPC_DISCUSSION_URL, 6 * HOUR, readViaHost)) });
const loadTable = (url: string) => async () => {
  const data = parsePslTable(await cachedRead(url, 24 * HOUR, readViaHost));
  if (data.length === 0) throw new Error('EMPTY');
  return { data };
};
const loadPdo = loadTable(PDO_URL);
const loadIod = loadTable(IOD_URL);
const loadGlobal = async () => {
  const data = parseGistemp(await cachedRead(GISTEMP_URL, 24 * HOUR, readViaHost));
  if (data.length === 0) throw new Error('EMPTY');
  return { data };
};
const loadSst = async () => {
  const grid = parseSst(JSON.parse(await cachedRead(sstUrl(), 6 * HOUR, readViaHost, (t) => t.includes('"rows"'))));
  if (!grid) throw new Error('UNREADABLE');
  return { data: grid };
};
/** The present: GDACS alerts (orange and red), EONET's open events, USGS M6+ of the last 60 days. */
const loadHazards = async () => {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const parts = await Promise.allSettled([
    readGdacsPages((u) => cachedRead(u, HOUR / 2, (x) => readDirect(x)), GDACS_URL),
    cachedRead(EONET_URL, HOUR / 2, (x) => readDirect(x)).then((t) => parseEonet(JSON.parse(t))),
    cachedRead(usgsUrl(since), HOUR / 2, (x) => readDirect(x), isJson, `usgs-live:${today()}`).then((t) => parseUsgs(JSON.parse(t))),
  ]);
  const names = ['GDACS', 'EONET', 'USGS'];
  const items: Hazard[] = [];
  let dropped = 0;
  const failed: string[] = [];
  parts.forEach((p, i) => {
    if (p.status === 'fulfilled') { items.push(...p.value.items); dropped += p.value.dropped; }
    else failed.push(`${names[i]}: ${errText(p.reason)}`);
  });
  if (failed.length === parts.length) throw new Error(failed.join(' · '));
  return { data: { items: byTime(items), failed }, dropped };
};

export interface Climate {
  oni: Loadable<OniRow[]>;
  cpc: Loadable<Discussion>;
  pdo: Loadable<MonthValue[]>;
  iod: Loadable<MonthValue[]>;
  global: Loadable<MonthValue[]>;
  sst: Loadable<SstGrid>;
  hazards: Loadable<{ items: Hazard[]; failed: string[] }>;
  reload: Record<'oni' | 'cpc' | 'pdo' | 'iod' | 'global' | 'sst' | 'hazards', () => void>;
}

/** What this window needs: a map window never reads the slow indices, a timeline never the hazards. */
export interface Needs { indices: boolean; sst: boolean; hazards: boolean }

export function useClimate(needs: Needs): Climate {
  const [oni, rOni] = useLoad(loadOni);
  const [cpc, rCpc] = useLoad(loadCpc);
  const [pdo, rPdo] = useLoad(loadPdo, needs.indices);
  const [iod, rIod] = useLoad(loadIod, needs.indices);
  const [global, rGlobal] = useLoad(loadGlobal, needs.indices);
  const [sst, rSst] = useLoad(loadSst, needs.sst);
  const [hazards, rHaz] = useLoad(loadHazards, needs.hazards);
  return { oni, cpc, pdo, iod, global, sst, hazards, reload: { oni: rOni, cpc: rCpc, pdo: rPdo, iod: rIod, global: rGlobal, sst: rSst, hazards: rHaz } };
}

export const okData = <T,>(l: Loadable<T>): T | null => (l.status === 'ok' ? l.data : null);
