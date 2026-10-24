/**
 * sstArchive.ts — every month of ocean heat, downloaded once and kept on the machine (Tony,
 * 11/10: « it lags when I move the timeline, can't we download all the data »).
 *
 * Source: ERSST v5 through ERDDAP in its OPeNDAP ASCII form (`.asc`), one YEAR per request.
 * Measured 11/10: 1.53 MB and 3.5 s a year, 1950 → 2026 = 77 requests, about 118 MB. The binary
 * form (`.dods`, 647 KB) would be smaller, but the host's `social.fetch` keeps only images, sound
 * and video as bytes and decodes everything else as UTF-8, which would destroy it; the text form
 * goes through untouched and stays under the host's 4 MB.
 *
 * Kept packed: one signed byte per sea cell, the anomaly in twentieths of a degree (±6.35 °C;
 * the map saturates at ±3), land = -128. A month is 13 425 bytes, 1950 → 2026 is about 12 MB.
 */
import { monthKey } from './months';
import type { SstGrid } from './sst';

export const ARCHIVE_FIRST_YEAR = 1950;
/** The grid every month of the archive shares: ERSST's 2° cells, as asked below. */
export const LATS = Array.from({ length: 75 }, (_, i) => -74 + 2 * i);
export const LONS = Array.from({ length: 179 }, (_, i) => -178 + 2 * i);
export const CELLS = LATS.length * LONS.length;
const LAND = -128;
const SCALE = 20;

export function ersstYearUrl(year: number, lastMonth = 12): string {
  const q = `ssta[(${year}-01-15):1:(${year}-${String(lastMonth).padStart(2, '0')}-15)][(0.0)][(-74):1:(74)][(-178):1:(178)]`;
  return `https://coastwatch.pfeg.noaa.gov/erddap/griddap/nceiErsstv5_LonPM180.asc?${q.replace(/\[/g, '%5B').replace(/\]/g, '%5D')}`;
}

export interface ArchiveYear {
  months: { y: number; m: number }[];
  /** One Float32Array per month, latitude-major then longitude, NaN on land. */
  values: Float32Array[];
}

/**
 * Read ERDDAP's OPeNDAP ASCII answer for one Grid: rows `[t][0][lat], v, v, …` (179 values, land
 * written as an empty cell), then the maps, of which `ssta.time[n]` (seconds since 1970) dates
 * each month. A grid that is not the shape asked for is refused, never read across the wrong
 * cells; a row that is missing leaves its month refused, never filled.
 */
export function parseErsstAsc(text: string): ArchiveYear {
  const dims = /ssta\.ssta\[(\d+)\]\[1\]\[(\d+)\]\[(\d+)\]/.exec(text);
  if (!dims) throw new Error('ASC_SHAPE');
  const nt = Number(dims[1]), nlat = Number(dims[2]), nlon = Number(dims[3]);
  if (nlat !== LATS.length || nlon !== LONS.length) throw new Error(`ASC_GRID_${nlat}x${nlon}`);
  const values = Array.from({ length: nt }, () => new Float32Array(CELLS).fill(NaN));
  const seen = Array.from({ length: nt }, () => new Uint8Array(nlat));
  const lines = text.split(/\r?\n/);
  let timeLine = -1;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k]!;
    if (line.startsWith('ssta.time[')) { timeLine = k + 1; break; }
    const m = /^\[(\d+)\]\[0\]\[(\d+)\], /.exec(line);
    if (!m) continue;
    const t = Number(m[1]), i = Number(m[2]);
    const cells = line.slice(m[0].length).split(', ');
    if (t >= nt || i >= nlat || cells.length !== nlon) throw new Error('ASC_ROW');
    const row = values[t]!;
    for (let j = 0; j < nlon; j++) {
      const c = cells[j]!.trim();
      row[i * nlon + j] = c === '' ? NaN : Number(c);
    }
    seen[t]![i] = 1;
  }
  if (seen.some((s) => s.some((x) => x === 0))) throw new Error('ASC_MISSING_ROWS');
  const times = timeLine > 0 ? (lines[timeLine] ?? '').split(', ').map(Number) : [];
  if (times.length !== nt || times.some((x) => !Number.isFinite(x))) throw new Error('ASC_TIME');
  const months = times.map((sec) => { const d = new Date(sec * 1000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; });
  return { months, values };
}

/** One month, packed. */
export function pack(values: Float32Array): Int8Array {
  const out = new Int8Array(CELLS);
  for (let c = 0; c < CELLS; c++) {
    const v = values[c]!;
    out[c] = Number.isFinite(v) ? Math.max(-127, Math.min(127, Math.round(v * SCALE))) : LAND;
  }
  return out;
}

/** A packed month as the grid the map draws, dated in its own month. */
export function toGrid(y: number, m: number, packed: Int8Array): SstGrid {
  const cells: SstGrid['cells'] = [];
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < LATS.length; i++) {
    for (let j = 0; j < LONS.length; j++) {
      const p = packed[i * LONS.length + j]!;
      if (p === LAND) continue;
      const v = p / SCALE;
      cells.push({ lat: LATS[i]!, lon: LONS[j]!, v });
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { day: `${y}-${String(m).padStart(2, '0')}-15`, step: 2, cells, min, max, monthly: true };
}

// ── kept on the machine: IndexedDB, one record per year ───────────────────

const DB = 'mnemo-clima';
const STORE = 'ersst-years';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('NO_INDEXEDDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB_OPEN'));
  });
}

export interface StoredYear { year: number; months: { y: number; m: number }[]; data: Int8Array[] }

export async function saveYear(year: StoredYear): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ months: year.months, data: year.data.map((a) => a.buffer) }, year.year);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB_WRITE'));
    });
  } finally {
    db.close();
  }
}

/** Every stored year, as a map month key → packed month. A record that does not read is skipped and counted. */
export async function loadAll(): Promise<{ months: Map<number, Int8Array>; years: number[]; dropped: number }> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const months = new Map<number, Int8Array>();
      const years: number[] = [];
      let dropped = 0;
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { resolve({ months, years, dropped }); return; }
        const rec = cur.value as { months?: { y: number; m: number }[]; data?: ArrayBuffer[] };
        if (Array.isArray(rec?.months) && Array.isArray(rec.data) && rec.months.length === rec.data.length
            && rec.data.every((b) => b instanceof ArrayBuffer && b.byteLength === CELLS)) {
          rec.months.forEach((mm, i) => months.set(monthKey(mm.y, mm.m), new Int8Array(rec.data![i]!)));
          years.push(Number(cur.key));
        } else dropped++;
        cur.continue();
      };
      req.onerror = () => reject(req.error ?? new Error('IDB_READ'));
    });
  } finally {
    db.close();
  }
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB_CLEAR'));
    });
  } finally {
    db.close();
  }
}
