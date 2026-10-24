/**
 * board.ts — the exploded view (doc 143), MnemoClio's design: the map large, the timeline and
 * its curves under it, the panel on the right. The host lays the declared windows out on a
 * desktop of their own; each window knows its part by `?widget=`.
 *
 * Seen 11/10 in the app's log: Tony's presses all came back `BOARD_FULL` (every desktop is
 * taken), shown as a raw code. As in MnemoClio, a refusal is said in words, and a full pager
 * offers « Open here »: the same three windows on the desktop the person is on.
 */
import { useCallback, useState } from 'react';
import type { Key } from '../i18n/strings';
import { HOST_TIMEOUT_MS, errText, inShell, sdk } from './host';

export type Role = 'main' | 'map' | 'timeline' | 'panel';

/** `?widget=mnemo-clima-map` → 'map'; anything else (a plain browser, the single window) → 'main'. */
export function roleOf(search: string): Role {
  const w = new URLSearchParams(search).get('widget');
  return w === 'mnemo-clima-map' ? 'map' : w === 'mnemo-clima-timeline' ? 'timeline' : w === 'mnemo-clima-panel' ? 'panel' : 'main';
}

export const BOARD_LAYOUT = [
  { id: 'mnemo-clima-map', x: 0, y: 0, w: 0.64, h: 0.62 },
  { id: 'mnemo-clima-timeline', x: 0, y: 0.62, w: 0.64, h: 0.38 },
  { id: 'mnemo-clima-panel', x: 0.64, y: 0, w: 0.36, h: 1 },
] as const;
export const BOARD_ZOOM = 0.8;

/** The host's refusal, in the person's words; an unknown code keeps its raw text, never a guess. */
export function boardWhy(message: string): { key: Key; why?: string } {
  if (message.includes('BOARD_AMBIGUOUS')) return { key: 'board.why.ambiguous' };
  if (message.includes('BOARD_FULL')) return { key: 'board.why.full' };
  if (message.includes('BOARD_NOWHERE')) return { key: 'board.why.nowhere' };
  if (message.includes('BOARD_UNHEARD')) return { key: 'board.why.unheard' };
  if (message.includes('TOO_SOON')) return { key: 'board.why.soon' };
  return { key: 'board.failed', why: message };
}

export function useBoard(t: (k: Key, v?: Record<string, string | number>) => string) {
  const available = inShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const run = useCallback((action: 'canvas.openBoard' | 'canvas.leaveBoard', payload?: unknown) => {
    if (!available || busy) return;
    setBusy(true);
    setError(null);
    setFull(false);
    sdk.invoke(action, payload, HOST_TIMEOUT_MS)
      .then(() => undefined, (err: unknown) => {
        const w = boardWhy(errText(err));
        if (w.key === 'board.why.full') setFull(true);
        console.warn('[MnemoClima]', action, 'refused:', err);
        setError(t(w.key, w.why ? { why: w.why } : undefined));
      })
      .finally(() => setBusy(false));
  }, [available, busy, t]);
  const open = useCallback(() => run('canvas.openBoard', { windows: BOARD_LAYOUT, fill: true, zoom: BOARD_ZOOM }), [run]);
  // here: the single window closes while the board is open (« Single view » brings it back)
  const openHere = useCallback(() => run('canvas.openBoard', { windows: BOARD_LAYOUT, fill: true, zoom: BOARD_ZOOM, here: true, replace: true }), [run]);
  const leave = useCallback(() => run('canvas.leaveBoard'), [run]);
  return { available, busy, error, full, open, openHere, leave };
}
