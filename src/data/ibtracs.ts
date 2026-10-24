/**
 * ibtracs.ts — tropical cyclone tracks from NOAA NCEI IBTrACS v04r01 (public domain).
 *
 * The CSV has a units row under its header, and blank cells written as a single space. Only the
 * columns the map draws are read: id, season, basin, name, time, position, WMO wind. A track's
 * strongest wind is its own maximum over the WMO column; an absent wind is unknown, never 0.
 *
 * The file of the last three years is ~11 MB with CORS open: the iframe reads it directly, by a
 * gesture (doc 147 §3), never on opening.
 */
export const IBTRACS_BASE = 'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/';
export const IBTRACS_FILES = {
  last3years: 'ibtracs.last3years.list.v04r01.csv',
  since1980: 'ibtracs.since1980.list.v04r01.csv',
} as const;
export type IbtracsFile = keyof typeof IBTRACS_FILES;

export interface TrackPoint { lon: number; lat: number; t: string; wind: number | null }
export interface Track {
  sid: string;
  name: string | null;
  season: number;
  basin: string;
  points: TrackPoint[];
  /** Strongest WMO wind of the track, knots; null when no point carries one. */
  maxWind: number | null;
}

export interface TrackParse { tracks: Track[]; dropped: number }

export function parseIbtracs(csv: string): TrackParse {
  const lines = csv.split(/\r?\n/);
  const header = lines[0]?.split(',') ?? [];
  const col = (name: string) => header.indexOf(name);
  const iSid = col('SID'), iSeason = col('SEASON'), iBasin = col('BASIN'), iName = col('NAME'), iTime = col('ISO_TIME'), iLat = col('LAT'), iLon = col('LON'), iWind = col('WMO_WIND');
  if ([iSid, iSeason, iBasin, iName, iTime, iLat, iLon].some((i) => i < 0)) return { tracks: [], dropped: 0 };
  const map = new Map<string, Track>();
  let dropped = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const c = line.split(',');
    const sid = c[iSid]?.trim() ?? '';
    // the units row starts with a blank SID
    if (!sid) continue;
    const lat = Number(c[iLat]), lon = Number(c[iLon]), season = Number(c[iSeason]);
    const t = c[iTime]?.trim() ?? '';
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isInteger(season) || !t) { dropped++; continue; }
    const w = iWind >= 0 ? c[iWind]?.trim() : '';
    const wind = w && Number.isFinite(Number(w)) ? Number(w) : null;
    let tr = map.get(sid);
    if (!tr) {
      const name = c[iName]?.trim() ?? '';
      tr = { sid, name: name && name !== 'NOT_NAMED' ? name : null, season, basin: c[iBasin]?.trim() || '?', points: [], maxWind: null };
      map.set(sid, tr);
    }
    tr.points.push({ lon: lon > 180 ? lon - 360 : lon, lat, t: `${t.replace(' ', 'T')}Z`, wind });
    if (wind != null && (tr.maxWind == null || wind > tr.maxWind)) tr.maxWind = wind;
  }
  return { tracks: [...map.values()], dropped };
}

/** Saffir-Simpson category from knots, for the colour of a track (0 = tropical storm, null = unknown). */
export function categoryOf(kt: number | null): number | null {
  if (kt == null) return null;
  if (kt >= 137) return 5;
  if (kt >= 113) return 4;
  if (kt >= 96) return 3;
  if (kt >= 83) return 2;
  if (kt >= 64) return 1;
  return 0;
}
