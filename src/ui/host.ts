/**
 * host.ts — MnemoClima's one line to the shell, and its two ways to read the web.
 *
 *  - `readDirect`: the sources that open CORS (NASA POWER, EONET, GDACS, USGS, IBTrACS) are read
 *    by the iframe itself. Works outside the shell too.
 *  - `readViaHost`: the ones that do not (NOAA CPC and PSL, GISTEMP, ERDDAP, FEWS NET) go through
 *    the host's `social.fetch` (HTTPS only, 4 MB, permission `vault:read`). A truncated body is a
 *    prefix and is refused, never parsed as if whole.
 *
 * Every call ends (rule 9): a read that never answers ends in `TIMEOUT`.
 */
import { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { relayed } from './devRelays';

export const APP_ID = '@mnemosyne-plugins/mnemo-clima';
export const sdk = new MnemoCartridgeSDK(APP_ID);

export const HOST_TIMEOUT_MS = 15_000;
export const FETCH_TIMEOUT_MS = 45_000;
/** IBTrACS is ~11 MB: a slow line must not be cut at 45 s. */
export const BIG_FETCH_TIMEOUT_MS = 180_000;

/** Inside the shell? Outside it (a plain browser, dev) there is no host to fetch through. */
export const inShell = (): boolean => typeof window !== 'undefined' && window.parent !== window;

export function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A GET the iframe makes itself, for a source that opens CORS (or a file of the cartridge).
 * Ends in `TIMEOUT` after `timeoutMs`; a non-2xx status is an error named `HTTP_<status>`.
 */
export async function readDirect(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return await res.text();
  } catch (err) {
    if (ctrl.signal.aborted) throw new Error('TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

interface HostFetchAnswer { status?: number; body?: string; encoding?: 'utf8' | 'base64'; truncated?: boolean }

/** The text of a host answer. A truncated body is refused (`TRUNCATED`). */
export function hostAnswerText(answer: unknown): string {
  const a = (answer && typeof answer === 'object' ? answer : {}) as HostFetchAnswer;
  if (a.truncated) throw new Error('TRUNCATED');
  if (typeof a.body !== 'string') throw new Error('NO_BODY');
  if (a.encoding !== 'base64') return a.body;
  const bin = atob(a.body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * A GET through the host's `social.fetch`, for a source without CORS (HTTPS only, 4 MB, a
 * truncated body refused as `TRUNCATED`). Outside the shell, in dev only, through a Vite relay.
 */
export async function readViaHost(url: string): Promise<string> {
  // Outside the shell (a plain browser in dev) there is no host: try directly, and a CORS
  // refusal then reads as the error it is.
  if (!inShell()) {
    const viaRelay = import.meta.env.DEV ? relayed(url) : null;
    return readDirect(viaRelay ?? url);
  }
  return hostAnswerText(await sdk.invoke('social.fetch', { url }, FETCH_TIMEOUT_MS));
}

/**
 * Ask the host whether this cartridge holds the permissions it is about to use. The host reads
 * the manifests at startup, so an update that added one is refused until this re-read.
 */
export async function refreshPermissions(perms: string[]): Promise<Record<string, boolean>> {
  if (!inShell()) return Object.fromEntries(perms.map((p) => [p, false]));
  const res = await sdk.invoke<{ granted?: Record<string, boolean> }>('permissions.refresh', { permissions: perms }, HOST_TIMEOUT_MS);
  return res?.granted ?? {};
}
