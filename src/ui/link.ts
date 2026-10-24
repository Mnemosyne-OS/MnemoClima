/**
 * link.ts — the exploded view's three windows share one moment and one selection (doc 143).
 *
 * A channel named after the cartridge carries the month under the timeline's cursor, the place
 * shown, and the map pick a panel asked for. The rules of doc 143, kept small:
 *  - the origin is shared with other cartridges, so every message is checked field by field and
 *    an unknown one is ignored, never trusted;
 *  - a window never applies its own message back (each has an id);
 *  - nothing here is stored: the windows only echo what the person is doing now.
 */
export type LinkMessage =
  /** The month under the cursor; `span` (years) or `factor` (a zoom step) frames the timeline too. */
  | { kind: 'cursor'; t: number; span?: number; factor?: number }
  | { kind: 'place'; id: string | null }
  | { kind: 'pick'; on: boolean; purpose: 'place' | 'marker' }
  | { kind: 'picked'; lat: number; lon: number; purpose: 'place' | 'marker' }
  /** The settings after a change in another window, re-read field by field on arrival (store.ts). */
  | { kind: 'settings'; settings: unknown }
  | { kind: 'hazardKind'; value: string }
  /** The map drawn as a globe or flat, asked from the panel (an agent): the map window follows. */
  | { kind: 'globe'; on: boolean };

const CHANNEL = 'mnemo-clima:board';
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function readLinkMessage(x: unknown): LinkMessage | null {
  const m = x as Record<string, unknown> | null;
  if (!m || typeof m !== 'object') return null;
  switch (m.kind) {
    case 'cursor': {
      if (!finite(m.t) || m.t <= 1800 || m.t >= 2200) return null;
      // a frame that does not read is dropped, the month still goes
      const span = finite(m.span) && m.span >= 0.5 && m.span <= 400 ? m.span : undefined;
      const factor = finite(m.factor) && m.factor >= 0.1 && m.factor <= 10 ? m.factor : undefined;
      return { kind: 'cursor', t: m.t, ...(span !== undefined ? { span } : {}), ...(factor !== undefined ? { factor } : {}) };
    }
    case 'place': return m.id === null || typeof m.id === 'string' ? { kind: 'place', id: m.id as string | null } : null;
    case 'pick': return typeof m.on === 'boolean' && (m.purpose === 'place' || m.purpose === 'marker') ? { kind: 'pick', on: m.on, purpose: m.purpose } : null;
    case 'picked':
      return finite(m.lat) && finite(m.lon) && Math.abs(m.lat) <= 90 && Math.abs(m.lon) <= 180 && (m.purpose === 'place' || m.purpose === 'marker')
        ? { kind: 'picked', lat: m.lat, lon: m.lon, purpose: m.purpose } : null;
    case 'hazardKind': return typeof m.value === 'string' && /^(all|cyclone|flood|drought|quake|volcano|fire|storm|ice|other)$/.test(m.value) ? { kind: 'hazardKind', value: m.value } : null;
    case 'globe': return typeof m.on === 'boolean' ? { kind: 'globe', on: m.on } : null;
    case 'settings': return m.settings && typeof m.settings === 'object' ? { kind: 'settings', settings: m.settings } : null;
    default: return null;
  }
}

export interface Link { send: (m: LinkMessage) => void; close: () => void }

/** Opens the channel; `onMessage` hears the OTHER windows only. No channel (old runtime) = a link that sends nowhere. */
export function openLink(onMessage: (m: LinkMessage) => void): Link {
  if (typeof BroadcastChannel === 'undefined') return { send: () => undefined, close: () => undefined };
  const me = Math.random().toString(36).slice(2);
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (ev: MessageEvent) => {
    const d = ev.data as { from?: unknown; msg?: unknown } | null;
    if (!d || d.from === me) return;
    const m = readLinkMessage(d.msg);
    if (m) onMessage(m);
  };
  return {
    send: (msg) => { try { ch.postMessage({ from: me, msg }); } catch (err) { console.warn('[MnemoClima] board message not sent', err); } },
    close: () => ch.close(),
  };
}
