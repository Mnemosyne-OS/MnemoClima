/**
 * chronicle.ts — what MnemoClima writes into memory, and the numbers it shares with other apps.
 *
 * Memory (doc 147 §6): prose the chat can read, each text naming its source and the day it was
 * read. One chronicle per subject and per FINISHED year; the year still running is one
 * chronicle per month, because a month once published does not change, while a year that
 * gains a month every few weeks would leave a stale copy behind at every pour (the host dedupes
 * on the exact text, not on the subject).
 *
 * Numbers (doc 147 §11): one JSON file per month, `schema: 1`, the contract with the parcels
 * cartridge. A reader that meets another schema refuses it and says so.
 */
import { normals } from './analogs';
import { byMonth, monthKey, type MonthValue } from './months';
import { phaseOf, type OniRow } from './oni';
import { formatLatLon, type Place } from './place';
import type { Discussion } from './cpc';
import { dayName, fmt, monthName, translate, type Key, type Lang } from '../i18n/strings';

export interface Chronicle {
  /** Stable name of what it covers: `oni:1997`, `oni:2026-09`, `place:<id>:2015`, `cpc:2026-10-08`. */
  key: string;
  content: string;
  sourceRef: string;
}

type T = (key: Key, vars?: Record<string, string | number>) => string;
const tFor = (lang: Lang): T => (key, vars) => translate(lang, key, vars);

/** Which unit a year is poured in: the whole year when it is over, otherwise month by month. */
export function unitsOf<T extends { y: number; m: number }>(rows: T[], now: { y: number; m: number }): { key: string; rows: T[] }[] {
  const out: { key: string; rows: T[] }[] = [];
  const years = new Map<number, T[]>();
  for (const r of rows) (years.get(r.y) ?? years.set(r.y, []).get(r.y)!).push(r);
  for (const [y, rs] of [...years.entries()].sort((a, b) => a[0] - b[0])) {
    if (y < now.y) out.push({ key: String(y), rows: rs });
    else for (const r of rs) out.push({ key: `${y}-${String(r.m).padStart(2, '0')}`, rows: [r] });
  }
  return out;
}

export function oniChronicles(rows: OniRow[], lang: Lang, readOn: string, now: { y: number; m: number }): Chronicle[] {
  const t = tFor(lang);
  return unitsOf(rows, now).map((u) => {
    const lines = u.rows.map((r) => t('chron.oniMonth', {
      month: monthName(lang, r.y, r.m),
      value: `${fmt(lang, r.v!, 2, true)} °C`,
      phase: t(`enso.phase.${phaseOf(r.v!)}` as Key),
    }));
    const year = u.rows[0]!.y;
    return {
      key: `oni:${u.key}`,
      content: [t('chron.oniYear', { year }), ...lines, t('chron.oniSource', { date: dayName(lang, readOn) })].join('\n'),
      sourceRef: `mnemo-clima:oni:${u.key}`,
    };
  });
}

export function placeChronicles(place: Place, rain: MonthValue[], temp: MonthValue[], lang: Lang, readOn: string, now: { y: number; m: number }): Chronicle[] {
  const t = tFor(lang);
  const rn = normals(rain), tn = normals(temp);
  const tLook = byMonth(temp);
  const latlon = formatLatLon(place.lat, place.lon);
  const dash = t('place.missing');
  const show = (v: number | null | undefined, d: number) => (v == null ? dash : fmt(lang, v, d));
  return unitsOf(rain, now).map((u) => {
    const lines = u.rows.map((r) => t('chron.placeMonth', {
      month: monthName(lang, r.y, r.m),
      rain: show(r.v, 0), rainNormal: show(rn[r.m], 0),
      temp: show(tLook.get(monthKey(r.y, r.m)), 1), tempNormal: show(tn[r.m], 1),
    }));
    return {
      key: `place:${place.id}:${u.key}`,
      content: [t('chron.placeYear', { name: place.name, latlon, year: u.rows[0]!.y }), ...lines, t('chron.placeSource', { date: dayName(lang, readOn) })].join('\n'),
      sourceRef: `mnemo-clima:place:${place.id}:${u.key}`,
    };
  });
}

export function cpcChronicle(d: Discussion, url: string, lang: Lang): Chronicle | null {
  if (!d.issued || !d.status) return null;
  const t = tFor(lang);
  return {
    key: `cpc:${d.issued}`,
    content: t('chron.cpc', { date: dayName(lang, d.issued), status: d.status, synopsis: d.synopsis ?? '', url }),
    sourceRef: `mnemo-clima:cpc:${d.issued}`,
  };
}

// ── the numbers, schema 1 ─────────────────────────────────────────────────

export const NUMBERS_SCHEMA = 1;

export interface NumbersFile {
  schema: typeof NUMBERS_SCHEMA;
  source: 'mnemo-clima';
  month: string;
  /** ONI of the season centred on this month, °C, or null when not published. */
  oni: number | null;
  places: { id: string; name: string; lat: number; lon: number; rainMm: number | null; rainNormalMm: number | null; tempC: number | null; tempNormalC: number | null }[];
  /** ISO day the file was written. */
  writtenOn: string;
}

export function numbersFiles(oni: OniRow[], places: { place: Place; rain: MonthValue[]; temp: MonthValue[] }[], writtenOn: string, from = 1981): NumbersFile[] {
  const oniLook = byMonth(oni);
  const prepared = places.map((p) => ({ ...p, rn: normals(p.rain), tn: normals(p.temp), rl: byMonth(p.rain), tl: byMonth(p.temp) }));
  const months = new Set<number>();
  for (const r of oni) if (r.y >= from) months.add(monthKey(r.y, r.m));
  for (const p of places) for (const r of p.rain) if (r.y >= from) months.add(monthKey(r.y, r.m));
  return [...months].sort((a, b) => a - b).map((k) => {
    const y = Math.floor(k / 100), m = k % 100;
    return {
      schema: NUMBERS_SCHEMA, source: 'mnemo-clima' as const,
      month: `${y}-${String(m).padStart(2, '0')}`,
      oni: oniLook.get(k) ?? null,
      places: prepared.map((p) => ({
        id: p.place.id, name: p.place.name, lat: p.place.lat, lon: p.place.lon,
        rainMm: p.rl.get(k) ?? null, rainNormalMm: p.rn[m] ?? null,
        tempC: p.tl.get(k) ?? null, tempNormalC: p.tn[m] ?? null,
      })),
      writtenOn,
    };
  });
}

/** What a reader of the contract does first: refuse what it does not know. */
export function readNumbersFile(x: unknown): NumbersFile | { refused: string } {
  const f = x as Partial<NumbersFile> | null;
  if (!f || typeof f !== 'object') return { refused: 'NOT_AN_OBJECT' };
  if (f.schema !== NUMBERS_SCHEMA) return { refused: `UNKNOWN_SCHEMA_${String(f.schema)}` };
  if (f.source !== 'mnemo-clima' || typeof f.month !== 'string' || !Array.isArray(f.places)) return { refused: 'MALFORMED' };
  return f as NumbersFile;
}

