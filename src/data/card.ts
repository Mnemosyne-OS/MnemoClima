/**
 * card.ts — the El Niño card on the board (cockpit, doc 110): NOAA's status and the latest ONI,
 * each with its date. An opinion that could not be read says so on the card, never nothing.
 * The host's limits: title 120, status 160, 4 lines of 80.
 */
import type { Discussion } from './cpc';
import type { OniRow } from './oni';

export const ENSO_CARD_ID = 'enso';

export interface EnsoCard {
  id: string;
  title: string;
  mark: { label: string; tint: null; svg: null };
  status: string;
  seenAt: null;
  lines: string[];
  tone: 'alert' | 'idle';
  snapshot: true;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface CardWords {
  title: string;
  /** "{status} · issued {date}", filled */
  status: (status: string, date: string) => string;
  unread: string;
  /** "ONI {value} °C ({season} {year})", filled */
  oni: (row: OniRow) => string;
  source: string;
}

export function ensoCard(d: Discussion | null, oni: OniRow | null, w: CardWords): EnsoCard {
  const read = d?.status && d.issued;
  const lines = [oni ? w.oni(oni) : '', d?.synopsis ?? '', w.source].filter(Boolean).map((l) => cut(l, 80)).slice(0, 4);
  // an El Niño or La Niña under way asks for the eye; a page that could not be read too
  const alert = !read || d!.kind === 'elninoAdvisory' || d!.kind === 'laninaAdvisory';
  return {
    id: ENSO_CARD_ID,
    title: cut(w.title, 120),
    mark: { label: '🌊', tint: null, svg: null },
    status: cut(read ? w.status(d!.status!, d!.issued!) : w.unread, 160),
    seenAt: null,
    lines,
    tone: alert ? 'alert' : 'idle',
    snapshot: true,
  };
}
