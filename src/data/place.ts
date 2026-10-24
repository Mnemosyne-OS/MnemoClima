/**
 * place.ts — the places the person DECLARED (doc 147 §2): a point she put on the map, with a
 * name. Nothing here guesses one, and no place exists by default.
 *
 * The parcels cartridge (doc 147 §11) will hand its own places the same way: a list of named
 * points. The shape is the contract, so a place that does not read is refused, never repaired.
 */
export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export const MAX_PLACES = 12;

export function readPlace(x: unknown): Place | null {
  const p = x as Partial<Place> | null;
  if (!p || typeof p.id !== 'string' || !p.id) return null;
  if (typeof p.name !== 'string' || !p.name.trim()) return null;
  if (typeof p.lat !== 'number' || typeof p.lon !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return null;
  return { id: p.id, name: p.name.trim().slice(0, 60), lat: p.lat, lon: p.lon };
}

export function readPlaces(x: unknown): Place[] {
  if (!Array.isArray(x)) return [];
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const item of x) {
    const p = readPlace(item);
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
    if (out.length >= MAX_PLACES) break;
  }
  return out;
}

/** "10.20° N, 67.00° W": the coordinates as a person reads them. */
export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

/** Great-circle distance, km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
