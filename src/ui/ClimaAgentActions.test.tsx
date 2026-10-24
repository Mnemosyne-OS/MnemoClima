/**
 * ClimaAgentActions — an iframe served an older SDK (no onAgentActions) keeps its window:
 * it warns and serves nothing, it never throws the page down.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ClimaAgentContext } from './climaAgent';

vi.mock('./host', () => ({ sdk: {}, inShell: () => true }));

afterEach(() => { vi.restoreAllMocks(); });

describe('ClimaAgentActions', () => {
  it('an SDK without onAgentActions warns instead of breaking the window', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ClimaAgentActions } = await import('./ClimaAgentActions');
    expect(() => render(<ClimaAgentActions {...({} as ClimaAgentContext)} />)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no onAgentActions'));
  });
});
