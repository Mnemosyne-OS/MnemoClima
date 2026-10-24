/**
 * useSettings › commit — the agent's settings write (doc 149) answers only once the host has
 * stored it, says when it did not, and writes nothing before the host's copy is read.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('./host', () => ({ sdk: { invoke: (...a: unknown[]) => invoke(...a) }, inShell: () => true, HOST_TIMEOUT_MS: 15000 }));

afterEach(() => { invoke.mockReset(); localStorage.clear(); });

describe('commit', () => {
  it('refuses before the host copy is read, and writes nothing', async () => {
    let release: (v: unknown) => void = () => undefined;
    invoke.mockImplementation((action: string) => (action === 'state.get' ? new Promise((r) => { release = r; }) : Promise.resolve({})));
    const { useSettings } = await import('./store');
    const { result } = renderHook(() => useSettings());
    await expect(result.current.commit((s) => ({ ...s, watch: true }))).rejects.toThrow(/^NOT_READY/);
    expect(invoke).not.toHaveBeenCalledWith('state.set', expect.anything(), expect.anything());
    await act(async () => { release({ state: null }); });
  });

  it('answers once state.set has answered, and refuses when it fails', async () => {
    invoke.mockImplementation((action: string) => (action === 'state.get' ? Promise.resolve({ state: null }) : Promise.resolve({})));
    const { useSettings } = await import('./store');
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const applied = vi.fn();
    let next: unknown;
    await act(async () => { next = await result.current.commit((s) => ({ ...s, analogMin: 2.0 }), applied); });
    expect(next).toMatchObject({ analogMin: 2.0 });
    expect(applied).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('state.set', { state: expect.objectContaining({ analogMin: 2.0 }) }, 15000);

    invoke.mockImplementation(() => Promise.reject(new Error('host down')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await act(async () => {
      await expect(result.current.commit((s) => ({ ...s, watch: true }))).rejects.toThrow(/^NOT_SAVED: .*host down/);
    });
    expect(result.current.saveError).toBe('host down');
    warn.mockRestore();
  });
});
