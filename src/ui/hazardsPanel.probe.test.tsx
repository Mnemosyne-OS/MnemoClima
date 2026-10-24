/**
 * Verification probe (session 1596fc7a, doc 147): the disasters panel against the volume the doc
 * measured on 2026-10-11 (306 events in progress, §12.2). No test of the suite renders a panel.
 * The rule attacked is the one doc 93 §10 paid for: a counter above a list that is shorter than
 * the counter, without a word, is the screen affirming two incompatible things.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HazardsPanel } from './Panels';
import { translate, type Key } from '../i18n/strings';
import type { Hazard } from '../data/hazards';

const t = (k: Key, v?: Record<string, string | number>) => translate('en', k, v);
const hazard = (i: number): Hazard => ({
  id: `usgs:q${i}`, source: 'usgs', kind: 'quake', title: `Quake ${i}`, lon: 0, lat: 0,
  from: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00.000Z`, to: null, level: null, measure: 'M 6.1', url: null, country: null,
});

describe('HazardsPanel (probe)', () => {
  const items = Array.from({ length: 306 }, (_, i) => hazard(i));
  const history = [{ id: 'tracks' as const, state: null }, { id: 'quakes' as const, state: null }, { id: 'droughts' as const, state: null }];

  it('the chip says 306 and the list shows every one, or says how many it does not show — FAILS at HEAD (200 rows, nothing said)', () => {
    const { container } = render(
      <HazardsPanel t={t} lang="en" hazards={{ status: 'ok', data: { items, failed: [] }, at: '2026-10-11T00:00:00Z', dropped: 0 }} retry={() => undefined}
        kind="all" onKind={() => undefined} onFocus={() => undefined} history={history} onLoadHistory={() => undefined} />,
    );
    expect(screen.getAllByText(/· 306/).length).toBeGreaterThan(0);
    const rows = container.querySelectorAll('ul.hazard-list li').length;
    // eslint-disable-next-line no-console
    console.log(`[probe] hazards chip 306, rows rendered ${rows}`);
    const saysCut = container.textContent?.includes(String(items.length - rows)) && rows < items.length;
    expect(rows === items.length || saysCut, `${items.length - rows} rows hidden and nothing on screen says so`).toBe(true);
  });

  it('a network that failed is named next to the ones that answered (never "no disaster")', () => {
    const { container } = render(
      <HazardsPanel t={t} lang="en" hazards={{ status: 'ok', data: { items: items.slice(0, 3), failed: ['GDACS: TIMEOUT'] }, at: 'x', dropped: 2 }} retry={() => undefined}
        kind="all" onKind={() => undefined} onFocus={() => undefined} history={history} onLoadHistory={() => undefined} />,
    );
    expect(screen.getByText(/GDACS: TIMEOUT/)).toBeInTheDocument();
    expect(container.textContent).toContain(t('src.dropped', { n: 2 }));
  });
});
