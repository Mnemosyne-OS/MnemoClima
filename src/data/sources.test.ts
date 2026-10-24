/**
 * The readers against the sources' REAL answers, saved on 2026-10-11 (fixtures/). A test written
 * on an invented sample would pass on a format nobody serves.
 */
import { describe, expect, it } from 'vitest';
import oniTxt from './fixtures/oni.ascii.txt?raw';
import pdoTxt from './fixtures/pdo.data?raw';
import dmiTxt from './fixtures/dmi.data?raw';
import gisCsv from './fixtures/gistemp.csv?raw';
import discHtml from './fixtures/ensodisc.html?raw';
import ibCsv from './fixtures/ibtracs.head.csv?raw';
import sstJson from './fixtures/sst.json';
import ersstJson from './fixtures/ersst.json';
import powerJson from './fixtures/power.json';
import gdacsJson from './fixtures/gdacs.json';
import eonetJson from './fixtures/eonet.json';
import usgsJson from './fixtures/usgs.json';
import fewsJson from './fixtures/fewsnet.json';
import { analogPeaks, currentRun, episodesOf, latestOni, parseOni, phaseOf, strengthOf } from './oni';
import { parseGistemp, parsePslTable } from './indices';
import { classify, parseDiscussion, parseIssued } from './cpc';
import { anomalyColour, ersstUrl, parseSst, sstUrl } from './sst';
import { parsePower, powerUrl } from './power';
import { parseEonet, parseGdacs, parseUsgs } from './hazards';
import { categoryOf, parseIbtracs } from './ibtracs';
import { fewsUrl, latestIpc, parseFews } from './fewsnet';

describe('ONI (NOAA CPC)', () => {
  const { rows, dropped } = parseOni(oniTxt);
  it('reads every season since DJF 1950, on its middle month', () => {
    expect(dropped).toBe(0);
    expect(rows[0]).toMatchObject({ season: 'DJF', y: 1950, m: 1, v: -1.32 });
    expect(latestOni(rows)).toMatchObject({ season: 'JAS', y: 2026, m: 8, v: 2.16 });
  });
  it('finds the El Niño episodes by the 5-season rule', () => {
    const eps = episodesOf(rows);
    const p97 = eps.find((e) => e.kind === 'elnino' && e.peak.y === 1997);
    expect(p97?.peak.v).toBeGreaterThanOrEqual(2.2);
    // 2026 has 4 seasons over +0.5 (AMJ → JAS): not an episode by the rule yet
    expect(eps.some((e) => e.start.y === 2026)).toBe(false);
  });
  it('names the run the file ends in, even under 5 seasons', () => {
    expect(currentRun(rows)).toEqual({ kind: 'elnino', seasons: 4, start: { y: 2026, m: 5 }, peak: { y: 2026, m: 8, v: 2.16 } });
  });
  it('flags an episode the file ends in as ongoing', () => {
    const text = ['DJF 2000 27 0.9', 'JFM 2000 27 1.0', 'FMA 2000 27 1.2', 'MAM 2000 27 1.1', 'AMJ 2000 27 0.8'].join('\n');
    expect(episodesOf(parseOni(text).rows)[0]).toMatchObject({ kind: 'elnino', ongoing: true, peak: { y: 2000, m: 3, v: 1.2 } });
    expect(analogPeaks(episodesOf(parseOni(text).rows), 0.5, 1950)).toEqual([]);
  });
  it('never takes the episode under way as its own analogue, and keeps the strong ones since 1981', () => {
    const peaks = analogPeaks(episodesOf(rows), 1.5, 1981).map((e) => e.peak.y);
    // the 1982-83 event peaks in DJF 1983 by the ONI
    expect(peaks).toEqual([1983, 1992, 1997, 2009, 2015, 2023]);
    expect(peaks).not.toContain(2026);
    expect(peaks.every((y) => y >= 1981)).toBe(true);
    const veryStrong = analogPeaks(episodesOf(rows), 2.0, 1981).map((e) => e.peak.y);
    expect(veryStrong.length).toBeLessThan(peaks.length);
  });
  it('names phase and strength by the conventional bands', () => {
    expect(phaseOf(0.49)).toBe('neutral');
    expect(phaseOf(-0.5)).toBe('lanina');
    expect(strengthOf(2.16)).toBe('veryStrong');
    expect(strengthOf(1.5)).toBe('strong');
    expect(strengthOf(0.2)).toBeNull();
  });
  it('a gap in the file ends a run: no episode is stitched across missing seasons', () => {
    const text = ['DJF 2000 27 0.9', 'JFM 2000 27 0.9', 'FMA 2000 27 0.9', 'JAS 2000 27 0.9', 'ASO 2000 27 0.9', 'SON 2000 27 0.9'].join('\n');
    expect(episodesOf(parseOni(text).rows)).toEqual([]);
  });
});

describe('PDO, IOD (NOAA PSL) and GISTEMP', () => {
  it('turns the PSL missing marker into null and drops the unpublished tail', () => {
    const pdo = parsePslTable(pdoTxt);
    expect(pdo[0]).toEqual({ y: 1948, m: 1, v: -0.11 });
    expect(pdo[pdo.length - 1]!.v).not.toBeNull();
    expect(pdo.some((p) => p.v === -9.9)).toBe(false);
    const iod = parsePslTable(dmiTxt);
    expect(iod[0]!.y).toBe(1870);
    expect(iod.some((p) => p.v === -9999)).toBe(false);
  });
  it('reads GISTEMP monthly and leaves *** as unpublished', () => {
    const g = parseGistemp(gisCsv);
    expect(g[0]).toEqual({ y: 1880, m: 1, v: -0.19 });
    const last = g[g.length - 1]!;
    expect(last.v).not.toBeNull();
    expect(last.y).toBe(2026);
  });
});

describe("NOAA's ENSO discussion", () => {
  it('reads its date, status and synopsis by their labels', () => {
    const d = parseDiscussion(discHtml);
    expect(d.issued).toBe('2026-10-08');
    expect(d.status).toBe('El Niño Advisory');
    expect(d.kind).toBe('elninoAdvisory');
    expect(d.synopsis).toMatch(/^El Niño continues to strengthen/);
  });
  it('a page without the labels reads as unknown, never as "no alert"', () => {
    expect(parseDiscussion('<html><body>maintenance</body></html>')).toEqual({ issued: null, status: null, kind: null, synopsis: null });
  });
  it('classifies the statuses the CPC uses', () => {
    expect(classify('La Niña Watch')).toBe('laninaWatch');
    expect(classify('Final El Niño Advisory')).toBe('finalElnino');
    expect(classify('Not Active')).toBe('notActive');
    expect(parseIssued('31 Smarch 2026')).toBeNull();
  });
});

describe('ocean heat (OISST via ERDDAP)', () => {
  it('reads the grid with its day, and leaves land out', () => {
    const g = parseSst(sstJson, 40)!;
    expect(g.day).toBe('2026-09-26');
    expect(g.cells.length).toBeGreaterThan(10);
    expect(g.cells.every((c) => Number.isFinite(c.v))).toBe(true);
  });
  it('builds a query ERDDAP reads (brackets encoded, the last day)', () => {
    expect(sstUrl(2)).toContain('ncdcOisst21Agg_LonPM180.json?anom%5B(last)%5D');
    expect(sstUrl(2)).toContain('(-75):8:(75)');
  });
  it('colours heat red, cold blue, zero pale', () => {
    expect(anomalyColour(3)).toMatch(/^hsla\(4,/);
    expect(anomalyColour(-3)).toMatch(/^hsla\(214,/);
    expect(anomalyColour(0)).toContain('96%');
  });
  it('a body that is not the table is null', () => {
    expect(parseSst({ error: 'x' })).toBeNull();
  });
  it('reads a month of ERSST (its anomaly is called ssta), dated in its own month', () => {
    const g = parseSst(ersstJson, 2)!;
    expect(g.day.slice(0, 7)).toBe('1997-12');
    expect(g.cells.length).toBeGreaterThan(50);
    // December 1997: the eastern equatorial Pacific far over normal (the saved sample is a 20° grid,
    // too coarse to land on the +2 °C cells, so the bar is +1.5)
    expect(Math.max(...g.cells.filter((c) => Math.abs(c.lat) <= 6 && c.lon < -100).map((c) => c.v))).toBeGreaterThan(1.5);
  });
  it('asks ERSST for the middle of the month, the way it stamps its months', () => {
    expect(ersstUrl(1997, 12)).toContain('ssta%5B(1997-12-15)%5D');
  });
});

describe('a place (NASA POWER)', () => {
  it('turns mm/day into the month total, drops month 13, keeps -999 as missing', () => {
    const s = parsePower(powerJson)!;
    expect(s.rain.every((p) => p.m >= 1 && p.m <= 12)).toBe(true);
    expect(s.rain.length).toBe(45 * 12);
    const raw = (powerJson as unknown as { properties: { parameter: { PRECTOTCORR: Record<string, number> } } }).properties.parameter.PRECTOTCORR['198101']!;
    expect(s.rain[0]!.v).toBeCloseTo(raw * 31, 0);
    expect(s.elevation).toBeGreaterThan(0);
    const missing = parsePower({ properties: { parameter: { PRECTOTCORR: { '202001': -999 }, T2M: {} } } })!;
    expect(missing.rain[0]!.v).toBeNull();
  });
  it('asks for the agroclimatology community at the declared point', () => {
    expect(powerUrl(10.2, -67, 2026)).toContain('community=AG');
    expect(powerUrl(10.2, -67, 2026)).toContain('latitude=10.200');
  });
});

describe('disasters', () => {
  it('reads GDACS alerts with their level and country', () => {
    const { items, dropped } = parseGdacs(gdacsJson);
    expect(dropped).toBe(0);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.id).toMatch(/^gdacs:/);
  });
  it('reads EONET, and a hurricane filed under storms is a cyclone', () => {
    const { items } = parseEonet(eonetJson);
    expect(items.find((h) => /Hurricane/.test(h.title))?.kind).toBe('cyclone');
  });
  it('reads USGS earthquakes with their magnitude', () => {
    const { items } = parseUsgs(usgsJson);
    expect(items[0]!.measure).toMatch(/^M \d\.\d$/);
  });
  it('drops and counts a record without a place', () => {
    expect(parseUsgs({ features: [{ id: 'x', properties: { time: 0 }, geometry: null }] })).toEqual({ items: [], dropped: 1 });
  });
});

describe('cyclone tracks (IBTrACS)', () => {
  it('skips the units row, groups points by storm, an absent wind is unknown', () => {
    const { tracks, dropped } = parseIbtracs(ibCsv);
    expect(dropped).toBe(0);
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks[0]!.points[0]!.t).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(tracks.every((tr) => tr.points.every((p) => p.wind === null || p.wind >= 0))).toBe(true);
    expect(categoryOf(null)).toBeNull();
    expect(categoryOf(140)).toBe(5);
  });
});

describe('food security (FEWS NET)', () => {
  it('keeps the country line only, newest first, and names projections apart', () => {
    const { rows } = parseFews(fewsJson);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.start >= rows[rows.length - 1]!.start).toBe(true);
    const { current } = latestIpc(rows);
    expect(current?.scenario).toBe('current');
  });
  it('a sub-national row is not the country', () => {
    const r = parseFews({ results: [{ unit_type: 'admin2', value: 4, projection_start: '2026-01-01', projection_end: '2026-01-31', scenario: 'CS' }] });
    expect(r.rows).toEqual([]);
  });
  it('asks by fnid, the filter FEWS NET honours', () => {
    expect(fewsUrl('GT', '2025-10-11T00:00:00Z')).toContain('fnid=GT&start_date=2025-10-11');
  });
});
