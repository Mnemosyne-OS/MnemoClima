/**
 * MapChrome — what sits over the map: one « Layers » button that opens a panel of switches (each
 * layer with its name and one line of state), the view (flat or globe), and ONE legend card for
 * the colours with the date of each grid and the download of the archive.
 *
 * Replaces a row of unlabelled icons (Tony, 11/10: « a panel easy to understand to turn things on
 * and off »).
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pill, Popover, Switch } from './Controls';
import type { Layer } from './store';

export interface LayerRow { id: Layer; icon: string; label: string; detail: ReactNode; error?: boolean }

export function LayersMenu(p: {
  rows: LayerRow[]; on: Layer[]; onToggle: (l: Layer) => void;
  globe: boolean; onGlobe: (g: boolean) => void;
  words: { button: string; title: string; view: string; flat: string; globe: string };
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const count = p.rows.filter((r) => p.on.includes(r.id)).length;
  return (
    <div className="map-menu">
      <Pill refEl={anchor} icon="🗂" label={`${p.words.button} · ${count}/${p.rows.length}`} active={open} onClick={() => setOpen((o) => !o)} />
      <Popover open={open} onClose={close} anchor={anchor} className="layers-pop">
        <div className="pop-title">{p.words.title}</div>
        <div className="switch-list">
          {p.rows.map((r) => (
            <Switch key={r.id} icon={r.icon} label={r.label} detail={r.detail} tone={r.error ? 'error' : undefined} on={p.on.includes(r.id)} onChange={() => p.onToggle(r.id)} />
          ))}
        </div>
        <div className="pop-title">{p.words.view}</div>
        <div className="segmented glass wide" role="group" aria-label={p.words.view}>
          <button type="button" aria-pressed={!p.globe} onClick={() => p.onGlobe(false)}>🗺 {p.words.flat}</button>
          <button type="button" aria-pressed={p.globe} onClick={() => p.onGlobe(true)}>🌍 {p.words.globe}</button>
        </div>
      </Popover>
    </div>
  );
}

export interface LegendLine { icon: string; text: ReactNode; tone?: 'muted' | 'error'; action?: { label: string; onClick: () => void } }

/** The colours, then one line per grid shown (its own date, or why it is not there), then extras. */
export function MapLegend(p: { title: string; lines: LegendLine[]; footer?: ReactNode }) {
  const [folded, setFolded] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  return (
    <div className="map-legend glass">
      <button type="button" className="legend-head" aria-expanded={!folded} onClick={() => setFolded((f) => !f)}>
        <span>{p.title}</span>
        <span aria-hidden>{folded ? '▸' : '▾'}</span>
      </button>
      {!folded && (
        <>
          <div className="ramp" aria-hidden />
          <div className="ramp-scale" aria-hidden><span>−3 °C</span><span>0</span><span>+3 °C</span></div>
          <ul className="legend-lines">
            {p.lines.map((l, i) => (
              <li key={i} className={l.tone ?? ''}>
                <span aria-hidden>{l.icon}</span>
                <span className="grow">{l.text}</span>
                {l.action && <button type="button" className="small-btn" onClick={l.action.onClick}>{l.action.label}</button>}
              </li>
            ))}
          </ul>
          {p.footer}
        </>
      )}
    </div>
  );
}
