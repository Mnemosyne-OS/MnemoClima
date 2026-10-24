import { describe, it, expect } from 'vitest';
import { WRITTEN, translate, fmt, monthName } from './strings';

describe('strings', () => {
  const keys = Object.keys(WRITTEN.en);

  it('writes every key in fr and es', () => {
    for (const lang of ['fr', 'es'] as const) {
      expect(keys.filter((k) => !(k in WRITTEN[lang])), lang).toEqual([]);
    }
  });

  it('keeps every placeholder in every written language', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of keys) {
      const en = vars((WRITTEN.en as Record<string, string>)[k]!);
      for (const lang of ['fr', 'es'] as const) {
        expect(vars((WRITTEN[lang] as Record<string, string>)[k]!), `${lang} ${k}`).toBe(en);
      }
    }
  });

  it('falls back to English and leaves an unknown placeholder visible', () => {
    expect(translate('de', 'analog.n', { n: 4 })).toBe('N = 4');
    expect(translate('en', 'enso.issued', {})).toContain('{date}');
  });

  it('writes numbers with the language decimal mark and a real minus sign', () => {
    expect(fmt('fr', 2.16, 2, true)).toBe('+2,16');
    expect(fmt('en', -0.5, 1, true)).toBe('−0.5');
    expect(fmt('en', -0.5, 1)).toBe('−0.5');
    expect(monthName('en', 2026, 9)).toBe('September 2026');
  });
});

describe('de, pt, ru, zh', () => {
  it('write every visible text, and keep every placeholder of the English', async () => {
    const more = await import('./more');
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    const en = WRITTEN.en as Record<string, string>;
    // what may stay English: a unit or a placeholder alone, a symbol
    const neutral = (k: string) => /^[{}\w\s°%·+=—→\-]*$/.test(en[k]!.replace(/\{\w+\}/g, '')) && !/[a-z]{3,}/i.test(en[k]!.replace(/\{\w+\}/g, ''));
    for (const [lang, dict] of Object.entries({ de: more.de, pt: more.pt, ru: more.ru, zh: more.zh })) {
      const d = dict as Record<string, string>;
      const missing = Object.keys(en).filter((k) => !(k in d) && !neutral(k) && !['enso.phase.elnino', 'enso.phase.lanina', 'enso.oniValue', 'card.title', 'card.oni', 'chron.oniMonth', 'chron.marker', 'tl.oni', 'hazard.droughtsSize', 'hazard.sources', 'map.legend', 'marker.ipcCurrent', 'analog.n', 'tl.rain', 'tl.markerRain', 'tl.cursor', 'mem.progress'].includes(k));
      expect(missing, lang).toEqual([]);
      for (const k of Object.keys(d)) expect(vars(d[k]!), `${lang} ${k}`).toBe(vars(en[k]!));
    }
  });
});
