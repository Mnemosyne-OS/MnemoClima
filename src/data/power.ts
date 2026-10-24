/**
 * power.ts — rain and temperature at one point, month by month since 1981: NASA POWER,
 * agroclimatology community (public; NASA asks to be credited). The point is the one the person
 * DECLARED (doc 147 §2); nothing here picks one.
 *
 * POWER gives precipitation as a monthly mean in mm/day. It is turned into the month's total
 * (× days of the month), the number a farmer reads. Month "13" is the year's aggregate and is
 * not a month. -999 is POWER's missing value.
 */
import { daysIn, monthKey, type MonthValue } from './months';

export const POWER_FIRST_YEAR = 1981;

export function powerUrl(lat: number, lon: number, endYear: number): string {
  const p = new URLSearchParams({
    parameters: 'T2M,PRECTOTCORR', community: 'AG',
    longitude: lon.toFixed(3), latitude: lat.toFixed(3),
    start: String(POWER_FIRST_YEAR), end: String(endYear), format: 'JSON',
  });
  return `https://power.larc.nasa.gov/api/temporal/monthly/point?${p.toString()}`;
}

export interface PlaceSeries {
  /** Monthly rain, mm. */
  rain: MonthValue[];
  /** Monthly mean temperature at 2 m, °C. */
  temp: MonthValue[];
  /** Elevation POWER used for the cell, metres, when it said. */
  elevation: number | null;
}

interface PowerJson {
  geometry?: { coordinates?: unknown[] };
  header?: { fill_value?: unknown };
  properties?: { parameter?: Record<string, Record<string, unknown>> };
}

export function parsePower(json: unknown): PlaceSeries | null {
  const j = json as PowerJson;
  const p = j?.properties?.parameter;
  if (!p || typeof p !== 'object') return null;
  const fill = typeof j.header?.fill_value === 'number' ? j.header.fill_value : -999;
  const read = (name: string, toTotal: boolean): MonthValue[] => {
    const raw = p[name];
    if (!raw || typeof raw !== 'object') return [];
    const out: MonthValue[] = [];
    for (const [key, val] of Object.entries(raw)) {
      if (!/^\d{6}$/.test(key)) continue;
      const y = Number(key.slice(0, 4)), m = Number(key.slice(4));
      if (m < 1 || m > 12) continue; // 13 = the year's aggregate
      const ok = typeof val === 'number' && Number.isFinite(val) && val !== fill;
      out.push({ y, m, v: ok ? (toTotal ? Math.round(val * daysIn(y, m) * 10) / 10 : val) : null });
    }
    return out.sort((a, b) => monthKey(a.y, a.m) - monthKey(b.y, b.m));
  };
  const rain = read('PRECTOTCORR', true);
  const temp = read('T2M', false);
  if (rain.length === 0 && temp.length === 0) return null;
  const elev = j.geometry?.coordinates?.[2];
  return { rain, temp, elevation: typeof elev === 'number' && Number.isFinite(elev) ? elev : null };
}
