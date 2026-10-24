/**
 * Verification probe (session 1596fc7a, doc 147): `useKeyed` (FEWS NET per marker, the history
 * files on a gesture) and `usePlaceSeries` (NASA POWER per point). Neither hook had a test;
 * mutation M41 of the first pass cited guards.test.ts, which never mounts them.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readDirect = vi.fn<(url: string, timeout?: number) => Promise<string>>();
vi.mock('./host', () => ({
  errText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  readDirect: (u: string, t?: number) => readDirect(u, t),
}));

import { useKeyed } from './useKeyed';
import { usePlaceSeries } from './usePlaceSeries';

const settle = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };

describe('useKeyed (probe)', () => {
  it('reads each wanted key once, never a key nobody wants', async () => {
    const load = vi.fn(async (k: string) => `v:${k}`);
    const { result, rerender } = renderHook(({ keys }) => useKeyed(keys, load), { initialProps: { keys: ['a'] } });
    await settle();
    expect(result.current.byKey.a).toMatchObject({ status: 'ok', data: 'v:a' });
    rerender({ keys: ['a', 'b'] });
    await settle();
    expect(load.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
    rerender({ keys: ['a'] });
    rerender({ keys: ['a', 'b'] });
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a failed read is not marked as asked: shown again, it is read again, and retry reads it now', async () => {
    let fail = true;
    const load = vi.fn(async (k: string) => { if (fail) throw new Error('HTTP_500'); return `v:${k}`; });
    const { result, rerender } = renderHook(({ keys }) => useKeyed(keys, load), { initialProps: { keys: ['a'] } });
    await settle();
    expect(result.current.byKey.a).toMatchObject({ status: 'error', error: 'HTTP_500' });
    fail = false;
    // shown again (a marker switched off then on): the failed key is read again by itself
    rerender({ keys: [] });
    rerender({ keys: ['a'] });
    await settle();
    expect(result.current.byKey.a).toMatchObject({ status: 'ok', data: 'v:a' });
    expect(load).toHaveBeenCalledTimes(2);
    // and an explicit retry reads it now, even when it succeeded
    act(() => { result.current.retry('a'); });
    await settle();
    expect(load).toHaveBeenCalledTimes(3);
  });
});

describe('usePlaceSeries (probe)', () => {
  const power = (y: number) => JSON.stringify({ properties: { parameter: { PRECTOTCORR: { [`${y}01`]: 3 }, T2M: { [`${y}01`]: 20 } } } });
  beforeEach(() => { readDirect.mockReset(); });

  it('reads POWER once per point, up to the year under way', async () => {
    readDirect.mockResolvedValue(power(2026));
    const pts = [{ id: 'p1', lat: 6.82, lon: -61.61 }];
    const { result } = renderHook(() => usePlaceSeries(pts));
    await settle();
    expect(readDirect).toHaveBeenCalledTimes(1);
    expect(readDirect.mock.calls[0]![0]).toContain(`end=${new Date().getUTCFullYear()}`);
    expect(result.current.series.p1).toMatchObject({ status: 'ok' });
  });

  it('a 422 for the year under way is asked once more up to the year before (doc 147 §12, measured 11/10)', async () => {
    readDirect.mockRejectedValueOnce(new Error('HTTP_422')).mockResolvedValueOnce(power(2025));
    const { result } = renderHook(() => usePlaceSeries([{ id: 'p1', lat: 1, lon: 1 }]));
    await settle();
    expect(readDirect).toHaveBeenCalledTimes(2);
    expect(readDirect.mock.calls[1]![0]).toContain(`end=${new Date().getUTCFullYear() - 1}`);
    expect(result.current.series.p1).toMatchObject({ status: 'ok' });
  });

  it('a point that is no longer shown is not in the series, even when its read is cached', async () => {
    readDirect.mockResolvedValue(power(2026));
    const { result, rerender } = renderHook(({ pts }) => usePlaceSeries(pts), { initialProps: { pts: [{ id: 'p1', lat: 1, lon: 1 }, { id: 'p2', lat: 2, lon: 2 }] } });
    await settle();
    expect(Object.keys(result.current.series).sort()).toEqual(['p1', 'p2']);
    rerender({ pts: [{ id: 'p1', lat: 1, lon: 1 }] });
    // this is what App's `points` does to a place that is declared but not selected:
    // its series leaves the map handed to chroniclesFor('places') and shareNumbers
    expect(Object.keys(result.current.series)).toEqual(['p1']);
  });

  it('a failed read (not 422) is an error with its reason, and is asked again on retry', async () => {
    readDirect.mockRejectedValueOnce(new Error('TIMEOUT')).mockResolvedValueOnce(power(2026));
    const { result } = renderHook(() => usePlaceSeries([{ id: 'p1', lat: 1, lon: 1 }]));
    await settle();
    expect(result.current.series.p1).toMatchObject({ status: 'error', error: 'TIMEOUT' });
    act(() => { result.current.retry(); });
    await settle();
    expect(result.current.series.p1).toMatchObject({ status: 'ok' });
  });
});

describe('an error says when it was tried (verification F5)', () => {
  it('useKeyed stamps the time of the failed read', async () => {
    const { result } = renderHook(() => useKeyed(['a'], async () => { throw new Error('HTTP_500'); }));
    await waitFor(() => expect(result.current.byKey.a?.status).toBe('error'));
    const e = result.current.byKey.a as { at?: string };
    expect(typeof e.at).toBe('string');
    expect(Number.isNaN(Date.parse(e.at!))).toBe(false);
  });
});
