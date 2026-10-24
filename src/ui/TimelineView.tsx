/**
 * TimelineView — the curves one under the other, on one shared time: El Niño, the world's
 * temperature, the slow oceans, the rain at the place shown, the markers. The lag between the
 * Pacific's peak and what follows is SEEN here (doc 147 §4), never computed into a promise.
 *
 * The cursor is the centre of the view (MnemoClio's rule). Drag, wheel, arrow keys. One frame
 * per change, never a loop.
 */
import { useEffect, useRef } from 'react';
import { panBy, span, zoomAt, type View } from '@mnemosyne_os/timeline-map/view';
import { completeTheme, type Theme } from '@mnemosyne_os/timeline-map/theme';
import type { Episode } from '../data/oni';
import { monthPos } from '../data/months';
import { readClimaColors } from '../engine/canvasColors';
import { barColour, barSpan, barValue, climaRange, ticksFor, valueAt, type Lane } from '../engine/curves';

export interface TimelineProps {
  theme: Theme;
  lanes: Lane[];
  episodes: Episode[];
  view: View;
  onView: (v: View) => void;
  cursorLabel: (t: number) => string;
  missing: string;
  ariaLabel: string;
}

const GUTTER = 200;
/** The names' column: 150 px and more on a screen, a third of a phone (375 px gives 120). */
const gutterOf = (W: number) => Math.min(GUTTER, W < 500 ? Math.max(110, W * 0.32) : Math.max(150, W * 0.24));
const RULER = 26;
const LANE_GAP = 6;

export default function TimelineView(p: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef(p);
  props.current = p;
  const raf = useRef(0);
  const range = useRef(climaRange());

  const redraw = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => { raf.current = 0; draw(); });
  };
  useEffect(() => { redraw(); });
  // 🪤 the cleanup must ZERO the handle: StrictMode runs it once at mount, and a cancelled frame
  // whose id stayed in the ref made every later redraw() return early (a canvas never drawn)
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; }, []);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const P = props.current;
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (W <= 0 || H <= 0) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const th = completeTheme(P.theme);
    const cc = readClimaColors();
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);

    const gutter = gutterOf(W);
    const plotW = W - gutter;
    const { y0, y1 } = P.view;
    const X = (t: number) => gutter + ((t - y0) / (y1 - y0)) * plotW;
    const n = Math.max(1, P.lanes.length);
    const laneH = (H - RULER - LANE_GAP * (n + 1)) / n;

    // the El Niño and La Niña episodes, behind every lane
    for (const e of P.episodes) {
      const a = X(monthPos(e.start.y, e.start.m) - 1 / 24), b = X(monthPos(e.end.y, e.end.m) + 1 / 24);
      if (b < gutter || a > W) continue;
      // a token may be any CSS colour: the opacity goes through globalAlpha, never a string edit
      ctx.fillStyle = e.kind === 'elnino' ? cc.nino : cc.nina;
      ctx.globalAlpha = 0.07;
      ctx.fillRect(Math.max(gutter, a), RULER, b - Math.max(gutter, a), H - RULER);
      ctx.globalAlpha = 1;
    }

    // the ruler
    ctx.fillStyle = th.muted;
    ctx.strokeStyle = th.line;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const cxRuler = X((y0 + y1) / 2);
    for (const tk of ticksFor(y0, y1, plotW)) {
      const x = X(tk.t);
      if (x < gutter) continue;
      ctx.globalAlpha = tk.major ? 0.9 : 0.35;
      ctx.beginPath(); ctx.moveTo(x, RULER - (tk.major ? 7 : 4)); ctx.lineTo(x, H); ctx.lineWidth = tk.major ? 0.6 : 0.3; ctx.stroke();
      // the cursor's own label sits over the centre: a year there would be written twice
      if (tk.label && Math.abs(x - cxRuler) > 70) ctx.fillText(tk.label, x, 14);
    }
    ctx.globalAlpha = 1;

    const cursor = (y0 + y1) / 2;
    P.lanes.forEach((lane, i) => {
      const top = RULER + LANE_GAP + i * (laneH + LANE_GAP);
      const mid = top + laneH / 2;
      ctx.fillStyle = th.laneTint;
      ctx.fillRect(gutter, top, plotW, laneH);
      ctx.strokeStyle = th.line;
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(gutter, mid); ctx.lineTo(W, mid); ctx.stroke();
      const k = (laneH / 2 - 2) / lane.scale;
      const barW = Math.max(1, plotW / ((y1 - y0) * 12) - 0.4);
      for (const p of lane.series) {
        if (p.v == null) continue;
        const { t0, w } = barSpan(p);
        if (t0 + w < y0 || t0 > y1) continue;
        const b = Math.max(-lane.scale, Math.min(lane.scale, barValue(lane.kind, p.v)));
        const x = X(t0);
        ctx.fillStyle = barColour(lane.kind, p.v);
        ctx.fillRect(x, b >= 0 ? mid - b * k : mid, barW, Math.max(0.5, Math.abs(b) * k));
      }
      // its name and the value under the cursor, in the gutter
      const v = valueAt(lane.series, cursor);
      const valueText = v == null ? P.missing : lane.format(v);
      ctx.font = '700 13px system-ui, sans-serif';
      const valueW = ctx.measureText(valueText).width;
      // the value sits right-aligned in the gutter; the name takes what is left, on one line when
      // the lane is short (two lines overlapped the value on a 6-lane timeline, seen 11/10)
      const tall = laneH >= 46;
      ctx.textAlign = 'right';
      ctx.fillStyle = v == null ? th.muted : barColour(lane.kind, v, 1);
      ctx.fillText(valueText, gutter - 8, tall ? top + 34 : mid + 5);
      ctx.textAlign = 'left';
      ctx.fillStyle = th.text;
      ctx.font = '600 11px system-ui, sans-serif';
      if (tall) wrapText(ctx, lane.label, 8, top + 14, gutter - 16, 13, 2);
      else wrapText(ctx, lane.label, 8, mid + 4, gutter - 20 - valueW, 13, 1);
    });

    // the cursor: the centre, always
    const cx = X(cursor);
    ctx.strokeStyle = th.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, RULER - 2); ctx.lineTo(cx, H); ctx.stroke();
    ctx.fillStyle = th.accent;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = P.cursorLabel(cursor);
    const tw = ctx.measureText(label).width + 14;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(cx - tw / 2, 1, tw, 18);
    ctx.globalAlpha = 1;
    ctx.fillText(label, cx, 14);
  }

  // ── gestures ──
  const drag = useRef<{ x: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX }; };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current, wrap = wrapRef.current;
    if (!d || !wrap) return;
    const dx = e.clientX - d.x;
    if (dx === 0) return;
    d.x = e.clientX;
    const plotW = wrap.clientWidth - gutterOf(wrap.clientWidth);
    const v = props.current.view;
    props.current.onView(panBy(v, (-dx / Math.max(1, plotW)) * span(v), range.current));
  };
  const onPointerUp = () => { drag.current = null; };
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = props.current.view;
      const cursor = (v.y0 + v.y1) / 2;
      props.current.onView(zoomAt(v, cursor, e.deltaY > 0 ? 1.2 : 1 / 1.2, range.current));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    const v = props.current.view;
    const step = e.shiftKey ? span(v) / 2 : 1 / 12;
    if (e.key === 'ArrowLeft') { e.preventDefault(); props.current.onView(panBy(v, -step, range.current)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); props.current.onView(panBy(v, step, range.current)); }
    if (e.key === '+' || e.key === '=') props.current.onView(zoomAt(v, (v.y0 + v.y1) / 2, 1 / 1.4, range.current));
    if (e.key === '-') props.current.onView(zoomAt(v, (v.y0 + v.y1) / 2, 1.4, range.current));
  };

  return (
    <div ref={wrapRef} className="timeline-wrap">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label={p.ariaLabel}
      />
    </div>
  );
}

/** Up to `lines` lines of text in a width; the last one ends with an ellipsis when cut. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, lines: number) {
  const words = text.split(' ');
  let line = '', row = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]!;
    if (ctx.measureText(test).width > maxW && line) {
      if (row === lines - 1) { ctx.fillText(`${line}…`, x, y + row * lh); return; }
      ctx.fillText(line, x, y + row * lh);
      row++;
      line = words[i]!;
    } else line = test;
  }
  ctx.fillText(line, x, y + row * lh);
}

