/**
 * markers.ts — information markers (doc 147 §10): places that answer El Niño early (precursor)
 * or pay for it months later (impact).
 *
 * A marker is DATA: a point, a role, its sources. What it says comes from measurements at its
 * point (NASA POWER) and, where FEWS NET covers the country, from the published food-security
 * phase. The two built-in ones carry what Tony named on 11/10; the person adds her own on the map.
 */
import type { IpcRow } from './fewsnet';

export type Role = 'precursor' | 'impact';

export interface Marker {
  id: string;
  /** i18n key for a built-in marker, or the name the person typed. */
  nameKey?: string;
  name?: string;
  role: Role;
  lat: number;
  lon: number;
  /** Radius drawn on the map, km. */
  radiusKm: number;
  /** FEWS NET country (ISO 3166 alpha-2), when the marker is in its coverage. */
  fews?: string;
  /** i18n key of the one-line note under the marker's name: what it is known for. */
  noteKey?: string;
  /** A family the panel groups by (the coffee regions apart). */
  group?: 'coffee';
  builtIn: boolean;
}

/** The person's own markers kept at most (the reader keeps the first ones; the add is refused past it). */
export const MAX_USER_MARKERS = 24;

export const BUILT_IN_MARKERS: Marker[] = [
  // Southern California: winter storms of strong El Niño years (1982-83, 1997-98), and the
  // 2015-16 winter that stayed dry. The point is Los Angeles.
  { id: 'california', nameKey: 'marker.california', noteKey: 'marker.california.note', role: 'precursor', lat: 34.05, lon: -118.25, radiusKm: 350, builtIn: true },
  // Central America's Dry Corridor: the point is Chiquimula, Guatemala.
  { id: 'guatemala', nameKey: 'marker.guatemala', noteKey: 'marker.guatemala.note', role: 'impact', lat: 14.8, lon: -89.55, radiusKm: 250, fews: 'GT', builtIn: true },
  // The coffee regions (Tony's harvests, 11/10): off until the person turns them on. Each point is
  // a town at the heart of the region; the notes say what the region is, never what El Niño
  // does there: that is what the analogue table measures.
  { id: 'coffee-minas', nameKey: 'marker.coffeeMinas', noteKey: 'marker.coffeeMinas.note', role: 'impact', lat: -21.55, lon: -45.43, radiusKm: 220, group: 'coffee', builtIn: true },
  { id: 'coffee-huila', nameKey: 'marker.coffeeHuila', noteKey: 'marker.coffeeHuila.note', role: 'impact', lat: 1.85, lon: -76.05, radiusKm: 150, group: 'coffee', builtIn: true },
  { id: 'coffee-andes-ve', nameKey: 'marker.coffeeVenezuela', noteKey: 'marker.coffeeVenezuela.note', role: 'impact', lat: 8.59, lon: -71.15, radiusKm: 180, group: 'coffee', builtIn: true },
  { id: 'coffee-highlands-vn', nameKey: 'marker.coffeeVietnam', noteKey: 'marker.coffeeVietnam.note', role: 'impact', lat: 12.67, lon: 108.04, radiusKm: 200, group: 'coffee', builtIn: true },
  { id: 'coffee-sidama', nameKey: 'marker.coffeeSidama', noteKey: 'marker.coffeeSidama.note', role: 'impact', lat: 7.06, lon: 38.48, radiusKm: 180, fews: 'ET', group: 'coffee', builtIn: true },
  { id: 'coffee-gayo', nameKey: 'marker.coffeeGayo', noteKey: 'marker.coffeeGayo.note', role: 'impact', lat: 4.62, lon: 96.85, radiusKm: 150, group: 'coffee', builtIn: true },
];

/** The built-in markers shown on a first opening: the two Tony named. The coffee regions wait for a switch. */
export const DEFAULT_ACTIVE_MARKERS = ['california', 'guatemala'];

/** How far the last measured months stray from the normal, as a word the marker lights with. */
export type RainState = 'dry' | 'wet' | 'normal';

/** Under 75 % of the normal is dry, over 125 % is wet: a band, never a single cut. */
export function rainState(pct: number): RainState {
  if (pct < 75) return 'dry';
  if (pct > 125) return 'wet';
  return 'normal';
}

/** IPC phase 3 (Crisis) and above light a marker. */
export const ipcLights = (row: IpcRow | null): boolean => row != null && row.phase >= 3;

/** A marker the person placed: named, inside the world, a role among the two. Anything else is refused. */
export function readUserMarker(x: unknown): Marker | null {
  const m = x as Partial<Marker> | null;
  if (!m || typeof m.id !== 'string' || !m.id.startsWith('user:')) return null;
  if (typeof m.name !== 'string' || !m.name.trim()) return null;
  if (m.role !== 'precursor' && m.role !== 'impact') return null;
  if (typeof m.lat !== 'number' || typeof m.lon !== 'number' || Math.abs(m.lat) > 90 || Math.abs(m.lon) > 180) return null;
  const radiusKm = typeof m.radiusKm === 'number' && m.radiusKm > 0 && m.radiusKm <= 2000 ? m.radiusKm : 200;
  const fews = typeof m.fews === 'string' && /^[A-Z]{2}$/.test(m.fews) ? m.fews : undefined;
  return { id: m.id, name: m.name.trim().slice(0, 60), role: m.role, lat: m.lat, lon: m.lon, radiusKm, builtIn: false, ...(fews ? { fews } : {}) };
}
