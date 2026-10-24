/**
 * What crosses a boundary: a message on the board channel (shared with other cartridges of the
 * same origin), the settings the host hands back, the card the board draws, and the identity of
 * `t` (everything memoised on it, the board card included, followed it).
 */
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readLinkMessage } from './link';
import { DEFAULT_SETTINGS, readSettings } from './store';
import { ensoCard, type CardWords } from '../data/card';
import { useI18n } from '../i18n/useI18n';
import { SPINE } from './usePour';

describe('board messages', () => {
  it('takes what reads and refuses the rest', () => {
    expect(readLinkMessage({ kind: 'cursor', t: 2015.5 })).toEqual({ kind: 'cursor', t: 2015.5 });
    expect(readLinkMessage({ kind: 'cursor', t: 1e9 })).toBeNull();
    // a frame that reads travels; one that does not is dropped and the month still goes
    expect(readLinkMessage({ kind: 'cursor', t: 1997.5, span: 3 })).toEqual({ kind: 'cursor', t: 1997.5, span: 3 });
    expect(readLinkMessage({ kind: 'cursor', t: 1997.5, factor: 1.6, span: 'x' })).toEqual({ kind: 'cursor', t: 1997.5, factor: 1.6 });
    expect(readLinkMessage({ kind: 'cursor', t: 1997.5, span: 1e6, factor: 0 })).toEqual({ kind: 'cursor', t: 1997.5 });
    expect(readLinkMessage({ kind: 'globe', on: true })).toEqual({ kind: 'globe', on: true });
    expect(readLinkMessage({ kind: 'globe', on: 'yes' })).toBeNull();
    expect(readLinkMessage({ kind: 'picked', lat: 95, lon: 0, purpose: 'place' })).toBeNull();
    expect(readLinkMessage({ kind: 'pick', on: true, purpose: 'other' })).toBeNull();
    expect(readLinkMessage({ kind: 'settings' })).toBeNull();
    expect(readLinkMessage({ kind: 'settings', settings: { places: [] } })).toEqual({ kind: 'settings', settings: { places: [] } });
    expect(readLinkMessage({ kind: 'erase-everything' })).toBeNull();
    expect(readLinkMessage('cursor')).toBeNull();
  });
});

describe('settings handed back by the host or another window', () => {
  it('nothing stored reads as the defaults', () => {
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('drops what does not read, field by field, and never invents a place', () => {
    const s = readSettings({
      places: [{ id: 'a', name: 'Finca', lat: 10, lon: -67 }, { id: 'b', name: '', lat: 1, lon: 1 }],
      activeMarkers: ['guatemala', 'unknown-marker'],
      layers: ['sst', 'nuclear'],
      layersVersion: 2,
      analogMin: 7,
      watch: 'yes',
    });
    expect(s.places.map((p) => p.id)).toEqual(['a']);
    expect(s.activeMarkers).toEqual(['guatemala']);
    expect(s.layers).toEqual(['sst']);
    expect(s.analogMin).toBe(1.5);
    expect(s.watch).toBe(false);
  });
  it('a layer added since the choice was stored is shown once; one the person turned off stays off', () => {
    expect(readSettings({ layers: ['sst'] }).layers).toEqual(['sst', 'land']);
    expect(readSettings({ layers: ['sst'], layersVersion: 2 }).layers).toEqual(['sst']);
  });
  it('an empty list of shown markers stays empty: the person turned them all off', () => {
    expect(readSettings({ activeMarkers: [] }).activeMarkers).toEqual([]);
  });
});

describe('the El Niño card', () => {
  const w: CardWords = {
    title: 'El Niño · NOAA',
    status: (s, d) => `${s} · ${d}`,
    unread: 'not read',
    oni: (r) => `ONI ${r.v}`,
    source: 'NOAA CPC',
  };
  const row = { season: 'JAS' as const, y: 2026, m: 8, v: 2.16, total: 29.12 };
  it('carries the status with its date, and asks for the eye during an El Niño', () => {
    const c = ensoCard({ issued: '2026-10-08', status: 'El Niño Advisory', kind: 'elninoAdvisory', synopsis: 'x' }, row, w);
    expect(c.status).toBe('El Niño Advisory · 2026-10-08');
    expect(c.tone).toBe('alert');
    expect(c.lines[0]).toBe('ONI 2.16');
  });
  it('a page that could not be read says so on the card, and still asks for the eye', () => {
    const c = ensoCard(null, null, w);
    expect(c.status).toBe('not read');
    expect(c.tone).toBe('alert');
  });
  it('a quiet Pacific is a quiet card', () => {
    expect(ensoCard({ issued: '2026-01-01', status: 'Not Active', kind: 'notActive', synopsis: null }, row, w).tone).toBe('idle');
  });
});

describe('t', () => {
  it('keeps its identity between renders of the same language', () => {
    const { result, rerender } = renderHook(() => useI18n());
    const first = result.current.t;
    rerender();
    expect(result.current.t).toBe(first);
  });
});

describe('verification fixes (11/10)', () => {
  it('F3: the spine is one the host accepts as is (UPPER_SNAKE), never rewritten to SOCIAL_NODE', () => {
    expect(SPINE).toMatch(/^[A-Z][A-Z0-9_]{2,39}$/);
  });
  it('F10: the disaster filter crosses to the other windows, and only a known kind does', () => {
    expect(readLinkMessage({ kind: 'hazardKind', value: 'quake' })).toEqual({ kind: 'hazardKind', value: 'quake' });
    expect(readLinkMessage({ kind: 'hazardKind', value: 'all' })).toEqual({ kind: 'hazardKind', value: 'all' });
    expect(readLinkMessage({ kind: 'hazardKind', value: 'tsunami<script>' })).toBeNull();
  });
});

describe('the switch (redesign 11/10)', () => {
  it('is a real switch for a screen reader, and says its state', async () => {
    const { render, screen, fireEvent } = await import('@testing-library/react');
    const { createElement } = await import('react');
    const { Switch } = await import('./Controls');
    let on = false;
    const { rerender } = render(createElement(Switch, { label: 'Continents', on, onChange: (v: boolean) => { on = v; } }));
    const sw = screen.getByRole('switch', { name: /Continents/ });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(on).toBe(true);
    rerender(createElement(Switch, { label: 'Continents', on, onChange: () => undefined }));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });
  it('a hidden curve stays hidden through a re-read, a region curve is asked for', () => {
    const s = readSettings({ hiddenLanes: ['pdo'], regionLanes: ['asia', 'mars'] });
    expect(s.hiddenLanes).toEqual(['pdo']);
    expect(s.regionLanes).toEqual(['asia']);
  });
});

describe('the exploded view (BOARD_FULL seen in the log, 11/10)', () => {
  it('says each refusal in words, and keeps an unknown code raw', async () => {
    const { boardWhy } = await import('./board');
    expect(boardWhy('Error: BOARD_FULL')).toEqual({ key: 'board.why.full' });
    expect(boardWhy('TOO_SOON')).toEqual({ key: 'board.why.soon' });
    expect(boardWhy('UNKNOWN_WIDGET: x')).toEqual({ key: 'board.failed', why: 'UNKNOWN_WIDGET: x' });
  });
  it('asks the host for windows the manifest declares, filling the view without overlap', async () => {
    const { BOARD_LAYOUT } = await import('./board');
    const manifest = (await import('../../mnemo-plugin.json')).default as { widgets: { id: string }[] };
    const declared = new Set(manifest.widgets.map((w) => w.id));
    for (const w of BOARD_LAYOUT) {
      expect(declared.has(w.id)).toBe(true);
      expect(w.x + w.w).toBeLessThanOrEqual(1 + 1e-6);
      expect(w.y + w.h).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.min(w.w, w.h)).toBeGreaterThanOrEqual(0.1);
    }
  });
});
