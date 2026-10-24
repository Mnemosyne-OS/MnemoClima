/**
 * continents.ts — the month's average temperature departure for the world and each continent
 * (Tony, 11/10: « la moyenne des températures, et aussi sur les continents »).
 *
 * Source: NOAA NCEI « Climate at a Glance », global time series (public domain), one CSV per
 * region: `Date,Departure from Average` then `YYYYMM,value`. Measured 11/10: monthly since 1950,
 * last month September 2026, CORS open (the iframe reads it), about 11 KB each.
 *
 * 🎭 Their base period is 1901-2000, NOT the ocean map's: the screen says it next to the numbers.
 * The world is given twice on purpose: land only, and land + ocean.
 */
import { monthKey, num, type MonthValue } from './months';

export const REGIONS = [
  { id: 'globe-lo', path: 'globe/land_ocean', key: 'region.globeLandOcean' },
  { id: 'globe', path: 'globe/land', key: 'region.globeLand' },
  { id: 'africa', path: 'africa/land', key: 'region.africa' },
  { id: 'asia', path: 'asia/land', key: 'region.asia' },
  { id: 'europe', path: 'europe/land', key: 'region.europe' },
  { id: 'northAmerica', path: 'northAmerica/land', key: 'region.northAmerica' },
  { id: 'southAmerica', path: 'southAmerica/land', key: 'region.southAmerica' },
  { id: 'oceania', path: 'oceania/land', key: 'region.oceania' },
] as const;
export type RegionId = (typeof REGIONS)[number]['id'];

export const regionUrl = (path: string, from: number, to: number): string =>
  `https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/global/time-series/${path}/1/0/${from}-${to}/data.csv`;

export interface RegionSeries { series: MonthValue[]; base: string | null; dropped: number }

/** Read one CSV: the base period from its header, then `YYYYMM,value`; -999 and blanks are missing. */
export function parseRegion(csv: string): RegionSeries {
  const series: MonthValue[] = [];
  let base: string | null = null;
  let dropped = 0;
  for (const line of csv.split(/\r?\n/)) {
    const b = /^#\s*Base Period:\s*(.+)$/i.exec(line);
    if (b) { base = b[1]!.trim(); continue; }
    const m = /^(\d{4})(\d{2}),(.*)$/.exec(line.trim());
    if (!m) continue;
    const y = Number(m[1]), mo = Number(m[2]);
    if (mo < 1 || mo > 12) { dropped++; continue; }
    const v = num(m[3]);
    series.push({ y, m: mo, v: v == null || v <= -99 ? null : v });
  }
  series.sort((a, b) => monthKey(a.y, a.m) - monthKey(b.y, b.m));
  return { series, base, dropped };
}
