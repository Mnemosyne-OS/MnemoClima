/**
 * The continents' reader, on a sample written in the exact form ERDDAP gives a grid without a
 * depth axis (the ocean grid's form, `[t][i], v, …` then the maps). ⛔ Not the server's own
 * answer: on 11/10 it was down (« Currently unknown datasetID »).
 */
import { describe, expect, it } from 'vitest';
import { decadeOf, landDecadeUrl, landGrid, parseLandAsc } from './landTemp';

function sample(months: number, latsDescending: boolean, lon0to360: boolean): string {
  const lats = Array.from({ length: 36 }, (_, i) => (latsDescending ? 87.5 - 5 * i : -87.5 + 5 * i));
  const lons = Array.from({ length: 72 }, (_, j) => (lon0to360 ? 2.5 + 5 * j : -177.5 + 5 * j));
  const rows: string[] = [];
  for (let t = 0; t < months; t++) for (let i = 0; i < 36; i++) {
    rows.push(`[${t}][${i}], ` + lons.map((_, j) => (i === 0 && j === 0 ? '' : String(((t + 1) * (i - 18)) / 10))).join(', '));
  }
  const times = Array.from({ length: months }, (_, t) => Date.UTC(1997, 10 + t, 1) / 1000);
  return [
    'Dataset {', '  GRID {', '    ARRAY:', `      Float32 air[time = ${months}][latitude = 36][longitude = 72];`, '  } air;', '} noaa;',
    '---------------------------------------------', `air.air[${months}][36][72]`, ...rows, '',
    `air.time[${months}]`, times.join(', '), '', 'air.latitude[36]', lats.join(', '), '', 'air.longitude[72]', lons.join(', '),
  ].join('\n');
}

describe('continents (NOAAGlobalTemp via ERDDAP)', () => {
  it('reads each month, dated, with the axes the answer gives (latitude down, longitudes 0..360)', () => {
    const d = parseLandAsc(sample(2, true, true));
    expect([...d.months.keys()]).toEqual([199711, 199712]);
    expect(d.lats[0]).toBe(87.5);
    expect(Math.max(...d.lons)).toBeLessThanOrEqual(180);
    expect(d.lons).toContain(-2.5);
  });
  it('a missing cell is missing, never a 0, and values come back within a tenth of a degree', () => {
    const g = landGrid(1997, 12, parseLandAsc(sample(2, false, false)))!;
    expect(g.cells.length).toBe(36 * 72 - 1);
    expect(g.step).toBe(5);
    const top = g.cells.find((c) => c.lat === 87.5 && c.lon === -177.5)!;
    expect(top.v).toBeCloseTo((2 * 17) / 10, 1);
  });
  it('refuses another grid, or a month with a missing row', () => {
    expect(() => parseLandAsc(sample(1, false, false).replace('air.air[1][36][72]', 'air.air[1][35][72]'))).toThrow(/LAND_GRID/);
    expect(() => parseLandAsc(sample(1, false, false).replace(/^\[0\]\[5\],.*$/m, ''))).toThrow(/LAND_MISSING_ROWS/);
    expect(landGrid(2001, 1, parseLandAsc(sample(1, false, false)))).toBeNull();
  });
  it('asks a decade at once, stopping at the last month published', () => {
    expect(decadeOf(1997)).toBe(1990);
    expect(landDecadeUrl(1990, { y: 2026, m: 8 })).toContain('air%5B(1990-01-01):1:(1999-12-01)%5D%5B0:1:35%5D%5B0:1:71%5D');
    expect(landDecadeUrl(2020, { y: 2026, m: 8 })).toContain('(2026-08-01)');
  });
});
