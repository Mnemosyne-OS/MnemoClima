/**
 * useWatch — watching El Niño while MnemoClima is closed (doc 72, doc 147 §7).
 *
 * The host does the watching: a `hash` target on NOAA's discussion page notices that it changed
 * (a new opinion, once a month), a `json` target on GDACS notices new orange and red alerts.
 * The first pass never announces anything (doc 72's first invariant). On opening, the inbox
 * says what arrived while closed, or WHY nothing could be read (`lastError`), never a silence.
 */
import { useCallback, useEffect, useState } from 'react';
import { CPC_DISCUSSION_URL } from '../data/cpc';
import { GDACS_URL } from '../data/hazards';
import { HOST_TIMEOUT_MS, errText, inShell, refreshPermissions, sdk } from './host';

export interface WatchInbox { count: number; labels: string[]; error: string | null }

export function watchTargets(labels: { cpc: string; gdacs: string }) {
  return [
    { url: CPC_DISCUSSION_URL, spec: { mode: 'hash' }, label: labels.cpc },
    { url: GDACS_URL, spec: { mode: 'json', arrayPath: 'features', idField: 'properties.eventid', labelField: 'properties.name' }, label: labels.gdacs },
  ];
}

/** `on` is the person's choice, kept in the settings; this keeps the host's watch in step with it. */
export function useWatch(on: boolean, labels: { cpc: string; gdacs: string }) {
  const [inbox, setInbox] = useState<WatchInbox | null>(null);
  const [error, setError] = useState<string | null>(null);

  // what arrived while closed, read once on opening
  useEffect(() => {
    if (!inShell() || !on) return;
    let alive = true;
    sdk.invoke<{ items?: Array<{ label?: string }>; status?: { lastError?: string | null } | null }>('watch.inbox', undefined, HOST_TIMEOUT_MS)
      .then((res) => {
        if (!alive) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        const lastError = typeof res?.status?.lastError === 'string' && res.status.lastError ? res.status.lastError : null;
        setInbox({ count: items.length, labels: items.map((i) => i.label ?? '').filter(Boolean).slice(0, 5), error: lastError });
      })
      .catch((err) => { if (alive) setError(errText(err)); });
    return () => { alive = false; };
  }, [on]);

  const apply = useCallback(async (want: boolean): Promise<boolean> => {
    setError(null);
    try {
      if (want) {
        const granted = await refreshPermissions(['watch:background']);
        if (granted['watch:background'] === false) throw new Error('PERMISSION:watch:background');
        await sdk.invoke('watch.register', { targets: watchTargets(labels), intervalMin: 360, notify: true }, HOST_TIMEOUT_MS);
      } else {
        await sdk.invoke('watch.unregister', undefined, HOST_TIMEOUT_MS);
      }
      return true;
    } catch (err) {
      setError(errText(err));
      return false;
    }
  }, [labels]);

  const clear = useCallback(() => {
    sdk.invoke('watch.clearInbox', undefined, HOST_TIMEOUT_MS)
      .then(() => setInbox((b) => (b ? { ...b, count: 0, labels: [] } : b)))
      .catch((err) => setError(errText(err)));
  }, []);

  return { inbox, error, apply, clear };
}
