import { describe, expect, it } from 'vitest';
import africa from './fixtures/cag-africa.csv?raw';
import { REGIONS, parseRegion, regionUrl } from './continents';

describe('continent averages (NOAA Climate at a Glance)', () => {
  it('reads every month since 1950 with its base period', () => {
    const r = parseRegion(africa);
    expect(r.base).toBe('1901-2000');
    expect(r.series[0]).toEqual({ y: 1950, m: 1, v: -0.12 });
    expect(r.series.at(-1)).toMatchObject({ y: 2026, m: 9 });
    expect(r.dropped).toBe(0);
  });
  it('a missing value (-999) is missing, never a cold month', () => {
    expect(parseRegion('Date,Departure from Average\n202001,-999\n202002,0.5').series).toEqual([{ y: 2020, m: 1, v: null }, { y: 2020, m: 2, v: 0.5 }]);
  });
  it('asks the land series of each continent, and the world twice (land, land and ocean)', () => {
    expect(REGIONS.map((r) => r.path)).toContain('globe/land_ocean');
    expect(regionUrl('africa/land', 1950, 2026)).toBe('https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/global/time-series/africa/land/1/0/1950-2026/data.csv');
  });
});
