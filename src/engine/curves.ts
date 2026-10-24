/**
 * curves.ts — what the timeline draws for a lane, pure: the range of a lane, the colour of a
 * month, the ticks of the ruler at any zoom, the climate's own timeline range.
 */
import { monthPos, type MonthValue } from '../data/months';
import { centreOn, type View, type ViewRange } from '@mnemosyne_os/timeline-map/view';

/** 1850 to the month under way: the climate's timeline, down to half a year across. */
export function climaRange(now = new Date()): ViewRange {
  const end = now.getUTCFullYear() + (now.getUTCMonth() + 1) / 12;
  return { minSpan: 0.5, maxSpan: end - 1850 + 2, centre: { min: 1850, max: end } };
}

export type LaneKind = 'oni' | 'anomaly' | 'pct' | 'count';

export interface Lane {
  id: string;
  label: string;
  kind: LaneKind;
  series: MonthValue[];
  /** Half the height of the lane in the series' unit: ±3 °C for the ONI, ±200 % for rain. */
  scale: number;
  /** How a value reads under the cursor. */
  format: (v: number) => string;
}

/** The value a bar is drawn from: anomalies as they are, a % of normal as its distance to 100. */
export const barValue = (kind: LaneKind, v: number): number => (kind === 'pct' ? v - 100 : v);

/** A bar's colour: the ONI by phase, the rest by sign (red above, blue below). */
export function barColour(kind: LaneKind, v: number, alpha = 0.85): string {
  const b = barValue(kind, v);
  // a count of events: one colour, the taller the more
  if (kind === 'count') return `hsla(28, 90%, 58%, ${alpha})`;
  if (kind === 'oni') {
    if (v >= 0.5) return `hsla(4, 80%, ${v >= 1.5 ? 50 : 60}%, ${alpha})`;
    if (v <= -0.5) return `hsla(214, 80%, ${v <= -1.5 ? 50 : 62}%, ${alpha})`;
    return `hsla(220, 8%, 60%, ${alpha * 0.6})`;
  }
  // rain under its normal is the drought side: brown, over it green-blue
  if (kind === 'pct') return b < 0 ? `hsla(30, 70%, 52%, ${alpha})` : `hsla(178, 60%, 45%, ${alpha})`;
  return b >= 0 ? `hsla(4, 75%, 58%, ${alpha})` : `hsla(214, 75%, 60%, ${alpha})`;
}

/** The value under a timeline position: the month it falls in, or null (not measured, or outside). */
export function valueAt(series: MonthValue[], t: number): number | null {
  const y = Math.floor(t), m = Math.min(12, Math.max(1, Math.floor((t - y) * 12) + 1));
  // series are in month order: a binary search keeps the cursor cheap on 2 000 months
  let lo = 0, hi = series.length - 1;
  const key = y * 12 + m;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const k = series[mid]!.y * 12 + series[mid]!.m;
    if (k === key) return series[mid]!.v;
    if (k < key) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}

/** The ruler: years when they fit, months when a year is wide. Positions are timeline years. */
export function ticksFor(y0: number, y1: number, width: number): { t: number; major: boolean; label: string | null }[] {
  const pxPerYear = width / Math.max(1e-9, y1 - y0);
  const out: { t: number; major: boolean; label: string | null }[] = [];
  if (pxPerYear >= 240) {
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let m = 1; m <= 12; m++) {
        const t = y + (m - 1) / 12;
        if (t < y0 || t > y1) continue;
        out.push({ t, major: m === 1, label: m === 1 ? String(y) : null });
      }
    }
    return out;
  }
  const steps = [1, 2, 5, 10, 20, 25, 50];
  const step = steps.find((s) => s * pxPerYear >= 64) ?? 50;
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) out.push({ t: y, major: true, label: String(y) });
  return out;
}

/** Where a month's bar starts on the timeline (its first day), and its width in years. */
export const barSpan = (p: { y: number; m: number }): { t0: number; w: number } => ({ t0: monthPos(p.y, p.m) - 0.5 / 12, w: 1 / 12 });

/** The view a timeline opens on: the last 12 years, the cursor on the latest month. */
export function openingView(now = new Date()): View {
  const r = climaRange(now);
  return centreOn(r.centre.max - 1 / 24, 12, r);
}
