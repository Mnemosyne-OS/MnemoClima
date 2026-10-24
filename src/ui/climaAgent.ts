/**
 * climaAgent.ts — what an agent may do in MnemoClima (doc 149), as plain functions over the app's
 * own state and its own moves. Declared in `mnemo-plugin.json` › agentActions, served by
 * `ClimaAgentActions` from the window that holds the panel (the single window, or the panel of
 * the exploded view: one window answers, never three).
 *
 * 🚨 Every move is the one the person's own control makes: a month goes through the board's
 * cursor jump (the timeline glides there and the map follows, in every window of the board), a
 * tab through the tabs, layers, places and markers through the same settings change as the
 * Layers menu, the Places form and the markers' switches, a disaster type through the Disasters
 * tab's chips.
 *
 * 🚨 A settings change answers only once the host has stored it, and is refused before the
 * host's copy is read (`commit`, store.ts): an answer « done » over a place the next opening has
 * forgotten would be the cartridge saying something false.
 *
 * 🎙 By voice (doc 149 §19): the orb never reads the app before it plans, so every action that
 * targets a thing takes it by the words a person says (« Caracas », « El Niño 1997 », « le cyclone
 * au Mexique ») and still by its id; several matches are refused with their names (AMBIGUOUS),
 * which is what the orb's repair call reads (`data/agentFind`).
 *
 * ⛔ Nothing here forecasts: an episode, an analogue year, a disaster are what was MEASURED or
 * published, dated; the future is NOAA's opinion as `status` reads it.
 *
 * ⛔ Not exposed: removing a place or a marker, sharing the numbers (an OS folder dialog), the background watch (a standing
 * permission), pouring into memory and the disaster history (long batches).
 *
 * Refusals throw `CODE: reason`, and an unknown name says how to list the right ones.
 */
import { findNamed, type Named } from '../data/agentFind';
import type { Discussion } from '../data/cpc';
import type { Hazard, HazardKind } from '../data/hazards';
import type { Marker } from '../data/markers';
import { monthPos } from '../data/months';
import { analogPeaks, strengthOf, type Episode, type OniRow } from '../data/oni';
import { openingView } from '../engine/curves';
import { MAX_PLACES, type Place } from '../data/place';
import type { Layer, Settings } from './store';

export const TABS = ['pacific', 'averages', 'place', 'markers', 'hazards', 'memory'] as const;
export type AgentTab = (typeof TABS)[number];
export const HAZARD_KINDS = ['all', 'cyclone', 'flood', 'drought', 'quake', 'volcano', 'fire', 'storm', 'ice', 'other'] as const;
const LAYERS: Layer[] = ['sst', 'land', 'hazards', 'tracks', 'markers', 'places'];

/** The timeline's zoom moves, the same as its buttons (− + ⟷ ◉). */
export const ZOOMS = ['in', 'out', 'all', 'now'] as const;
/** The buttons' zoom step (TimelineHost). */
const ZOOM_STEP = 1.6;
/** A span asked in years, inside what the timeline can show. */
export const SPAN_YEARS = { min: 1, max: 180 } as const;

/** How a jump frames the timeline: a span in years, or a zoom factor around its middle. */
export interface JumpFrame { span?: number; factor?: number }

/** One timeline curve and its switch, as the Curves menu lists it. */
export interface CurveChoice { id: string; label: string; on: boolean }

/** How many disasters `hazards` answers at most: what the manifest declares as `limit`'s maximum. */
export const HAZARDS_LIMIT = { min: 1, max: 200, default: 50 } as const;

/** The app's state and its own moves, read fresh at every call. */
export interface ClimaAgentContext {
  /** The host's copy of the settings is read: writes may go. */
  ready: boolean;
  settings: Settings;
  cpc: { state: 'loading' | 'error' | 'ok'; data: Discussion | null; error: string | null };
  oniLatest: OniRow | null;
  hazards: { state: 'loading' | 'error' | 'ok'; items: readonly Hazard[]; error: string | null };
  cursor: { y: number; m: number };
  /** The months the timeline can stand on, as fractional years. */
  range: { min: number; max: number };
  tab: AgentTab;
  hazardKind: HazardKind | 'all';
  selectedPlace: string | null;
  markers: readonly Marker[];
  markerName: (m: Marker) => string;
  /** The El Niño and La Niña episodes the ONI defines (the timeline's bands). */
  episodes: readonly Episode[];
  /** Every curve of the timeline, each with its switch (the Curves menu). */
  curves: readonly CurveChoice[];
  /** The map is drawn as a globe (else flat). */
  globe: boolean;
  setGlobe: (on: boolean) => void;
  /** The board's own jump: the timeline glides there and every window follows; a frame zooms it. */
  jumpTo: (t: number, frame?: JumpFrame) => void;
  setTab: (t: AgentTab) => void;
  selectPlace: (id: string | null) => void;
  chooseHazardKind: (k: HazardKind | 'all') => void;
  /** The settings change, answered once the host has stored it. */
  commit: (fn: (s: Settings) => Settings) => Promise<Settings>;
  newPlaceId: () => string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A whole number of rows inside the declared limits; anything else is refused, never clamped. */
export function readLimit(v: unknown): number {
  if (v === undefined || v === null) return HAZARDS_LIMIT.default;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < HAZARDS_LIMIT.min || v > HAZARDS_LIMIT.max) {
    throw new Error(`BAD_ARG: limit must be a whole number from ${HAZARDS_LIMIT.min} to ${HAZARDS_LIMIT.max}`);
  }
  return v;
}

/** A month the timeline can show, as the position of its middle; outside the timeline is refused. */
export function readMonth(year: unknown, month: unknown, range: { min: number; max: number }): number {
  if (typeof year !== 'number' || !Number.isInteger(year)) throw new Error('BAD_ARG: year must be a whole year');
  const m = month === undefined || month === null ? 7 : month;
  if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > 12) throw new Error('BAD_ARG: month runs from 1 to 12');
  const t = monthPos(year, m);
  if (t < Math.floor(range.min) || t > range.max) throw new Error(`OUTSIDE: the timeline runs from ${Math.floor(range.min)} to the month under way`);
  return t;
}

const KIND_WORD: Record<Episode['kind'], string> = { elnino: 'El Niño', lanina: 'La Niña' };
/** The words a spoken sentence may use for a disaster type (titles are English, sentences are not). */
const HAZARD_WORDS: Record<string, string> = {
  cyclone: 'cyclone hurricane typhoon ouragan typhon huracan', flood: 'flood inondation crue inundacion', drought: 'drought sécheresse sequia',
  quake: 'earthquake quake séisme tremblement terre terremoto sismo', volcano: 'volcano volcan éruption eruption', fire: 'fire wildfire incendie feu incendio',
  storm: 'storm tempête orage tormenta', ice: 'ice glace hielo', other: '',
};

/** A place by its id or the words of its name; two of the same name are AMBIGUOUS, never the first one. */
export function resolvePlace(places: readonly Place[], ref: string): Place {
  const shared = (p: Place) => places.filter((x) => x.name === p.name).length > 1;
  const entries: Array<Named<Place>> = places.map((p) => ({ item: p, id: p.id, names: [p.name], label: shared(p) ? `${p.name} (${p.id})` : p.name }));
  return findNamed(entries, ref, { code: 'NO_PLACE', noun: 'place' });
}

/** A marker by its id or the words of its name as the screen shows it (or of its id); two are AMBIGUOUS. */
export function resolveMarker(markers: readonly Marker[], name: (m: Marker) => string, ref: string): Marker {
  const entries: Array<Named<Marker>> = markers.map((m) => ({ item: m, id: m.id, names: [name(m), m.id.replace(/^user:/, '')], label: name(m) }));
  return findNamed(entries, ref, { code: 'NO_MARKER', noun: 'marker' });
}

/** An episode's id and the words it answers to: its kind, its years, « current » while it runs. */
export function episodeId(e: Episode): string {
  return `${e.kind}-${e.start.y}-${String(e.start.m).padStart(2, '0')}`;
}
export function episodeLabel(e: Episode): string {
  return `${KIND_WORD[e.kind]} ${e.start.y}${e.end.y !== e.start.y ? `–${e.end.y}` : ''}${e.ongoing ? ' (ongoing)' : ''}`;
}
export function resolveEpisode(episodes: readonly Episode[], ref: string): Episode {
  const entries: Array<Named<Episode>> = episodes.map((e) => {
    const years: string[] = [];
    for (let y = e.start.y; y <= e.end.y; y++) years.push(String(y));
    return { item: e, id: episodeId(e), names: [KIND_WORD[e.kind], ...years, ...(e.ongoing ? ['current ongoing actuel cours en curso'] : [])], label: episodeLabel(e) };
  });
  return findNamed(entries, ref, { code: 'NO_EPISODE', noun: 'episode' });
}

/** A disaster in progress by its id, or the words of its title, its country or its type. */
export function resolveHazard(items: readonly Hazard[], ref: string): Hazard {
  const entries: Array<Named<Hazard>> = items.map((h) => ({
    item: h, id: h.id,
    names: [h.title, h.country ?? '', h.kind, HAZARD_WORDS[h.kind] ?? ''].filter(Boolean),
    label: h.country && !h.title.includes(h.country) ? `${h.title} · ${h.country}` : h.title,
  }));
  return findNamed(entries, ref, { code: 'NO_DISASTER', noun: 'disaster' });
}

/** A timeline curve by its id or the words of its name as the Curves menu shows it. */
export function resolveCurve(curves: readonly CurveChoice[], ref: string): CurveChoice {
  const entries: Array<Named<CurveChoice>> = curves.map((c) => ({ item: c, id: c.id, names: [c.label, c.id.replace(/^(region|place|marker|haz):/, '')], label: c.label }));
  return findNamed(entries, ref, { code: 'NO_CURVE', noun: 'curve' });
}

/** The middle of a month, as a position on the timeline. */
const middleOf = (p: { y: number; m: number }) => monthPos(p.y, p.m);

function writable(c: ClimaAgentContext): void {
  if (!c.ready) throw new Error('NOT_READY: the saved settings are still being read; ask again in a moment');
}

/** The handlers, keyed by the action ids `mnemo-plugin.json` declares. */
export function climaAgentHandlers(ctx: () => ClimaAgentContext) {
  // agent-actions:begin
  return {
    status: () => {
      const c = ctx();
      const s = c.settings;
      return {
        noaa: c.cpc.state === 'ok' && c.cpc.data
          ? { status: c.cpc.data.status, kind: c.cpc.data.kind, issued: c.cpc.data.issued, synopsis: c.cpc.data.synopsis }
          : { unread: c.cpc.state === 'error' ? c.cpc.error : 'loading' },
        latestOni: c.oniLatest ? { year: c.oniLatest.y, season: c.oniLatest.season, anomaly: c.oniLatest.v } : null,
        showing: c.cursor,
        tab: c.tab,
        layers: s.layers,
        places: s.places.map((p) => ({ ...p, selected: p.id === c.selectedPlace })),
        markers: c.markers.map((m) => ({ id: m.id, name: c.markerName(m), role: m.role, shown: s.activeMarkers.includes(m.id) })),
        hazardKind: c.hazardKind,
        mapView: c.globe ? 'globe' : 'flat',
        analogStrength: s.analogMin === 2.0 ? 'veryStrong' : 'strong',
        curves: c.curves.map((x) => ({ id: x.id, name: x.label, shown: x.on })),
        settingsReady: c.ready,
      };
    },
    hazards: (args: Record<string, unknown>) => {
      const c = ctx();
      const limit = readLimit(args.limit);
      if (c.hazards.state === 'loading') throw new Error('LOADING: the disasters in progress are still being read; ask again in a moment');
      if (c.hazards.state === 'error') throw new Error(`UNREAD: the disasters in progress could not be read (${c.hazards.error})`);
      const kind = str(args.kind) || 'all';
      const rows = c.hazards.items.filter((h) => kind === 'all' || h.kind === kind);
      return {
        total: rows.length,
        hazards: rows.slice(0, limit).map((h) => ({ kind: h.kind, title: h.title, from: h.from, to: h.to, level: h.level, measure: h.measure, country: h.country, lat: h.lat, lon: h.lon, source: h.source, url: h.url })),
      };
    },
    goToMonth: (args: Record<string, unknown>) => {
      const c = ctx();
      const t = readMonth(args.year, args.month, c.range);
      c.jumpTo(t);
      return { showing: { y: args.year, m: args.month ?? 7 } };
    },
    showTab: (args: Record<string, unknown>) => {
      const c = ctx();
      const tab = str(args.tab) as AgentTab;
      if (!TABS.includes(tab)) throw new Error(`BAD_ARG: tab must be one of ${TABS.join(', ')}`);
      c.setTab(tab);
      return { tab };
    },
    setLayers: async (args: Record<string, unknown>) => {
      const c = ctx();
      writable(c);
      const change = LAYERS.filter((l) => typeof args[l] === 'boolean');
      if (!change.length) throw new Error(`MISSING_ARG: give at least one of ${LAYERS.join(', ')}`);
      const next = await c.commit((s) => ({
        ...s,
        layers: LAYERS.filter((l) => (typeof args[l] === 'boolean' ? args[l] === true : s.layers.includes(l))),
      }));
      return { layers: next.layers };
    },
    selectPlace: (args: Record<string, unknown>) => {
      const c = ctx();
      const p = resolvePlace(c.settings.places, str(args.place));
      c.selectPlace(p.id);
      c.setTab('place');
      return { selected: p };
    },
    addPlace: async (args: Record<string, unknown>) => {
      const c = ctx();
      writable(c);
      const name = str(args.name);
      const lat = args.latitude, lon = args.longitude;
      if (!name) throw new Error('BAD_ARG: a place needs a name');
      if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90) throw new Error('BAD_ARG: latitude runs from -90 to 90');
      if (typeof lon !== 'number' || !Number.isFinite(lon) || Math.abs(lon) > 180) throw new Error('BAD_ARG: longitude runs from -180 to 180');
      // The reader keeps the first MAX_PLACES: one more is refused here, never written to be dropped.
      if (c.settings.places.length >= MAX_PLACES) throw new Error(`FULL: ${MAX_PLACES} places are declared already; the person removes one first`);
      const place: Place = { id: c.newPlaceId(), name: name.slice(0, 60), lat, lon };
      await c.commit((s) => ({ ...s, places: [...s.places, place] }));
      c.selectPlace(place.id);
      c.setTab('place');
      return { added: place };
    },
    showMarker: async (args: Record<string, unknown>) => {
      const c = ctx();
      writable(c);
      const m = resolveMarker(c.markers, c.markerName, str(args.marker));
      const on = args.on === true;
      await c.commit((s) => ({
        ...s,
        activeMarkers: on
          ? (s.activeMarkers.includes(m.id) ? s.activeMarkers : [...s.activeMarkers, m.id])
          : s.activeMarkers.filter((id) => id !== m.id),
      }));
      return { marker: m.id, name: c.markerName(m), shown: on };
    },
    setHazardKind: (args: Record<string, unknown>) => {
      const c = ctx();
      const kind = str(args.kind) as HazardKind | 'all';
      if (!(HAZARD_KINDS as readonly string[]).includes(kind)) throw new Error(`BAD_ARG: kind must be one of ${HAZARD_KINDS.join(', ')}`);
      c.chooseHazardKind(kind);
      c.setTab('hazards');
      return { kind };
    },
    episodes: (args: Record<string, unknown>) => {
      const c = ctx();
      const kind = str(args.kind) || 'all';
      if (!['all', 'elnino', 'lanina'].includes(kind)) throw new Error('BAD_ARG: kind must be all, elnino or lanina');
      if (!c.episodes.length) throw new Error('LOADING: the ocean index (ONI) is not read yet, so no episode is known; ask again in a moment');
      // the analogue years the Place tab compares, by the strength the person chose there
      const analogues = new Set(analogPeaks([...c.episodes], c.settings.analogMin).map(episodeId));
      return {
        analogueStrength: c.settings.analogMin === 2.0 ? 'veryStrong' : 'strong',
        episodes: c.episodes.filter((e) => kind === 'all' || e.kind === kind).map((e) => ({
          id: episodeId(e), name: episodeLabel(e), kind: e.kind, start: e.start, end: e.end,
          peak: e.peak, strength: strengthOf(Math.abs(e.peak.v)), ongoing: e.ongoing, analogue: analogues.has(episodeId(e)),
        })),
      };
    },
    showEpisode: (args: Record<string, unknown>) => {
      const c = ctx();
      if (!c.episodes.length) throw new Error('LOADING: the ocean index (ONI) is not read yet, so no episode is known; ask again in a moment');
      const e = resolveEpisode(c.episodes, str(args.episode));
      // the whole episode in view, a year either side, the timeline's middle on it
      const a = middleOf(e.start), b = middleOf(e.end);
      c.jumpTo((a + b) / 2, { span: Math.max(3, b - a + 2) });
      return { showing: { id: episodeId(e), name: episodeLabel(e), start: e.start, end: e.end, peak: e.peak } };
    },
    zoomTimeline: (args: Record<string, unknown>) => {
      const c = ctx();
      const zoom = args.zoom === undefined ? '' : str(args.zoom);
      const years = args.years;
      if (zoom && !(ZOOMS as readonly string[]).includes(zoom)) throw new Error(`BAD_ARG: zoom must be one of ${ZOOMS.join(', ')}`);
      if (years !== undefined && (typeof years !== 'number' || !Number.isFinite(years) || years < SPAN_YEARS.min || years > SPAN_YEARS.max)) {
        throw new Error(`BAD_ARG: years runs from ${SPAN_YEARS.min} to ${SPAN_YEARS.max}`);
      }
      const here = middleOf(c.cursor);
      if (typeof years === 'number') { c.jumpTo(here, { span: years }); return { span: years }; }
      if (zoom === 'in' || zoom === 'out') { c.jumpTo(here, { factor: zoom === 'in' ? 1 / ZOOM_STEP : ZOOM_STEP }); return { zoom }; }
      if (zoom === 'all') {
        // the ⟷ button: 1950 to the month under way, where the ocean index lives
        const max = c.range.max;
        c.jumpTo((1950 + max) / 2, { span: max - 1950 + 1 });
        return { zoom, from: 1950 };
      }
      if (zoom === 'now') {
        const v = openingView();
        c.jumpTo((v.y0 + v.y1) / 2, { span: v.y1 - v.y0 });
        return { zoom };
      }
      throw new Error(`MISSING_ARG: give zoom (${ZOOMS.join(', ')}) or years`);
    },
    showHazard: (args: Record<string, unknown>) => {
      const c = ctx();
      if (c.hazards.state === 'loading') throw new Error('LOADING: the disasters in progress are still being read; ask again in a moment');
      if (c.hazards.state === 'error') throw new Error(`UNREAD: the disasters in progress could not be read (${c.hazards.error})`);
      const h = resolveHazard(c.hazards.items, str(args.disaster));
      // what a click on its row does (its type chosen, the Disasters tab), and the timeline on
      // its first month so the map draws it
      c.chooseHazardKind(h.kind);
      c.setTab('hazards');
      const y = Number(h.from.slice(0, 4)), m = Number(h.from.slice(5, 7));
      if (Number.isInteger(y) && m >= 1 && m <= 12) c.jumpTo(monthPos(y, m));
      return { showing: { id: h.id, kind: h.kind, title: h.title, country: h.country, from: h.from, to: h.to, level: h.level, measure: h.measure, source: h.source, url: h.url } };
    },
    setMapView: (args: Record<string, unknown>) => {
      const c = ctx();
      const view = str(args.view);
      if (view !== 'flat' && view !== 'globe') throw new Error('BAD_ARG: view must be flat or globe');
      c.setGlobe(view === 'globe');
      return { view };
    },
    showCurve: async (args: Record<string, unknown>) => {
      const c = ctx();
      writable(c);
      if (typeof args.on !== 'boolean') throw new Error('BAD_ARG: on must be true or false');
      const on = args.on;
      const curve = resolveCurve(c.curves, str(args.curve));
      // the Curves menu's switch: a continent is a curve the person asks for, every other one is shown until turned off
      await c.commit((s) => {
        if (curve.id.startsWith('region:')) {
          const r = curve.id.slice(7);
          return { ...s, regionLanes: on ? (s.regionLanes.includes(r) ? s.regionLanes : [...s.regionLanes, r]) : s.regionLanes.filter((x) => x !== r) };
        }
        return { ...s, hiddenLanes: on ? s.hiddenLanes.filter((x) => x !== curve.id) : (s.hiddenLanes.includes(curve.id) ? s.hiddenLanes : [...s.hiddenLanes, curve.id]) };
      });
      return { curve: curve.id, name: curve.label, shown: on };
    },
    setAnalogStrength: async (args: Record<string, unknown>) => {
      const c = ctx();
      writable(c);
      const strength = str(args.strength);
      if (strength !== 'strong' && strength !== 'veryStrong') throw new Error('BAD_ARG: strength must be strong or veryStrong');
      await c.commit((s) => ({ ...s, analogMin: strength === 'veryStrong' ? 2.0 : 1.5 }));
      // the switch lives in the Place tab: the person sees the table change
      c.setTab('place');
      return { strength };
    },
  };
  // agent-actions:end
}
