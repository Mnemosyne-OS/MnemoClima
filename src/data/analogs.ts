/**
 * analogs.ts — "the last times, what happened at my place": the only thing about the future
 * this cartridge computes, and it is made of the PAST (doc 147 §4).
 *
 * For each analogue El Niño (a finished episode that peaked strong, oni.ts), month by month from
 * the peak to 12 months after, the place's measurement against the place's normal for that
 * month (1991-2020). Every row carries N, and each year is kept apart: four years that
 * contradict one another must show it, a mean alone would promise what one of them disproved.
 */
import { addMonths, byMonth, monthKey, type MonthValue } from './months';
import type { Episode } from './oni';

export const NORMAL_FROM = 1991;
export const NORMAL_TO = 2020;
export const MONTHS_AFTER = 12;

/**
 * The place's normal for each calendar month: the mean of the years in [from, to] that have a
 * value. A month with fewer than half its years measured has no normal (null): a mean of three
 * years is not a normal.
 */
export function normals(series: MonthValue[], from = NORMAL_FROM, to = NORMAL_TO): (number | null)[] {
  const sum = new Array<number>(13).fill(0), n = new Array<number>(13).fill(0);
  for (const p of series) {
    if (p.y < from || p.y > to || p.v == null) continue;
    sum[p.m]! += p.v;
    n[p.m]!++;
  }
  const need = Math.ceil((to - from + 1) / 2);
  const out: (number | null)[] = [null];
  for (let m = 1; m <= 12; m++) out.push(n[m]! >= need ? sum[m]! / n[m]! : null);
  return out;
}

export interface AnalogCell {
  /** Months after the peak, 0..12. */
  offset: number;
  y: number;
  m: number;
  value: number | null;
  normal: number | null;
  /** value − normal; null when either is missing. */
  delta: number | null;
  /** value / normal × 100 (rain); null when either is missing or the normal is 0. */
  pct: number | null;
}

export interface AnalogYear { peak: Episode['peak']; cells: AnalogCell[] }

export interface AnalogSummary {
  offset: number;
  /** How many analogue years have a delta at this offset. */
  n: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  /** How many of the n were below their normal. */
  below: number;
}

/** For each analogue peak, the place's months 0..`monthsAfter` after it, against that month's normal. */
export function analogYears(series: MonthValue[], peaks: Episode[], monthsAfter = MONTHS_AFTER): AnalogYear[] {
  const norm = normals(series);
  const look = byMonth(series);
  return peaks.map((e) => {
    const cells: AnalogCell[] = [];
    for (let k = 0; k <= monthsAfter; k++) {
      const { y, m } = addMonths(e.peak.y, e.peak.m, k);
      const value = look.get(monthKey(y, m)) ?? null;
      const normal = norm[m] ?? null;
      const delta = value != null && normal != null ? value - normal : null;
      const pct = value != null && normal != null && normal !== 0 ? (value / normal) * 100 : null;
      cells.push({ offset: k, y, m, value, normal, delta, pct });
    }
    return { peak: e.peak, cells };
  });
}

/** Per month after the peak: N (the years measured), the mean, the spread, how many below normal. */
export function summarise(years: AnalogYear[], monthsAfter = MONTHS_AFTER): AnalogSummary[] {
  const out: AnalogSummary[] = [];
  for (let k = 0; k <= monthsAfter; k++) {
    const ds = years.map((a) => a.cells[k]?.delta).filter((d): d is number => d != null);
    out.push({
      offset: k, n: ds.length,
      mean: ds.length ? ds.reduce((s, d) => s + d, 0) / ds.length : null,
      min: ds.length ? Math.min(...ds) : null,
      max: ds.length ? Math.max(...ds) : null,
      below: ds.filter((d) => d < 0).length,
    });
  }
  return out;
}

/**
 * Anomaly of the last `months` months that ARE measured, ending at the series' last value:
 * what lights a marker (doc 147 §10.1). Null when fewer than `months` of them have a normal.
 * Returns the sum of values against the sum of normals (rain) and the dates it covers.
 */
export function recentAnomaly(series: MonthValue[], months = 3): { from: { y: number; m: number }; to: { y: number; m: number }; value: number; normal: number; pct: number } | null {
  const norm = normals(series);
  const valued = series.filter((p) => p.v != null);
  const tail = valued.slice(-months);
  if (tail.length < months) return null;
  let value = 0, normal = 0;
  for (const p of tail) {
    const nm = norm[p.m];
    if (nm == null) return null;
    value += p.v!;
    normal += nm;
  }
  if (normal === 0) return null;
  return { from: { y: tail[0]!.y, m: tail[0]!.m }, to: { y: tail[tail.length - 1]!.y, m: tail[tail.length - 1]!.m }, value, normal, pct: (value / normal) * 100 };
}
