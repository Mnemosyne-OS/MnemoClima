/**
 * indices.ts — the slow indices drawn under El Niño: PDO, IOD (NOAA PSL) and the global
 * temperature (NASA GISTEMP). All three are public domain.
 */
import { monthKey, num, type MonthValue } from './months';

export const PDO_URL = 'https://psl.noaa.gov/data/correlation/pdo.data';
export const IOD_URL = 'https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data';
export const GISTEMP_URL = 'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv';

/**
 * The PSL table format: a first line `first last`, one line per year with 12 monthly values,
 * then a line holding the missing-value marker alone (`-9.90`, `-9999`), then free text. Every
 * cell equal to the marker is null. Without a marker line, nothing is treated as missing that
 * is not unreadable.
 */
export function parsePslTable(text: string): MonthValue[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = lines[0]?.split(/\s+/) ?? [];
  const first = Number(head[0]), last = Number(head[1]);
  if (!Number.isInteger(first) || !Number.isInteger(last)) return [];
  const body: string[][] = [];
  let marker: number | null = null;
  for (const line of lines.slice(1)) {
    const cells = line.split(/\s+/);
    if (cells.length === 13 && Number.isInteger(Number(cells[0]))) { body.push(cells); continue; }
    if (cells.length === 1 && num(cells[0]) != null) marker = num(cells[0]);
    break;
  }
  const out: MonthValue[] = [];
  for (const cells of body) {
    const y = Number(cells[0]);
    if (y < first || y > last) continue;
    for (let m = 1; m <= 12; m++) {
      const v = num(cells[m]);
      out.push({ y, m, v: v == null || (marker != null && Math.abs(v - marker) < 1e-9) ? null : v });
    }
  }
  return trimTail(out);
}

/**
 * GISTEMP's global table: `Year,Jan,…,Dec,J-D,…` after a title line, `***` for a month not yet
 * computed. Anomalies in °C against 1951-1980.
 */
export function parseGistemp(csv: string): MonthValue[] {
  const out: MonthValue[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const cells = line.split(',');
    const y = Number(cells[0]);
    if (!Number.isInteger(y) || cells.length < 13) continue;
    for (let m = 1; m <= 12; m++) out.push({ y, m, v: num(cells[m]) });
  }
  out.sort((a, b) => monthKey(a.y, a.m) - monthKey(b.y, b.m));
  return trimTail(out);
}

/** Months not yet published at the end of a table are not part of the series. */
function trimTail(s: MonthValue[]): MonthValue[] {
  let end = s.length;
  while (end > 0 && s[end - 1]!.v == null) end--;
  return s.slice(0, end);
}
