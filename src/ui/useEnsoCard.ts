/**
 * useEnsoCard — the El Niño card pinned on the board, on a gesture (doc 110).
 *
 * The host holds the one fact of what is pinned: every answer of pin / unpin / publish carries
 * the list, and the button follows it. While pinned, the card follows the data (a new opinion,
 * a new ONI, another language). A refused publish pauses until the next gesture, or a refused
 * permission would raise a dialog at every data change (MnemoClio's lesson, doc 110).
 */
import { useCallback, useEffect, useState } from 'react';
import { ENSO_CARD_ID, type EnsoCard } from '../data/card';
import { HOST_TIMEOUT_MS, errText, inShell, refreshPermissions, sdk } from './host';

export function useEnsoCard(card: EnsoCard | null) {
  const available = inShell();
  const [pinned, setPinned] = useState<boolean | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adopt = (res: { pinned?: unknown } | null | undefined) => {
    if (Array.isArray(res?.pinned)) setPinned(res.pinned.includes(ENSO_CARD_ID));
  };

  useEffect(() => {
    if (!available) return;
    let alive = true;
    sdk.invoke<{ pinned?: string[] }>('cockpit.state', undefined, HOST_TIMEOUT_MS)
      .then((res) => { if (alive) adopt(res); })
      .catch((err) => { if (alive) { console.warn('[MnemoClima] cockpit.state unavailable', err); setPinned(false); } });
    return () => { alive = false; };
  }, [available]);

  useEffect(() => {
    if (!available || !pinned || paused || !card) return;
    let alive = true;
    sdk.invoke<{ success?: boolean; pinned?: string[] }>('cockpit.publish', { cards: [card] }, HOST_TIMEOUT_MS)
      .then((res) => { if (!alive) return; adopt(res); if (res?.success === false) setPaused(true); })
      .catch((err) => { console.warn('[MnemoClima] cockpit.publish refused', err); if (alive) setPaused(true); });
    return () => { alive = false; };
  }, [available, pinned, paused, card]);

  const toggle = useCallback(() => {
    if (!available || !card) return;
    setPaused(false);
    setError(null);
    const unpin = pinned === true;
    const ready = unpin ? Promise.resolve({} as Record<string, boolean>) : refreshPermissions(['cockpit:pin']);
    void ready
      .then((granted) => {
        if (granted['cockpit:pin'] === false) throw new Error('PERMISSION:cockpit:pin');
        return sdk.invoke<{ success?: boolean; pinned?: string[]; error?: string }>(
          unpin ? 'cockpit.unpin' : 'cockpit.pin',
          unpin ? { id: ENSO_CARD_ID } : { id: ENSO_CARD_ID, card, level: 'plane' },
          HOST_TIMEOUT_MS,
        );
      })
      .then((res) => { adopt(res); if (res?.success === false) setError(res.error ?? 'refused'); })
      .catch((err) => setError(errText(err)));
  }, [available, card, pinned]);

  return { available, pinned, error, toggle };
}
