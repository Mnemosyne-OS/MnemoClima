/**
 * Verification probe (session 1596fc7a, doc 147 §12.6): the month of ocean heat under the
 * cursor. The commit 85502bb34 of the feature (judged at 542629fae = HEAD 401127295 for these files) put
 * four of its five rules in this hook and no test mounted it. The host is mocked; the
 * ERSST answer is the real one saved on 2026-10-11 (December 1997).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ersstJson from '../data/fixtures/ersst.json';

const readViaHost = vi.fn<(url: string) => Promise<string>>();
vi.mock('./host', () => ({
  readViaHost: (url: string) => readViaHost(url),
  errText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { DEBOUNCE_MS, useMonthSst } from './useMonthSst';

const LAST = { y: 2026, m: 8 };
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

describe('useMonthSst (probe)', () => {
  beforeEach(() => { vi.useFakeTimers(); readViaHost.mockReset(); readViaHost.mockResolvedValue(JSON.stringify(ersstJson)); });
  afterEach(() => { vi.useRealTimers(); });

  it('asks the month only once the cursor has rested on it', async () => {
    const { result } = renderHook(() => useMonthSst({ y: 1997, m: 12 }, LAST, true));
    expect(result.current.loading).toBe(true);
    await act(async () => { vi.advanceTimersByTime(DEBOUNCE_MS - 1); });
    expect(readViaHost).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(readViaHost).toHaveBeenCalledTimes(1);
    expect(readViaHost.mock.calls[0]![0]).toContain('1997-12-15');
    await flush();
    expect(result.current.grid?.monthly).toBe(true);
    expect(result.current.grid?.day.slice(0, 7)).toBe('1997-12');
    expect(result.current.loading).toBe(false);
  });

  it('refuses the month the server answered when it is not the one asked (the nearest month)', async () => {
    // the saved answer IS December 1997; ask November and the server would answer December
    const { result } = renderHook(() => useMonthSst({ y: 1997, m: 11 }, LAST, true));
    await act(async () => { vi.advanceTimersByTime(DEBOUNCE_MS); });
    await flush();
    expect(result.current.grid).toBeNull();
    expect(result.current.error).toBe('MONTH_1997-12');
  });

  it('keeps a month read for the session: coming back to it asks nothing', async () => {
    const { result, rerender } = renderHook(({ c }) => useMonthSst(c, LAST, true), { initialProps: { c: { y: 1997, m: 12 } } });
    await act(async () => { vi.advanceTimersByTime(DEBOUNCE_MS); });
    await flush();
    expect(readViaHost).toHaveBeenCalledTimes(1);
    // another month (the mock answers December for every ask, so this one is refused: still a read)
    rerender({ c: { y: 1998, m: 1 } });
    await act(async () => { vi.advanceTimersByTime(DEBOUNCE_MS); });
    await flush();
    expect(readViaHost).toHaveBeenCalledTimes(2);
    rerender({ c: { y: 1997, m: 12 } });
    await act(async () => { vi.advanceTimersByTime(DEBOUNCE_MS); });
    await flush();
    expect(readViaHost).toHaveBeenCalledTimes(2);
    expect(result.current.grid?.day.slice(0, 7)).toBe('1997-12');
  });

  it('never asks a month past the last ERSST has: beyond is true and the daily grid takes over', async () => {
    const { result } = renderHook(() => useMonthSst({ y: 2026, m: 10 }, LAST, true));
    await act(async () => { vi.advanceTimersByTime(DEBOUNCE_MS * 2); });
    await flush();
    expect(result.current.beyond).toBe(true);
    expect(readViaHost).not.toHaveBeenCalled();
  });

  it('while the next month loads, the previous grid stays with its OWN month', async () => {
    const { result, rerender } = renderHook(({ c }) => useMonthSst(c, LAST, true), { initialProps: { c: { y: 1997, m: 12 } } });
    await act(async () => { vi.advanceTimersByTime(DEBOUNCE_MS); });
    await flush();
    rerender({ c: { y: 2015, m: 12 } });
    expect(result.current.loading).toBe(true);
    expect(result.current.wanted).toEqual({ y: 2015, m: 12 });
    expect(result.current.grid?.day.slice(0, 7)).toBe('1997-12');
  });
});
