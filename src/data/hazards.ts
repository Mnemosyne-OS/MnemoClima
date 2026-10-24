/**
 * hazards.ts — natural events from three open networks, brought to one shape for the map.
 *
 *  - GDACS (UN/EU Global Disaster Alert and Coordination System): alerts with a level, droughts
 *    and floods included. Credit: "GDACS, European Commission Joint Research Centre".
 *  - NASA EONET: natural events in progress (storms, fires, volcanoes, ice).
 *  - USGS: earthquakes, GeoJSON (public domain).
 *
 * All three answer with CORS open, so the cartridge reads them directly. A record without a
 * readable place or date is dropped and COUNTED: the screen says how many (doc 147 §2).
 */
export type HazardKind = 'cyclone' | 'flood' | 'drought' | 'quake' | 'volcano' | 'fire' | 'storm' | 'ice' | 'other';
export type HazardSource = 'gdacs' | 'eonet' | 'usgs' | 'ibtracs';
export type Level = 'green' | 'orange' | 'red';

export interface Hazard {
  id: string;
  source: HazardSource;
  kind: HazardKind;
  title: string;
  lon: number;
  lat: number;
  /** ISO start of the event. */
  from: string;
  /** ISO end, when the source gives one. */
  to: string | null;
  level: Level | null;
  /** A short measure as the source states it ("M 6.2", "250 km/h"). */
  measure: string | null;
  url: string | null;
  country: string | null;
}

export interface HazardParse { items: Hazard[]; dropped: number }

export const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=DR;FL;TC;EQ;VO;WF&alertlevel=Orange;Red';
export const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200';
export const usgsUrl = (sinceIso: string, minMag = 6): string =>
  `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=${minMag}&starttime=${sinceIso.slice(0, 10)}&orderby=time`;
/** GDACS droughts and floods over a span: the history the map draws behind the present. */
export const gdacsHistoryUrl = (types: string, fromIso: string, toIso: string): string =>
  `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=${types}&alertlevel=Orange;Red&fromDate=${fromIso.slice(0, 10)}&toDate=${toIso.slice(0, 10)}`;

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isoOr = (x: unknown): string | null => {
  if (typeof x === 'string' && !Number.isNaN(Date.parse(x))) return new Date(Date.parse(x.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(x) ? x : `${x}Z`)).toISOString();
  if (isNum(x)) return new Date(x).toISOString();
  return null;
};
const levelOf = (x: unknown): Level | null => {
  const s = typeof x === 'string' ? x.toLowerCase() : '';
  return s === 'green' || s === 'orange' || s === 'red' ? s : null;
};

const GDACS_KIND: Record<string, HazardKind> = { TC: 'cyclone', FL: 'flood', DR: 'drought', EQ: 'quake', VO: 'volcano', WF: 'fire' };

/** A point for a geometry: a Point as is, anything else by the centre of its coordinates. */
function pointOf(g: unknown): [number, number] | null {
  const geo = g as { type?: string; coordinates?: unknown } | null;
  if (!geo) return null;
  if (geo.type === 'Point' && Array.isArray(geo.coordinates) && isNum(geo.coordinates[0]) && isNum(geo.coordinates[1])) {
    return [geo.coordinates[0], geo.coordinates[1]];
  }
  const flat: number[] = [];
  const walk = (c: unknown) => { if (Array.isArray(c)) { if (c.length >= 2 && isNum(c[0]) && isNum(c[1])) flat.push(c[0], c[1]); else c.forEach(walk); } };
  walk(geo.coordinates);
  if (flat.length < 2) return null;
  let x = 0, y = 0;
  for (let i = 0; i < flat.length; i += 2) { x += flat[i]!; y += flat[i + 1]!; }
  return [x / (flat.length / 2), y / (flat.length / 2)];
}

export function parseGdacs(json: unknown): HazardParse {
  const fs = (json as { features?: unknown[] })?.features;
  if (!Array.isArray(fs)) return { items: [], dropped: 0 };
  const items: Hazard[] = [];
  let dropped = 0;
  for (const f of fs) {
    const p = (f as { properties?: Record<string, unknown> })?.properties ?? {};
    const pt = pointOf((f as { geometry?: unknown })?.geometry);
    const from = isoOr(p.fromdate);
    if (!pt || !from || p.eventid == null) { dropped++; continue; }
    const sev = p.severitydata as { severity?: unknown; severityunit?: unknown } | undefined;
    const url = (p.url as { report?: unknown } | undefined)?.report;
    items.push({
      id: `gdacs:${String(p.eventtype)}:${String(p.eventid)}`,
      source: 'gdacs',
      kind: GDACS_KIND[String(p.eventtype)] ?? 'other',
      title: typeof p.name === 'string' ? p.name : typeof p.description === 'string' ? p.description : String(p.eventid),
      lon: pt[0], lat: pt[1], from, to: isoOr(p.todate),
      level: levelOf(p.alertlevel),
      measure: sev && isNum(sev.severity) && typeof sev.severityunit === 'string' && sev.severityunit ? `${Math.round(sev.severity)} ${sev.severityunit}` : null,
      url: typeof url === 'string' ? url : null,
      country: typeof p.country === 'string' && p.country ? p.country : null,
    });
  }
  return { items, dropped };
}

const EONET_KIND: Record<string, HazardKind> = {
  severeStorms: 'storm', wildfires: 'fire', volcanoes: 'volcano', floods: 'flood', drought: 'drought',
  earthquakes: 'quake', seaLakeIce: 'ice', snow: 'ice', landslides: 'other', dustHaze: 'other', tempExtremes: 'other', waterColor: 'other', manmade: 'other',
};

export function parseEonet(json: unknown): HazardParse {
  const evs = (json as { events?: unknown[] })?.events;
  if (!Array.isArray(evs)) return { items: [], dropped: 0 };
  const items: Hazard[] = [];
  let dropped = 0;
  for (const e of evs) {
    const ev = e as { id?: unknown; title?: unknown; link?: unknown; categories?: { id?: unknown }[]; geometry?: { date?: unknown; type?: string; coordinates?: unknown; magnitudeValue?: unknown; magnitudeUnit?: unknown }[]; closed?: unknown };
    const geos = Array.isArray(ev.geometry) ? ev.geometry : [];
    const last = geos[geos.length - 1];
    const first = geos[0];
    const pt = last ? pointOf(last) : null;
    const from = first ? isoOr(first.date) : null;
    if (!pt || !from || typeof ev.id !== 'string') { dropped++; continue; }
    const cat = String(ev.categories?.[0]?.id ?? '');
    let kind = EONET_KIND[cat] ?? 'other';
    // EONET files hurricanes and typhoons under severe storms; their titles say which they are.
    if (kind === 'storm' && typeof ev.title === 'string' && /hurricane|typhoon|cyclone/i.test(ev.title)) kind = 'cyclone';
    items.push({
      id: `eonet:${ev.id}`, source: 'eonet', kind,
      title: typeof ev.title === 'string' ? ev.title : ev.id,
      // still open (closed = null): it lasts at least until its latest reading, never one day
      lon: pt[0], lat: pt[1], from, to: isoOr(ev.closed) ?? (last ? isoOr(last.date) : null),
      level: null,
      measure: last && isNum(last.magnitudeValue) && typeof last.magnitudeUnit === 'string' ? `${last.magnitudeValue} ${last.magnitudeUnit}` : null,
      url: typeof ev.link === 'string' ? ev.link : null,
      country: null,
    });
  }
  return { items, dropped };
}

export function parseUsgs(json: unknown): HazardParse {
  const fs = (json as { features?: unknown[] })?.features;
  if (!Array.isArray(fs)) return { items: [], dropped: 0 };
  const items: Hazard[] = [];
  let dropped = 0;
  for (const f of fs) {
    const ft = f as { id?: unknown; properties?: Record<string, unknown>; geometry?: unknown };
    const p = ft.properties ?? {};
    const pt = pointOf(ft.geometry);
    const from = isoOr(p.time);
    if (!pt || !from || typeof ft.id !== 'string') { dropped++; continue; }
    items.push({
      id: `usgs:${ft.id}`, source: 'usgs', kind: 'quake',
      title: typeof p.place === 'string' ? p.place : typeof p.title === 'string' ? p.title : ft.id,
      lon: pt[0], lat: pt[1], from, to: null,
      level: levelOf(p.alert),
      measure: isNum(p.mag) ? `M ${p.mag.toFixed(1)}` : null,
      url: typeof p.url === 'string' ? p.url : null,
      country: null,
    });
  }
  return { items, dropped };
}

/** GDACS answers 100 events a page (measured 11/10: 100 + 92 for droughts and floods since 2018). */
export const GDACS_PAGE = 100;
const GDACS_MAX_PAGES = 30;

/**
 * Every page of a GDACS search, until a page comes back short. A last page still full at the
 * page limit is reported as `capped`: the list is then the newest part, and the screen says so.
 */
export async function readGdacsPages(read: (url: string) => Promise<string>, url: string): Promise<HazardParse & { capped: boolean }> {
  const items: Hazard[] = [];
  let dropped = 0;
  for (let page = 1; page <= GDACS_MAX_PAGES; page++) {
    const { items: got, dropped: d } = parseGdacs(JSON.parse(await read(page === 1 ? url : `${url}&pagenumber=${page}`)));
    items.push(...got);
    dropped += d;
    if (got.length + d < GDACS_PAGE) return { items, dropped, capped: false };
  }
  return { items, dropped, capped: true };
}

/**
 * How many events started each month, for the timeline. Only what was READ is counted: a month
 * outside what the sources covered is absent (no bar), never a month with no disaster.
 */
export function monthlyCounts(items: Hazard[], kinds?: HazardKind[]): { y: number; m: number; v: number | null }[] {
  const counts = new Map<number, number>();
  for (const h of items) {
    if (kinds && !kinds.includes(h.kind)) continue;
    const k = Number(h.from.slice(0, 4)) * 100 + Number(h.from.slice(5, 7));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort((a, b) => a - b);
  if (keys.length === 0) return [];
  const out: { y: number; m: number; v: number | null }[] = [];
  for (let k = keys[0]!; k <= keys[keys.length - 1]!; k = (k % 100 === 12 ? (Math.floor(k / 100) + 1) * 100 + 1 : k + 1)) {
    out.push({ y: Math.floor(k / 100), m: k % 100, v: counts.get(k) ?? 0 });
  }
  return out;
}

/** One event reported by two networks stays two dots: the sources are kept apart, never merged on a guess. */
export function byTime(items: Hazard[]): Hazard[] {
  return [...items].sort((a, b) => b.from.localeCompare(a.from));
}
