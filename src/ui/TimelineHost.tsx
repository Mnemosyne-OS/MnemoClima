/**
 * TimelineHost — the timeline's own moment, kept here and not in App (Tony, 11/10: « it is not
 * smooth »).
 *
 * A drag moves the view at every pointer frame. When that view lived in App, every frame
 * re-rendered the whole cartridge (the map redrew its 13 000 ocean cells and the panels their
 * tables) for a cursor that, most frames, stayed in the same month. Here a frame redraws the
 * timeline only; App hears the cursor's MONTH, and only when it changes.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { centreOn, span, zoomAt, type View } from '@mnemosyne_os/timeline-map/view';
import { Pill, Popover, Switch } from './Controls';
import type { Theme } from '@mnemosyne_os/timeline-map/theme';
import type { Episode } from '../data/oni';
import { monthAt } from '../data/months';
import { climaRange, openingView, type Lane } from '../engine/curves';
import TimelineView from './TimelineView';

export interface TimelineHostProps {
  theme: Theme;
  lanes: Lane[];
  episodes: Episode[];
  cursorLabel: (t: number) => string;
  missing: string;
  ariaLabel: string;
  /** A jump asked from outside (another board window, an agent); `n` changes at each one. A
   *  `span` (years) frames the timeline around `t`; a `factor` zooms it around its middle, as
   *  the − and + buttons do. */
  jump: { t: number; n: number; span?: number; factor?: number } | null;
  /** The cursor entered another month. */
  onMonth: (y: number, m: number) => void;
  /** The cursor moved (for the other board windows). */
  onCursor: (t: number) => void;
  /** Every curve the timeline can show, each with its switch. */
  choices: { id: string; label: string; on: boolean; group: string }[];
  onChoice: (id: string) => void;
  words: { zoomIn: string; zoomOut: string; all: string; now: string; curves: string; curvesTitle: string };
}

function TimelineHost(p: TimelineHostProps) {
  const [view, setView] = useState<View>(() => openingView());
  const props = useRef(p);
  props.current = p;
  const month = useRef(monthAt((view.y0 + view.y1) / 2));

  const report = useCallback((v: View, tell: boolean) => {
    const t = (v.y0 + v.y1) / 2;
    const m = monthAt(t);
    if (m.y !== month.current.y || m.m !== month.current.m) {
      month.current = m;
      props.current.onMonth(m.y, m.m);
    }
    if (tell) props.current.onCursor(t);
  }, []);

  const onView = useCallback((v: View) => {
    setView(v);
    report(v, true);
  }, [report]);

  // a jump from another window: moved here, never echoed back
  useEffect(() => {
    if (!p.jump) return;
    setView((v) => {
      const j = p.jump!;
      const next = j.factor ? zoomAt(v, (v.y0 + v.y1) / 2, j.factor, climaRange()) : centreOn(j.t, j.span ?? span(v), climaRange());
      report(next, false);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.jump?.n]);

  const [menu, setMenu] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenu(false), []);
  const r = climaRange();
  const mid = (view.y0 + view.y1) / 2;
  const groups = [...new Set(p.choices.map((c) => c.group))];

  return (
    <div className="timeline-host">
      <div className="timeline-tools">
        <div className="segmented glass" role="group">
          <button type="button" title={p.words.zoomOut} aria-label={p.words.zoomOut} onClick={() => onView(zoomAt(view, mid, 1.6, r))}>−</button>
          <button type="button" title={p.words.zoomIn} aria-label={p.words.zoomIn} onClick={() => onView(zoomAt(view, mid, 1 / 1.6, r))}>+</button>
        </div>
        <Pill icon="⟷" label={p.words.all} onClick={() => onView(centreOn((1950 + r.centre.max) / 2, r.centre.max - 1950 + 1, r))} />
        <Pill icon="◉" label={p.words.now} onClick={() => onView(openingView())} />
        <Pill refEl={anchor} icon="📈" label={`${p.words.curves} · ${p.choices.filter((c) => c.on).length}`} active={menu} onClick={() => setMenu((m) => !m)} />
        <Popover open={menu} onClose={closeMenu} anchor={anchor} className="curves-pop">
          <div className="pop-title">{p.words.curvesTitle}</div>
          {groups.map((g) => (
            <div key={g} className="switch-group">
              <div className="pop-sub">{g}</div>
              <div className="switch-list">
                {p.choices.filter((c) => c.group === g).map((c) => <Switch key={c.id} label={c.label} on={c.on} onChange={() => p.onChoice(c.id)} />)}
              </div>
            </div>
          ))}
        </Popover>
      </div>
      {/* the tools sit in their own bar: over the canvas they covered the cursor's month */}
      <div className="timeline-canvas">
        <TimelineView
          theme={p.theme} lanes={p.lanes} episodes={p.episodes} view={view} onView={onView}
          cursorLabel={p.cursorLabel} missing={p.missing} ariaLabel={p.ariaLabel}
        />
      </div>
    </div>
  );
}

export default memo(TimelineHost);
