/**
 * Verification probe (session 1596fc7a, doc 147 §6 / doc 79): pouring into the Memory Pack.
 * `usePour` holds four rules (words-only pack, already-poured keys skipped, Stop after the
 * chronicle in flight, a refused chronicle counted and said) and no test of the suite mounted it:
 * mutations M38-M41 of the first pass could only cite guards.test.ts, which never calls it.
 * The host is mocked at the one line the hook uses (`sdk.invoke`, `refreshPermissions`).
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn<(action: string, payload?: unknown, timeout?: number) => Promise<unknown>>();
const refreshPermissions = vi.fn<(perms: string[]) => Promise<Record<string, boolean>>>();
vi.mock('./host', () => ({
  HOST_TIMEOUT_MS: 15_000,
  errText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  refreshPermissions: (p: string[]) => refreshPermissions(p),
  sdk: { invoke: (a: string, p?: unknown, t?: number) => invoke(a, p, t) },
}));

import { usePour } from './usePour';

const chron = (k: string) => ({ key: k, content: `text ${k}`, sourceRef: `ref:${k}` });
const settle = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };

describe('usePour (probe)', () => {
  beforeEach(() => {
    invoke.mockReset();
    refreshPermissions.mockReset();
    refreshPermissions.mockResolvedValue({ 'vault:write': true });
    invoke.mockImplementation(async (action) => (action === 'vault.pack.ensure' ? { vault: 'kp-clima' } : {}));
  });

  it('asks the host for a words-only pack (lexicalOnly), and skips the keys already poured', async () => {
    const poured = vi.fn();
    const { result } = renderHook(() => usePour(poured));
    await act(async () => { await result.current.pour('oni', [chron('oni:1997'), chron('oni:1998'), chron('oni:1999')], new Set(['oni:1998'])); });
    await settle();
    const ensure = invoke.mock.calls.find((c) => c[0] === 'vault.pack.ensure')!;
    expect(ensure[1]).toEqual({ pack: 'climate', lexicalOnly: true });
    const ingested = invoke.mock.calls.filter((c) => c[0] === 'mnemosyne.ingest').map((c) => (c[1] as { sourceRef: string }).sourceRef);
    expect(ingested).toEqual(['ref:oni:1997', 'ref:oni:1999']);
    expect(poured).toHaveBeenCalledWith('oni', ['oni:1997', 'oni:1999']);
    expect(result.current.state).toMatchObject({ phase: 'finished', written: 2, refused: 0, vault: 'kp-clima', stopped: false });
  });

  it('a refused chronicle is counted and the pour goes on', async () => {
    invoke.mockImplementation(async (action, payload) => {
      if (action === 'vault.pack.ensure') return { vault: 'kp-clima' };
      if ((payload as { sourceRef: string }).sourceRef === 'ref:b') throw new Error('INGEST_REFUSED');
      return {};
    });
    const poured = vi.fn();
    const { result } = renderHook(() => usePour(poured));
    await act(async () => { await result.current.pour('oni', [chron('a'), chron('b'), chron('c')], new Set()); });
    expect(result.current.state).toMatchObject({ phase: 'finished', written: 2, refused: 1 });
    expect(poured).toHaveBeenCalledWith('oni', ['a', 'c']);
  });

  it('Stop ends after the chronicle in flight, keeps what is written, and SAYS it stopped', async () => {
    let release: () => void = () => undefined;
    invoke.mockImplementation(async (action, payload) => {
      if (action === 'vault.pack.ensure') return { vault: 'kp-clima' };
      if ((payload as { sourceRef: string }).sourceRef === 'ref:a') await new Promise<void>((r) => { release = r; });
      return {};
    });
    const poured = vi.fn();
    const { result } = renderHook(() => usePour(poured));
    let done: Promise<void>;
    act(() => { done = result.current.pour('oni', [chron('a'), chron('b'), chron('c')], new Set()); });
    await settle();
    expect(result.current.state).toMatchObject({ phase: 'running', total: 3 });
    act(() => { result.current.stop(); });
    release();
    await act(async () => { await done!; });
    expect(result.current.state).toMatchObject({ phase: 'finished', written: 1, stopped: true });
    expect(invoke.mock.calls.filter((c) => c[0] === 'mnemosyne.ingest')).toHaveLength(1);
    expect(poured).toHaveBeenCalledWith('oni', ['a']);
  });

  it('a refused permission fails the pour BEFORE any pack is created, and names the permission', async () => {
    refreshPermissions.mockResolvedValue({ 'vault:write': false });
    const { result } = renderHook(() => usePour(vi.fn()));
    await act(async () => { await result.current.pour('oni', [chron('a')], new Set()); });
    expect(result.current.state).toEqual({ phase: 'failed', subject: 'oni', error: 'PERMISSION:vault:write' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a pack the host could not give is a failure, never a pour into nowhere', async () => {
    invoke.mockImplementation(async () => ({}));
    const { result } = renderHook(() => usePour(vi.fn()));
    await act(async () => { await result.current.pour('oni', [chron('a')], new Set()); });
    expect(result.current.state).toMatchObject({ phase: 'failed', error: 'ENSURE_PACK_FAILED' });
    expect(invoke.mock.calls.filter((c) => c[0] === 'mnemosyne.ingest')).toHaveLength(0);
  });
});
