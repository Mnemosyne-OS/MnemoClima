/**
 * sst.ts — the heat in the ocean: NOAA OISST v2.1 daily anomaly of sea surface temperature,
 * read through the CoastWatch ERDDAP (public domain). The last day the server has, which runs
 * about two weeks behind (doc 147 §2): the date travels with the grid, never "today".
 */
export const SST_STEP_DEG = 2;

/**
 * One grid every `step` degrees, the last day available. OISST cells are 0.25°, so the stride
 * is step × 4. A 2° grid is ~16 000 cells, 798 KB measured: the iframe cannot read it (no CORS), the host can.
 */
export function sstUrl(step = SST_STEP_DEG): string {
  const stride = Math.max(1, Math.round(step * 4));
  const q = `anom[(last)][(0.0)][(-75):${stride}:(75)][(-179.875):${stride}:(179.875)]`;
  // only the brackets are encoded: ERDDAP reads both forms (measured 11/10, 798 KB at 2°)
  return `https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.json?${q.replace(/\[/g, '%5B').replace(/\]/g, '%5D')}`;
}

/**
 * The heat of ONE MONTH, for the month under the timeline's cursor: NOAA ERSST v5, monthly
 * anomaly since January 1854, a 2° grid (public domain). Measured 11/10: 730 KB a month, last
 * month August 2026, no CORS (read through the host). Asked on the 15th: the server stamps its
 * months mid-month, and the answer's own month is checked by the caller.
 */
export const ERSST_FIRST = { y: 1854, m: 1 };
export function ersstUrl(y: number, m: number): string {
  const day = `${y}-${String(m).padStart(2, '0')}-15`;
  const q = `ssta[(${day})][(0.0)][(-74):1:(74)][(-178):1:(178)]`;
  return `https://coastwatch.pfeg.noaa.gov/erddap/griddap/nceiErsstv5_LonPM180.json?${q.replace(/\[/g, '%5B').replace(/\]/g, '%5D')}`;
}

/** One cell of the last month ERSST has: enough to read which month that is. */
export const ersstLastUrl = (): string =>
  'https://coastwatch.pfeg.noaa.gov/erddap/griddap/nceiErsstv5_LonPM180.json?ssta%5B(last)%5D%5B(0.0)%5D%5B(0):1:(0)%5D%5B(0):1:(0)%5D';

export interface SstGrid {
  /** ISO day of the grid. */
  day: string;
  step: number;
  /** A month's grid (ERSST), named by its month; absent = a day's (OISST), named by its day. */
  monthly?: boolean;
  /** One cell per sea point: lon, lat, anomaly °C. Land has no cell. */
  cells: { lon: number; lat: number; v: number }[];
  /** Range of the anomalies read, for a legend that says what it shows. */
  min: number;
  max: number;
}

interface ErddapTable { table?: { columnNames?: string[]; rows?: unknown[][] } }

/** Both grids: OISST names its anomaly `anom`, ERSST `ssta`. */
export function parseSst(json: unknown, step = SST_STEP_DEG): SstGrid | null {
  const t = (json as ErddapTable)?.table;
  const names = t?.columnNames ?? [];
  const iTime = names.indexOf('time'), iLat = names.indexOf('latitude'), iLon = names.indexOf('longitude');
  const iV = names.indexOf('anom') >= 0 ? names.indexOf('anom') : names.indexOf('ssta');
  if (iTime < 0 || iLat < 0 || iLon < 0 || iV < 0 || !Array.isArray(t?.rows)) return null;
  const cells: SstGrid['cells'] = [];
  let day = '';
  let min = Infinity, max = -Infinity;
  for (const r of t!.rows!) {
    if (!Array.isArray(r)) continue;
    const v = r[iV], lat = r[iLat], lon = r[iLon];
    if (!day && typeof r[iTime] === 'string') day = (r[iTime] as string).slice(0, 10);
    if (typeof v !== 'number' || typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(v)) continue;
    cells.push({ lon, lat, v });
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!day || cells.length === 0) return null;
  return { day, step, cells, min, max };
}

/** The same colour as `anomalyColour`, as bytes for an image (r, g, b, a in 0..255). */
export function anomalyRgba(v: number, full = 3, alpha = 0.9): [number, number, number, number] {
  const t = Math.max(-1, Math.min(1, v / full));
  const a = Math.abs(t);
  const h = (t >= 0 ? 4 : 214) / 360, s = (20 + a * 70) / 100, l = (96 - a * 52) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const ch = (x: number) => { let k = x; if (k < 0) k += 1; if (k > 1) k -= 1;
    return k < 1 / 6 ? p + (q - p) * 6 * k : k < 1 / 2 ? q : k < 2 / 3 ? p + (q - p) * (2 / 3 - k) * 6 : p; };
  return [Math.round(ch(h + 1 / 3) * 255), Math.round(ch(h) * 255), Math.round(ch(h - 1 / 3) * 255), Math.round(alpha * 255)];
}

/** The anomaly as a colour: blue below, red above, white at 0, saturated at ±`full` °C. */
export function anomalyColour(v: number, full = 3, alpha = 0.85): string {
  const t = Math.max(-1, Math.min(1, v / full));
  const a = Math.abs(t);
  // white → deep red (or deep blue): the hue is fixed, lightness falls with |t|
  const hue = t >= 0 ? 4 : 214;
  const light = 96 - a * 52;
  const sat = 20 + a * 70;
  return `hsla(${hue}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%, ${alpha})`;
}
