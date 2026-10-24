/**
 * Verification probe (session 1596fc7a, doc 147): the cases the suite never fed its readers.
 *  - FEWS NET: the real answer of 2026-10-11 carries projections (ML1/ML2); the suite only
 *    asserted that the latest CURRENT row is current, which a reader that calls everything
 *    "current" also satisfies (mutation M16 survived). Same for the sort (M17: the fixture is
 *    already newest-first).
 *  - recentAnomaly: a month WITHOUT a normal inside the last three (M28 survived: the only test
 *    had no normal at all, which the `normal === 0` guard catches on its own).
 *  - the caps on what the person declares: 12 places, 24 markers — and what the writers in
 *    App.tsx do when the cap is reached (`.slice(-12)`: the FIRST place goes, in silence).
 *  - parseOni counts a malformed season row (the suite only asserted dropped === 0).
 */
import { describe, expect, it } from 'vitest';
import fewsJson from './fixtures/fewsnet.json';
import { latestIpc, parseFews } from './fewsnet';
import { recentAnomaly } from './analogs';
import { parseOni } from './oni';
import { readPlaces, MAX_PLACES } from './place';
import { readSettings } from '../ui/store';
import type { MonthValue } from './months';

function series(from: number, to: number, f: (y: number, m: number) => number | null): MonthValue[] {
  const out: MonthValue[] = [];
  for (let y = from; y <= to; y++) for (let m = 1; m <= 12; m++) out.push({ y, m, v: f(y, m) });
  return out;
}

describe('FEWS NET projections (probe)', () => {
  it('the real answer of 11/10 holds projections, named as such and dated', () => {
    const { rows } = parseFews(fewsJson);
    const projections = rows.filter((r) => r.scenario === 'projection');
    expect(projections.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.scenario === 'current')).toBe(true);
    const { current, projection } = latestIpc(rows);
    expect(current?.scenario).toBe('current');
    expect(projection?.scenario).toBe('projection');
    expect(projection?.madeOn).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
  it('rows handed back in any order come out newest first', () => {
    const row = (start: string, sc: string, value: number) => ({ unit_type: 'admin0', value, projection_start: start, projection_end: '2026-12-31', scenario: sc, description: 'x', reporting_date: '2026-09-01' });
    const { rows } = parseFews({ results: [row('2025-06-01', 'CS', 2), row('2026-07-01', 'CS', 3), row('2026-03-01', 'ML1', 3)] });
    expect(rows.map((r) => r.start)).toEqual(['2026-07-01', '2026-03-01', '2025-06-01']);
  });
});

describe('recentAnomaly with a month that has no normal (probe)', () => {
  it('says nothing rather than summing the months that do have one', () => {
    // every February of 1991-2020 unmeasured: no normal for February
    const s = series(1991, 2020, (_y, m) => (m === 2 ? null : 100)).concat([{ y: 2026, m: 1, v: 50 }, { y: 2026, m: 2, v: 50 }, { y: 2026, m: 3, v: 50 }]);
    expect(recentAnomaly(s, 3)).toBeNull();
  });
  it('ends at the last MEASURED month, not at the last row (POWER answers the year under way with unmeasured months)', () => {
    const s = series(1991, 2020, () => 100).concat([{ y: 2026, m: 6, v: 50 }, { y: 2026, m: 7, v: 50 }, { y: 2026, m: 8, v: 50 }, { y: 2026, m: 9, v: null }, { y: 2026, m: 10, v: null }]);
    expect(recentAnomaly(s, 3)).toMatchObject({ pct: 50, from: { y: 2026, m: 6 }, to: { y: 2026, m: 8 } });
  });
});

describe('the caps on what the person declares (probe)', () => {
  const place = (i: number) => ({ id: `p${i}`, name: `Place ${i}`, lat: i, lon: i });
  it('the reader keeps the FIRST 12 places; App.tsx savePlace keeps the LAST 12 (`.slice(-12)`): the two disagree', () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => place(i));
    expect(readPlaces(thirteen).map((p) => p.id)).toEqual(thirteen.slice(0, MAX_PLACES).map((p) => p.id));
    // what savePlace does with the same 13 (App.tsx:257)
    expect([...thirteen].slice(-12).map((p) => p.id)).toEqual(thirteen.slice(1).map((p) => p.id));
  });
  it('a 25th user marker is written by App.tsx but dropped by every re-read (host state, another window)', () => {
    const marker = (i: number) => ({ id: `user:m${i}`, name: `M ${i}`, role: 'impact', lat: 1, lon: 1, radiusKm: 100, builtIn: false });
    const s = readSettings({ userMarkers: Array.from({ length: 25 }, (_, i) => marker(i)), activeMarkers: ['user:m24'] });
    expect(s.userMarkers).toHaveLength(24);
    // the 25th was active in the writer's window; here it is gone, and its id with it
    expect(s.activeMarkers).toEqual([]);
  });
});

describe('parseOni counts what it drops (probe)', () => {
  it('a season row whose anomaly is not a number is counted, never read as 0', () => {
    const { rows, dropped } = parseOni(['DJF 2000 27.0 -0.9', 'JFM 2000 27.0 abc', 'FMA 2000 27.0 0.3'].join('\n'));
    expect(dropped).toBe(1);
    expect(rows.map((r) => r.v)).toEqual([-0.9, 0.3]);
  });
});
