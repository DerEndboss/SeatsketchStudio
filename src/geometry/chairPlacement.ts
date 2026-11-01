import { type Vec2, add, facingRotation, lerp, mul, normalize, sub } from './vec';
import { closestPointOnPolyline, polygonsIntersect, rectPolygon, transformPoints } from './polygon';
import { measurePolyline, offsetClosedPolygon, pointAtDistance, type Polyline } from './perimeterSampling';
import { enabledSides, rectSides, tableOutline } from './shapes';
import type { ChairSize, TableObject } from '../types/document';

/* ------------------------------------------------------------------------------------------
 * Chair distribution, purely geometric:
 *  1. "Tracks" on which chair centres may lie are derived from the table outline
 *     (rectangle: one straight track per side; all other shapes: the outline offset outwards).
 *  2. The chair count is distributed across the tracks in proportion to track length (with a capacity limit).
 *  3. On each track the chairs sit at equal arc distances; each chair faces the
 *     nearest point of the table edge.
 * ---------------------------------------------------------------------------------------- */

/** Minimum distance between two chairs (m). */
export const CHAIR_GAP = 0.06;

export interface ChairPose {
  x: number;
  y: number;
  rotation: number;
}

export interface ChairLane {
  path: Polyline;
  capacity: number;
  /** For straight sides: fixed viewing direction towards the table */
  facing?: Vec2;
  /** Start point (arc length) for closed tracks */
  start: number;
}

type TableGeometry = Pick<TableObject, 'shape' | 'width' | 'height' | 'cornerRadius' | 'path' | 'seating'>;

export function chairLanes(table: TableGeometry, size: ChairSize): ChairLane[] {
  const offset = Math.max(0, table.seating.gap) + size.depth / 2;
  const pitch = size.width + CHAIR_GAP;

  if (table.shape === 'rect') {
    const flags = enabledSides(table);
    const lanes: ChairLane[] = [];
    rectSides(table.width, table.height).forEach((side, i) => {
      if (!flags[i]) return;
      // do not occupy rounded corners
      const inset = Math.min(table.cornerRadius * 0.6, side.length * 0.25);
      const usable = Math.max(0, side.length - 2 * inset);
      const t0 = side.length > 0 ? inset / side.length : 0;
      const a = add(lerp(side.a, side.b, t0), mul(side.normal, offset));
      const b = add(lerp(side.a, side.b, 1 - t0), mul(side.normal, offset));
      lanes.push({
        path: measurePolyline([a, b], false),
        capacity: Math.max(0, Math.floor((usable + CHAIR_GAP) / pitch)),
        facing: mul(side.normal, -1),
        start: 0,
      });
    });
    return lanes;
  }

  const outline = tableOutline(table);
  const offsetPoly = offsetClosedPolygon(outline, offset);

  if (table.shape === 'semicircle' && table.seating.mode === 'long') {
    // arc side only: contiguous section below the straight edge
    const top = -table.height / 2;
    const below = offsetPoly.map((p) => p.y > top + 1e-6);
    const n = offsetPoly.length;
    let startIdx = below.findIndex((b, i) => b && !below[(i - 1 + n) % n]);
    if (startIdx < 0) startIdx = 0;
    const arc: Vec2[] = [];
    for (let k = 0; k < n; k++) {
      const i = (startIdx + k) % n;
      if (!below[i]) break;
      arc.push(offsetPoly[i]);
    }
    const path = measurePolyline(arc, false);
    const lane: ChairLane = { path, capacity: 0, start: 0 };
    lane.capacity = curvedCapacity(lane, outline, size, Math.floor((path.length + CHAIR_GAP) / pitch));
    return [lane];
  }

  const path = measurePolyline(offsetPoly, true);
  const lane: ChairLane = { path, capacity: 0, start: topCenterDistance(path) };
  lane.capacity = curvedCapacity(lane, outline, size, Math.floor(path.length / pitch));
  return [lane];
}

/**
 * Arc length of the topmost intersection of the track with the centre axis x = 0.
 * This gives symmetric tables symmetric arrangements with seat 1 at the top centre.
 */
function topCenterDistance(path: Polyline): number {
  const pts = path.points;
  const n = pts.length;
  let bestY = Infinity;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if ((a.x <= 0 && b.x >= 0) || (a.x >= 0 && b.x <= 0)) {
      const dx = b.x - a.x;
      const t = Math.abs(dx) < 1e-12 ? 0 : -a.x / dx;
      const y = a.y + (b.y - a.y) * t;
      if (y < bestY) {
        bestY = y;
        best = path.cumulative[i] + t * (path.cumulative[i + 1] - path.cumulative[i]);
      }
    }
  }
  return best;
}

/** Chair poses on a track (equal arc distances), facing the nearest table edge. */
function posesOnLane(lane: ChairLane, count: number, outline: readonly Vec2[] | null): ChairPose[] {
  const poses: ChairPose[] = [];
  if (count <= 0) return poses;
  const step = lane.path.length / count;
  for (let i = 0; i < count; i++) {
    const d = lane.path.closed ? lane.start + i * step : (i + 0.5) * step;
    const sample = pointAtDistance(lane.path, d);
    let facing = lane.facing;
    if (!facing && outline) {
      const nearest = closestPointOnPolyline(sample.point, outline, true);
      // Fallback: inward normal of the track
      const inward = { x: -sample.tangent.y, y: sample.tangent.x };
      facing = normalize(sub(nearest.point, sample.point), inward);
    }
    poses.push({
      x: round6(sample.point.x),
      y: round6(sample.point.y),
      rotation: round6(facingRotation(facing ?? { x: 0, y: -1 })),
    });
  }
  return poses;
}

function chairsOverlap(a: ChairPose, b: ChairPose, size: ChairSize): boolean {
  const rect = rectPolygon(size.width, size.depth);
  return polygonsIntersect(transformPoints(rect, a.x, a.y, a.rotation), transformPoints(rect, b.x, b.y, b.rotation));
}

/**
 * Capacity of a curved track: on curves the front chair corners collide earlier
 * than the arc length suggests, hence a real collision check of the neighbours.
 */
function curvedCapacity(lane: ChairLane, outline: readonly Vec2[], size: ChairSize, upper: number): number {
  for (let n = Math.max(0, upper); n > 1; n--) {
    const poses = posesOnLane(lane, n, outline);
    let ok = true;
    const pairs = lane.path.closed ? n : n - 1;
    for (let i = 0; i < pairs && ok; i++) {
      if (chairsOverlap(poses[i], poses[(i + 1) % n], size)) ok = false;
    }
    if (ok) return n;
  }
  return Math.min(1, Math.max(0, upper));
}

const capacityCache = new Map<string, number>();
const pathIds = new WeakMap<object, number>();
let pathSeq = 0;

/** Key from everything that affects capacity (position and rotation are not part of it). */
function geometryKey(t: TableGeometry, size: ChairSize): string {
  let pid = 0;
  if (t.shape === 'custom' && t.path) {
    pid = pathIds.get(t.path) ?? 0;
    if (!pid) {
      pid = ++pathSeq;
      pathIds.set(t.path, pid);
    }
  }
  const s = t.seating;
  return `${t.shape}|${t.width}|${t.height}|${t.cornerRadius}|${pid}|${s.mode}|${s.sides.join('')}|${s.gap}|${size.width}|${size.depth}`;
}

/** How many chairs fit at this table without overlap (with the current seating)? */
export function seatingCapacity(table: TableGeometry, size: ChairSize): number {
  const key = geometryKey(table, size);
  const hit = capacityCache.get(key);
  if (hit !== undefined) return hit;
  const value = chairLanes(table, size).reduce((s, l) => s + l.capacity, 0);
  if (capacityCache.size > 4000) capacityCache.clear();
  capacityCache.set(key, value);
  return value;
}

/**
 * Distributes `total` as integers in proportion to `weights` (Hare/Niemeyer with upper limits).
 * Guaranteed: sum = min(total, sum of the limits), no entry above its limit.
 */
export function allocateProportional(weights: readonly number[], total: number, caps?: readonly number[]): number[] {
  const n = weights.length;
  const result = new Array<number>(n).fill(0);
  const want = Math.max(0, Math.floor(total));
  if (n === 0 || want === 0) return result;
  const cap = (i: number): number => (caps ? Math.max(0, Math.floor(caps[i])) : Infinity);
  let w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  let active = w.map((x, i) => (x > 0 && cap(i) > 0 ? i : -1)).filter((i) => i >= 0);
  if (active.length === 0) {
    // no weights → evenly across all with free capacity
    w = weights.map(() => 1);
    active = w.map((_, i) => (cap(i) > 0 ? i : -1)).filter((i) => i >= 0);
    if (active.length === 0) return result;
  }
  const capSum = caps ? active.reduce((s, i) => s + cap(i), 0) : Infinity;
  const target = Math.min(want, capSum);
  const real = new Array<number>(n).fill(0);
  let rest = target;
  let open = active.slice();
  while (open.length > 0) {
    const wsum = open.reduce((s, i) => s + w[i], 0);
    const over = open.filter((i) => (rest * w[i]) / wsum >= cap(i));
    if (over.length === 0) {
      for (const i of open) real[i] = (rest * w[i]) / wsum;
      break;
    }
    for (const i of over) {
      real[i] = cap(i);
      rest -= cap(i);
    }
    open = open.filter((i) => !over.includes(i));
  }
  for (let i = 0; i < n; i++) result[i] = Math.floor(real[i] + 1e-9);
  let deficit = target - result.reduce((s, x) => s + x, 0);
  const order = active
    .slice()
    .sort((a, b) => real[b] - result[b] - (real[a] - result[a]) || w[b] - w[a] || a - b);
  for (const i of order) {
    if (deficit <= 0) break;
    if (result[i] < cap(i) && real[i] - result[i] > 1e-9) {
      result[i]++;
      deficit--;
    }
  }
  for (const i of order) {
    if (deficit <= 0) break;
    if (result[i] < cap(i)) {
      result[i]++;
      deficit--;
    }
  }
  return result;
}

export interface ChairLayout {
  poses: ChairPose[];
  capacity: number;
  /** more chairs requested than fit without overlap */
  overfull: boolean;
}

/** Computes `count` chair positions (local to the table). Order = seat numbers clockwise. */
export function layoutChairs(table: TableGeometry, count: number, size: ChairSize): ChairLayout {
  const lanes = chairLanes(table, size);
  const capacity = lanes.reduce((s, l) => s + l.capacity, 0);
  const n = Math.max(0, Math.floor(count));
  if (n === 0 || lanes.length === 0) return { poses: [], capacity, overfull: n > capacity };

  const weights = lanes.map((l) => l.path.length);
  let perLane: number[];
  if (n <= capacity) {
    perLane = allocateProportional(weights, n, lanes.map((l) => l.capacity));
  } else {
    const extra = allocateProportional(weights, n - capacity);
    perLane = lanes.map((l, i) => l.capacity + extra[i]);
  }

  const outline = table.shape === 'rect' ? null : tableOutline(table);
  const poses: ChairPose[] = [];
  lanes.forEach((lane, li) => poses.push(...posesOnLane(lane, perLane[li], outline)));
  return { poses, capacity, overfull: n > capacity };
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

export interface TableAllocationInput {
  id: string;
  capacity: number;
}

export interface TableAllocation {
  counts: Map<string, number>;
  placed: number;
  requested: number;
  /** Sum of the usable seats (min(max per table, capacity)) */
  available: number;
}

/**
 * Distributes a total number of chairs across several tables: larger tables (more room at the edge)
 * get more chairs, no table more than `maxPerTable` or than physically fit.
 */
export function allocateAcrossTables(
  tables: readonly TableAllocationInput[],
  total: number,
  maxPerTable: number,
): TableAllocation {
  const caps = tables.map((t) => Math.max(0, Math.min(Math.floor(maxPerTable), t.capacity)));
  const weights = tables.map((t) => t.capacity);
  const counts = allocateProportional(weights, total, caps);
  const map = new Map<string, number>();
  tables.forEach((t, i) => map.set(t.id, counts[i]));
  return {
    counts: map,
    placed: counts.reduce((s, x) => s + x, 0),
    requested: Math.max(0, Math.floor(total)),
    available: caps.reduce((s, x) => s + x, 0),
  };
}

/** Recommended chair count for a new table shape (freely changeable). */
export function suggestedChairCount(table: TableGeometry, size: ChairSize): number {
  const cap = seatingCapacity(table, size);
  if (table.shape === 'round' || table.shape === 'oval' || table.shape === 'custom') {
    // round tables: leave some room (~65 cm per person along the circumference)
    const lanes = chairLanes(table, size);
    const len = lanes.reduce((s, l) => s + l.path.length, 0);
    return Math.max(1, Math.min(cap, Math.round(len / 0.84)));
  }
  return cap;
}

/** Chair pose relative to the table edge: centre at distance gap + depth/2, facing the table. */
export function snapPoseToTable(
  table: TableGeometry,
  localPoint: Vec2,
  size: ChairSize,
): { pose: ChairPose; distance: number } {
  const outline = tableOutline(table);
  const nearest = closestPointOnPolyline(localPoint, outline, true);
  const offset = Math.max(0, table.seating.gap) + size.depth / 2;
  const a = outline[nearest.index];
  const b = outline[(nearest.index + 1) % outline.length];
  const tangent = normalize(sub(b, a), { x: 1, y: 0 });
  const outward = { x: tangent.y, y: -tangent.x };
  const p = add(nearest.point, mul(outward, offset));
  return {
    pose: { x: p.x, y: p.y, rotation: facingRotation(mul(outward, -1)) },
    distance: nearest.distance,
  };
}
