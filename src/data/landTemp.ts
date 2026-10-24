/**
 * landTemp.ts — the continents in colour (Tony, 11/10): NOAAGlobalTemp, the land and ocean
 * surface temperature anomaly merged by NOAA, monthly, a 5° grid (NOAA PSL, « available for use
 * without restriction »), through ERDDAP (upwell) in its OPeNDAP ASCII form.
 *
 * Measured 11/10: 1850 → August 2026, 36 × 72 cells. A decade is one request (120 months,
 * ~2.8 MB of text, under the host's 4 MB). The grid's axes are READ from the answer, never
 * assumed (the latitude may run either way, longitudes may be 0..360).
 *
 * ⛔ Not seen answering: on 11/10 the server said « Currently unknown datasetID » (ERDDAP
 * reloading) and the other door (PSL THREDDS) answered 429. The reader is tested on a sample
 * written in the exact form ERDDAP gives the ocean grid; the map says when the server is down.
 */
import { monthKey } from './months';
import type { SstGrid } from './sst';

export const LAND_DATASET = 'https://upwell.pfeg.noaa.gov/erddap/griddap/noaa_psl_d9a4_93e4_c44f';
const NLAT = 36, NLON = 72;
const MISSING = -128;
const SCALE = 10; // tenths of a degree: land departures run larger than the ocean's (±12.7 °C)

/** A whole decade (or what exists of it) in one request, by index on the space axes. */
export function landDecadeUrl(decade: number, last: { y: number; m: number } | null, now = new Date()): string {
  // never past the last month published, nor past this month when that is not known yet (a
  // request into 2029 answers 404 and reads as an outage)
  const bound = last ?? { y: now.getUTCFullYear(), m: Math.max(1, now.getUTCMonth()) };
  const endY = Math.min(decade + 9, bound.y);
  const endM = endY === bound.y ? bound.m : 12;
  const q = `air[(${decade}-01-01):1:(${endY}-${String(endM).padStart(2, '0')}-01)][0:1:${NLAT - 1}][0:1:${NLON - 1}]`;
  return `${LAND_DATASET}.asc?${q.replace(/\[/g, '%5B').replace(/\]/g, '%5D')}`;
}

export interface LandDecade {
  lats: number[];
  lons: number[];
  /** month key → packed month (lat-major in the answer's own order). */
  months: Map<number, Int8Array>;
}

/**
 * Read an ERDDAP OPeNDAP ASCII answer for `air[time][latitude][longitude]`: rows `[t][i], v, …`
 * (an empty cell is missing), then the maps `air.time`, `air.latitude`, `air.longitude`. A grid
 * of another shape, or a missing row, is refused.
 */
export function parseLandAsc(text: string): LandDecade {
  const dims = /air\.air\[(\d+)\]\[(\d+)\]\[(\d+)\]/.exec(text);
  if (!dims) throw new Error('LAND_SHAPE');
  const nt = Number(dims[1]), nlat = Number(dims[2]), nlon = Number(dims[3]);
  if (nlat !== NLAT || nlon !== NLON) throw new Error(`LAND_GRID_${nlat}x${nlon}`);
  const values = Array.from({ length: nt }, () => new Float32Array(nlat * nlon).fill(NaN));
  const seen = Array.from({ length: nt }, () => new Uint8Array(nlat));
  const lines = text.split(/\r?\n/);
  const maps: Record<string, number[]> = {};
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k]!;
    const map = /^air\.(time|latitude|longitude)\[(\d+)\]$/.exec(line.trim());
    if (map) { maps[map[1]!] = (lines[k + 1] ?? '').split(', ').map(Number); continue; }
    const m = /^\[(\d+)\]\[(\d+)\], /.exec(line);
    if (!m) continue;
    const t = Number(m[1]), i = Number(m[2]);
    const cells = line.slice(m[0].length).split(', ');
    if (t >= nt || i >= nlat || cells.length !== nlon) throw new Error('LAND_ROW');
    for (let j = 0; j < nlon; j++) {
      const c = cells[j]!.trim();
      values[t]![i * nlon + j] = c === '' || c === 'NaN' ? NaN : Number(c);
    }
    seen[t]![i] = 1;
  }
  if (seen.some((s) => s.some((x) => x === 0))) throw new Error('LAND_MISSING_ROWS');
  const time = maps.time ?? [], lats = maps.latitude ?? [], lons = maps.longitude ?? [];
  if (time.length !== nt || lats.length !== nlat || lons.length !== nlon || [...time, ...lats, ...lons].some((x) => !Number.isFinite(x))) throw new Error('LAND_MAPS');
  const months = new Map<number, Int8Array>();
  time.forEach((sec, t) => {
    const d = new Date(sec * 1000);
    const packed = new Int8Array(nlat * nlon);
    const v = values[t]!;
    for (let c = 0; c < v.length; c++) packed[c] = Number.isFinite(v[c]!) ? Math.max(-127, Math.min(127, Math.round(v[c]! * SCALE))) : MISSING;
    months.set(monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1), packed);
  });
  return { lats, lons: lons.map((x) => (x > 180 ? x - 360 : x)), months };
}

/** A packed land month as cells to draw (5° squares), dated in its own month. */
export function landGrid(y: number, m: number, d: LandDecade): SstGrid | null {
  const packed = d.months.get(monthKey(y, m));
  if (!packed) return null;
  const cells: SstGrid['cells'] = [];
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < d.lats.length; i++) for (let j = 0; j < d.lons.length; j++) {
    const p = packed[i * d.lons.length + j]!;
    if (p === MISSING) continue;
    const v = p / SCALE;
    cells.push({ lat: d.lats[i]!, lon: d.lons[j]!, v });
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { day: `${y}-${String(m).padStart(2, '0')}-01`, step: 5, cells, min, max, monthly: true };
}

export const decadeOf = (y: number): number => Math.floor(y / 10) * 10;
