/**
 * oni.ts — the Oceanic Niño Index (NOAA CPC), and the El Niño / La Niña episodes it defines.
 *
 * Source: https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt (public domain). One line per
 * overlapping 3-month season: `DJF 1950  25.01  -1.32` = season, year, mean SST of Niño-3.4,
 * anomaly. A season is placed on its MIDDLE month (DJF 1950 = January 1950, NDJ 1950 =
 * December 1950).
 *
 * 🪤 This is the classic ONI. The CPC now states its thresholds in RONI (relative ONI: minus
 * the mean tropical warming), e.g. "+2.5 RONI" for a historic event. Never compare a RONI
 * threshold with a value from this file, never draw both on one curve (doc 147 §0).
 */
import { monthKey, num, type MonthValue } from './months';

export const ONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';

const SEASONS = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ'] as const;
export type Season = (typeof SEASONS)[number];

export interface OniRow extends MonthValue {
  season: Season;
  /** Mean Niño-3.4 temperature of the season, °C. */
  total: number | null;
}

export interface OniParse { rows: OniRow[]; dropped: number }

/** Read the CPC file. A line that is not a season row is skipped; a malformed season row is counted. */
export function parseOni(text: string): OniParse {
  const rows: OniRow[] = [];
  let dropped = 0;
  for (const line of text.split(/\r?\n/)) {
    const cells = line.trim().split(/\s+/);
    if (cells.length < 4) continue;
    const idx = SEASONS.indexOf(cells[0] as Season);
    if (idx < 0) continue; // the header, or anything else that is not a season
    const y = Number(cells[1]);
    const anom = num(cells[3]);
    if (!Number.isInteger(y) || anom == null) { dropped++; continue; }
    rows.push({ season: cells[0] as Season, y, m: idx + 1, total: num(cells[2]), v: anom });
  }
  rows.sort((a, b) => monthKey(a.y, a.m) - monthKey(b.y, b.m));
  return { rows, dropped };
}

export type Phase = 'elnino' | 'lanina' | 'neutral';
export type Strength = 'weak' | 'moderate' | 'strong' | 'veryStrong';

/** ±0.5 °C is the CPC's threshold for one season. */
export function phaseOf(anom: number): Phase {
  if (anom >= 0.5) return 'elnino';
  if (anom <= -0.5) return 'lanina';
  return 'neutral';
}

/** The conventional bands on |ONI|: 0.5, 1.0, 1.5, 2.0. Null under the threshold. */
export function strengthOf(anom: number): Strength | null {
  const a = Math.abs(anom);
  if (a >= 2.0) return 'veryStrong';
  if (a >= 1.5) return 'strong';
  if (a >= 1.0) return 'moderate';
  if (a >= 0.5) return 'weak';
  return null;
}

export interface Episode {
  kind: 'elnino' | 'lanina';
  start: { y: number; m: number };
  end: { y: number; m: number };
  peak: { y: number; m: number; v: number };
  /** True when the last season of the file is still in it: the episode has not ended. */
  ongoing: boolean;
}

/**
 * Episodes by the CPC's rule: at least 5 consecutive overlapping seasons at or beyond ±0.5.
 * Consecutive means consecutive months in the file; a gap in the file ends a run.
 */
export function episodesOf(rows: OniRow[], minSeasons = 5): Episode[] {
  const out: Episode[] = [];
  let run: OniRow[] = [];
  let kind: Phase = 'neutral';
  const flush = (ongoing: boolean) => {
    if (kind !== 'neutral' && run.length >= minSeasons) {
      let peak = run[0]!;
      for (const r of run) if (Math.abs(r.v!) > Math.abs(peak.v!)) peak = r;
      out.push({
        kind, ongoing,
        start: { y: run[0]!.y, m: run[0]!.m },
        end: { y: run[run.length - 1]!.y, m: run[run.length - 1]!.m },
        peak: { y: peak.y, m: peak.m, v: peak.v! },
      });
    }
    run = [];
    kind = 'neutral';
  };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const p = phaseOf(r.v!);
    const prev = run[run.length - 1];
    const contiguous = prev ? monthKey(r.y, r.m) === nextKey(prev) : true;
    if (p === 'neutral' || p !== kind || !contiguous) flush(false);
    if (p !== 'neutral') { kind = p; run.push(r); }
  }
  flush(true);
  return out;
}

const nextKey = (r: { y: number; m: number }): number => (r.m === 12 ? monthKey(r.y + 1, 1) : monthKey(r.y, r.m + 1));

/**
 * The El Niño episodes that are analogues: finished, peaking at `minPeak` or more, and peaking
 * after `since` (the first year the place's measurements exist). The ongoing episode is never
 * its own analogue.
 */
export function analogPeaks(episodes: Episode[], minPeak = 1.5, since = 1981): Episode[] {
  return episodes.filter((e) => e.kind === 'elnino' && !e.ongoing && e.peak.v >= minPeak && e.peak.y >= since);
}

/**
 * The run the file ENDS in: the seasons at or beyond the threshold up to the last one, even
 * fewer than 5. Measured 11/10: the 2026 warming had 4 seasons (AMJ → JAS) at +0.95, +1.39,
 * +1.80, +2.16, so by the CPC's rule it is not an episode yet, while the CPC's own status says
 * El Niño Advisory. The screen shows both, each under its own name.
 */
export function currentRun(rows: OniRow[]): { kind: 'elnino' | 'lanina'; seasons: number; start: { y: number; m: number }; peak: { y: number; m: number; v: number } } | null {
  const last = rows[rows.length - 1];
  if (!last) return null;
  const kind = phaseOf(last.v!);
  if (kind === 'neutral') return null;
  let i = rows.length - 1;
  let peak = last;
  while (i > 0) {
    const prev = rows[i - 1]!;
    if (phaseOf(prev.v!) !== kind || nextKey(prev) !== monthKey(rows[i]!.y, rows[i]!.m)) break;
    i--;
    if (Math.abs(prev.v!) > Math.abs(peak.v!)) peak = prev;
  }
  return { kind, seasons: rows.length - i, start: { y: rows[i]!.y, m: rows[i]!.m }, peak: { y: peak.y, m: peak.m, v: peak.v! } };
}

/** The latest season of the file, with its phase. */
export function latestOni(rows: OniRow[]): OniRow | null {
  return rows.length ? rows[rows.length - 1]! : null;
}
