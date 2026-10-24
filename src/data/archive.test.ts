/**
 * The archive of every month (Tony, 11/10: « download all the data »), read on ERDDAP's real
 * ASCII answer for November-December 1997, saved on 11/10.
 */
import { describe, expect, it } from 'vitest';
import asc from './fixtures/ersst-1997-11-12.asc?raw';
import { CELLS, LATS, LONS, ersstYearUrl, pack, parseErsstAsc, toGrid } from './sstArchive';

describe('ERSST archive', () => {
  const year = parseErsstAsc(asc);

  it('reads both months, dated in their own month', () => {
    expect(year.months).toEqual([{ y: 1997, m: 11 }, { y: 1997, m: 12 }]);
    expect(year.values).toHaveLength(2);
    expect(year.values[1]!.length).toBe(CELLS);
  });

  it('land is NaN, never a 0', () => {
    const dec = year.values[1]!;
    const land = [...dec].filter((v) => Number.isNaN(v)).length;
    expect(land).toBeGreaterThan(1000);
    expect(land).toBeLessThan(CELLS);
  });

  it('December 1997: the eastern equatorial Pacific more than 2 °C over normal', () => {
    const dec = year.values[1]!;
    let max = -Infinity;
    for (let i = 0; i < LATS.length; i++) for (let j = 0; j < LONS.length; j++) {
      if (Math.abs(LATS[i]!) <= 4 && LONS[j]! < -100) { const v = dec[i * LONS.length + j]!; if (v > max) max = v; }
    }
    expect(max).toBeGreaterThan(2);
  });

  it('packs a month to a byte a cell and back within a twentieth of a degree, land kept as land', () => {
    const dec = year.values[1]!;
    const g = toGrid(1997, 12, pack(dec));
    expect(g.monthly).toBe(true);
    expect(g.day).toBe('1997-12-15');
    expect(g.cells.length).toBe([...dec].filter((v) => !Number.isNaN(v)).length);
    const first = g.cells[0]!;
    const i = LATS.indexOf(first.lat), j = LONS.indexOf(first.lon);
    expect(Math.abs(first.v - dec[i * LONS.length + j]!)).toBeLessThanOrEqual(0.025 + 1e-9);
  });

  it('refuses an answer that is not the grid asked for, or that misses rows', () => {
    expect(() => parseErsstAsc(asc.replace('[latitude = 75]', '[latitude = 74]').replace('ssta.ssta[2][1][75][179]', 'ssta.ssta[2][1][74][179]'))).toThrow(/ASC_GRID/);
    expect(() => parseErsstAsc(asc.replace(/^\[1\]\[0\]\[40\],.*$/m, ''))).toThrow(/ASC_MISSING_ROWS/);
    expect(() => parseErsstAsc('maintenance')).toThrow(/ASC_SHAPE/);
  });

  it('asks a whole year in one request, as text the host passes through', () => {
    const u = ersstYearUrl(1997);
    expect(u).toContain('nceiErsstv5_LonPM180.asc?');
    expect(u).toContain('(1997-01-15):1:(1997-12-15)');
    expect(ersstYearUrl(2026, 8)).toContain('(2026-08-15)');
  });
});
