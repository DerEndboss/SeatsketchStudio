import type { Vec2 } from './vec';
import { roundTo } from './vec';
import type { Bounds } from './polygon';

/** Guide: vertical (v) at x = pos or horizontal (h) at y = pos, from `from` to `to`. */
export interface Guide {
  orientation: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
}

/** A snap target: its characteristic x and y lines plus the extent for the guides. */
export interface SnapTarget {
  xs: number[];
  ys: number[];
  bounds: Bounds;
}

export function targetFromBounds(b: Bounds): SnapTarget {
  return {
    xs: [b.minX, (b.minX + b.maxX) / 2, b.maxX],
    ys: [b.minY, (b.minY + b.maxY) / 2, b.maxY],
    bounds: b,
  };
}

export interface MoveSnapInput {
  /** Bounding box of the moved objects after the raw offset */
  moving: Bounds;
  /** Reference point for grid snapping (object centre) after the raw offset */
  anchor: Vec2;
  targets: readonly SnapTarget[];
  /** Snap radius in metres (converted from screen pixels) */
  threshold: number;
  /** Grid spacing or null */
  grid: number | null;
}

export interface MoveSnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/**
 * Smart guides before grid: edges and centres of the moved selection snap to edges and
 * centres of other objects. If an axis has no hit, the centre snaps to the grid.
 */
export function snapMove(input: MoveSnapInput): MoveSnapResult {
  const { moving, anchor, targets, threshold, grid } = input;
  const mx = [moving.minX, (moving.minX + moving.maxX) / 2, moving.maxX];
  const my = [moving.minY, (moving.minY + moving.maxY) / 2, moving.maxY];

  let bestX = { dist: threshold, delta: 0, found: false };
  let bestY = { dist: threshold, delta: 0, found: false };
  for (const t of targets) {
    for (const a of mx) {
      for (const b of t.xs) {
        const d = Math.abs(b - a);
        if (d < bestX.dist || (!bestX.found && d <= threshold)) bestX = { dist: d, delta: b - a, found: true };
      }
    }
    for (const a of my) {
      for (const b of t.ys) {
        const d = Math.abs(b - a);
        if (d < bestY.dist || (!bestY.found && d <= threshold)) bestY = { dist: d, delta: b - a, found: true };
      }
    }
  }

  let dx = 0;
  let dy = 0;
  if (bestX.found) dx = bestX.delta;
  else if (grid) dx = roundTo(anchor.x, grid) - anchor.x;
  if (bestY.found) dy = bestY.delta;
  else if (grid) dy = roundTo(anchor.y, grid) - anchor.y;

  const guides: Guide[] = [];
  const snapped: Bounds = { minX: moving.minX + dx, maxX: moving.maxX + dx, minY: moving.minY + dy, maxY: moving.maxY + dy };
  const sx = [snapped.minX, (snapped.minX + snapped.maxX) / 2, snapped.maxX];
  const sy = [snapped.minY, (snapped.minY + snapped.maxY) / 2, snapped.maxY];
  const eps = 1e-6;
  if (bestX.found) {
    const lines = new Map<number, Guide>();
    for (const t of targets) {
      for (const b of t.xs) {
        if (!sx.some((a) => Math.abs(a - b) < eps)) continue;
        const key = Math.round(b * 1e5);
        const from = Math.min(snapped.minY, t.bounds.minY);
        const to = Math.max(snapped.maxY, t.bounds.maxY);
        const g = lines.get(key);
        if (g) {
          g.from = Math.min(g.from, from);
          g.to = Math.max(g.to, to);
        } else lines.set(key, { orientation: 'v', pos: b, from, to });
      }
    }
    guides.push(...lines.values());
  }
  if (bestY.found) {
    const lines = new Map<number, Guide>();
    for (const t of targets) {
      for (const b of t.ys) {
        if (!sy.some((a) => Math.abs(a - b) < eps)) continue;
        const key = Math.round(b * 1e5);
        const from = Math.min(snapped.minX, t.bounds.minX);
        const to = Math.max(snapped.maxX, t.bounds.maxX);
        const g = lines.get(key);
        if (g) {
          g.from = Math.min(g.from, from);
          g.to = Math.max(g.to, to);
        } else lines.set(key, { orientation: 'h', pos: b, from, to });
      }
    }
    guides.push(...lines.values());
  }
  return { dx, dy, guides };
}

/** Snap a point to the grid (when active). */
export const snapPoint = (p: Vec2, step: number | null): Vec2 =>
  step ? { x: roundTo(p.x, step), y: roundTo(p.y, step) } : p;

/** Snap an angle to multiples of `step` degrees when it is closer than `tolerance` (or always with force). */
export function snapAngle(deg: number, step: number, tolerance: number, force: boolean): number {
  const target = Math.round(deg / step) * step;
  if (force || Math.abs(target - deg) <= tolerance) return target;
  return deg;
}

/** Constrain the direction of a segment to 45° steps (for walls/dimension lines with Shift). */
export function constrainTo45(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };
}
