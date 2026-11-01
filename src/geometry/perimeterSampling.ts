import { type Vec2, add, clamp, cross, distance, dot, mul, normalize, outwardNormal, sub } from './vec';
import { ensureClockwise, isSelfIntersecting, untangle } from './polygon';

/** Polyline with precomputed arc length, the basis for even spacing along an outline. */
export interface Polyline {
  points: Vec2[];
  closed: boolean;
  /** cumulative[i] = arc length up to point i; last entry = total length */
  cumulative: number[];
  length: number;
}

export function measurePolyline(points: readonly Vec2[], closed: boolean): Polyline {
  const n = points.length;
  const cumulative = [0];
  let L = 0;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    L += distance(points[i], points[(i + 1) % n]);
    cumulative.push(L);
  }
  return { points: points.slice(), closed, cumulative, length: L };
}

export interface PathSample {
  point: Vec2;
  /** Unit tangent in the direction of travel */
  tangent: Vec2;
  segment: number;
}

/** Point at arc length d (closed paths continue cyclically). */
export function pointAtDistance(pl: Polyline, d: number): PathSample {
  const n = pl.points.length;
  if (n === 0) return { point: { x: 0, y: 0 }, tangent: { x: 1, y: 0 }, segment: 0 };
  if (n === 1 || pl.length < 1e-12) return { point: { ...pl.points[0] }, tangent: { x: 1, y: 0 }, segment: 0 };
  const dd = pl.closed ? ((d % pl.length) + pl.length) % pl.length : clamp(d, 0, pl.length);
  let lo = 0;
  let hi = pl.cumulative.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pl.cumulative[mid] <= dd) lo = mid;
    else hi = mid - 1;
  }
  const a = pl.points[lo];
  const b = pl.points[(lo + 1) % n];
  const segLen = pl.cumulative[lo + 1] - pl.cumulative[lo];
  const t = segLen > 1e-12 ? (dd - pl.cumulative[lo]) / segLen : 0;
  return {
    point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
    tangent: normalize(sub(b, a), { x: 1, y: 0 }),
    segment: lo,
  };
}

/** Arc length of the point with index i. */
export const distanceAtIndex = (pl: Polyline, i: number): number => pl.cumulative[i] ?? 0;

/**
 * Offsets a closed polygon (clockwise) outwards by `offset`.
 * Convex corners get a round transition (chairs stand at the same distance there),
 * loops that arise in tight indentations are removed.
 */
export function offsetClosedPolygon(poly: readonly Vec2[], offset: number, arcStepDeg = 12): Vec2[] {
  const src = ensureClockwise(poly);
  const n = src.length;
  if (n < 3 || offset <= 0) return src;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = src[(i - 1 + n) % n];
    const cur = src[i];
    const next = src[(i + 1) % n];
    const e1 = normalize(sub(cur, prev), { x: 1, y: 0 });
    const e2 = normalize(sub(next, cur), e1);
    const n1 = outwardNormal(e1);
    const n2 = outwardNormal(e2);
    const sweep = Math.atan2(cross(n1, n2), dot(n1, n2));
    if (Math.abs(sweep) < (3 * Math.PI) / 180) {
      out.push(add(cur, mul(normalize(add(n1, n2), n1), offset)));
    } else if (sweep > 0) {
      // convex: circular arc around the corner
      const a1 = Math.atan2(n1.y, n1.x);
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) / ((arcStepDeg * Math.PI) / 180)));
      for (let k = 0; k <= steps; k++) {
        const ang = a1 + (sweep * k) / steps;
        out.push({ x: cur.x + Math.cos(ang) * offset, y: cur.y + Math.sin(ang) * offset });
      }
    } else {
      // concave: both normal points; untangle() removes the small loop that results
      out.push(add(cur, mul(n1, offset)), add(cur, mul(n2, offset)));
    }
  }
  const cleaned = isSelfIntersecting(out) ? untangle(out) : out;
  return ensureClockwise(cleaned);
}

/** Distributes `count` points at equal arc spacing on a closed path, starting at `start`. */
export function sampleClosedEvenly(pl: Polyline, count: number, start: number): PathSample[] {
  const out: PathSample[] = [];
  if (count <= 0) return out;
  const step = pl.length / count;
  for (let i = 0; i < count; i++) out.push(pointAtDistance(pl, start + i * step));
  return out;
}

/** Distributes `count` points over equally long sections of an open path (each at the section centre). */
export function sampleOpenSlots(pl: Polyline, count: number): PathSample[] {
  const out: PathSample[] = [];
  if (count <= 0) return out;
  const step = pl.length / count;
  for (let i = 0; i < count; i++) out.push(pointAtDistance(pl, (i + 0.5) * step));
  return out;
}
