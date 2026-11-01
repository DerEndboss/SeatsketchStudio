import type { Vec2 } from './vec';
import { clamp } from './vec';
import type { Bounds } from './polygon';

/**
 * View onto the world: screen = world · scale + (x, y).
 * `scale` is in pixels per metre; the geometry itself knows no pixels.
 */
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

/** 100 % zoom = 100 pixels per metre. */
export const BASE_PX_PER_M = 100;
export const MIN_SCALE = 6;
export const MAX_SCALE = 2400;

export const worldToScreen = (v: Viewport, p: Vec2): Vec2 => ({ x: p.x * v.scale + v.x, y: p.y * v.scale + v.y });
export const screenToWorld = (v: Viewport, p: Vec2): Vec2 => ({ x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale });

/** Zooms by `factor` while the world point under `anchor` (screen) stays in place. */
export function zoomAt(v: Viewport, anchor: Vec2, factor: number): Viewport {
  const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
  const world = screenToWorld(v, anchor);
  return { scale, x: anchor.x - world.x * scale, y: anchor.y - world.y * scale };
}

export function visibleWorldBounds(v: Viewport, width: number, height: number): Bounds {
  const a = screenToWorld(v, { x: 0, y: 0 });
  const b = screenToWorld(v, { x: width, y: height });
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}

/** View that fits `bounds` with a margin into an area of width × height. */
export function fitBounds(bounds: Bounds, width: number, height: number, padding = 64): Viewport {
  const bw = Math.max(0.5, bounds.maxX - bounds.minX);
  const bh = Math.max(0.5, bounds.maxY - bounds.minY);
  const availW = Math.max(40, width - padding * 2);
  const availH = Math.max(40, height - padding * 2);
  const scale = clamp(Math.min(availW / bw, availH / bh), MIN_SCALE, MAX_SCALE);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale };
}

export const zoomPercent = (v: Viewport): number => Math.round((v.scale / BASE_PX_PER_M) * 100);
