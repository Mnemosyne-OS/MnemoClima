/**
 * What the MAP shows of the present at opening (doc 147 §1.3 / §12.6), on the real answers saved
 * on 2026-10-11. Written by the verification of session 1596fc7a as a probe that FAILED on the
 * code judged (the timeline opened on the latest ONI month, two months behind, and the map hid
 * every alert of October); kept as the test of the fix: the timeline opens on this month.
 */
import { describe, expect, it } from 'vitest';
import gdacsJson from './fixtures/gdacs.json';
import eonetJson from './fixtures/eonet.json';
import usgsJson from './fixtures/usgs.json';
import { parseEonet, parseGdacs, parseUsgs } from './hazards';
import { addMonths, monthAt, monthKey, touchesMonths } from './months';
import { openingView } from '../engine/curves';

const HAZARD_WINDOW = 1; // App.tsx

describe('the present on the map at opening', () => {
  const v = openingView(new Date('2026-10-11T12:00:00Z'));
  const cursor = monthAt((v.y0 + v.y1) / 2);
  const a = addMonths(cursor.y, cursor.m, -HAZARD_WINDOW), b = addMonths(cursor.y, cursor.m, HAZARD_WINDOW);
  const ka = monthKey(a.y, a.m), kb = monthKey(b.y, b.m);
  const present = [...parseGdacs(gdacsJson).items, ...parseEonet(eonetJson).items, ...parseUsgs(usgsJson).items];
  const shown = present.filter((h) => touchesMonths(h.from, h.to, ka, kb));

  it('opens on the month of the day it is opened', () => {
    expect(cursor).toEqual({ y: 2026, m: 10 });
  });

  it('doc §1.3: the alerts in progress the day it opens are on the map', () => {
    const cyclones = present.filter((h) => h.source === 'gdacs' && h.kind === 'cyclone');
    expect(cyclones.length).toBeGreaterThan(0);
    for (const c of cyclones) expect(shown, `${c.title} (${c.from.slice(0, 10)}) should be on the map`).toContain(c);
    expect(shown.filter((h) => h.from >= '2026-10').length).toBe(present.filter((h) => h.from >= '2026-10').length);
  });

  it('doc §12.6: an EONET event still OPEN shows while it lasts (until its latest reading)', () => {
    const { items } = parseEonet({ events: [{ id: 'EONET_1', title: 'Wildfire somewhere', link: 'u', closed: null, categories: [{ id: 'wildfires' }], geometry: [{ date: '2026-05-10T00:00:00Z', type: 'Point', coordinates: [10, 10] }, { date: '2026-10-09T00:00:00Z', type: 'Point', coordinates: [10, 10] }] }] });
    const fire = items[0]!;
    // the cursor on August 2026 (July..September): the fire is open, its last reading is October
    expect(touchesMonths(fire.from, fire.to, monthKey(2026, 7), monthKey(2026, 9))).toBe(true);
  });
});
