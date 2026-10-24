/**
 * months.ts — a value per month, the unit every source here is brought to.
 *
 * A missing month is `null`, never 0 (doc 147 §2): a gap in a rain curve drawn as a dry month
 * would be the cartridge inventing a drought.
 */

export interface MonthValue {
  /** Calendar year. */
  y: number;
  /** Month 1..12. */
  m: number;
  /** The reading, or null when the source has none for this month. */
  v: number | null;
}

/** A month as a position on the timeline: its middle, in fractional years (July 1997 = 1997.54). */
export const monthPos = (y: number, m: number): number => y + (m - 0.5) / 12;

/** The month a timeline position falls in. */
export function monthAt(t: number): { y: number; m: number } {
  const y = Math.floor(t);
  const m = Math.min(12, Math.max(1, Math.floor((t - y) * 12) + 1));
  return { y, m };
}

/** A sortable key, 199707. */
export const monthKey = (y: number, m: number): number => y * 100 + m;

/** Add `n` months (may be negative). */
export function addMonths(y: number, m: number, n: number): { y: number; m: number } {
  const i = y * 12 + (m - 1) + n;
  return { y: Math.floor(i / 12), m: (((i % 12) + 12) % 12) + 1 };
}

/** Days in a month (proleptic Gregorian). */
export const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A lookup by month for a series. */
export function byMonth(series: MonthValue[]): Map<number, number | null> {
  const out = new Map<number, number | null>();
  for (const p of series) out.set(monthKey(p.y, p.m), p.v);
  return out;
}

/** The last month that carries a value, or null for a series with none. */
export function lastValued(series: MonthValue[]): MonthValue | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i]!.v != null) return series[i]!;
  return null;
}

/** The month key of an ISO date ("2026-10-07T…" → 202610). */
export const monthKeyOfIso = (iso: string): number => monthKey(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)));

/**
 * Whether something that runs from `fromIso` to `toIso` (or is a single date) touches the
 * months [a, b] (month keys, both included): what the map shows around the timeline's cursor.
 */
export function touchesMonths(fromIso: string, toIso: string | null, a: number, b: number): boolean {
  const from = monthKeyOfIso(fromIso);
  const to = toIso ? monthKeyOfIso(toIso) : from;
  return from <= b && to >= a;
}

/** A finite number, or null: what every parser below turns a cell into. */
export function num(cell: string | undefined): number | null {
  if (cell == null) return null;
  const s = cell.trim();
  if (!s || s === '***') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
