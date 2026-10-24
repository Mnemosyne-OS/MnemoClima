/**
 * usePour — pouring chronicles into MnemoClima's Memory Pack, on a gesture (doc 147 §6, doc 79:
 * nothing enters memory on its own).
 *
 * The pack is the host's (`vault.pack.ensure`, words only: series of numbers have nothing to do
 * in an embedder, doc 84 §17). A chronicle already poured (its key is in the settings) is
 * skipped; the host also refuses an identical text, so a second pour never doubles anything.
 * Stop ends after the chronicle in flight; what is written stays and is SAID.
 */
import { useCallback, useRef, useState } from 'react';
import type { Chronicle } from '../data/chronicle';
import { HOST_TIMEOUT_MS, errText, refreshPermissions, sdk } from './host';

export const PACK = 'climate';
/** The host accepts UPPER_SNAKE only and rewrites anything else to SOCIAL_NODE (socialHandlers.ts). */
export const SPINE = 'CLIMATE_RECORD';
const INGEST_TIMEOUT_MS = 30_000;

export type PourState =
  | { phase: 'idle' }
  | { phase: 'running'; subject: string; done: number; total: number; refused: number }
  | { phase: 'finished'; subject: string; written: number; refused: number; vault: string; stopped: boolean; skipped: number }
  | { phase: 'failed'; subject: string; error: string };

/** Pour a list of chronicles on a gesture; `onPoured` receives the keys actually written. */
export function usePour(onPoured: (subject: string, keys: string[]) => void) {
  const [state, setState] = useState<PourState>({ phase: 'idle' });
  const stopRef = useRef(false);

  /** `skipped`: what the caller could not even turn into chronicles (a place not read), said in the result. */
  const pour = useCallback(async (subject: string, chronicles: Chronicle[], already: Set<string>, skipped = 0) => {
    stopRef.current = false;
    const todo = chronicles.filter((c) => !already.has(c.key));
    setState({ phase: 'running', subject, done: 0, total: todo.length, refused: 0 });
    try {
      const granted = await refreshPermissions(['vault:write']);
      if (granted['vault:write'] === false) throw new Error('PERMISSION:vault:write');
      const ensured = await sdk.invoke<{ vault?: string }>('vault.pack.ensure', { pack: PACK, lexicalOnly: true }, HOST_TIMEOUT_MS * 2);
      const vault = ensured?.vault;
      if (!vault) throw new Error('ENSURE_PACK_FAILED');
      const written: string[] = [];
      let refused = 0;
      for (let i = 0; i < todo.length; i++) {
        if (stopRef.current) break;
        const c = todo[i]!;
        try {
          await sdk.invoke('mnemosyne.ingest', { vault, content: c.content, spineType: SPINE, sourceRef: c.sourceRef }, INGEST_TIMEOUT_MS);
          written.push(c.key);
        } catch (err) {
          refused++;
          console.warn('[MnemoClima] chronicle refused', c.key, err);
        }
        setState({ phase: 'running', subject, done: i + 1, total: todo.length, refused });
      }
      onPoured(subject, written);
      setState({ phase: 'finished', subject, written: written.length, refused, vault, stopped: stopRef.current, skipped });
    } catch (err) {
      setState({ phase: 'failed', subject, error: errText(err) });
    }
  }, [onPoured]);

  const stop = useCallback(() => { stopRef.current = true; }, []);
  return { state, pour, stop };
}
