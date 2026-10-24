/**
 * MnemoClima — the world's climate on a map and a timeline you can move (doc 147).
 *
 * Reads NOAA, NASA and the open alert networks; computes nothing about the future except what
 * the PAST did at a place the person declared. One window holds everything; the exploded view
 * puts the map, the timeline and the panel in three windows that share the moment (board.ts,
 * link.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onHostConfig } from '@mnemosyne_os/cartridge-sdk';
import { readTheme, type Theme } from '@mnemosyne_os/timeline-map/theme';
import { useI18n } from './i18n/useI18n';
import { dayName, fmt, monthName, type Key } from './i18n/strings';
import { normals } from './data/analogs';
import { ensoCard } from './data/card';
import { cpcChronicle, numbersFiles, oniChronicles, placeChronicles, type Chronicle } from './data/chronicle';
import { CPC_DISCUSSION_URL } from './data/cpc';
import { fewsUrl, parseFews, type IpcRow } from './data/fewsnet';
import { gdacsHistoryUrl, monthlyCounts, parseUsgs, readGdacsPages, usgsUrl, type Hazard, type HazardKind } from './data/hazards';
import { IBTRACS_BASE, IBTRACS_FILES, parseIbtracs, type Track } from './data/ibtracs';
import { BUILT_IN_MARKERS, MAX_USER_MARKERS, type Marker, type Role as MarkerRole } from './data/markers';
import { addMonths, monthAt, monthKey, monthKeyOfIso, touchesMonths, type MonthValue } from './data/months';
import { episodesOf, latestOni } from './data/oni';
import { ersstLastUrl, type SstGrid } from './data/sst';
import { REGIONS, parseRegion, regionUrl, type RegionSeries } from './data/continents';
import { MAX_PLACES, type Place } from './data/place';
import { climaRange, openingView, type Lane } from './engine/curves';
import { BIG_FETCH_TIMEOUT_MS, HOST_TIMEOUT_MS, errText, inShell, readDirect, readViaHost, refreshPermissions, sdk } from './ui/host';
import { roleOf, useBoard } from './ui/board';
import { openLink, type Link, type LinkMessage } from './ui/link';
import MapView, { type MapPick } from './ui/MapView';
import TimelineHost from './ui/TimelineHost';
import { LayersMenu, MapLegend, type LayerRow, type LegendLine } from './ui/MapChrome';
import { Pill } from './ui/Controls';
import { useSstArchive, type SstArchive } from './ui/useSstArchive';
import { useMonthLand } from './ui/useMonthLand';
import { DAY, HOUR, cachedRead, isJson, today } from './ui/readCache';
import { AveragesPanel, HazardsPanel, MarkersPanel, MemoryPanel, PacificPanel, PlacesPanel, type HistoryItem, type PourOption, type ShareState } from './ui/Panels';
import { useSettings, type Layer } from './ui/store';
import { okData, useClimate, useLoad, type Loadable } from './ui/useClimate';
import { useMonthSst } from './ui/useMonthSst';
import { usePlaceSeries } from './ui/usePlaceSeries';
import { useKeyed } from './ui/useKeyed';
import { usePour } from './ui/usePour';
import { useWatch } from './ui/useWatch';
import { useEnsoCard } from './ui/useEnsoCard';
import { ClimaAgentActions } from './ui/ClimaAgentActions';
import './styles.css';

type Tab = 'pacific' | 'averages' | 'place' | 'markers' | 'hazards' | 'memory';
const TABS: { id: Tab; icon: string; key: Key }[] = [
  { id: 'pacific', icon: '🌊', key: 'tab.pacific' },
  { id: 'averages', icon: '🌡', key: 'tab.averages' },
  { id: 'place', icon: '📍', key: 'tab.place' },
  { id: 'markers', icon: '🚩', key: 'tab.markers' },
  { id: 'hazards', icon: '⚠️', key: 'tab.hazards' },
  { id: 'memory', icon: '🧠', key: 'tab.memory' },
];

/** A series as a % of its own 1991-2020 normal, month by month: the unit a rain lane is drawn in. */
function asPctOfNormal(series: MonthValue[]): MonthValue[] {
  const n = normals(series);
  return series.map((p) => ({ y: p.y, m: p.m, v: p.v == null || !n[p.m] ? null : (p.v / n[p.m]!) * 100 }));
}

/** Months each side of the cursor whose disasters the map shows. */
const HAZARD_WINDOW = 1;

/** ERSST's last published month, read once (a one-cell request; its time is read even if the cell is land). */
async function loadErsstLast() {
  const raw = JSON.parse(await cachedRead(ersstLastUrl(), 12 * HOUR, readViaHost, (t) => t.includes('"rows"'))) as { table?: { rows?: unknown[][] } };
  const day = raw.table?.rows?.[0]?.[0];
  if (typeof day !== 'string' || !/^\d{4}-\d{2}/.test(day)) throw new Error('UNREADABLE');
  return { data: { y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)) } };
}

/** The world and the six continents, each read on its own: one that fails never hides the others. */
async function loadRegions() {
  const to = new Date().getUTCFullYear();
  const parts = await Promise.allSettled(REGIONS.map((r) => cachedRead(regionUrl(r.path, 1950, to), 12 * HOUR, (u) => readDirect(u), (t) => t.includes('Departure')).then(parseRegion)));
  const out: Record<string, RegionSeries | { error: string }> = {};
  parts.forEach((part, i) => {
    out[REGIONS[i]!.id] = part.status === 'fulfilled' ? part.value : { error: errText(part.reason) };
  });
  if (parts.every((x) => x.status === 'rejected')) throw new Error((parts[0] as PromiseRejectedResult).reason instanceof Error ? ((parts[0] as PromiseRejectedResult).reason as Error).message : 'UNREADABLE');
  return { data: out };
}

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function App() {
  const { t, lang } = useI18n();
  const role = useMemo(() => roleOf(window.location.search), []);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  useEffect(() => onHostConfig(() => setTheme(readTheme())), []);

  const { settings, update: updateHere, adopt, commit: commitHere, ready: settingsReady } = useSettings();
  const adoptRef = useRef(adopt);
  adoptRef.current = adopt;
  const climate = useClimate({ indices: role !== 'map', sst: role !== 'timeline', hazards: role !== 'timeline' });
  const oni = okData(climate.oni);
  const cpc = okData(climate.cpc);

  const [tab, setTab] = useState<Tab>('pacific');
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [picking, setPicking] = useState<null | 'place' | 'marker'>(null);
  const [pending, setPending] = useState<null | { lat: number; lon: number; purpose: 'place' | 'marker' }>(null);
  const [globe, setGlobe] = useState(false);
  const [hazardKind, setHazardKind] = useState<HazardKind | 'all'>('all');

  // ── the shared moment (board windows) ──
  // The cursor's MONTH is all App holds of the timeline: the view itself lives in TimelineHost,
  // so a drag redraws the timeline alone and App renders once per month crossed.
  const [cursorMonth, setCursorMonth] = useState(() => { const v = openingView(); return monthAt((v.y0 + v.y1) / 2); });
  const onMonth = useCallback((y: number, m: number) => setCursorMonth((c) => (c.y === y && c.m === m ? c : { y, m })), []);
  const [jump, setJump] = useState<{ t: number; n: number; span?: number; factor?: number } | null>(null);
  const linkRef = useRef<Link | null>(null);
  /** The timeline glides to `t` here (a jump from another board window, or from an agent); a frame zooms it. */
  const jumpHere = (t: number, frame?: { span?: number; factor?: number }) => { setJump((j) => ({ t, n: (j?.n ?? 0) + 1, span: frame?.span, factor: frame?.factor })); const mm = monthAt(t); setCursorMonth((c) => (c.y === mm.y && c.m === mm.m ? c : mm)); };
  useEffect(() => {
    const link = openLink((m: LinkMessage) => {
      if (m.kind === 'cursor') jumpHere(m.t, m);
      if (m.kind === 'place') setSelectedPlace(m.id);
      if (m.kind === 'pick') { setPicking(m.on ? m.purpose : null); if (m.on) setGlobe(false); }
      if (m.kind === 'picked') { setPicking(null); setPending({ lat: m.lat, lon: m.lon, purpose: m.purpose }); }
      if (m.kind === 'settings') adoptRef.current(m.settings);
      if (m.kind === 'globe') setGlobe(m.on);
      if (m.kind === 'hazardKind') setHazardKind(m.value as HazardKind | 'all');
    });
    linkRef.current = link;
    return () => { link.close(); linkRef.current = null; };
  }, []);
  // every change of the settings reaches the other board windows (a place put from the panel
  // shows on the map window)
  const update = useCallback((fn: Parameters<typeof updateHere>[0]) => {
    const next = updateHere(fn);
    linkRef.current?.send({ kind: 'settings', settings: next });
  }, [updateHere]);
  const onCursor = useCallback((t: number) => linkRef.current?.send({ kind: 'cursor', t }), []);
  // The timeline opens on THIS month (verification 11/10, F1): opening on the latest ONI month
  // (two months behind) kept the map on August and hid every alert of October that the
  // Disasters tab listed. The ONI lane then reads « — » at the cursor, which is true.

  const chooseHazardKind = useCallback((k: HazardKind | 'all') => {
    setHazardKind(k);
    linkRef.current?.send({ kind: 'hazardKind', value: k });
  }, []);
  const selectPlace = useCallback((id: string | null) => {
    setSelectedPlace(id);
    linkRef.current?.send({ kind: 'place', id });
  }, []);
  useEffect(() => {
    if (selectedPlace == null && settings.places[0]) setSelectedPlace(settings.places[0].id);
  }, [settings.places, selectedPlace]);

  const startPick = (purpose: 'place' | 'marker') => {
    setPending(null);
    // a point is put on the flat map, where one click is one place (the globe ignores it)
    setGlobe(false);
    setPicking(purpose);
    linkRef.current?.send({ kind: 'pick', on: true, purpose });
  };
  const cancelPick = () => {
    setPicking(null);
    setPending(null);
    linkRef.current?.send({ kind: 'pick', on: false, purpose: 'place' });
  };
  const onPoint = (lat: number, lon: number) => {
    const purpose = picking ?? 'place';
    setPicking(null);
    setPending({ lat, lon, purpose });
    linkRef.current?.send({ kind: 'picked', lat, lon, purpose });
    setTab(purpose === 'place' ? 'place' : 'markers');
  };

  // ── markers and the points that need NASA POWER ──
  const markers = useMemo<Marker[]>(() => [...BUILT_IN_MARKERS, ...settings.userMarkers], [settings.userMarkers]);
  const activeMarkers = useMemo(() => markers.filter((m) => settings.activeMarkers.includes(m.id)), [markers, settings.activeMarkers]);
  const markerName = useCallback((m: Marker) => (m.nameKey ? t(m.nameKey as Key) : m.name ?? m.id), [t]);
  const place = settings.places.find((p) => p.id === selectedPlace) ?? null;
  const points = useMemo(() => [
    ...(place ? [{ id: place.id, lat: place.lat, lon: place.lon }] : []),
    ...activeMarkers.map((m) => ({ id: m.id, lat: m.lat, lon: m.lon })),
  ], [place, activeMarkers]);
  const { series: placeSeries, retry: retrySeries } = usePlaceSeries(points);

  // FEWS NET for the shown markers that are in its coverage
  const fewsKeys = useMemo(() => activeMarkers.filter((m) => m.fews).map((m) => m.id), [activeMarkers]);
  const fewsLoad = useCallback(async (id: string): Promise<IpcRow[]> => {
    const m = markers.find((x) => x.id === id);
    if (!m?.fews) return [];
    const since = new Date(Date.now() - 400 * 86_400_000).toISOString();
    return parseFews(JSON.parse(await cachedRead(fewsUrl(m.fews, since), DAY, readViaHost, isJson, `fews:${m.fews}:${today()}`))).rows;
  }, [markers]);
  const { byKey: ipc } = useKeyed(fewsKeys, fewsLoad);

  // ── history of disasters, on a gesture ──
  const [historyWanted, setHistoryWanted] = useState<string[]>([]);
  const historyLoad = useCallback(async (id: string): Promise<{ hazards: Hazard[]; tracks: Track[] }> => {
    if (id === 'tracks') {
      // IBTrACS publishes once a week
      const { tracks } = parseIbtracs(await cachedRead(IBTRACS_BASE + IBTRACS_FILES.last3years, 7 * DAY, (u) => readDirect(u, BIG_FETCH_TIMEOUT_MS)));
      return { hazards: [], tracks };
    }
    if (id === 'quakes') {
      const { items } = parseUsgs(JSON.parse(await cachedRead(`${usgsUrl('1980-01-01', 6.5)}&limit=20000`, DAY, (u) => readDirect(u, BIG_FETCH_TIMEOUT_MS), isJson)));
      return { hazards: items, tracks: [] };
    }
    // the URL ends at « now »: each page is kept under the day it was read
    const { items } = await readGdacsPages((u) => cachedRead(u, DAY, (x) => readDirect(x, BIG_FETCH_TIMEOUT_MS), isJson, `gdacs-history:${today()}:p${/pagenumber=(\d+)/.exec(u)?.[1] ?? '1'}`), gdacsHistoryUrl('DR;FL', '2018-01-01', new Date().toISOString()));
    return { hazards: items, tracks: [] };
  }, []);
  const { byKey: history, retry: retryHistory } = useKeyed(historyWanted, historyLoad);
  const loadHistory = (id: HistoryItem['id']) => {
    if (historyWanted.includes(id)) retryHistory(id);
    else setHistoryWanted((w) => [...w, id]);
  };
  const historyItems: HistoryItem[] = (['tracks', 'quakes', 'droughts'] as const).map((id) => {
    const h = history[id];
    const state: Loadable<number> | null = !h ? null : h.status === 'ok'
      ? { status: 'ok', data: h.data.hazards.length + h.data.tracks.length, at: h.at, dropped: 0 }
      : h.status === 'error' ? { status: 'error', error: h.error } : { status: 'loading' };
    return { id, state };
  });

  const hazardsNow = okData(climate.hazards)?.items ?? [];
  const allHazards = useMemo(() => {
    const extra = Object.values(history).flatMap((h) => (h.status === 'ok' ? h.data.hazards : []));
    const seen = new Set<string>();
    return [...hazardsNow, ...extra].filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)));
  }, [hazardsNow, history]);
  const tracks = useMemo(() => Object.values(history).flatMap((h) => (h.status === 'ok' ? h.data.tracks : [])), [history]);
  // ── the map follows the timeline (Tony, 11/10): the cursor's month of ocean heat, and the
  // disasters of the months around it. The panel's list stays whole.
  const cursorY = cursorMonth.y, cursorM = cursorMonth.m;
  const [ersstLast, reloadErsstLast] = useLoad(loadErsstLast, role !== 'timeline');
  const [regions, reloadRegions] = useLoad(loadRegions);
  const ersstLastMonth = okData(ersstLast);
  // every month since 1950 kept on the machine, on a gesture (Tony, 11/10)
  const archive = useSstArchive(role !== 'timeline');
  const monthSst = useMonthSst(cursorMonth, ersstLastMonth, role !== 'timeline' && settings.layers.includes('sst') && ersstLast.status === 'ok', archive.month, archive.version);
  // past ERSST's last month, or when its last month could not be read: the latest daily grid
  const daily = monthSst.beyond || ersstLast.status === 'error';
  const mapSst: SstGrid | null = daily ? okData(climate.sst) : monthSst.grid;
  // the continents' month: NOAAGlobalTemp, a decade read at once (landTemp.ts)
  const land = useMonthLand(cursorMonth, ersstLastMonth, role !== 'timeline' && settings.layers.includes('land'));
  const windowKeys = useMemo(() => {
    const a = addMonths(cursorY, cursorM, -HAZARD_WINDOW), b = addMonths(cursorY, cursorM, HAZARD_WINDOW);
    return { a: monthKey(a.y, a.m), b: monthKey(b.y, b.m) };
  }, [cursorY, cursorM]);
  // an event shows while it lasts: from its start to its end (or its start alone)
  const mapHazards = useMemo(() => allHazards.filter((h) => (hazardKind === 'all' || h.kind === hazardKind) && touchesMonths(h.from, h.to, windowKeys.a, windowKeys.b)), [allHazards, hazardKind, windowKeys]);
  const mapTracks = useMemo(() => tracks.filter((tr) => tr.points.some((p) => { const k = monthKeyOfIso(p.t); return k >= windowKeys.a && k <= windowKeys.b; })), [tracks, windowKeys]);

  // ── the timeline's lanes ──
  const allLanes = useMemo<{ lane: Lane; group: string }[]>(() => {
    const out: { lane: Lane; group: string }[] = [];
    const gOcean = t('curves.ocean'), gWorld = t('curves.world'), gPlaces = t('curves.places');
    const deg = (v: number) => `${fmt(lang, v, 2, true)} °C`;
    if (oni) out.push({ group: gOcean, lane: { id: 'oni', label: t('tl.oni'), kind: 'oni', series: oni, scale: 3, format: deg } });
    const g = okData(climate.global);
    if (g) out.push({ group: gWorld, lane: { id: 'global', label: t('tl.global'), kind: 'anomaly', series: g.filter((p) => p.y >= 1900), scale: 1.6, format: deg } });
    const pdo = okData(climate.pdo);
    if (pdo) out.push({ group: gOcean, lane: { id: 'pdo', label: t('tl.pdo'), kind: 'anomaly', series: pdo, scale: 3.5, format: (v) => fmt(lang, v, 2, true) } });
    const iod = okData(climate.iod);
    if (iod) out.push({ group: gOcean, lane: { id: 'iod', label: t('tl.iod'), kind: 'anomaly', series: iod.filter((p) => p.y >= 1900), scale: 1.2, format: deg } });
    const pct = (v: number) => `${Math.round(v)} %`;
    const ps = place ? okData(placeSeries[place.id] ?? { status: 'loading' }) : null;
    if (place && ps) out.push({ group: gPlaces, lane: { id: `place:${place.id}`, label: t('tl.rain', { name: place.name }), kind: 'pct', series: asPctOfNormal(ps.rain), scale: 200, format: pct } });
    const rs = okData(regions);
    for (const r of REGIONS) {
      const s = rs?.[r.id];
      if (s && 'series' in s) out.push({ group: gWorld, lane: { id: `region:${r.id}`, label: t(r.key as Key), kind: 'anomaly', series: s.series, scale: 3, format: deg } });
    }
    // the disasters: how many started each month, among what was read (now, and the history loaded)
    const gHaz = t('curves.hazards');
    const quakes = monthlyCounts(allHazards, ['quake']);
    const weather = monthlyCounts(allHazards, ['cyclone', 'flood', 'drought', 'storm', 'fire']);
    const cnt = (v: number) => t('tl.count', { n: Math.round(v) });
    const top = (s: { v: number | null }[]) => Math.max(1, ...s.map((p) => p.v ?? 0));
    if (weather.length) out.push({ group: gHaz, lane: { id: 'haz:weather', label: t('tl.hazWeather'), kind: 'count', series: weather, scale: top(weather), format: cnt } });
    if (quakes.length) out.push({ group: gHaz, lane: { id: 'haz:quakes', label: t('tl.hazQuakes'), kind: 'count', series: quakes, scale: top(quakes), format: cnt } });
    for (const m of activeMarkers) {
      const s = okData(placeSeries[m.id] ?? { status: 'loading' });
      if (s) out.push({ group: gPlaces, lane: { id: `marker:${m.id}`, label: t('tl.markerRain', { name: markerName(m) }), kind: 'pct', series: asPctOfNormal(s.rain), scale: 200, format: pct } });
    }
    return out;
  }, [oni, climate.global, climate.pdo, climate.iod, place, placeSeries, activeMarkers, markerName, t, lang, regions, allHazards]);
  // a region is a curve the person asks for (regionLanes); every other curve is shown until turned off
  const laneOn = useCallback((id: string) => (id.startsWith('region:') ? settings.regionLanes.includes(id.slice(7)) : !settings.hiddenLanes.includes(id)), [settings.regionLanes, settings.hiddenLanes]);
  const lanes = useMemo(() => allLanes.filter((x) => laneOn(x.lane.id)).map((x) => x.lane), [allLanes, laneOn]);
  const laneChoices = useMemo(() => allLanes.map((x) => ({ id: x.lane.id, label: x.lane.label, group: x.group, on: laneOn(x.lane.id) })), [allLanes, laneOn]);
  const toggleLane = useCallback((id: string) => {
    if (id.startsWith('region:')) { const r = id.slice(7); update((s) => ({ ...s, regionLanes: s.regionLanes.includes(r) ? s.regionLanes.filter((x) => x !== r) : [...s.regionLanes, r] })); return; }
    update((s) => ({ ...s, hiddenLanes: s.hiddenLanes.includes(id) ? s.hiddenLanes.filter((x) => x !== id) : [...s.hiddenLanes, id] }));
  }, [update]);

  const episodes = useMemo(() => (oni ? episodesOf(oni) : []), [oni]);
  const cursorLabel = useCallback((tt: number) => { const { y, m } = monthAt(tt); return monthName(lang, y, m); }, [lang]);

  // ── settings edits ──
  const savePlace = (name: string) => {
    // the reader keeps the first MAX_PLACES: a 13th is refused here, never written to be dropped
    if (!pending || settings.places.length >= MAX_PLACES) return;
    const p: Place = { id: newId('p'), name, lat: pending.lat, lon: pending.lon };
    update((s) => ({ ...s, places: [...s.places, p] }));
    setPending(null);
    selectPlace(p.id);
  };
  const removePlace = (id: string) => {
    update((s) => ({ ...s, places: s.places.filter((p) => p.id !== id) }));
    // the next place is chosen here AND in the other board windows
    if (selectedPlace === id) selectPlace(settings.places.find((p) => p.id !== id)?.id ?? null);
  };
  const saveMarker = (name: string, mrole: MarkerRole, fews: string) => {
    if (!pending || settings.userMarkers.length >= MAX_USER_MARKERS) return;
    const m: Marker = { id: `user:${newId('')}`, name, role: mrole, lat: pending.lat, lon: pending.lon, radiusKm: 200, builtIn: false, ...(/^[A-Z]{2}$/.test(fews) ? { fews } : {}) };
    update((s) => ({ ...s, userMarkers: [...s.userMarkers, m], activeMarkers: [...s.activeMarkers, m.id] }));
    setPending(null);
  };
  const toggleMarker = (id: string) => update((s) => ({ ...s, activeMarkers: s.activeMarkers.includes(id) ? s.activeMarkers.filter((x) => x !== id) : [...s.activeMarkers, id] }));
  const removeMarker = (id: string) => update((s) => ({ ...s, userMarkers: s.userMarkers.filter((m) => m.id !== id), activeMarkers: s.activeMarkers.filter((x) => x !== id) }));
  const toggleLayer = (l: Layer) => update((s) => ({ ...s, layers: s.layers.includes(l) ? s.layers.filter((x) => x !== l) : [...s.layers, l] }));

  // ── memory ──
  const onPoured = useCallback((subject: string, keys: string[]) => {
    const today = new Date().toISOString().slice(0, 10);
    update((s) => ({ ...s, poured: [...s.poured, ...keys], pouredOn: { ...s.pouredOn, [subject]: today } }));
  }, [update]);
  const { state: pourState, pour, stop } = usePour(onPoured);
  const now = useMemo(() => { const d = new Date(); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; }, []);
  const chroniclesFor = (id: string): Chronicle[] => {
    const today = new Date().toISOString().slice(0, 10);
    if (id === 'oni' && oni) return oniChronicles(oni, lang, today, now);
    if (id === 'cpc' && cpc) { const c = cpcChronicle(cpc, CPC_DISCUSSION_URL, lang); return c ? [c] : []; }
    if (id === 'places') {
      return settings.places.flatMap((p) => {
        const s = okData(placeSeries[p.id] ?? { status: 'loading' });
        return s ? placeChronicles(p, s.rain, s.temp, lang, today, now) : [];
      });
    }
    // a shown marker is poured like a place: its rain and temperature month by month, named after it
    if (id === 'markers') {
      return activeMarkers.flatMap((m) => {
        const s = okData(placeSeries[m.id] ?? { status: 'loading' });
        return s ? placeChronicles({ id: `marker-${m.id}`, name: markerName(m), lat: m.lat, lon: m.lon }, s.rain, s.temp, lang, today, now) : [];
      });
    }
    return [];
  };
  const unreadMarkers = activeMarkers.filter((m) => placeSeries[m.id]?.status !== 'ok').length;
  /** The places whose measurements are not read: they cannot be poured or shared, and it is said. */
  const unreadPlaces = settings.places.filter((p) => placeSeries[p.id]?.status !== 'ok').length;
  const pourOptions: PourOption[] = [
    { id: 'oni', label: t('mem.pourOni'), count: oni ? oniChronicles(oni, lang, '2000-01-01', now).length : null, lastOn: settings.pouredOn.oni ?? null, ready: !!oni },
    { id: 'cpc', label: t('mem.pourCpc'), count: cpc?.issued ? 1 : null, lastOn: settings.pouredOn.cpc ?? null, ready: !!cpc?.issued },
    { id: 'places', label: t('mem.pourPlaces'), count: null, lastOn: settings.pouredOn.places ?? null, ready: settings.places.some((p) => placeSeries[p.id]?.status === 'ok') },
    { id: 'markers', label: t('mem.pourMarkers'), count: activeMarkers.length || null, lastOn: settings.pouredOn.markers ?? null, ready: activeMarkers.some((m) => placeSeries[m.id]?.status === 'ok') },
  ];
  const doPour = (id: string) => void pour(id, chroniclesFor(id), new Set(settings.poured), id === 'places' ? unreadPlaces : id === 'markers' ? unreadMarkers : 0);

  // the watch follows the person's switch
  const watchLabels = useMemo(() => ({ cpc: t('enso.cpc'), gdacs: t('hazard.title') }), [t]);
  const watch = useWatch(settings.watch, watchLabels);
  const setWatch = (on: boolean) => { void watch.apply(on).then((ok) => { if (ok) update((s) => ({ ...s, watch: on })); }); };

  // the card on the board
  const card = useMemo(() => (climate.cpc.status === 'loading' ? null : ensoCard(cpc, oni ? latestOni(oni) : null, {
    title: t('card.title'),
    status: (status, date) => t('card.status', { status, date: dayName(lang, date) }),
    unread: t('card.unread'),
    oni: (row) => t('card.oni', { value: fmt(lang, row.v!, 2, true), season: row.season, year: row.y }),
    source: 'NOAA CPC · MnemoClima',
  })), [climate.cpc.status, cpc, oni, t, lang]);
  // one window publishes the card: in the exploded view the map and the timeline stay quiet
  const ensoPin = useEnsoCard(role === 'main' || role === 'panel' ? card : null);

  // the numbers, shared with other apps in a folder the person picks
  const [share, setShare] = useState<ShareState>({ phase: 'idle' });
  const shareNumbers = async () => {
    if (!oni) return;
    setShare({ phase: 'choosing' });
    let n = 0;
    try {
      const granted = await refreshPermissions(['dialog:open']);
      if (granted['dialog:open'] === false) throw new Error('PERMISSION:dialog:open');
      // ⛔ no deadline on an OS dialog: the person may take minutes to choose (doc 119 §15)
      const folder = await sdk.invoke<string | null>('dialog.selectFolder', {}, 0);
      if (!folder) { setShare({ phase: 'idle' }); return; }
      const places = settings.places.flatMap((p) => {
        const s = okData(placeSeries[p.id] ?? { status: 'loading' });
        return s ? [{ place: p, rain: s.rain, temp: s.temp }] : [];
      });
      const files = numbersFiles(oni, places, new Date().toISOString().slice(0, 10));
      const sep = folder.includes('\\') ? '\\' : '/';
      setShare({ phase: 'writing', done: 0, total: files.length, skipped: unreadPlaces });
      for (const f of files) {
        const res = await sdk.invoke<{ success?: boolean; error?: string }>('dialog.writeFile', { filePath: `${folder}${sep}mnemo-clima-${f.month}.json`, content: JSON.stringify(f, null, 2) }, HOST_TIMEOUT_MS);
        if (res && res.success === false) throw new Error(res.error ?? 'WRITE_FAILED');
        n++;
        if (n % 12 === 0 || n === files.length) setShare({ phase: 'writing', done: n, total: files.length, skipped: unreadPlaces });
      }
      setShare({ phase: 'done', n, skipped: unreadPlaces });
    } catch (err) {
      setShare({ phase: 'failed', error: errText(err), written: n });
    }
  };

  const board = useBoard(t);

  // ── the map's chrome: what each layer shows right now, and the legend's lines ──
  const cursorName = monthName(lang, cursorMonth.y, cursorMonth.m);
  const oceanText = (): { text: string; tone?: 'muted' | 'error'; action?: { label: string; onClick: () => void } } => {
    const err = ersstLast.status === 'error' && !monthSst.beyond ? ersstLast.error : daily ? (climate.sst.status === 'error' ? climate.sst.error : null) : monthSst.error;
    const retry = ersstLast.status === 'error' && !monthSst.beyond ? reloadErsstLast : daily ? climate.reload.sst : monthSst.retry;
    if (err) return { text: t('src.failed', { why: err }), tone: 'error', action: { label: t('src.retry'), onClick: retry } };
    const loading = daily ? climate.sst.status === 'loading' : monthSst.loading || ersstLast.status === 'loading';
    if (loading) return { text: t('map.sstLoading', { month: cursorName }), tone: 'muted' };
    if (!mapSst) return { text: t('map.sstNone', { month: cursorName }), tone: 'muted' };
    return { text: mapSst.monthly ? monthName(lang, Number(mapSst.day.slice(0, 4)), Number(mapSst.day.slice(5, 7))) : dayName(lang, mapSst.day) };
  };
  const landText = (): { text: string; tone?: 'muted' | 'error'; action?: { label: string; onClick: () => void } } => {
    // a server answer (404 unknown dataset, 429 too many requests, 5xx, a timeout) is NOAA's side
    // being down, said in words; anything else keeps its raw reason
    if (land.error) {
      // LAND_SHAPE / LAND_MISSING_ROWS: measured 11/10, the server answered 200 with the header and
      // no data while its upstream (NOAA PSL) was down — the same outage, not a reader fault
      const serverDown = /^(HTTP_(404|429|5\d\d)|TIMEOUT|LAND_SHAPE|LAND_MISSING_ROWS|LAND_MAPS)/.test(land.error) || /Host did not reply/.test(land.error);
      return { text: serverDown ? t('map.landServerDown', { code: land.error }) : t('map.landFailed', { why: land.error }), tone: 'error', action: { label: t('src.retry'), onClick: land.retry } };
    }
    if (land.loading) return { text: t('map.landLoading'), tone: 'muted' };
    if (!land.grid) return { text: t('map.landNone', { month: cursorName }), tone: 'muted' };
    return { text: cursorName };
  };
  const hazardCount = mapHazards.length;
  const ocean = oceanText(), landT = landText();
  const layerRows: LayerRow[] = [
    { id: 'sst', icon: '🌊', label: t('map.sst'), detail: ocean.text, error: ocean.tone === 'error' },
    { id: 'land', icon: '🏔', label: t('map.land'), detail: landT.text, error: landT.tone === 'error' },
    { id: 'hazards', icon: '⚠️', label: t('map.hazards'), detail: t('layers.hazardsDetail', { n: hazardCount }) },
    { id: 'tracks', icon: '🌀', label: t('map.tracks'), detail: mapTracks.length ? t('layers.tracksDetail', { n: mapTracks.length }) : t('layers.tracksNone') },
    { id: 'markers', icon: '🚩', label: t('map.markers'), detail: t('layers.markersDetail', { n: activeMarkers.length }) },
    { id: 'places', icon: '📍', label: t('map.places'), detail: t('layers.placesDetail', { n: settings.places.length }) },
  ];
  const legendLines: LegendLine[] = [
    ...(settings.layers.includes('sst') ? [{ icon: '🌊', text: `${t('map.sst')} · ${ocean.text}`, tone: ocean.tone, action: ocean.action }] : []),
    ...(settings.layers.includes('land') ? [{ icon: '🏔', text: `${t('map.land')} · ${landT.text}`, tone: landT.tone, action: landT.action }] : []),
  ];


  // ── the parts ──
  const mapBox = (
    <div className="map-box">
      <MapView
        theme={theme}
        layers={settings.layers}
        sst={mapSst}
        land={land.grid}
        hazards={mapHazards}
        tracks={mapTracks}
        markers={activeMarkers}
        places={settings.places}
        selectedPlace={selectedPlace}
        markerName={markerName}
        picking={picking != null}
        globe={globe}
        onPoint={onPoint}
        onPick={(pk: MapPick | null) => {
          if (!pk) return;
          if (pk.type === 'place') { selectPlace(pk.item.id); setTab('place'); }
          if (pk.type === 'marker') setTab('markers');
          if (pk.type === 'hazard') { chooseHazardKind(pk.item.kind); setTab('hazards'); }
        }}
        label={{ picking: t('place.picking'), map: t('map.aria') }}
      />
      <LayersMenu
        rows={layerRows} on={settings.layers} onToggle={toggleLayer} globe={globe} onGlobe={setGlobe}
        words={{ button: t('layers.button'), title: t('layers.title'), view: t('layers.view'), flat: t('map.flat'), globe: t('map.globe') }}
      />
      {(settings.layers.includes('sst') || settings.layers.includes('land')) && (
        <MapLegend title={t('legend.title')} lines={legendLines} footer={<ArchiveLine t={t} archive={archive} last={ersstLastMonth} />} />
      )}
    </div>
  );

  const timelineBox = (
    <div className="timeline-box">
      <TimelineHost theme={theme} lanes={lanes} episodes={episodes} cursorLabel={cursorLabel} missing={t('place.missing')} ariaLabel={t('tl.aria')} jump={jump} onMonth={onMonth} onCursor={onCursor}
        choices={laneChoices} onChoice={toggleLane}
        words={{ zoomIn: t('tl.zoomIn'), zoomOut: t('tl.zoomOut'), all: t('tl.all'), now: t('tl.now'), curves: t('curves.button'), curvesTitle: t('curves.title') }} />
      {climate.oni.status === 'error' && <div className="error-line small overlay">{t('src.failed', { why: climate.oni.error })} <button type="button" className="small-btn" onClick={climate.reload.oni}>{t('src.retry')}</button></div>}
    </div>
  );

  const panelBox = (
    <div className="panel-box">
      {/* The window with the panel answers agents: the single window, or the board's panel. */}
      <ClimaAgentActions
        ready={settingsReady} settings={settings}
        cpc={{ state: climate.cpc.status, data: cpc, error: climate.cpc.status === 'error' ? climate.cpc.error : null }}
        oniLatest={oni ? latestOni(oni) : null}
        hazards={{ state: climate.hazards.status, items: hazardsNow, error: climate.hazards.status === 'error' ? climate.hazards.error : null }}
        cursor={cursorMonth} range={climaRange().centre} tab={tab} hazardKind={hazardKind} selectedPlace={selectedPlace}
        markers={markers} markerName={markerName}
        episodes={episodes} curves={laneChoices} globe={globe} setGlobe={(on) => { setGlobe(on); linkRef.current?.send({ kind: 'globe', on }); }}
        jumpTo={(tt, frame) => { jumpHere(tt, frame); linkRef.current?.send({ kind: 'cursor', t: tt, ...frame }); }}
        setTab={setTab} selectPlace={selectPlace} chooseHazardKind={chooseHazardKind}
        commit={(fn) => commitHere(fn, (next) => linkRef.current?.send({ kind: 'settings', settings: next }))}
        newPlaceId={() => newId('p')}
      />
      {role !== 'main' && board.available && (
        <div className="row between board-bar">
          <strong>MnemoClima</strong>
          <Pill icon="▣" label={t('board.leave')} title={t('board.leaveHint')} disabled={board.busy} onClick={board.leave} />
        </div>
      )}
      {role !== 'main' && board.error && <div className="error-line small">{board.error}</div>}
      <div className="segmented glass tabs" role="tablist">
        {TABS.map((tb) => (
          <button key={tb.id} type="button" role="tab" aria-selected={tab === tb.id} aria-pressed={tab === tb.id} title={t(tb.key)} onClick={() => setTab(tb.id)}>
            <span aria-hidden>{tb.icon}</span> <span className="tab-label">{t(tb.key)}</span>
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'pacific' && <PacificPanel t={t} lang={lang} oni={climate.oni} cpc={climate.cpc} retryOni={climate.reload.oni} retryCpc={climate.reload.cpc} sstDay={okData(climate.sst)?.day ?? null} />}
        {tab === 'averages' && (
          <AveragesPanel t={t} lang={lang} regions={regions} retry={reloadRegions} month={cursorMonth}
            lanes={settings.regionLanes} onLane={(id) => update((s) => ({ ...s, regionLanes: s.regionLanes.includes(id) ? s.regionLanes.filter((x) => x !== id) : [...s.regionLanes, id] }))} />
        )}
        {tab === 'place' && (
          <PlacesPanel
            t={t} lang={lang} places={settings.places} selected={selectedPlace} series={placeSeries} retrySeries={retrySeries}
            oni={oni} analogMin={settings.analogMin} picking={picking === 'place'} pending={pending?.purpose === 'place' ? pending : null}
            onSelect={selectPlace} onAdd={() => startPick('place')} onCancel={cancelPick} onSave={savePlace} onRemove={removePlace}
            onAnalogMin={(v) => update((s) => ({ ...s, analogMin: v }))}
          />
        )}
        {tab === 'markers' && (
          <MarkersPanel
            t={t} lang={lang} markers={markers} active={settings.activeMarkers} name={markerName} series={placeSeries} retrySeries={retrySeries}
            ipc={ipc} oni={oni} analogMin={settings.analogMin} picking={picking === 'marker'} pending={pending?.purpose === 'marker' ? pending : null}
            onToggle={toggleMarker} onAdd={() => startPick('marker')} onCancel={cancelPick} onSave={saveMarker} onRemove={removeMarker}
          />
        )}
        {tab === 'hazards' && (
          <HazardsPanel t={t} lang={lang} hazards={climate.hazards} retry={climate.reload.hazards} kind={hazardKind} onKind={chooseHazardKind} onFocus={(h) => chooseHazardKind(h.kind)} history={historyItems} onLoadHistory={loadHistory} />
        )}
        {tab === 'memory' && (
          <MemoryPanel
            t={t} lang={lang} options={pourOptions} pour={pourState} onPour={doPour} onStop={stop}
            watch={settings.watch} onWatch={setWatch} watchError={watch.error} inbox={watch.inbox} onClearInbox={watch.clear}
            pinned={ensoPin.pinned} onPin={ensoPin.toggle} pinError={ensoPin.error} pinAvailable={ensoPin.available}
            onShare={() => void shareNumbers()} share={share}
          />
        )}
      </div>
    </div>
  );

  if (role === 'map') return <div className="clima-app solo">{mapBox}</div>;
  if (role === 'timeline') return <div className="clima-app solo">{timelineBox}</div>;
  if (role === 'panel') return <div className="clima-app solo">{panelBox}</div>;

  return (
    <div className="clima-app">
      <header className="top glass">
        <div className="brand">
          <strong>MnemoClima</strong>
          <span className="muted small">{t('app.subtitle')}</span>
        </div>
        <div className="now-chip glass">
          <span className="muted small">{t('header.showing')}</span>
          <strong>{cursorName}</strong>
        </div>
        <EnsoPill t={t} lang={lang} cpc={climate.cpc} />
        <div className="grow" />
        {board.available && (
          <div className="row">
            <Pill icon="⊞" label={board.busy ? t('board.opening') : t('board.open')} title={t('board.openHint')} disabled={board.busy} onClick={board.open} />
            {board.full && <Pill icon="⤓" label={t('board.here')} title={t('board.hereHint')} disabled={board.busy} onClick={board.openHere} primary />}
            {board.error && <span className="error-line small">{board.error}</span>}
          </div>
        )}
      </header>
      <main className="layout">
        <div className="left">
          {mapBox}
          {timelineBox}
        </div>
        {panelBox}
      </main>
      <footer className="muted small foot">{t('footer.source')}{inShell() ? '' : ' · dev'}</footer>
    </div>
  );
}

function EnsoPill(p: { t: (k: Key, v?: Record<string, string | number>) => string; lang: string; cpc: Loadable<{ status: string | null; kind: string | null; issued: string | null }> }) {
  const { t } = p;
  if (p.cpc.status === 'loading') return <span className="pill glass muted">{t('src.loading')}</span>;
  if (p.cpc.status === 'error' || !p.cpc.data.status) return <span className="pill glass error">{t('enso.unread')}</span>;
  const d = p.cpc.data;
  return <span className={`pill glass ${d.kind ?? 'other'}`} title={d.status ?? ''}>{t(`enso.status.${d.kind ?? 'other'}` as Key)}</span>;
}


/** The archive in one line: download it all, its progress, or what it holds. */
function ArchiveLine(p: { t: (k: Key, v?: Record<string, string | number>) => string; archive: SstArchive; last: { y: number; m: number } | null }) {
  const { t, archive: a } = p;
  const s = a.state;
  if (s.phase === 'reading') return null;
  if (s.phase === 'downloading') {
    return (
      <div className="stack-sm" role="status">
        <div className="row">
          <span>{t('archive.progress', { year: s.year, done: s.done, total: s.total })}</span>
          <button type="button" className="small-btn" onClick={a.stop}>{t('mem.stop')}</button>
        </div>
        <progress value={s.done} max={Math.max(1, s.total)} />
      </div>
    );
  }
  const whole = p.last != null && a.count >= (p.last.y - 1950) * 12 + p.last.m;
  return (
    <div className="stack-sm">
      {a.count > 0 && <div className="muted">{t('archive.kept', { n: a.count })}</div>}
      {s.phase === 'finished' && s.failed.length > 0 && <div className="error-line">{t('archive.failedYears', { years: s.failed.join(', ') })}</div>}
      {s.phase === 'stopped' && <div className="muted">{t('archive.stopped', { done: s.done, total: s.total })}</div>}
      {s.phase === 'failed' && <div className="error-line">{t('src.failed', { why: s.error })}</div>}
      {s.phase === 'idle' && s.storeError && <div className="error-line">{t('archive.storeError', { why: s.storeError })}</div>}
      {!whole && p.last && <button type="button" className="primary small-btn" onClick={() => a.download(p.last!)}>⬇ {t('archive.download')}</button>}
    </div>
  );
}

