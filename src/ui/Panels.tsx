/**
 * Panels — the five views of the side panel: the Pacific, my places, the markers, the disasters,
 * the memory. Each draws what it is given; the reading and the writing live in App and its hooks.
 */
import { useState } from 'react';
import { analogYears, recentAnomaly, summarise } from '../data/analogs';
import { latestIpc, type IpcRow } from '../data/fewsnet';
import type { Hazard, HazardKind } from '../data/hazards';
import { MAX_USER_MARKERS, rainState, type Marker, type Role } from '../data/markers';
import { lastValued } from '../data/months';
import { analogPeaks, currentRun, episodesOf, latestOni, phaseOf, strengthOf, type OniRow } from '../data/oni';
import type { PlaceSeries } from '../data/power';
import { MAX_PLACES, formatLatLon, type Place } from '../data/place';
import type { Discussion } from '../data/cpc';
import { CPC_DISCUSSION_URL } from '../data/cpc';
import { dayName, fmt, monthName, type Key, type Lang } from '../i18n/strings';
import { Source } from './Source';
import type { Loadable } from './useClimate';
import type { PourState } from './usePour';
import { sourceWords, type T } from './words';
import { Switch } from './Controls';
import { REGIONS, type RegionSeries } from '../data/continents';
import { valueAt } from '../engine/curves';
import { monthPos } from '../data/months';

export type ShareState =
  | { phase: 'idle' }
  | { phase: 'choosing' }
  | { phase: 'writing'; done: number; total: number; skipped: number }
  | { phase: 'done'; n: number; skipped: number }
  | { phase: 'failed'; error: string; written: number };


// ── the Pacific ──────────────────────────────────────────────────────────

export function PacificPanel(p: { t: T; lang: Lang; oni: Loadable<OniRow[]>; cpc: Loadable<Discussion>; retryOni: () => void; retryCpc: () => void; sstDay: string | null }) {
  const { t, lang } = p;
  const w = sourceWords(t);
  return (
    <div className="stack">
      <section className="glass card">
        <h3>{t('enso.cpc')}</h3>
        <Source of={p.cpc} retry={p.retryCpc} words={{ ...w, failed: (why) => `${t('enso.unread')} · ${why}` }}>
          {(d) => d.status ? (
            <div className="stack-sm">
              <div className={`status-pill ${d.kind ?? 'other'}`}>
                <strong>{t(`enso.status.${d.kind ?? 'other'}` as Key)}</strong>
                <span className="muted">« {d.status} »</span>
              </div>
              {d.issued && <div className="muted small">{t('enso.issued', { date: dayName(lang, d.issued) })}</div>}
              {d.synopsis && <blockquote className="quote">{d.synopsis}</blockquote>}
              <a className="link" href={CPC_DISCUSSION_URL} target="_blank" rel="noreferrer">{t('enso.read')}</a>
            </div>
          ) : (
            <div className="error-line">{t('enso.unread')}</div>
          )}
        </Source>
      </section>

      <section className="glass card">
        <h3>{t('enso.oni')}</h3>
        <Source of={p.oni} retry={p.retryOni} words={w}>
          {(rows) => {
            const last = latestOni(rows);
            const run = currentRun(rows);
            const eps = episodesOf(rows).filter((e) => e.kind === 'elnino' || e.kind === 'lanina').slice(-6).reverse();
            if (!last) return null;
            const phase = phaseOf(last.v!);
            const strength = strengthOf(last.v!);
            return (
              <div className="stack-sm">
                <div className="big-number">
                  <span className={`oni-value ${phase}`}>{fmt(lang, last.v!, 2, true)} °C</span>
                  <span className="muted">{last.season} {last.y}</span>
                </div>
                <div>
                  {t(`enso.phase.${phase}` as Key)}{strength ? ` · ${t(`enso.strength.${strength}` as Key)}` : ''}
                  {run && <span className="muted small"> · {t('enso.run', { n: run.seasons })}</span>}
                </div>
                <p className="muted small">{t('enso.roni')}</p>
                <h4>{t('enso.episodes')}</h4>
                <ul className="plain small">
                  {eps.map((e) => (
                    <li key={`${e.kind}${e.start.y}${e.start.m}`}>
                      {t('enso.episode', {
                        kind: t(`enso.phase.${e.kind}` as Key),
                        from: monthName(lang, e.start.y, e.start.m, 'short'),
                        to: e.ongoing ? t('enso.ongoing') : monthName(lang, e.end.y, e.end.m, 'short'),
                        peak: fmt(lang, e.peak.v, 1, true),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            );
          }}
        </Source>
      </section>
      {p.sstDay && <div className="muted small">{t('enso.heatDay', { date: dayName(lang, p.sstDay) })}</div>}
    </div>
  );
}

// ── analogue table, shared by places and markers ─────────────────────────

export function AnalogTable(p: { t: T; lang: Lang; series: PlaceSeries; oni: OniRow[]; min: number; variable: 'rain' | 'temp' }) {
  const { t, lang } = p;
  const peaks = analogPeaks(episodesOf(p.oni), p.min, 1981);
  if (peaks.length === 0) return <div className="muted small">{t('analog.none')}</div>;
  const years = analogYears(p.variable === 'rain' ? p.series.rain : p.series.temp, peaks);
  const sum = summarise(years);
  const cell = (v: { pct: number | null; delta: number | null }) => {
    if (p.variable === 'rain') return v.pct == null ? t('place.missing') : `${Math.round(v.pct)}`;
    return v.delta == null ? t('place.missing') : fmt(lang, v.delta, 1, true);
  };
  const tone = (v: { pct: number | null; delta: number | null }) => {
    if (p.variable === 'rain') return v.pct == null ? '' : v.pct < 75 ? 'dry' : v.pct > 125 ? 'wet' : '';
    return v.delta == null ? '' : v.delta > 0.5 ? 'hot' : v.delta < -0.5 ? 'cool' : '';
  };
  return (
    <div className="analog">
      <div className="muted small">{p.variable === 'rain' ? t('analog.rainCell') : t('analog.tempCell')}</div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('analog.month')}</th>
              {years.map((y) => <th key={`${y.peak.y}-${y.peak.m}`}>{monthName(lang, y.peak.y, y.peak.m, 'short')}<br /><span className="muted">{fmt(lang, y.peak.v, 1, true)}</span></th>)}
              <th>{t('analog.n', { n: years.length })}</th>
            </tr>
          </thead>
          <tbody>
            {sum.map((s) => (
              <tr key={s.offset}>
                <th>{s.offset === 0 ? t('analog.peak') : t('analog.after', { n: s.offset })}</th>
                {years.map((y) => {
                  const c = y.cells[s.offset]!;
                  return <td key={`${y.peak.y}-${s.offset}`} className={tone(c)} title={monthName(lang, c.y, c.m)}>{cell(c)}</td>;
                })}
                <td className="muted small">{p.variable === 'rain' ? t('analog.below', { below: s.below, n: s.n }) : `N ${s.n}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted small">{t('analog.normal')}</div>
    </div>
  );
}

// ── my places ────────────────────────────────────────────────────────────

export function PlacesPanel(p: {
  t: T; lang: Lang; places: Place[]; selected: string | null; series: Record<string, Loadable<PlaceSeries>>; retrySeries: () => void;
  oni: OniRow[] | null; analogMin: 1.5 | 2.0; picking: boolean; pending: { lat: number; lon: number } | null;
  onSelect: (id: string) => void; onAdd: () => void; onCancel: () => void; onSave: (name: string) => void; onRemove: (id: string) => void; onAnalogMin: (v: 1.5 | 2.0) => void;
}) {
  const { t, lang } = p;
  const [name, setName] = useState('');
  const [variable, setVariable] = useState<'rain' | 'temp'>('rain');
  const place = p.places.find((x) => x.id === p.selected) ?? null;
  const s = place ? p.series[place.id] : undefined;
  return (
    <div className="stack">
      <div className="row wrap">
        {p.places.map((pl) => (
          <button key={pl.id} type="button" className={`chip-tile glass${pl.id === p.selected ? ' chosen' : ''}`} onClick={() => p.onSelect(pl.id)}>
            <strong>{pl.name}</strong>
            <span className="muted small">{formatLatLon(pl.lat, pl.lon)}</span>
          </button>
        ))}
        {!p.picking && !p.pending && p.places.length < MAX_PLACES && <button type="button" className="primary" onClick={p.onAdd}>＋ {t('place.add')}</button>}
        {p.places.length >= MAX_PLACES && <span className="muted small">{t('place.full', { n: MAX_PLACES })}</span>}
      </div>
      {p.places.length === 0 && !p.picking && !p.pending && <div className="muted small">{t('place.none')}</div>}
      {p.picking && !p.pending && (
        <div className="row"><span>{t('place.picking')}</span><button type="button" onClick={p.onCancel}>{t('place.cancel')}</button></div>
      )}
      {p.pending && (
        <form className="glass card row wrap" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { p.onSave(name.trim()); setName(''); } }}>
          <span className="muted small">{formatLatLon(p.pending.lat, p.pending.lon)}</span>
          <input aria-label={t('place.name')} placeholder={t('place.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
          <button type="submit" className="primary" disabled={!name.trim()}>{t('place.save')}</button>
          <button type="button" onClick={p.onCancel}>{t('place.cancel')}</button>
        </form>
      )}

      {place && s && (
        <section className="glass card stack-sm">
          <div className="row between">
            <h3>{place.name}</h3>
            <button type="button" className="icon-btn" title={t('place.remove', { name: place.name })} aria-label={t('place.remove', { name: place.name })} onClick={() => p.onRemove(place.id)}>✕</button>
          </div>
          <Source of={s} retry={p.retrySeries} words={{ ...sourceWords(t), loading: t('place.loading'), failed: (why) => t('place.failed', { why }) }}>
            {(data) => (
              <div className="stack-sm">
                {data.elevation != null && <div className="muted small">{formatLatLon(place.lat, place.lon)} · {t('place.elevation', { m: Math.round(data.elevation) })}</div>}
                <LastMonths t={t} lang={lang} data={data} />
                <div className="row wrap">
                  <div className="segmented glass" role="group" aria-label={t('analog.title')}>
                    <button type="button" aria-pressed={p.analogMin === 1.5} onClick={() => p.onAnalogMin(1.5)}>{t('analog.strong')}</button>
                    <button type="button" aria-pressed={p.analogMin === 2.0} onClick={() => p.onAnalogMin(2.0)}>{t('analog.veryStrong')}</button>
                  </div>
                  <div className="segmented glass" role="group">
                    <button type="button" aria-pressed={variable === 'rain'} onClick={() => setVariable('rain')}>💧 {t('place.rain')}</button>
                    <button type="button" aria-pressed={variable === 'temp'} onClick={() => setVariable('temp')}>🌡 {t('place.temp')}</button>
                  </div>
                </div>
                <h4>{t('analog.title')}</h4>
                {p.oni ? <AnalogTable t={t} lang={lang} series={data} oni={p.oni} min={p.analogMin} variable={variable} /> : <div className="muted small">{t('src.loading')}</div>}
              </div>
            )}
          </Source>
        </section>
      )}
    </div>
  );
}

function LastMonths(p: { t: T; lang: Lang; data: PlaceSeries }) {
  const { t, lang } = p;
  const last = lastValued(p.data.rain);
  if (!last) return null;
  const rows = p.data.rain.filter((r) => r.y * 12 + r.m > last.y * 12 + last.m - 12 && r.y * 12 + r.m <= last.y * 12 + last.m);
  const recent = recentAnomaly(p.data.rain, 3);
  return (
    <div className="stack-sm">
      <h4>{t('place.lastMonths')}</h4>
      <div className="months">
        {rows.map((r) => (
          <div key={`${r.y}-${r.m}`} className="month glass">
            <span className="muted small">{monthName(lang, r.y, r.m, 'short')}</span>
            <strong>{r.v == null ? t('place.missing') : t('place.mm', { v: fmt(lang, r.v, 0) })}</strong>
          </div>
        ))}
      </div>
      {recent && (
        <div className={`small rain-${rainState(recent.pct)}`}>
          {t('marker.rain3', { from: monthName(lang, recent.from.y, recent.from.m, 'short'), to: monthName(lang, recent.to.y, recent.to.m, 'short') })}:{' '}
          <strong>{t('place.pct', { v: Math.round(recent.pct) })}</strong> · {t(`marker.rain.${rainState(recent.pct)}` as Key)}
        </div>
      )}
    </div>
  );
}

// ── markers ──────────────────────────────────────────────────────────────

export function MarkersPanel(p: {
  t: T; lang: Lang; markers: Marker[]; active: string[]; name: (m: Marker) => string;
  series: Record<string, Loadable<PlaceSeries>>; retrySeries: () => void; ipc: Record<string, Loadable<IpcRow[]>>;
  oni: OniRow[] | null; analogMin: 1.5 | 2.0; picking: boolean; pending: { lat: number; lon: number } | null;
  onToggle: (id: string) => void; onAdd: () => void; onCancel: () => void; onSave: (name: string, role: Role, fews: string) => void; onRemove: (id: string) => void;
}) {
  const { t, lang } = p;
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('impact');
  const [fews, setFews] = useState('');
  const groups: { title: string | null; items: Marker[] }[] = [
    { title: null, items: p.markers.filter((m) => m.group !== 'coffee' && m.builtIn) },
    { title: t('marker.group.coffee'), items: p.markers.filter((m) => m.group === 'coffee') },
    { title: t('marker.group.mine'), items: p.markers.filter((m) => !m.builtIn) },
  ].filter((g) => g.items.length > 0);
  return (
    <div className="stack">
      {groups.map((g) => (<div key={g.title ?? 'main'} className="stack">
      {g.title && <div className="pop-sub">{g.title}</div>}
      {g.items.map((m) => {
        const on = p.active.includes(m.id);
        const s = p.series[m.id];
        const ipc = m.fews ? p.ipc[m.id] : undefined;
        return (
          <section key={m.id} className={`glass card stack-sm marker ${m.role}`}>
            <div className="row between">
              <div className="grow">
                <Switch
                  icon={m.role === 'precursor' ? '🔭' : '🌾'}
                  label={p.name(m)}
                  detail={`${t(`marker.role.${m.role}` as Key)}${m.noteKey ? ` · ${t(m.noteKey as Key)}` : ''}`}
                  on={on}
                  onChange={() => p.onToggle(m.id)}
                />
              </div>
              {!m.builtIn && <button type="button" className="icon-btn" title={t('marker.remove', { name: p.name(m) })} aria-label={t('marker.remove', { name: p.name(m) })} onClick={() => p.onRemove(m.id)}>✕</button>}
            </div>
            {on && s && (
              <Source of={s} retry={p.retrySeries} words={{ ...sourceWords(t), loading: t('marker.loading') }}>
                {(data) => {
                  const recent = recentAnomaly(data.rain, 3);
                  return (
                    <div className="stack-sm">
                      {recent && (
                        <div className={`small rain-${rainState(recent.pct)}`}>
                          {t('marker.rain3', { from: monthName(lang, recent.from.y, recent.from.m, 'short'), to: monthName(lang, recent.to.y, recent.to.m, 'short') })}:{' '}
                          <strong>{t('place.pct', { v: Math.round(recent.pct) })}</strong> · {t(`marker.rain.${rainState(recent.pct)}` as Key)}
                        </div>
                      )}
                      {p.oni && <AnalogTable t={t} lang={lang} series={data} oni={p.oni} min={p.analogMin} variable="rain" />}
                    </div>
                  );
                }}
              </Source>
            )}
            {on && ipc && (
              <div className="stack-sm">
                <h4>{t('marker.ipc')}</h4>
                <Source of={ipc} words={sourceWords(t)}>
                  {(rows) => {
                    const { current, projection } = latestIpc(rows);
                    if (!current && !projection) return <div className="muted small">{t('marker.ipcNone')}</div>;
                    return (
                      <div className="stack-sm small">
                        {current && <div className={`ipc phase-${current.phase}`}>{t('marker.ipcCurrent', { phase: current.phase, label: current.label, from: monthName(lang, Number(current.start.slice(0, 4)), Number(current.start.slice(5, 7))) })}</div>}
                        {projection && <div className={`ipc projection phase-${projection.phase}`}>{t('marker.ipcProjection', { phase: projection.phase, label: projection.label, from: monthName(lang, Number(projection.start.slice(0, 4)), Number(projection.start.slice(5, 7))), made: projection.madeOn ? dayName(lang, projection.madeOn) : t('place.missing') })}</div>}
                      </div>
                    );
                  }}
                </Source>
              </div>
            )}
          </section>
        );
      })}
      </div>))}

      {!p.picking && !p.pending && p.markers.filter((m) => !m.builtIn).length < MAX_USER_MARKERS && <button type="button" className="primary" onClick={p.onAdd}>＋ {t('marker.add')}</button>}
      {p.markers.filter((m) => !m.builtIn).length >= MAX_USER_MARKERS && <span className="muted small">{t('place.full', { n: MAX_USER_MARKERS })}</span>}
      {p.picking && !p.pending && <div className="row"><span>{t('place.picking')}</span><button type="button" onClick={p.onCancel}>{t('place.cancel')}</button></div>}
      {p.pending && (
        <form className="glass card stack-sm" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { p.onSave(name.trim(), role, fews.trim().toUpperCase()); setName(''); setFews(''); } }}>
          <span className="muted small">{formatLatLon(p.pending.lat, p.pending.lon)}</span>
          <input aria-label={t('place.name')} placeholder={t('place.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
          <div className="row wrap" role="group" aria-label={t('marker.role')}>
            {(['precursor', 'impact'] as Role[]).map((r) => (
              <button key={r} type="button" className={`chip-tile glass${role === r ? ' chosen' : ''}`} onClick={() => setRole(r)}>{t(`marker.role.${r}` as Key)}</button>
            ))}
          </div>
          <input aria-label={t('marker.fewsCountry')} placeholder={t('marker.fewsCountry')} value={fews} onChange={(e) => setFews(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2))} />
          <div className="row">
            <button type="submit" className="primary" disabled={!name.trim()}>{t('place.save')}</button>
            <button type="button" onClick={p.onCancel}>{t('place.cancel')}</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── disasters ────────────────────────────────────────────────────────────

/** Rows drawn at once; past it the list says how many it leaves out (doc 93 §10). */
const LIST_MAX = 200;

const KINDS: HazardKind[] = ['cyclone', 'flood', 'drought', 'quake', 'volcano', 'fire', 'storm', 'ice', 'other'];

export interface HistoryItem { id: 'tracks' | 'quakes' | 'droughts'; state: Loadable<number> | null }

export function HazardsPanel(p: {
  t: T; lang: Lang; hazards: Loadable<{ items: Hazard[]; failed: string[] }>; retry: () => void;
  kind: HazardKind | 'all'; onKind: (k: HazardKind | 'all') => void; onFocus: (h: Hazard) => void;
  history: HistoryItem[]; onLoadHistory: (id: HistoryItem['id']) => void;
}) {
  const { t, lang } = p;
  return (
    <div className="stack">
      <Source of={p.hazards} retry={p.retry} words={sourceWords(t)}>
        {({ items, failed }) => {
          const counts = new Map<HazardKind, number>();
          for (const h of items) counts.set(h.kind, (counts.get(h.kind) ?? 0) + 1);
          const shown = p.kind === 'all' ? items : items.filter((h) => h.kind === p.kind);
          return (
            <div className="stack-sm">
              <div className="row wrap">
                <button type="button" className={`chip-tile glass${p.kind === 'all' ? ' chosen' : ''}`} onClick={() => p.onKind('all')}>{t('hazard.all')} · {items.length}</button>
                {KINDS.filter((k) => counts.get(k)).map((k) => (
                  <button key={k} type="button" className={`chip-tile glass${p.kind === k ? ' chosen' : ''}`} onClick={() => p.onKind(k)}>{t(`hazard.kind.${k}` as Key)} · {counts.get(k)}</button>
                ))}
              </div>
              {failed.map((f) => <div key={f} className="error-line small">{t('src.failed', { why: f })}</div>)}
              {shown.length === 0 && <div className="muted small">{t('hazard.none')}</div>}
              {shown.length > LIST_MAX && <div className="muted small">{t('hazard.more', { shown: LIST_MAX, n: shown.length })}</div>}
              <ul className="plain hazard-list">
                {shown.slice(0, LIST_MAX).map((h) => (
                  <li key={h.id}>
                    <button type="button" className="hazard-row" onClick={() => p.onFocus(h)}>
                      <span className={`dot ${h.kind}`} aria-hidden />
                      <span className="grow">
                        <strong>{h.title}</strong>
                        <span className="muted small"> · {dayName(lang, h.from)}{h.country ? ` · ${h.country}` : ''}{h.measure ? ` · ${h.measure}` : ''}</span>
                      </span>
                      {h.level && <span className={`level ${h.level}`}>{t(`hazard.level.${h.level}` as Key)}</span>}
                    </button>
                    {h.url && <a className="link small" href={h.url} target="_blank" rel="noreferrer">{t('hazard.open')}</a>}
                  </li>
                ))}
              </ul>
            </div>
          );
        }}
      </Source>

      <section className="glass card stack-sm">
        <h3>{t('hazard.history')}</h3>
        {p.history.map((h) => {
          const label = h.id === 'tracks' ? t('hazard.tracks') : h.id === 'quakes' ? t('hazard.quakes') : t('hazard.droughts');
          const size = h.id === 'tracks' ? t('hazard.tracksSize') : h.id === 'quakes' ? t('hazard.quakesSize') : t('hazard.droughtsSize');
          return (
            <div key={h.id} className="row between wrap">
              <div><div>{label}</div><div className="muted small">{size}</div></div>
              {h.state === null && <button type="button" onClick={() => p.onLoadHistory(h.id)}>{t('hazard.load')}</button>}
              {h.state?.status === 'loading' && <span className="muted small" role="status">{t('src.loading')}</span>}
              {h.state?.status === 'ok' && <span className="small">{t('hazard.loaded', { n: h.state.data })}</span>}
              {h.state?.status === 'error' && (
                <span className="error-line small">{t('src.failed', { why: h.state.error })} <button type="button" className="small-btn" onClick={() => p.onLoadHistory(h.id)}>{t('src.retry')}</button></span>
              )}
            </div>
          );
        })}
      </section>
      <div className="muted small">{t('hazard.sources')}</div>
    </div>
  );
}

// ── memory ───────────────────────────────────────────────────────────────

export interface PourOption { id: string; label: string; count: number | null; lastOn: string | null; ready: boolean }

export function MemoryPanel(p: {
  t: T; lang: Lang; options: PourOption[]; pour: PourState; onPour: (id: string) => void; onStop: () => void;
  watch: boolean; onWatch: (on: boolean) => void; watchError: string | null; inbox: { count: number; labels: string[]; error: string | null } | null; onClearInbox: () => void;
  pinned: boolean | null; onPin: () => void; pinError: string | null; pinAvailable: boolean;
  onShare: () => void; share: ShareState;
}) {
  const { t, lang } = p;
  const running = p.pour.phase === 'running';
  const perm = (err: string) => (err.startsWith('PERMISSION:') ? t('mem.permission', { perm: err.slice('PERMISSION:'.length) }) : err);
  return (
    <div className="stack">
      <section className="glass card stack-sm">
        <h3>{t('mem.title')}</h3>
        {p.options.map((o) => (
          <div key={o.id} className="row between wrap">
            <div>
              <div>{o.label}{o.count != null ? <span className="muted small"> · {o.count}</span> : null}</div>
              {o.lastOn && <div className="muted small">{t('mem.last', { date: dayName(lang, o.lastOn) })}</div>}
            </div>
            <button type="button" className="primary" disabled={running || !o.ready} onClick={() => p.onPour(o.id)}>{t('mem.pour')}</button>
          </div>
        ))}
        {p.pour.phase === 'running' && (
          <div className="row" role="status">
            <span>{t('mem.progress', { done: p.pour.done, total: p.pour.total })}</span>
            <progress value={p.pour.done} max={Math.max(1, p.pour.total)} />
            <button type="button" onClick={p.onStop}>{t('mem.stop')}</button>
          </div>
        )}
        {p.pour.phase === 'finished' && (
          <div className="stack-sm small">
            <div>{p.pour.stopped ? t('mem.stopped', { n: p.pour.written, vault: p.pour.vault }) : t('mem.done', { n: p.pour.written, vault: p.pour.vault })}</div>
            {p.pour.refused > 0 && <div className="error-line">{t('mem.refused', { n: p.pour.refused })}</div>}
            {p.pour.skipped > 0 && <div className="error-line">{t('mem.skipped', { n: p.pour.skipped })}</div>}
            <div className="muted">{t('mem.scope', { vault: p.pour.vault })}</div>
          </div>
        )}
        {p.pour.phase === 'failed' && (
          <div className="error-line small">{p.pour.error === 'NO_KNOWLEDGE_ROOT' ? t('mem.noRoot') : t('mem.failed', { why: perm(p.pour.error) })}</div>
        )}
      </section>

      <section className="glass card stack-sm">
        <Switch icon="🔔" label={t('mem.watch')} detail={p.watch ? t('mem.watchOn') : t('mem.watchOff')} on={p.watch} onChange={p.onWatch} />
        {p.watchError && <div className="error-line small">{perm(p.watchError)}</div>}
        {p.inbox && p.inbox.count > 0 && (
          <div className="row between small">
            <span>{t('mem.watchInbox', { n: p.inbox.count })}{p.inbox.labels.length ? ` : ${p.inbox.labels.join(' · ')}` : ''}</span>
            <button type="button" className="small-btn" onClick={p.onClearInbox}>✓</button>
          </div>
        )}
        {p.inbox?.error && <div className="error-line small">{t('mem.watchError', { why: p.inbox.error })}</div>}
      </section>

      {p.pinAvailable && (
        <section className="glass card row between wrap">
          <h3>{t('mem.pin')}</h3>
          <button type="button" className={p.pinned ? '' : 'primary'} disabled={p.pinned === null} onClick={p.onPin}>{p.pinned ? t('mem.unpin') : `📌 ${t('mem.pin')}`}</button>
          {p.pinError && <div className="error-line small">{t('mem.pinFailed', { why: perm(p.pinError) })}</div>}
        </section>
      )}

      <section className="glass card stack-sm">
        <div className="row between wrap">
          <h3>{t('mem.share')}</h3>
          <button type="button" disabled={p.share.phase === 'choosing' || p.share.phase === 'writing'} onClick={p.onShare}>📁 {t('mem.share')}</button>
        </div>
        <div className="muted small">{t('mem.shareHint')}</div>
        {p.share.phase === 'choosing' && <div className="muted small" role="status">{t('mem.shareChoosing')}</div>}
        {p.share.phase === 'writing' && (
          <div className="row small" role="status">
            <span>{t('mem.progress', { done: p.share.done, total: p.share.total })}</span>
            <progress value={p.share.done} max={Math.max(1, p.share.total)} />
          </div>
        )}
        {p.share.phase === 'done' && <div className="small">{t('mem.shareDone', { n: p.share.n })}</div>}
        {(p.share.phase === 'done' || p.share.phase === 'writing') && p.share.skipped > 0 && <div className="error-line small">{t('mem.shareSkipped', { n: p.share.skipped })}</div>}
        {p.share.phase === 'failed' && <div className="error-line small">{perm(p.share.error)}{p.share.written > 0 ? ` · ${t('mem.shareDone', { n: p.share.written })}` : ''}</div>}
      </section>
    </div>
  );
}

// ── the month's averages: the world and each continent ──────────────────

export function AveragesPanel(p: {
  t: T; lang: Lang; regions: Loadable<Record<string, RegionSeries | { error: string }>>; retry: () => void;
  month: { y: number; m: number }; lanes: string[]; onLane: (id: string) => void;
}) {
  const { t, lang } = p;
  const at = monthPos(p.month.y, p.month.m);
  return (
    <div className="stack">
      <section className="glass card stack-sm">
        <h3>{t('avg.title', { month: monthName(lang, p.month.y, p.month.m) })}</h3>
        <Source of={p.regions} retry={p.retry} words={sourceWords(t)}>
          {(all) => {
            const base = REGIONS.map((r) => all[r.id]).find((x): x is RegionSeries => !!x && 'series' in x)?.base ?? null;
            return (
              <div className="stack-sm">
                <ul className="plain averages">
                  {REGIONS.map((r) => {
                    const s = all[r.id];
                    const v = s && 'series' in s ? valueAt(s.series, at) : null;
                    return (
                      <li key={r.id} className="avg-row">
                        <span className="avg-name">{t(r.key as Key)}</span>
                        {s && 'error' in s
                          ? <span className="error-line small">{t('src.failed', { why: s.error })}</span>
                          : <strong className={`avg-value ${v == null ? 'muted' : v > 0 ? 'warm' : 'cold'}`}>{v == null ? t('place.missing') : `${fmt(lang, v, 2, true)} °C`}</strong>}
                        <span className="avg-bar" aria-hidden>{v != null && <span className={v > 0 ? 'warm-bg' : 'cold-bg'} style={{ width: `${Math.min(100, Math.abs(v) / 3 * 100)}%` }} />}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="pop-sub">{t('avg.lane')}</div>
                <div className="switch-list">
                  {REGIONS.map((r) => <Switch key={r.id} label={t(r.key as Key)} on={p.lanes.includes(r.id)} onChange={() => p.onLane(r.id)} />)}
                </div>
                <div className="muted small">{t('avg.base', { base: base ?? t('place.missing') })}</div>
              </div>
            );
          }}
        </Source>
      </section>
    </div>
  );
}
