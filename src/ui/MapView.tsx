/**
 * MapView — the world: the heat in the ocean, the disasters, the cyclone tracks, the markers and
 * the declared places. MnemoClio's camera and globe (shared package); its own layers.
 *
 * Nothing moves by itself (doc 59 §6.10): the map redraws when something changed (a layer, the
 * data, a drag, the theme, a resize), one frame each time, never in a loop.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { WORLD, panCam, toLat, toLon, zoomCam, type Cam } from '@mnemosyne_os/timeline-map/mapCam';
import { dragDegrees, turnCam } from '@mnemosyne_os/timeline-map/globe';
import { completeTheme, type Theme } from '@mnemosyne_os/timeline-map/theme';
import { anomalyColour, type SstGrid } from '../data/sst';
import type { Hazard } from '../data/hazards';
import { categoryOf, type Track } from '../data/ibtracs';
import type { Marker } from '../data/markers';
import type { Place } from '../data/place';
import { readClimaColors } from '../engine/canvasColors';
import { HAZARD_HUE, KM_PER_DEGREE, frameOf, gridImage, hitAt, pxPerDegree, trackColour, type Frame, type Hit } from '../engine/mapFrame';
import type { Layer } from './store';
import { HOST_TIMEOUT_MS, readDirect } from './host';

interface Shape { r: { pts: number[]; bb: [number, number, number, number] }[] }

export type MapPick = { type: 'hazard'; item: Hazard } | { type: 'marker'; item: Marker } | { type: 'place'; item: Place };

export interface MapProps {
  theme: Theme;
  layers: Layer[];
  sst: SstGrid | null;
  /** The continents' month (5° cells), drawn under the ocean's finer grid. */
  land: SstGrid | null;
  hazards: Hazard[];
  tracks: Track[];
  markers: Marker[];
  places: Place[];
  selectedPlace: string | null;
  markerName: (m: Marker) => string;
  /** On: a click puts a point instead of picking a thing. */
  picking: boolean;
  globe: boolean;
  onPoint: (lat: number, lon: number) => void;
  onPick: (p: MapPick | null) => void;
  label: { picking: string; map: string };
}

/** The shapes of today's countries (Natural Earth, public domain), read once per window. */
let worldOnce: Promise<Shape[]> | null = null;
function loadWorld(): Promise<Shape[]> {
  worldOnce ??= readDirect('./data/world-today.json', HOST_TIMEOUT_MS)
    .then((text) => JSON.parse(text) as Array<{ r?: number[][] }>)
    .then((rows) => rows.map((row) => ({
      r: (row.r ?? []).map((pts) => {
        let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
        for (let i = 0; i < pts.length; i += 2) { a = Math.min(a, pts[i]!); b = Math.max(b, pts[i]!); c = Math.min(c, pts[i + 1]!); d = Math.max(d, pts[i + 1]!); }
        return { pts, bb: [a, b, c, d] as [number, number, number, number] };
      }),
    })))
    .catch((err) => { worldOnce = null; throw err; });
  return worldOnce;
}

function MapView(p: MapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Cam>(WORLD);
  const frame = useRef<Frame | null>(null);
  const hits = useRef<Hit<MapPick>[]>([]);
  const props = useRef(p);
  props.current = p;
  const [world, setWorld] = useState<Shape[]>([]);
  // read through a ref: the resize observer and the wheel listener hold the first render's
  // functions, and must still draw the shapes that arrived after it
  const worldRef = useRef<Shape[]>(world);
  worldRef.current = world;
  const [worldError, setWorldError] = useState<string | null>(null);
  const raf = useRef(0);
  /** The countries, drawn once per camera/size/theme (see draw). */
  const worldLayer = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);

  useEffect(() => {
    let alive = true;
    loadWorld().then((w) => { if (alive) setWorld(w); }).catch((err) => { console.warn('[MnemoClima] world shapes not read', err); if (alive) setWorldError(String(err)); });
    return () => { alive = false; };
  }, []);

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
    const f = frameOf(cam.current, W, H, P.globe);
    frame.current = f;
    const on = (l: Layer) => P.layers.includes(l);
    const hs: Hit<MapPick>[] = [];

    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = th.ocean;
    if (f.globe) { ctx.beginPath(); ctx.arc(f.globe.cx, f.globe.cy, f.globe.r, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(0, 0, W, H);

    // the continents (5°) first: the ocean's finer grid covers them at sea, they show on land
    const landShown = on('land') && P.land != null;
    if (landShown && !f.globe) drawGridImage(ctx, f, P.land!, 0.95);
    else if (landShown) {
      const half = P.land!.step / 2;
      for (const cell of P.land!.cells) {
        const q0 = f.at(cell.lon - half, cell.lat + half), q1 = f.at(cell.lon + half, cell.lat - half);
        if (!q0.front && !q1.front) continue;
        ctx.fillStyle = anomalyColour(cell.v, 3, 0.95);
        ctx.fillRect(Math.min(q0.x, q1.x), Math.min(q0.y, q1.y), Math.abs(q1.x - q0.x) + 0.6, Math.abs(q1.y - q0.y) + 0.6);
      }
    }

    // the heat in the ocean: one square per grid cell
    if (on('sst') && P.sst && !f.globe) drawGridImage(ctx, f, P.sst, 0.9);
    else if (on('sst') && P.sst) {
      const half = P.sst.step / 2;
      for (const cell of P.sst.cells) {
        const q0 = f.at(cell.lon - half, cell.lat + half), q1 = f.at(cell.lon + half, cell.lat - half);
        if (!q0.front && !q1.front) continue;
        const w = Math.abs(q1.x - q0.x) + 0.6, h = Math.abs(q1.y - q0.y) + 0.6;
        if (q1.x < -w || q0.x > W + w || q1.y < -h || q0.y > H + h) continue;
        ctx.fillStyle = anomalyColour(cell.v, 3, 0.9);
        ctx.fillRect(Math.min(q0.x, q1.x), Math.min(q0.y, q1.y), w, h);
      }
    }

    // land on top, so a cell that touches the coast never paints the land. The countries do not
    // change when the month does: they are drawn once per camera, size and theme into their own
    // layer and only pasted after (1.2 MB of coordinates redrawn at every month crossed on the
    // timeline was most of a 180 ms frame, measured 11/10)
    const worldKey = [cam.current.a, cam.current.b, cam.current.c, cam.current.d, W, H, dpr, P.globe, landShown, th.land, th.border, worldRef.current.length].join('|');
    let layer = worldLayer.current;
    if (!layer || layer.key !== worldKey) {
      const canvasW = document.createElement('canvas');
      canvasW.width = Math.round(W * dpr); canvasW.height = Math.round(H * dpr);
      const wctx = canvasW.getContext('2d');
      if (wctx) {
        wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        wctx.fillStyle = th.land;
        wctx.strokeStyle = th.border;
        wctx.lineWidth = 0.6;
        for (const sh of worldRef.current) {
          wctx.beginPath();
          let any = false;
          for (const { pts, bb } of sh.r) {
            if (!f.globe && (bb[1] < f.box.a || bb[0] > f.box.b || bb[3] < f.box.c || bb[2] > f.box.d)) continue;
            let front = false;
            const ps = [];
            for (let i = 0; i < pts.length; i += 2) { const q = f.at(pts[i]!, pts[i + 1]!); ps.push(q); if (q.front) front = true; }
            if (!front) continue;
            any = true;
            wctx.moveTo(ps[0]!.x, ps[0]!.y);
            for (let i = 1; i < ps.length; i++) wctx.lineTo(ps[i]!.x, ps[i]!.y);
            wctx.closePath();
          }
          // with the continents coloured, the countries are outlines over them: a dark line under
          // a light one, so a coast reads on red as on blue (Tony, 11/10: « on ne les voit plus »)
          if (any) {
            if (!landShown) { wctx.fill(); wctx.stroke(); }
            else {
              wctx.lineJoin = 'round';
              wctx.strokeStyle = cc.coastDark; wctx.lineWidth = 2.4; wctx.stroke();
              wctx.strokeStyle = cc.coastLight; wctx.lineWidth = 1; wctx.stroke();
              wctx.strokeStyle = th.border; wctx.lineWidth = 0.6;
            }
          }
        }
      }
      layer = { key: worldKey, canvas: canvasW };
      worldLayer.current = layer;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();

    // cyclone tracks
    if (on('tracks')) {
      ctx.lineWidth = 1.4;
      for (const tr of P.tracks) {
        ctx.strokeStyle = trackColour(categoryOf(tr.maxWind));
        ctx.beginPath();
        let started = false, prevLon = 0;
        for (const pt of tr.points) {
          const q = f.at(pt.lon, pt.lat);
          // a track crossing the date line is cut, never drawn across the whole map
          if (!q.front || (started && Math.abs(pt.lon - prevLon) > 180)) { started = false; prevLon = pt.lon; continue; }
          if (started) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
          started = true;
          prevLon = pt.lon;
        }
        ctx.stroke();
      }
    }

    const ppd = pxPerDegree(f);
    // markers: their circle, their role's colour, their name
    if (on('markers')) {
      for (const m of P.markers) {
        const q = f.at(m.lon, m.lat);
        if (!q.front) continue;
        const r = Math.max(6, (m.radiusKm / KM_PER_DEGREE) * ppd);
        const hue = m.role === 'precursor' ? 190 : 32;
        ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.16)`;
        ctx.strokeStyle = `hsla(${hue}, 85%, 60%, 0.9)`;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = th.text;
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(P.markerName(m), q.x, q.y - r - 5);
        hs.push({ x: q.x, y: q.y, r: Math.max(10, Math.min(r, 40)), item: { type: 'marker', item: m } });
      }
    }

    // disasters: a dot by kind, ringed by its alert level
    if (on('hazards')) {
      for (const h of P.hazards) {
        const q = f.at(h.lon, h.lat);
        if (!q.front || q.x < -10 || q.x > W + 10 || q.y < -10 || q.y > H + 10) continue;
        const r = h.level === 'red' ? 6.5 : h.level === 'orange' ? 5.5 : 4.5;
        ctx.fillStyle = `hsla(${HAZARD_HUE[h.kind] ?? 220}, 85%, 60%, 0.95)`;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
        if (h.level) {
          ctx.strokeStyle = h.level === 'red' ? cc.red : h.level === 'orange' ? cc.orange : cc.green;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(q.x, q.y, r + 2.5, 0, Math.PI * 2); ctx.stroke();
        }
        hs.push({ x: q.x, y: q.y, r: r + 3, item: { type: 'hazard', item: h } });
      }
    }

    // the declared places: a pin and a name
    if (on('places')) {
      for (const pl of P.places) {
        const q = f.at(pl.lon, pl.lat);
        if (!q.front) continue;
        const chosen = pl.id === P.selectedPlace;
        ctx.fillStyle = chosen ? cc.chosen : th.accent;
        ctx.strokeStyle = th.bg;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(q.x, q.y - 9, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(q.x - 4, q.y - 6); ctx.lineTo(q.x, q.y); ctx.lineTo(q.x + 4, q.y - 6); ctx.fill();
        ctx.fillStyle = th.text;
        ctx.font = `${chosen ? 700 : 500} 12px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(pl.name, q.x + 9, q.y - 6);
        hs.push({ x: q.x, y: q.y - 8, r: 9, item: { type: 'place', item: pl } });
      }
    }
    hits.current = hs;
  }

  // ── gestures: drag to move, wheel to zoom, click to pick or to put a point ──
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current, f = frame.current;
    if (!d || !f) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    d.x = e.clientX; d.y = e.clientY;
    if (f.globe) { const g = dragDegrees(f.globe, dx, dy); cam.current = turnCam(cam.current, g.dLon, g.dLat); }
    else cam.current = panCam(cam.current, dx / (f.proj.kx * f.proj.s), dy / f.proj.s);
    redraw();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const f = frame.current;
    if (props.current.picking && f) {
      if (f.globe) return; // a point is put on the flat map, where a click means one place
      const lon = toLon(f.proj, x), lat = toLat(f.proj, y);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) props.current.onPoint(lat, lon);
      return;
    }
    props.current.onPick(hitAt(hits.current, x, y));
  };
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = frame.current;
      if (!f) return;
      const rect = el.getBoundingClientRect();
      const lon = toLon(f.proj, e.clientX - rect.left), lat = toLat(f.proj, e.clientY - rect.top);
      cam.current = zoomCam(cam.current, lon, lat, e.deltaY > 0 ? 1.18 : 1 / 1.18);
      redraw();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetView = () => { cam.current = WORLD; redraw(); };

  return (
    <div ref={wrapRef} className={`map-wrap${p.picking ? ' picking' : ''}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={resetView}
        aria-label={p.label.map}
      />
      {p.picking && <div className="map-banner glass">{p.label.picking}</div>}
      {worldError && <div className="map-banner glass error">{worldError}</div>}
    </div>
  );
}

/** A grid as its one image, stretched over the whole world on the flat map (cells stay sharp). */
function drawGridImage(ctx: CanvasRenderingContext2D, f: Frame, grid: SstGrid, alpha: number) {
  const img = gridImage(grid, alpha);
  if (!img) return;
  const tl = f.at(img.lon0, img.lat0), br = f.at(img.lon1, img.lat1);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img.canvas, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.imageSmoothingEnabled = smooth;
}

/**
 * Redrawn only when something it draws changed. The callbacks are read through a ref at the
 * moment of the gesture, so a new function identity is not a change; the label by its words.
 */
export default memo(MapView, (a, b) =>
  a.theme === b.theme && a.layers === b.layers && a.sst === b.sst && a.land === b.land && a.hazards === b.hazards && a.tracks === b.tracks
  && a.markers === b.markers && a.places === b.places && a.selectedPlace === b.selectedPlace && a.markerName === b.markerName
  && a.picking === b.picking && a.globe === b.globe && a.label.picking === b.label.picking && a.label.map === b.label.map);
