/**
 * useKeyed — one read per key, kept for the session: FEWS NET per marker, the history files on
 * demand. A failed read can be asked again; a read for a key nobody wants is never started.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { errText } from './host';
import type { Loadable } from './useClimate';

export function useKeyed<T>(keys: string[], load: (key: string) => Promise<T>): { byKey: Record<string, Loadable<T>>; retry: (key: string) => void } {
  const [byKey, setByKey] = useState<Record<string, Loadable<T>>>({});
  const asked = useRef(new Set<string>());
  const mounted = useRef(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const start = useCallback((key: string) => {
    asked.current.add(key);
    setByKey((m) => ({ ...m, [key]: { status: 'loading' } }));
    loadRef.current(key)
      .then((data) => { if (mounted.current) setByKey((m) => ({ ...m, [key]: { status: 'ok', data, at: new Date().toISOString(), dropped: 0 } })); })
      .catch((err) => {
        console.warn('[MnemoClima] read failed', key, err);
        asked.current.delete(key);
        if (mounted.current) setByKey((m) => ({ ...m, [key]: { status: 'error', error: errText(err), at: new Date().toISOString() } }));
      });
  }, []);

  const wanted = keys.join('|');
  useEffect(() => {
    for (const k of keys) if (!asked.current.has(k)) start(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, start]);

  return { byKey, retry: start };
}
