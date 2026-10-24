/**
 * fewsnet.ts — FEWS NET's food-security classification (IPC phases), the measure behind an
 * "impact" marker (doc 147 §10.3). Data API https://fdw.fews.net, `data_usage_policy: Public`.
 *
 * FEWS NET covers its own countries only (Africa, Central America, Haiti, part of Asia). A
 * country outside it has no line; that is never "no crisis". A projection (ML1, ML2) is not a
 * measure and is labelled as one, with the date it was made.
 *
 * Measured 11/10: `fnid=<ISO2>` keeps the country-level rows only (12 for Guatemala since
 * June 2025, against 13 078 with `country_code`, which mixes every sub-national unit);
 * `unit_type` is ignored, and an `ordering` query answers 202 and never 200. Rows come back in
 * no promised order, so they are sorted here.
 */
export const fewsUrl = (iso2: string, sinceIso: string, page = 500): string =>
  `https://fdw.fews.net/api/ipcphase/?fnid=${encodeURIComponent(iso2)}&start_date=${sinceIso.slice(0, 10)}&format=json&page_size=${page}`;

export type Scenario = 'current' | 'projection';

export interface IpcRow {
  start: string;
  end: string;
  scenario: Scenario;
  /** 1 Minimal, 2 Stressed, 3 Crisis, 4 Emergency, 5 Famine. */
  phase: number;
  label: string;
  /** When the projection was made (its collection date), for a projection. */
  madeOn: string | null;
}

export function parseFews(json: unknown): { rows: IpcRow[]; dropped: number } {
  const res = (json as { results?: unknown[] })?.results;
  if (!Array.isArray(res)) return { rows: [], dropped: 0 };
  const rows: IpcRow[] = [];
  let dropped = 0;
  for (const r of res) {
    const x = r as Record<string, unknown>;
    const phase = typeof x.value === 'number' ? Math.round(x.value) : NaN;
    const start = typeof x.projection_start === 'string' ? x.projection_start : '';
    const end = typeof x.projection_end === 'string' ? x.projection_end : '';
    const sc = typeof x.scenario === 'string' ? x.scenario : '';
    // sub-national rows (admin1, admin2, livelihood zones) are not the country's line
    if (x.unit_type !== 'admin0') continue;
    if (!(phase >= 1 && phase <= 5) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !end || !sc) { dropped++; continue; }
    const scenario: Scenario = sc === 'CS' ? 'current' : 'projection';
    rows.push({
      start, end, scenario, phase,
      label: typeof x.description === 'string' ? x.description : String(phase),
      madeOn: scenario === 'projection' && typeof x.reporting_date === 'string' ? x.reporting_date : null,
    });
  }
  // newest first; on the same month and scenario the higher phase first (the "highest household" reading)
  rows.sort((a, b) => b.start.localeCompare(a.start) || (a.scenario === b.scenario ? b.phase - a.phase : a.scenario === 'current' ? -1 : 1));
  return { rows, dropped };
}

/** The latest CURRENT situation, and the latest projection made after it (if any). */
export function latestIpc(rows: IpcRow[]): { current: IpcRow | null; projection: IpcRow | null } {
  const current = rows.find((r) => r.scenario === 'current') ?? null;
  const projection = rows.find((r) => r.scenario === 'projection' && (!current || r.start > current.start)) ?? null;
  return { current, projection };
}
