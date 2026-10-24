/**
 * climaAgent — the agent's moves are the app's own, a settings change answers only once it is
 * saved, and every refusal is named.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Hazard } from '../data/hazards';
import type { Marker } from '../data/markers';
import type { Episode } from '../data/oni';
import { MAX_PLACES, type Place } from '../data/place';
import { DEFAULT_SETTINGS, type Settings } from './store';
import { climaAgentHandlers, readLimit, readMonth, resolvePlace, type ClimaAgentContext } from './climaAgent';

const place = (id: string, name: string): Place => ({ id, name, lat: 10, lon: -67 });
const marker = (id: string, name: string): Marker => ({ id, name, role: 'precursor', lat: 0, lon: 0, radiusKm: 100, builtIn: false });
const hazard = (id: string, kind: Hazard['kind'], title = id, country: string | null = null, from = '2026-10-01T00:00:00.000Z'): Hazard => ({
  id, source: 'gdacs' as Hazard['source'], kind, title, lon: 0, lat: 0, from, to: null, level: null, measure: null, url: null, country,
});
const episode = (kind: Episode['kind'], y0: number, m0: number, y1: number, m1: number, peak: number, ongoing = false): Episode => ({
  kind, start: { y: y0, m: m0 }, end: { y: y1, m: m1 }, peak: { y: y0, m: 12, v: peak }, ongoing,
});
const EPISODES = [
  episode('elnino', 1997, 5, 1998, 5, 2.4), episode('elnino', 2015, 3, 2016, 5, 2.6), episode('lanina', 2010, 6, 2011, 5, -1.6),
  episode('elnino', 2023, 6, 2024, 4, 2.0), episode('elnino', 2026, 5, 2026, 9, 2.16, true),
];

function ctx(over: Partial<ClimaAgentContext> = {}, settings: Partial<Settings> = {}): ClimaAgentContext {
  let s: Settings = { ...DEFAULT_SETTINGS, places: [place('p1', 'Caracas'), place('p2', 'Cali'), place('p3', 'Cali')], ...settings };
  const c: ClimaAgentContext = {
    ready: true, settings: s,
    cpc: { state: 'ok', data: { issued: '2026-10-08', status: 'El Niño Advisory', kind: 'elninoAdvisory', synopsis: null }, error: null },
    oniLatest: null,
    hazards: { state: 'ok', items: [hazard('a', 'flood'), hazard('b', 'quake'), hazard('c', 'flood')], error: null },
    cursor: { y: 2026, m: 10 }, range: { min: 1850, max: 2026.8 }, tab: 'pacific', hazardKind: 'all', selectedPlace: 'p1',
    markers: [marker('california', 'California'), marker('user:x', 'Coffee farm')], markerName: (m) => m.name ?? m.id,
    episodes: EPISODES,
    curves: [{ id: 'oni', label: 'ONI', on: true }, { id: 'region:africa', label: 'Africa', on: false }, { id: 'place:p1', label: 'Rain · Caracas', on: true }],
    globe: false, setGlobe: vi.fn(),
    jumpTo: vi.fn(), setTab: vi.fn(), selectPlace: vi.fn(), chooseHazardKind: vi.fn(),
    commit: vi.fn(async (fn: (x: Settings) => Settings) => { s = fn(s); c.settings = s; return s; }),
    newPlaceId: () => 'pNEW',
    ...over,
  };
  return c;
}

describe('readMonth', () => {
  it('a month is the middle of it, on the timeline only', () => {
    const range = { min: 1850, max: 2026.8 };
    expect(readMonth(1997, 12, range)).toBeCloseTo(1997 + 11.5 / 12);
    expect(readMonth(1997, undefined, range)).toBeCloseTo(1997 + 6.5 / 12);
    expect(() => readMonth(1800, 1, range)).toThrow(/^OUTSIDE/);
    expect(() => readMonth(2030, 1, range)).toThrow(/^OUTSIDE/);
    expect(() => readMonth(1997, 13, range)).toThrow(/^BAD_ARG/);
    expect(() => readMonth(1997.5, 1, range)).toThrow(/^BAD_ARG/);
  });
});

describe('readLimit', () => {
  it('refuses a negative or broken limit', () => {
    expect(readLimit(undefined)).toBe(50);
    expect(() => readLimit(-1)).toThrow(/^BAD_ARG/);
    expect(() => readLimit(201)).toThrow(/^BAD_ARG/);
  });
});

describe('resolvePlace', () => {
  it('takes an id or a name, and refuses a name two places carry', () => {
    const places = [place('p1', 'Caracas'), place('p2', 'Cali'), place('p3', 'Cali')];
    expect(resolvePlace(places, 'p3').id).toBe('p3');
    expect(resolvePlace(places, 'caracas').id).toBe('p1');
    expect(() => resolvePlace(places, 'Cali')).toThrow(/^AMBIGUOUS: .*p2.*p3/);
    expect(() => resolvePlace(places, 'Lima')).toThrow('NO_PLACE: no place named "Lima"; places: Caracas, Cali (p2), Cali (p3)');
  });
});

describe('the handlers', () => {
  it('goToMonth goes through the board\'s own jump', () => {
    const c = ctx();
    climaAgentHandlers(() => c).goToMonth({ year: 1997, month: 12 });
    expect(c.jumpTo).toHaveBeenCalledWith(expect.closeTo(1997 + 11.5 / 12, 5));
  });

  it('hazards answers what is read, filtered, and says when it is not', () => {
    expect(climaAgentHandlers(() => ctx()).hazards({ kind: 'flood', limit: 1 })).toMatchObject({ total: 2, hazards: [{ title: 'a' }] });
    const loading = ctx({ hazards: { state: 'loading', items: [], error: null } });
    expect(() => climaAgentHandlers(() => loading).hazards({})).toThrow(/^LOADING/);
    const failed = ctx({ hazards: { state: 'error', items: [], error: 'HTTP_503' } });
    expect(() => climaAgentHandlers(() => failed).hazards({})).toThrow(/^UNREAD: .*HTTP_503/);
  });

  it('setLayers changes only the layers given, and answers after the save', async () => {
    const c = ctx({}, { layers: ['sst', 'hazards'] });
    const r = await climaAgentHandlers(() => c).setLayers({ land: true, sst: false });
    expect(r.layers).toEqual(['land', 'hazards']);
    expect(c.commit).toHaveBeenCalledTimes(1);
  });

  it('a save the host refuses is an error, never ok', async () => {
    const c = ctx({ commit: vi.fn(async () => { throw new Error('NOT_SAVED: host down'); }) });
    await expect(climaAgentHandlers(() => c).setLayers({ land: false })).rejects.toThrow(/^NOT_SAVED/);
  });

  it('nothing is written before the saved settings are read', async () => {
    const c = ctx({ ready: false });
    const h = climaAgentHandlers(() => c);
    await expect(h.setLayers({ land: true })).rejects.toThrow(/^NOT_READY/);
    await expect(h.addPlace({ name: 'Lima', latitude: -12, longitude: -77 })).rejects.toThrow(/^NOT_READY/);
    await expect(h.showMarker({ marker: 'California', on: false })).rejects.toThrow(/^NOT_READY/);
    expect(c.commit).not.toHaveBeenCalled();
  });

  it('addPlace saves the place, then shows it', async () => {
    const c = ctx();
    const r = await climaAgentHandlers(() => c).addPlace({ name: 'Lima', latitude: -12.05, longitude: -77.04 });
    expect(r.added).toEqual({ id: 'pNEW', name: 'Lima', lat: -12.05, lon: -77.04 });
    expect(c.settings.places.map((p) => p.id)).toContain('pNEW');
    expect(c.selectPlace).toHaveBeenCalledWith('pNEW');
  });

  it('addPlace refuses a 13th place, and coordinates out of range', async () => {
    const full = ctx({}, { places: Array.from({ length: MAX_PLACES }, (_, i) => place(`p${i}`, `P${i}`)) });
    await expect(climaAgentHandlers(() => full).addPlace({ name: 'Lima', latitude: -12, longitude: -77 })).rejects.toThrow(/^FULL/);
    expect(full.commit).not.toHaveBeenCalled();
    const c = ctx();
    await expect(climaAgentHandlers(() => c).addPlace({ name: 'X', latitude: 91, longitude: 0 })).rejects.toThrow(/^BAD_ARG/);
    await expect(climaAgentHandlers(() => c).addPlace({ name: 'X', latitude: 0, longitude: 181 })).rejects.toThrow(/^BAD_ARG/);
  });

  it('showMarker shows and hides a marker by its name', async () => {
    const c = ctx({}, { activeMarkers: ['california'] });
    await climaAgentHandlers(() => c).showMarker({ marker: 'coffee farm', on: true });
    expect(c.settings.activeMarkers).toEqual(['california', 'user:x']);
    await climaAgentHandlers(() => c).showMarker({ marker: 'California', on: false });
    expect(c.settings.activeMarkers).toEqual(['user:x']);
  });

  it('selectPlace refuses a name two places carry', () => {
    const c = ctx();
    expect(() => climaAgentHandlers(() => c).selectPlace({ place: 'Cali' })).toThrow(/^AMBIGUOUS/);
    expect(c.selectPlace).not.toHaveBeenCalled();
  });

  it('selectPlace takes the place as the person says it', () => {
    const c = ctx();
    climaAgentHandlers(() => c).selectPlace({ place: 'à Caracas' });
    expect(c.selectPlace).toHaveBeenCalledWith('p1');
    expect(c.setTab).toHaveBeenCalledWith('place');
  });

  it('showMarker refuses a marker it cannot name, with the names that exist, and writes nothing', async () => {
    const c = ctx();
    await expect(climaAgentHandlers(() => c).showMarker({ marker: 'Kenya', on: true })).rejects.toThrow('NO_MARKER: no marker named "Kenya"; markers: California, Coffee farm');
    expect(c.commit).not.toHaveBeenCalled();
  });
});

describe('by voice: episodes, the timeline, disasters, the map, curves', () => {
  const jumps = (c: ClimaAgentContext) => (c.jumpTo as ReturnType<typeof vi.fn>).mock.calls;

  it('episodes lists what the ONI defines, and which are the analogue years', () => {
    const r = climaAgentHandlers(() => ctx()).episodes({ kind: 'elnino' }) as { episodes: Array<{ id: string; analogue: boolean }> };
    expect(r.episodes.map((e) => e.id)).toEqual(['elnino-1997-05', 'elnino-2015-03', 'elnino-2023-06', 'elnino-2026-05']);
    // the ongoing episode is never its own analogue
    expect(r.episodes.map((e) => e.analogue)).toEqual([true, true, true, false]);
    const strict = ctx({}, { analogMin: 2.0 });
    const r2 = climaAgentHandlers(() => strict).episodes({}) as { episodes: Array<{ id: string; analogue: boolean }> };
    expect(r2.episodes.filter((e) => e.analogue).map((e) => e.id)).toEqual(['elnino-1997-05', 'elnino-2015-03', 'elnino-2023-06']);
    expect(() => climaAgentHandlers(() => ctx({ episodes: [] })).episodes({})).toThrow(/^LOADING/);
  });

  it('showEpisode frames the whole episode, by its words or its id', () => {
    const c = ctx();
    const h = climaAgentHandlers(() => c);
    h.showEpisode({ episode: "l'El Niño de 1997" });
    const [t, frame] = jumps(c)[0];
    expect(t).toBeCloseTo((1997 + 4.5 / 12 + 1998 + 4.5 / 12) / 2);
    expect(frame).toEqual({ span: 3 });
    h.showEpisode({ episode: 'La Niña 2011' });
    h.showEpisode({ episode: 'El Niño en cours' });
    h.showEpisode({ episode: 'elnino-2015-03' });
    expect(jumps(c)).toHaveLength(4);
  });

  it('showEpisode refuses several matches with their names, and an unknown one', () => {
    const c = ctx();
    const h = climaAgentHandlers(() => c);
    expect(() => h.showEpisode({ episode: 'El Niño' })).toThrow('AMBIGUOUS: "El Niño" names several episodes: El Niño 1997–1998, El Niño 2015–2016, El Niño 2023–2024, El Niño 2026 (ongoing); say which');
    expect(() => h.showEpisode({ episode: 'El Niño 1950' })).toThrow(/^NO_EPISODE: no episode named "El Niño 1950"; episodes: El Niño 1997–1998/);
    expect(c.jumpTo).not.toHaveBeenCalled();
  });

  it('zoomTimeline zooms as the buttons do, or to a span around the month shown', () => {
    const c = ctx({ cursor: { y: 1998, m: 1 } });
    const h = climaAgentHandlers(() => c);
    h.zoomTimeline({ zoom: 'in' });
    expect(jumps(c)[0][1]).toEqual({ factor: 1 / 1.6 });
    h.zoomTimeline({ zoom: 'out' });
    expect(jumps(c)[1][1]).toEqual({ factor: 1.6 });
    h.zoomTimeline({ years: 5 });
    expect(jumps(c)[2]).toEqual([expect.closeTo(1998 + 0.5 / 12, 5), { span: 5 }]);
    h.zoomTimeline({ zoom: 'all' });
    expect(jumps(c)[3][1]).toEqual({ span: expect.closeTo(2026.8 - 1950 + 1, 5) });
    expect(() => h.zoomTimeline({})).toThrow(/^MISSING_ARG/);
    expect(() => h.zoomTimeline({ years: 500 })).toThrow(/^BAD_ARG/);
    expect(() => h.zoomTimeline({ zoom: 'sideways' })).toThrow(/^BAD_ARG/);
  });

  it('showHazard finds a disaster by its type and country, and shows it where the person looks', () => {
    const items = [
      hazard('tc1', 'cyclone', 'Tropical Cyclone ALMA', 'Mexico', '2026-09-28T00:00:00Z'),
      hazard('tc2', 'cyclone', 'Tropical Cyclone BUD', 'Philippines'),
      hazard('eq1', 'quake', 'M 6.8 - off the coast', 'Japan'),
    ];
    const c = ctx({ hazards: { state: 'ok', items, error: null } });
    const h = climaAgentHandlers(() => c);
    expect(h.showHazard({ disaster: 'le cyclone au Mexico' })).toMatchObject({ showing: { id: 'tc1' } });
    expect(c.chooseHazardKind).toHaveBeenCalledWith('cyclone');
    expect(c.setTab).toHaveBeenCalledWith('hazards');
    expect(c.jumpTo).toHaveBeenCalledWith(expect.closeTo(2026 + 8.5 / 12, 5));
    expect(h.showHazard({ disaster: 'séisme Japan' })).toMatchObject({ showing: { id: 'eq1' } });
    expect(() => h.showHazard({ disaster: 'ouragan' })).toThrow('AMBIGUOUS: "ouragan" names several disasters: Tropical Cyclone ALMA · Mexico, Tropical Cyclone BUD · Philippines; say which');
    expect(() => h.showHazard({ disaster: 'inondation' })).toThrow(/^NO_DISASTER: .*ALMA/);
    expect(() => climaAgentHandlers(() => ctx({ hazards: { state: 'loading', items: [], error: null } })).showHazard({ disaster: 'x' })).toThrow(/^LOADING/);
  });

  it('setMapView turns the map into a globe or back', () => {
    const c = ctx();
    climaAgentHandlers(() => c).setMapView({ view: 'globe' });
    expect(c.setGlobe).toHaveBeenCalledWith(true);
    expect(() => climaAgentHandlers(() => c).setMapView({ view: 'round' })).toThrow(/^BAD_ARG/);
  });

  it('showCurve is the Curves menu switch, kept, answered after the save', async () => {
    const c = ctx();
    const h = climaAgentHandlers(() => c);
    await h.showCurve({ curve: 'the Africa curve', on: true });
    expect(c.settings.regionLanes).toEqual(['africa']);
    await h.showCurve({ curve: 'rain Caracas', on: false });
    expect(c.settings.hiddenLanes).toEqual(['place:p1']);
    await h.showCurve({ curve: 'ONI', on: true });
    expect(c.settings.hiddenLanes).toEqual(['place:p1']);
    await expect(h.showCurve({ curve: 'Europe', on: true })).rejects.toThrow('NO_CURVE: no curve named "Europe"; curves: ONI, Africa, Rain · Caracas');
  });

  it('a change the host does not save is an error, never reported done', async () => {
    const c = ctx({ commit: vi.fn(async () => { throw new Error('WRITE_FAILED: host down'); }) });
    await expect(climaAgentHandlers(() => c).showCurve({ curve: 'ONI', on: false })).rejects.toThrow(/^WRITE_FAILED/);
    await expect(climaAgentHandlers(() => c).setAnalogStrength({ strength: 'veryStrong' })).rejects.toThrow(/^WRITE_FAILED/);
    expect(c.setTab).not.toHaveBeenCalled();
  });

  it('setAnalogStrength keeps the choice, then shows the Place tab', async () => {
    const c = ctx();
    await climaAgentHandlers(() => c).setAnalogStrength({ strength: 'veryStrong' });
    expect(c.settings.analogMin).toBe(2.0);
    expect(c.setTab).toHaveBeenCalledWith('place');
    await expect(climaAgentHandlers(() => ctx({ ready: false })).setAnalogStrength({ strength: 'strong' })).rejects.toThrow(/^NOT_READY/);
  });
});
