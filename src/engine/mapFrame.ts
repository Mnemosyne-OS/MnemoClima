/**
 * mapFrame.ts — the map's pure geometry, out of the component (a .tsx exporting values is
 * reloaded whole by Fast Refresh on every save).
 *
 * The flat projection is MnemoClio's: equirectangular, longitudes shrunk by the cosine of the
 * mid latitude, the camera's window widened to fill the frame.
 */
import { globeOf, project, type Globe, type Pt } from '@mnemosyne_os/timeline-map/globe';
import type { Cam, Projection } from '@mnemosyne_os/timeline-map/mapCam';
import { anomalyRgba, type SstGrid } from '../data/sst';

export interface Frame {
  proj: Projection;
  globe: Globe | null;
  /** Lon/lat to the screen; `front` false on the far side of a globe. */
  at: (lon: number, lat: number) => Pt;
  /** The window actually drawn, degrees. */
  box: { a: number; b: number; c: number; d: number };
}

export function frameOf(cam: Cam, W: number, H: number, asGlobe: boolean): Frame {
  let { a, b, c, d } = cam;
  const kx = Math.cos(((c + d) / 2) * Math.PI / 180);
  const s = Math.min(W / ((b - a) * kx), H / (d - c));
  const ox = (W - (b - a) * kx * s) / 2, oy = (H - (d - c) * s) / 2;
  a -= ox / (kx * s); b += ox / (kx * s); c -= oy / s; d += oy / s;
  const globe = asGlobe ? globeOf(cam, W, H) : null;
  const at = (lon: number, lat: number): Pt => (globe ? project(globe, lon, lat) : { x: (lon - a) * kx * s, y: (d - lat) * s, front: true });
  return { proj: { a, d, kx, s }, globe, at, box: { a, b, c, d } };
}

/** Pixels per degree of latitude at this frame: how big a circle of `km` is drawn. */
export function pxPerDegree(f: Frame): number {
  return f.globe ? (f.globe.r * Math.PI) / 180 : f.proj.s;
}

export const KM_PER_DEGREE = 111.2;

export interface Hit<T> { x: number; y: number; r: number; item: T }

/** The nearest hit under the pointer, within its radius (+4 px of grace). */
export function hitAt<T>(hits: Hit<T>[], x: number, y: number): T | null {
  let best: Hit<T> | null = null, bestD = Infinity;
  for (const h of hits) {
    const dd = Math.hypot(h.x - x, h.y - y);
    if (dd <= h.r + 4 && dd < bestD) { best = h; bestD = dd; }
  }
  return best?.item ?? null;
}

/**
 * A grid as ONE image, a pixel per cell, made once per grid and kept (a grid is never changed
 * once made). Drawn stretched over the flat map, it replaces 13 000 rectangles each with its
 * colour computed: the 115 ms measured at each month crossed on the timeline (11/10).
 */
export interface GridImage { canvas: HTMLCanvasElement; lon0: number; lat0: number; lon1: number; lat1: number }
const images = new WeakMap<SstGrid, GridImage>();
export function gridImage(grid: SstGrid, alpha: number): GridImage | null {
  const kept = images.get(grid);
  if (kept) return kept;
  if (typeof document === 'undefined' || grid.cells.length === 0) return null;
  // the image's corner is a CELL corner (the 2° grid is centred on even degrees, its edges odd),
  // so each pixel lands exactly on its cell
  const half = grid.step / 2;
  let minLon = Infinity, maxLat = -Infinity;
  for (const c of grid.cells) { if (c.lon < minLon) minLon = c.lon; if (c.lat > maxLat) maxLat = c.lat; }
  const lon0 = minLon - half, lat0 = maxLat + half;
  const w = Math.ceil((180 - lon0) / grid.step) + 1, h = Math.ceil((lat0 + 90) / grid.step) + 1;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  for (const c of grid.cells) {
    const x = Math.round((c.lon - half - lon0) / grid.step), y = Math.round((lat0 - (c.lat + half)) / grid.step);
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const [r, g, b, a] = anomalyRgba(c.v, 3, alpha);
    const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  const out = { canvas, lon0, lat0, lon1: lon0 + w * grid.step, lat1: lat0 - h * grid.step };
  images.set(grid, out);
  return out;
}

/** The colour of a disaster on the map, by kind. */
export const HAZARD_HUE: Record<string, number> = {
  cyclone: 280, flood: 205, drought: 32, quake: 0, volcano: 12, fire: 20, storm: 260, ice: 190, other: 220,
};

/** A cyclone track's colour by Saffir-Simpson category (null = unknown wind, drawn grey). */
export function trackColour(cat: number | null): string {
  if (cat == null) return 'rgba(160,160,170,0.7)';
  const hues = [200, 60, 45, 30, 12, 330];
  return `hsla(${hues[cat]}, 85%, 58%, 0.85)`;
}
