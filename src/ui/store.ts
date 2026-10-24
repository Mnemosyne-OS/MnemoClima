/**
 * store.ts — what MnemoClima remembers between openings: the declared places, the person's own
 * markers, which markers are shown, the map layers, the analogue threshold, what was poured.
 *
 * The host's durable state (`state.get` / `state.set`, doc 73) is the truth, because an iframe's
 * localStorage dies with its origin; localStorage is a mirror for the first paint and for a plain
 * browser. Every field is re-read through its own reader: a value that does not read is dropped,
 * never repaired into something the person did not choose.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { readPlaces, type Place } from '../data/place';
import { BUILT_IN_MARKERS, DEFAULT_ACTIVE_MARKERS, MAX_USER_MARKERS, readUserMarker, type Marker } from '../data/markers';
import { HOST_TIMEOUT_MS, inShell, sdk } from './host';
import { REGIONS } from '../data/continents';

const REGION_IDS = new Set<string>(REGIONS.map((r) => r.id));

export type Layer = 'sst' | 'land' | 'hazards' | 'tracks' | 'markers' | 'places';
export const LAYERS: Layer[] = ['sst', 'land', 'hazards', 'tracks', 'markers', 'places'];
/** Bumped when a layer is added: settings written before see it ON once, then the choice is theirs. */
const LAYERS_VERSION = 2;

export interface Settings {
  places: Place[];
  userMarkers: Marker[];
  /** Ids of the markers shown (built-in and the person's). */
  activeMarkers: string[];
  layers: Layer[];
  /** 1.5 strong, 2.0 very strong. */
  analogMin: 1.5 | 2.0;
  /** Pour keys already written, so a second pour skips them. */
  poured: string[];
  /** ISO day of the last pour, per subject. */
  pouredOn: Record<string, string>;
  /** The person asked the host to watch El Niño while closed. */
  watch: boolean;
  /** Regions whose monthly departure is drawn on the timeline. */
  regionLanes: string[];
  /** Which set of layers the stored choice was made with (store.ts LAYERS_VERSION). */
  layersVersion: number;
  /** Timeline curves shown by default that the person turned off. */
  hiddenLanes: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  places: [],
  userMarkers: [],
  activeMarkers: DEFAULT_ACTIVE_MARKERS,
  layers: ['sst', 'land', 'hazards', 'markers', 'places'],
  analogMin: 1.5,
  poured: [],
  pouredOn: {},
  watch: false,
  regionLanes: [],
  layersVersion: LAYERS_VERSION,
  hiddenLanes: [],
};

/** Layers added since the stored choice was made are shown; nothing the person turned off is turned back on. */
function withNewLayers(layers: Layer[], version: unknown): Layer[] {
  if (version === LAYERS_VERSION) return layers;
  return layers.includes('land') ? layers : [...layers, 'land'];
}

const LOCAL_KEY = 'mnemo-clima:settings';
const MAX_POURED = 6000;

export function readSettings(x: unknown): Settings {
  const s = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const userMarkers = Array.isArray(s.userMarkers) ? s.userMarkers.map(readUserMarker).filter((m): m is Marker => m != null).slice(0, MAX_USER_MARKERS) : [];
  const ids = new Set([...BUILT_IN_MARKERS.map((m) => m.id), ...userMarkers.map((m) => m.id)]);
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((i): i is string => typeof i === 'string') : []);
  return {
    places: readPlaces(s.places),
    userMarkers,
    activeMarkers: Array.isArray(s.activeMarkers) ? strings(s.activeMarkers).filter((id) => ids.has(id)) : DEFAULT_SETTINGS.activeMarkers,
    layers: Array.isArray(s.layers)
      ? withNewLayers(strings(s.layers).filter((l): l is Layer => (LAYERS as string[]).includes(l)), s.layersVersion)
      : DEFAULT_SETTINGS.layers,
    layersVersion: LAYERS_VERSION,
    hiddenLanes: strings(s.hiddenLanes).slice(0, 64),
    analogMin: s.analogMin === 2 || s.analogMin === 2.0 ? 2.0 : 1.5,
    poured: strings(s.poured).slice(-MAX_POURED),
    pouredOn: s.pouredOn && typeof s.pouredOn === 'object'
      ? Object.fromEntries(Object.entries(s.pouredOn as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
      : {},
    watch: s.watch === true,
    regionLanes: strings(s.regionLanes).filter((id) => REGION_IDS.has(id)),
  };
}

function readLocal(): Settings | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? readSettings(JSON.parse(raw)) : null;
  } catch (err) {
    console.warn('[MnemoClima] local settings not read', err);
    return null;
  }
}

function writeLocal(s: Settings): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
  } catch (err) {
    console.warn('[MnemoClima] local settings not written', err);
  }
}

/**
 * The settings, with `ready` false until the host's copy is read: nothing is written back before
 * that, or a slow host would see its stored places replaced by the empty defaults.
 */
export function useSettings(): {
  settings: Settings; ready: boolean; update: (fn: (s: Settings) => Settings) => Settings; adopt: (x: unknown) => void; saveError: string | null;
  commit: (fn: (s: Settings) => Settings, onApplied?: (next: Settings) => void) => Promise<Settings>;
} {
  const [settings, setSettings] = useState<Settings>(() => readLocal() ?? DEFAULT_SETTINGS);
  const [ready, setReady] = useState(!inShell());
  const [saveError, setSaveError] = useState<string | null>(null);
  const readyRef = useRef(ready);

  useEffect(() => {
    if (!inShell()) return;
    let alive = true;
    sdk.invoke<{ state?: unknown }>('state.get', undefined, HOST_TIMEOUT_MS)
      .then((res) => {
        if (!alive) return;
        // null = never stored: keep the local mirror (a first opening, or the first since the host gained the state)
        if (res?.state) { const s = readSettings(res.state); setSettings(s); writeLocal(s); }
      })
      .catch((err) => console.warn('[MnemoClima] host settings not read; the local copy stands', err))
      .finally(() => { if (alive) { readyRef.current = true; setReady(true); } });
    return () => { alive = false; };
  }, []);

  // The latest settings, so an update computes from them OUTSIDE a state updater: an updater
  // runs twice under StrictMode and must not write to the host twice.
  const current = useRef(settings);
  current.current = settings;

  const update = useCallback((fn: (s: Settings) => Settings) => {
    const next = fn(current.current);
    current.current = next;
    setSettings(next);
    writeLocal(next);
    if (inShell() && readyRef.current) {
      sdk.invoke('state.set', { state: next }, HOST_TIMEOUT_MS)
        .then(() => setSaveError(null))
        .catch((err) => { console.warn('[MnemoClima] settings not saved to the host', err); setSaveError(err instanceof Error ? err.message : String(err)); });
    }
    return next;
  }, []);

  /**
   * The agent's write (doc 149): the same change as `update`, but it answers only once the host
   * has stored it, and refuses before the host's copy is read (`update` then keeps the change
   * on screen only, which a person sees and an agent would not). `onApplied` runs once the
   * change is on screen, before the host answers, so the other board windows follow at once.
   */
  const commit = useCallback(async (fn: (s: Settings) => Settings, onApplied?: (next: Settings) => void) => {
    if (inShell() && !readyRef.current) throw new Error('NOT_READY: the saved settings are still being read');
    const next = fn(current.current);
    current.current = next;
    setSettings(next);
    writeLocal(next);
    onApplied?.(next);
    if (inShell()) {
      try {
        await sdk.invoke('state.set', { state: next }, HOST_TIMEOUT_MS);
        setSaveError(null);
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        console.warn('[MnemoClima] settings not saved to the host', err);
        setSaveError(why);
        throw new Error(`NOT_SAVED: the change is on screen but the host did not store it (${why})`);
      }
    }
    return next;
  }, []);

  /**
   * Another board window changed the settings and wrote them: take them, read field by field
   * (the channel is shared with other cartridges of the same origin), and do NOT write back
   * (the writer already did; two windows writing each other's echo would never settle).
   */
  const adopt = useCallback((x: unknown) => {
    const next = readSettings(x);
    current.current = next;
    setSettings(next);
    writeLocal(next);
  }, []);

  return { settings, ready, update, adopt, saveError, commit };
}
