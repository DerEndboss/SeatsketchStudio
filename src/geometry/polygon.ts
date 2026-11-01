import { type Vec2, add, clamp, distance, rotate, sub } from './vec';

export type Polygon = Vec2[];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const EMPTY_BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

export function boundsOf(points: readonly Vec2[]): Bounds {
  if (points.length === 0) return { ...EMPTY_BOUNDS };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsUnion(list: readonly Bounds[]): Bounds | null {
  if (list.length === 0) return null;
  const out = { ...list[0] };
  for (const b of list) {
    out.minX = Math.min(out.minX, b.minX);
    out.minY = Math.min(out.minY, b.minY);
    out.maxX = Math.max(out.maxX, b.maxX);
    out.maxY = Math.max(out.maxY, b.maxY);
  }
  return out;
}

export const boundsWidth = (b: Bounds): number => b.maxX - b.minX;
export const boundsHeight = (b: Bounds): number => b.maxY - b.minY;
export const boundsCenter = (b: Bounds): Vec2 => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });

export const boundsOverlap = (a: Bounds, b: Bounds, eps = 0): boolean =>
  a.minX <= b.maxX + eps && b.minX <= a.maxX + eps && a.minY <= b.maxY + eps && b.minY <= a.maxY + eps;

export const boundsContains = (outer: Bounds, inner: Bounds): boolean =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;

export const expandBounds = (b: Bounds, m: number): Bounds => ({
  minX: b.minX - m,
  minY: b.minY - m,
  maxX: b.maxX + m,
  maxY: b.maxY + m,
});

export const translateBounds = (b: Bounds, dx: number, dy: number): Bounds => ({
  minX: b.minX + dx,
  minY: b.minY + dy,
  maxX: b.maxX + dx,
  maxY: b.maxY + dy,
});

export function boundsFromPoints(a: Vec2, b: Vec2): Bounds {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

/** Signed area. Positive = visually clockwise (y points down). */
export function signedArea(poly: readonly Vec2[]): number {
  let s = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const polygonArea = (poly: readonly Vec2[]): number => Math.abs(signedArea(poly));

/** Returns the polygon with positive orientation (clockwise). */
export function ensureClockwise(poly: readonly Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? poly.slice().reverse() : poly.slice();
}

export function perimeterOf(points: readonly Vec2[], closed = true): number {
  let L = 0;
  const n = points.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) L += distance(points[i], points[(i + 1) % n]);
  return L;
}

export function centroid(poly: readonly Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-12) {
    const b = boundsOf(poly);
    return boundsCenter(b);
  }
  let cx = 0;
  let cy = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export interface SegmentHit {
  t: number;
  u: number;
  point: Vec2;
}

/** Intersection of two segments p1→p2 and p3→p4 (parallel segments return null). */
export function segmentIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): SegmentHit | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-14) return null;
  const ox = p3.x - p1.x;
  const oy = p3.y - p1.y;
  const t = (ox * d2y - oy * d2x) / denom;
  const u = (ox * d1y - oy * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, point: { x: p1.x + d1x * t, y: p1.y + d1y * t } };
}

export const segmentsIntersect = (p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean =>
  segmentIntersection(p1, p2, p3, p4) !== null;

export interface ClosestPoint {
  point: Vec2;
  /** Index of the edge (start vertex) */
  index: number;
  t: number;
  distance: number;
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return { point: { x: a.x, y: a.y }, t: 0 };
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return { point: { x: a.x + dx * t, y: a.y + dy * t }, t };
}

export function closestPointOnPolyline(p: Vec2, points: readonly Vec2[], closed = true): ClosestPoint {
  const n = points.length;
  let best: ClosestPoint = { point: points[0] ?? p, index: 0, t: 0, distance: Infinity };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const c = closestPointOnSegment(p, a, b);
    const d = distance(p, c.point);
    if (d < best.distance) best = { point: c.point, index: i, t: c.t, distance: d };
  }
  return best;
}

interface Segment {
  i: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Finds a true self-intersection (non-adjacent edges) with a sweep over x.
 * Returns the edge indices i < j and the intersection point.
 */
export function findSelfIntersection(poly: readonly Vec2[]): { i: number; j: number; point: Vec2 } | null {
  const n = poly.length;
  if (n < 4) return null;
  const segs: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    segs.push({
      i,
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxY: Math.max(a.y, b.y),
    });
  }
  segs.sort((s1, s2) => s1.minX - s2.minX);
  const eps = 1e-9;
  for (let k = 0; k < n; k++) {
    const s = segs[k];
    for (let m = k + 1; m < n; m++) {
      const o = segs[m];
      if (o.minX > s.maxX) break;
      if (o.minY > s.maxY || o.maxY < s.minY) continue;
      const i = Math.min(s.i, o.i);
      const j = Math.max(s.i, o.i);
      if (j - i <= 1 || (i === 0 && j === n - 1)) continue; // adjacent
      const hit = segmentIntersection(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]);
      if (hit && hit.t > eps && hit.t < 1 - eps && hit.u > eps && hit.u < 1 - eps) {
        return { i, j, point: hit.point };
      }
    }
  }
  return null;
}

export const isSelfIntersecting = (poly: readonly Vec2[]): boolean => findSelfIntersection(poly) !== null;

/**
 * Untangles a self-intersecting polygon by splitting it into loops at the intersection
 * points; the simple loop with the largest area is returned. This removes, for example, small
 * curls from freehand drawing or swallowtails in offset curves inside indentations.
 */
export function untangle(poly: readonly Vec2[], maxDepth = 48): Vec2[] {
  let current = poly.slice();
  for (let guard = 0; guard < maxDepth; guard++) {
    const hit = findSelfIntersection(current);
    if (!hit) return current;
    const { i, j, point } = hit;
    const loopA: Vec2[] = [point, ...current.slice(i + 1, j + 1)];
    const loopB: Vec2[] = [point, ...current.slice(j + 1), ...current.slice(0, i + 1)];
    const a = loopA.length >= 3 ? untangle(loopA, maxDepth - guard - 1) : loopA;
    const b = loopB.length >= 3 ? untangle(loopB, maxDepth - guard - 1) : loopB;
    current = polygonArea(a) >= polygonArea(b) ? a : b;
  }
  return current;
}

/** Checks whether two polygons overlap (edge intersection or containment). */
export function polygonsIntersect(
  a: readonly Vec2[],
  b: readonly Vec2[],
  ba: Bounds = boundsOf(a),
  bb: Bounds = boundsOf(b),
): boolean {
  if (!boundsOverlap(ba, bb)) return false;
  const na = a.length;
  const nb = b.length;
  for (let i = 0; i < na; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % na];
    const sMinX = Math.min(a1.x, a2.x);
    const sMaxX = Math.max(a1.x, a2.x);
    const sMinY = Math.min(a1.y, a2.y);
    const sMaxY = Math.max(a1.y, a2.y);
    if (sMaxX < bb.minX || sMinX > bb.maxX || sMaxY < bb.minY || sMinY > bb.maxY) continue;
    for (let j = 0; j < nb; j++) {
      if (segmentsIntersect(a1, a2, b[j], b[(j + 1) % nb])) return true;
    }
  }
  return pointInPolygon(a[0], b) || pointInPolygon(b[0], a);
}

/** Does `inner` lie completely inside `outer`? */
export function polygonInside(inner: readonly Vec2[], outer: readonly Vec2[], tolerance = 0): boolean {
  for (const p of inner) {
    if (!pointInPolygon(p, outer)) {
      if (tolerance > 0 && closestPointOnPolyline(p, outer).distance <= tolerance) continue;
      return false;
    }
  }
  const n = inner.length;
  const m = outer.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const hit = segmentIntersection(inner[i], inner[(i + 1) % n], outer[j], outer[(j + 1) % m]);
      if (hit && hit.t > 1e-6 && hit.t < 1 - 1e-6 && hit.u > 1e-6 && hit.u < 1 - 1e-6) {
        if (tolerance <= 0) return false;
      }
    }
  }
  return true;
}

/** Transform local points (around 0,0) into world coordinates with rotation and position. */
export function transformPoints(points: readonly Vec2[], x: number, y: number, rotation: number): Vec2[] {
  const origin = { x, y };
  return points.map((p) => add(rotate(p, rotation), origin));
}

export function toLocal(p: Vec2, x: number, y: number, rotation: number): Vec2 {
  return rotate(sub(p, { x, y }), -rotation);
}

export function toWorld(p: Vec2, x: number, y: number, rotation: number): Vec2 {
  return add(rotate(p, rotation), { x, y });
}

export function rectPolygon(width: number, height: number): Vec2[] {
  const w = width / 2;
  const h = height / 2;
  return [
    { x: -w, y: -h },
    { x: w, y: -h },
    { x: w, y: h },
    { x: -w, y: h },
  ];
}
