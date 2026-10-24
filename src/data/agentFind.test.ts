import { describe, expect, it } from 'vitest';
import { findNamed, nameWords, type Named } from './agentFind';

const named = (id: string, ...names: string[]): Named<string> => ({ item: id, id, names, label: names[0] });
const EPISODES = [
  named('elnino-1997-05', 'El Niño 1997–1998', 'El Niño', '1997', '1998'),
  named('elnino-2015-03', 'El Niño 2014–2016', 'El Niño', '2014', '2016'),
  named('lanina-2010-06', 'La Niña 2010–2011', 'La Niña', '2010', '2011'),
];
const kind = { code: 'NO_EPISODE', noun: 'episode' };

describe('a thing named the way a person says it', () => {
  it('folds case, accents, fillers and a plural', () => {
    expect(nameWords("l'épisode El Niño de 1997")).toEqual(['nino', '1997']);
    expect(nameWords('les courbes des Andes')).toEqual(['ande']);
    expect(nameWords('La NIÑA')).toEqual(['nina']);
  });

  it('an id, or every word said', () => {
    expect(findNamed(EPISODES, 'lanina-2010-06', kind)).toBe('lanina-2010-06');
    expect(findNamed(EPISODES, "l'El Niño de 1997", kind)).toBe('elnino-1997-05');
    expect(findNamed(EPISODES, 'la Niña', kind)).toBe('lanina-2010-06');
    // « niño » and « niña » fold apart: a La Niña year never answers an El Niño
    expect(() => findNamed(EPISODES, 'El Niño 2010', kind)).toThrow(/^NO_EPISODE/);
  });

  it('several matches are refused with their names, never the first taken', () => {
    expect(() => findNamed(EPISODES, 'El Niño', kind)).toThrow('AMBIGUOUS: "El Niño" names several episodes: El Niño 1997–1998, El Niño 2014–2016; say which');
  });

  it('no match is refused with the names that exist', () => {
    expect(() => findNamed(EPISODES, '1950', kind)).toThrow('NO_EPISODE: no episode named "1950"; episodes: El Niño 1997–1998, El Niño 2014–2016, La Niña 2010–2011');
    expect(() => findNamed(EPISODES, '  ', kind)).toThrow(/^BAD_ARG/);
    expect(() => findNamed([], 'nino', kind)).toThrow('episodes: none');
  });

  it('the list of names is capped', () => {
    const many = Array.from({ length: 15 }, (_, i) => named(`p${i}`, `Place ${i}a`));
    expect(() => findNamed(many, 'Lima', { code: 'NO_PLACE', noun: 'place' })).toThrow(/Place 11a \(\+3\)$/);
  });
});
