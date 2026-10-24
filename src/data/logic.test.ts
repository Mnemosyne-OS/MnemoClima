import { describe, expect, it } from 'vitest';
import powerJson from './fixtures/power.json';
import oniTxt from './fixtures/oni.ascii.txt?raw';
import { analogYears, normals, recentAnomaly, summarise } from './analogs';
import { addMonths, monthAt, monthKey, monthPos, touchesMonths, type MonthValue } from './months';
import { analogPeaks, episodesOf, parseOni, type Episode } from './oni';
import { parsePower } from './power';
import { cpcChronicle, numbersFiles, oniChronicles, placeChronicles, readNumbersFile, unitsOf } from './chronicle';
import { readUserMarker, rainState } from './markers';
import { readGdacsPages } from './hazards';
import { distanceKm, formatLatLon, readPlaces } from './place';

/** Twelve months a year from `from` to `to`, every value `f(y, m)`. */
function series(from: number, to: number, f: (y: number, m: number) => number | null): MonthValue[] {
  const out: MonthValue[] = [];
  for (let y = from; y <= to; y++) for (let m = 1; m <= 12; m++) out.push({ y, m, v: f(y, m) });
  return out;
}
const peak = (y: number, m: number, v = 2): Episode => ({ kind: 'elnino', start: { y, m: 1 }, end: { y: y + 1, m: 3 }, peak: { y, m, v }, ongoing: false });

describe('months', () => {
  it('places a month on its middle and back', () => {
    expect(monthPos(1997, 7)).toBeCloseTo(1997.5417, 3);
    expect(monthAt(monthPos(1997, 12))).toEqual({ y: 1997, m: 12 });
    expect(addMonths(2015, 11, 3)).toEqual({ y: 2016, m: 2 });
    expect(addMonths(2016, 1, -1)).toEqual({ y: 2015, m: 12 });
  });
});

describe('what the map shows around the cursor', () => {
  const a = monthKey(2015, 11), b = monthKey(2016, 1);
  it('an event inside the months shows, one before or after does not', () => {
    expect(touchesMonths('2015-12-10T00:00:00Z', null, a, b)).toBe(true);
    expect(touchesMonths('2015-10-31T00:00:00Z', null, a, b)).toBe(false);
    expect(touchesMonths('2016-02-01T00:00:00Z', null, a, b)).toBe(false);
  });
  it('a drought that started before and is still running shows', () => {
    expect(touchesMonths('2015-03-01T00:00:00Z', '2016-06-30T00:00:00Z', a, b)).toBe(true);
    expect(touchesMonths('2015-03-01T00:00:00Z', '2015-09-30T00:00:00Z', a, b)).toBe(false);
  });
});

describe('normals', () => {
  it('is the 1991-2020 mean of each calendar month', () => {
    const s = series(1981, 2025, (y, m) => (y >= 1991 && y <= 2020 ? m * 10 : 999));
    const n = normals(s);
    expect(n[3]).toBe(30);
    expect(n[0]).toBeNull();
  });
  it('a month measured in fewer than half the years has no normal', () => {
    // 14 Februaries of 30: under half. 15 would be exactly half, which counts.
    const s = series(1991, 2020, (y, m) => (m === 2 && y > 2004 ? null : 10));
    expect(normals(s)[2]).toBeNull();
    expect(normals(s)[1]).toBe(10);
  });
});

describe('analogue years', () => {
  const rain = series(1981, 2025, (y, m) => (y === 2016 && m === 2 ? 25 : y === 1998 && m === 2 ? null : 100));
  it('compares each month after the peak with the normal of that month', () => {
    const years = analogYears(rain, [peak(2015, 12)], 12);
    const feb = years[0]!.cells[2]!;
    // the normal holds 2016 itself (29 Februaries measured: 28 at 100, one at 25)
    expect(normals(rain)[2]).toBeCloseTo((28 * 100 + 25) / 29, 6);
    expect(feb).toMatchObject({ offset: 2, y: 2016, m: 2, value: 25 });
    expect(feb.delta).toBeCloseTo(25 - normals(rain)[2]!, 6);
    expect(feb.pct).toBeCloseTo((25 / normals(rain)[2]!) * 100, 6);
  });
  it('a missing month is a missing cell, never a zero', () => {
    const years = analogYears(rain, [peak(1997, 12)], 12);
    expect(years[0]!.cells[2]).toMatchObject({ value: null, delta: null, pct: null });
  });
  it('counts N per month and keeps the spread, not the mean alone', () => {
    const s = summarise(analogYears(rain, [peak(2015, 12), peak(1997, 12)], 12), 12);
    expect(s[2]).toMatchObject({ n: 1, below: 1 });
    expect(s[0]!.n).toBe(2);
    expect(s[0]!.min).toBe(s[0]!.max);
  });
  it('runs on the real ONI and a real point: N is the count of strong episodes measured', () => {
    const peaks = analogPeaks(episodesOf(parseOni(oniTxt).rows), 1.5, 1981);
    const place = parsePower(powerJson)!;
    const sum = summarise(analogYears(place.rain, peaks));
    // the 2023 peak + 12 months reaches 2024-12, inside a file that ends in 2025
    expect(sum[0]!.n).toBe(peaks.length);
    expect(sum[12]!.n).toBe(peaks.length);
  });
});

describe('recent anomaly (what lights a marker)', () => {
  it('sums the last measured months against their normals', () => {
    const s = series(1991, 2020, () => 100).concat([{ y: 2026, m: 1, v: 50 }, { y: 2026, m: 2, v: 50 }, { y: 2026, m: 3, v: 50 }]);
    expect(recentAnomaly(s, 3)).toMatchObject({ pct: 50, from: { y: 2026, m: 1 }, to: { y: 2026, m: 3 } });
    expect(rainState(50)).toBe('dry');
    expect(rainState(100)).toBe('normal');
    expect(rainState(130)).toBe('wet');
  });
  it('without a normal it says nothing', () => {
    expect(recentAnomaly([{ y: 2026, m: 1, v: 10 }, { y: 2026, m: 2, v: 10 }, { y: 2026, m: 3, v: 10 }], 3)).toBeNull();
  });
});

describe('what goes into memory', () => {
  const oni = parseOni(oniTxt).rows;
  it('a finished year is one chronicle, the year under way one per month', () => {
    const units = unitsOf(oni, { y: 2026, m: 10 });
    expect(units.find((u) => u.key === '1997')!.rows).toHaveLength(12);
    expect(units.some((u) => u.key === '2026')).toBe(false);
    expect(units.some((u) => u.key === '2026-08')).toBe(true);
  });
  it('writes ONI years in the language, with its source and day', () => {
    const c = oniChronicles(oni, 'fr', '2026-10-11', { y: 2026, m: 10 }).find((x) => x.key === 'oni:1997')!;
    expect(c.content).toContain('El Niño');
    expect(c.content).toContain('NOAA Climate Prediction Center');
    expect(c.content).toContain('11 octobre 2026');
    expect(c.sourceRef).toBe('mnemo-clima:oni:1997');
  });
  it('writes a place with its normals, and a dash for a month it does not have', () => {
    const place = { id: 'p1', name: 'Finca', lat: 10.2, lon: -67 };
    const rain = series(1991, 2020, () => 100).concat([{ y: 2021, m: 1, v: null }]);
    const temp = series(1991, 2020, () => 20);
    const c = placeChronicles(place, rain, temp, 'en', '2026-10-11', { y: 2026, m: 10 }).find((x) => x.key === 'place:p1:2021')!;
    expect(c.content).toContain('Finca');
    expect(c.content).toContain('rain — mm (normal 100 mm)');
  });
  it('an opinion without date or status is not written', () => {
    expect(cpcChronicle({ issued: null, status: 'x', kind: 'other', synopsis: null }, 'u', 'en')).toBeNull();
  });
});

describe('the numbers contract (schema 1)', () => {
  it('one file per month, a missing reading is null', () => {
    const place = { id: 'p1', name: 'Finca', lat: 10.2, lon: -67 };
    const oni = parseOni(oniTxt).rows;
    const rain = series(1991, 2020, () => 100);
    const files = numbersFiles(oni, [{ place, rain, temp: [] }], '2026-10-11', 2019);
    const f = files.find((x) => x.month === '2020-05')!;
    expect(f.schema).toBe(1);
    expect(f.places[0]).toMatchObject({ rainMm: 100, rainNormalMm: 100, tempC: null, tempNormalC: null });
    expect(files.find((x) => x.month === '2026-08')!.places[0]!.rainMm).toBeNull();
  });
  it('a reader refuses a schema it does not know', () => {
    expect(readNumbersFile({ schema: 2, source: 'mnemo-clima', month: '2020-01', places: [] })).toEqual({ refused: 'UNKNOWN_SCHEMA_2' });
  });
});

describe('places and markers the person declares', () => {
  it('refuses a place outside the world and dedupes by id', () => {
    expect(readPlaces([{ id: 'a', name: 'A', lat: 10, lon: 10 }, { id: 'a', name: 'B', lat: 1, lon: 1 }, { id: 'c', name: 'C', lat: 95, lon: 0 }])).toHaveLength(1);
  });
  it('reads a user marker and refuses a built-in id or a bad role', () => {
    expect(readUserMarker({ id: 'user:1', name: 'Finca', role: 'impact', lat: 10, lon: -67, fews: 'VE' })).toMatchObject({ builtIn: false, fews: 'VE' });
    expect(readUserMarker({ id: 'guatemala', name: 'x', role: 'impact', lat: 1, lon: 1 })).toBeNull();
    expect(readUserMarker({ id: 'user:2', name: 'x', role: 'other', lat: 1, lon: 1 })).toBeNull();
  });
  it('says where a point is the way a person reads it', () => {
    expect(formatLatLon(10.2, -67)).toBe('10.20° N, 67.00° W');
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.2, 0);
  });
});

describe('GDACS pages', () => {
  const page = (n: number, from: number) => JSON.stringify({ features: Array.from({ length: n }, (_, i) => ({ geometry: { type: 'Point', coordinates: [0, 0] }, properties: { eventid: from + i, eventtype: 'DR', fromdate: '2020-01-01T00:00:00' } })) });
  it('reads every page until a short one', async () => {
    const asked: string[] = [];
    const r = await readGdacsPages(async (u) => { asked.push(u); return asked.length === 1 ? page(100, 0) : page(92, 100); }, 'https://x/SEARCH?a=1');
    expect(r.items).toHaveLength(192);
    expect(r.capped).toBe(false);
    expect(asked[1]).toBe('https://x/SEARCH?a=1&pagenumber=2');
  });
  it('says when the page limit cut the list', async () => {
    const r = await readGdacsPages(async () => page(100, 0), 'https://x/SEARCH?a=1');
    expect(r.capped).toBe(true);
  });
});

describe('disasters on the timeline', () => {
  const h = (from: string, kind: 'quake' | 'flood') => ({ id: from + kind, source: 'gdacs' as const, kind, title: 'x', lon: 0, lat: 0, from, to: null, level: null, measure: null, url: null, country: null });
  it('counts what started each month, a month in between with none is 0, outside what was read is absent', async () => {
    const { monthlyCounts } = await import('./hazards');
    const c = monthlyCounts([h('2026-01-03T00:00:00Z', 'flood'), h('2026-01-20T00:00:00Z', 'flood'), h('2026-03-01T00:00:00Z', 'flood'), h('2026-02-01T00:00:00Z', 'quake')], ['flood']);
    expect(c).toEqual([{ y: 2026, m: 1, v: 2 }, { y: 2026, m: 2, v: 0 }, { y: 2026, m: 3, v: 1 }]);
    expect(monthlyCounts([], ['flood'])).toEqual([]);
  });
});

describe('the coffee regions', () => {
  it('are built in, off until turned on, and Sidama is in FEWS NET', async () => {
    const { BUILT_IN_MARKERS, DEFAULT_ACTIVE_MARKERS } = await import('./markers');
    const coffee = BUILT_IN_MARKERS.filter((m) => m.group === 'coffee');
    expect(coffee.length).toBe(6);
    expect(coffee.some((m) => DEFAULT_ACTIVE_MARKERS.includes(m.id))).toBe(false);
    expect(coffee.find((m) => m.id === 'coffee-sidama')?.fews).toBe('ET');
  });
});
