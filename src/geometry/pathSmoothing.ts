import { type Vec2, clamp, distance, distanceSq, lerp, normalize, sub, dot } from './vec';
import {
  boundsOf,
  boundsWidth,
  boundsHeight,
  ensureClockwise,
  isSelfIntersecting,
  perimeterOf,
  polygonArea,
  centroid,
  untangle,
} from './polygon';
import type { CustomPath } from '../types/document';

/* ------------------------------------------------------------------------------------------
 * Path processing for freehand tables:
 *   raw path → Ramer–Douglas–Peucker (simplify) → resample evenly →
 *   Gaussian smoothing (optionally preserving corners) → fit exactly to the table size.
 * The raw path stays stored, so the smoothing can be undone at any time.
 * ---------------------------------------------------------------------------------------- */

export function dedupePoints(points: readonly Vec2[], minDist: number, closed = true): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (out.length === 0 || distance(out[out.length - 1], p) >= minDist) out.push({ x: p.x, y: p.y });
  }
  if (closed) {
    while (out.length > 2 && distance(out[0], out[out.length - 1]) < minDist) out.pop();
  }
  return out;
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return distance(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker for open polylines (iterative, no recursion depth risk). */
export function simplifyRDP(points: readonly Vec2[], epsilon: number): Vec2[] {
  const n = points.length;
  if (n <= 2) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segmentDistance(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * RDP for closed paths. The two points farthest apart serve as anchors,
 * so no artificial corner appears at the "seam" of the freehand stroke.
 */
export function simplifyClosed(points: readonly Vec2[], epsilon: number): Vec2[] {
  const n = points.length;
  if (n <= 3) return points.slice();
  const c = centroid(points);
  let a = 0;
  let best = -1;
  for (let i = 0; i < n; i++) {
    const d = distanceSq(points[i], c);
    if (d > best) {
      best = d;
      a = i;
    }
  }
  const rotated = [...points.slice(a), ...points.slice(0, a)];
  let far = 0;
  best = -1;
  for (let i = 1; i < n; i++) {
    const d = distanceSq(rotated[0], rotated[i]);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const first = simplifyRDP(rotated.slice(0, far + 1), epsilon);
  const second = simplifyRDP([...rotated.slice(far), rotated[0]], epsilon);
  const out = [...first.slice(0, -1), ...second.slice(0, -1)];
  return out.length >= 3 ? out : points.slice();
}

/** Bend angle (0° = straight, 180° = reversal) at each vertex of a closed polygon. */
export function turningAngles(poly: readonly Vec2[]): number[] {
  const n = poly.length;
  return poly.map((p, i) => {
    const prev = poly[(i - 1 + n) % n];
    const next = poly[(i + 1) % n];
    const a = normalize(sub(p, prev));
    const b = normalize(sub(next, p));
    return (Math.acos(clamp(dot(a, b), -1, 1)) * 180) / Math.PI;
  });
}

/** Samples each edge in proportion to its length; the original corners are kept exactly. */
function resampleKeepingVertices(poly: readonly Vec2[], spacing: number): { pts: Vec2[]; vertexIndex: number[] } {
  const pts: Vec2[] = [];
  const vertexIndex: number[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    vertexIndex.push(pts.length);
    pts.push({ x: a.x, y: a.y });
    const k = Math.max(1, Math.round(distance(a, b) / spacing));
    for (let j = 1; j < k; j++) pts.push(lerp(a, b, j / k));
  }
  return { pts, vertexIndex };
}

function gaussianWeights(sigma: number, maxRadius: number): number[] {
  const radius = Math.max(1, Math.min(maxRadius, Math.ceil(sigma * 3)));
  const w: number[] = [];
  for (let k = 0; k <= radius; k++) w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  return w;
}

/** Gaussian smoothing of a closed loop (convolution with a cyclic boundary). */
function smoothLoop(pts: readonly Vec2[], sigma: number): Vec2[] {
  const n = pts.length;
  const w = gaussianWeights(sigma, Math.floor((n - 1) / 2));
  const r = w.length - 1;
  const out: Vec2[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let sx = pts[i].x * w[0];
    let sy = pts[i].y * w[0];
    let ws = w[0];
    for (let k = 1; k <= r; k++) {
      const a = pts[(i + k) % n];
      const b = pts[(i - k + n) % n];
      sx += (a.x + b.x) * w[k];
      sy += (a.y + b.y) * w[k];
      ws += 2 * w[k];
    }
    out[i] = { x: sx / ws, y: sy / ws };
  }
  return out;
}

/**
 * Gaussian smoothing of an open section with fixed end points. The boundary is point-mirrored
 * (p₋ₖ = 2·p₀ − pₖ), which keeps corners sharp and straight pieces straight.
 */
function smoothSegmentFixedEnds(seg: readonly Vec2[], sigma: number): Vec2[] {
  const m = seg.length - 1;
  if (m < 2) return seg.slice();
  const w = gaussianWeights(sigma, m);
  const r = w.length - 1;
  const first = seg[0];
  const last = seg[m];
  const at = (j: number): Vec2 => {
    if (j < 0) {
      const q = seg[Math.min(m, -j)];
      return { x: 2 * first.x - q.x, y: 2 * first.y - q.y };
    }
    if (j > m) {
      const q = seg[Math.max(0, 2 * m - j)];
      return { x: 2 * last.x - q.x, y: 2 * last.y - q.y };
    }
    return seg[j];
  };
  const out: Vec2[] = new Array(m + 1);
  out[0] = first;
  out[m] = last;
  for (let i = 1; i < m; i++) {
    let sx = 0;
    let sy = 0;
    let ws = 0;
    for (let k = -r; k <= r; k++) {
      const p = at(i + k);
      const wk = w[Math.abs(k)];
      sx += p.x * wk;
      sy += p.y * wk;
      ws += wk;
    }
    out[i] = { x: sx / ws, y: sy / ws };
  }
  return out;
}

export interface SmoothingOptions {
  /** 0 … 1 */
  strength: number;
  preserveCorners: boolean;
  /** From this bend angle on, a vertex counts as a corner (degrees). */
  cornerAngle?: number;
}

/** Smoothing width (sigma) as a fraction of the perimeter at full strength. */
const MAX_SIGMA_FRACTION = 0.055;

/**
 * Smooths a closed polygon. Strength 0 returns the polygon unchanged (angular),
 * higher strengths widen the Gaussian kernel steplessly, so the slider acts continuously.
 */
export function smoothClosedPath(poly: readonly Vec2[], opts: SmoothingOptions): Vec2[] {
  const s = clamp(opts.strength, 0, 1);
  if (poly.length < 3 || s < 0.005) return poly.slice();
  const perimeter = perimeterOf(poly, true);
  if (perimeter < 1e-6) return poly.slice();
  const samples = Math.round(clamp(perimeter / 0.012, 120, 420));
  const spacing = perimeter / samples;
  const { pts, vertexIndex } = resampleKeepingVertices(poly, spacing);
  let sigma = (perimeter * MAX_SIGMA_FRACTION * Math.pow(s, 1.35)) / spacing;
  if (sigma < 0.35) return pts;

  let corners: number[] = [];
  if (opts.preserveCorners) {
    const angles = turningAngles(poly);
    const threshold = opts.cornerAngle ?? 50;
    corners = vertexIndex.filter((_, vi) => angles[vi] >= threshold);
  }

  const run = (sig: number): Vec2[] => {
    if (corners.length === 0) return smoothLoop(pts, sig);
    const n = pts.length;
    const out: Vec2[] = [];
    for (let c = 0; c < corners.length; c++) {
      const startIdx = corners[c];
      const endIdx = corners[(c + 1) % corners.length];
      const seg: Vec2[] = [];
      let i = startIdx;
      do {
        seg.push(pts[i]);
        i = (i + 1) % n;
      } while (i !== endIdx);
      seg.push(pts[endIdx]);
      out.push(...smoothSegmentFixedEnds(seg, sig).slice(0, -1));
    }
    return out;
  };

  // With extreme shapes (thin necks) smoothing can create self-intersections;
  // in that case the smoothing is reduced step by step instead of destroying the shape.
  let result = run(sigma);
  for (let attempt = 0; attempt < 6 && isSelfIntersecting(result); attempt++) {
    sigma *= 0.7;
    result = run(sigma);
  }
  if (isSelfIntersecting(result)) result = untangle(result);
  return result;
}

/** Scales and moves points so that their bounding box is exactly width × height around (0,0). */
export function fitToBox(points: readonly Vec2[], width: number, height: number): Vec2[] {
  const b = boundsOf(points);
  const bw = boundsWidth(b);
  const bh = boundsHeight(b);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const sx = bw > 1e-9 ? width / bw : 1;
  const sy = bh > 1e-9 ? height / bh : 1;
  return points.map((p) => ({ x: (p.x - cx) * sx, y: (p.y - cy) * sy }));
}

/** RDP tolerance relative to the table size. */
export const simplifyTolerance = (width: number, height: number): number =>
  Math.max(0.006, Math.hypot(width, height) * 0.012);

const outlineCache = new WeakMap<CustomPath, Map<string, Vec2[]>>();

/** Outline of a freehand/polygon table in local metres (clockwise, exactly width × height). */
export function customTableOutline(path: CustomPath, width: number, height: number): Vec2[] {
  const key = `${width.toFixed(5)}|${height.toFixed(5)}`;
  let perPath = outlineCache.get(path);
  const hit = perPath?.get(key);
  if (hit) return hit;

  const raw = path.points.map((p) => ({ x: p.x * width, y: p.y * height }));
  let outline: Vec2[];
  if (raw.length < 3) {
    outline = [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 },
    ];
  } else {
    const simplified = raw.length > 8 ? simplifyClosed(raw, simplifyTolerance(width, height)) : raw;
    const smoothed = smoothClosedPath(simplified, {
      strength: path.smoothing,
      preserveCorners: path.preserveCorners,
    });
    outline = ensureClockwise(fitToBox(smoothed, width, height));
  }
  if (!perPath) {
    perPath = new Map();
    outlineCache.set(path, perPath);
  }
  if (perPath.size > 24) perPath.clear();
  perPath.set(key, outline);
  return outline;
}

export interface ProcessedStroke {
  center: Vec2;
  width: number;
  height: number;
  /** points normalised to the bounding box (−0.5 … 0.5) */
  points: Vec2[];
}

/**
 * Converts a drawn stroke into a table shape: closes the path, removes
 * duplicate points and loops, and rejects shapes that are too small or too thin.
 * `minFeature` is the smallest meaningful distance in metres (e.g. 1 screen pixel).
 */
export function processStroke(world: readonly Vec2[], minFeature: number): ProcessedStroke | null {
  let pts = dedupePoints(world, Math.max(minFeature, 0.002), true);
  if (pts.length < 3) return null;
  // Thin out raw data slightly (invisibly) so project files stay small.
  if (pts.length > 320) pts = simplifyClosed(pts, Math.max(minFeature * 0.5, 0.003));
  if (isSelfIntersecting(pts)) pts = untangle(pts);
  if (pts.length < 3) return null;
  pts = ensureClockwise(pts);
  const b = boundsOf(pts);
  const width = boundsWidth(b);
  const height = boundsHeight(b);
  if (width < 0.15 || height < 0.15 || polygonArea(pts) < 0.02) return null;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return {
    center: { x: cx, y: cy },
    width,
    height,
    points: pts.map((p) => ({ x: (p.x - cx) / width, y: (p.y - cy) / height })),
  };
}

/* --------------------------------- Catmull-Rom → Bézier --------------------------------- */

export interface BezierSegment {
  c1: Vec2;
  c2: Vec2;
  to: Vec2;
}

/**
 * Converts a polyline into cubic Bézier segments (uniform Catmull-Rom).
 * This exports the smoothed outline as a true vector curve.
 */
export function catmullRomToBezier(points: readonly Vec2[], closed: boolean, tension = 1): BezierSegment[] {
  const n = points.length;
  if (n < 2) return [];
  const get = (i: number): Vec2 => {
    if (closed) return points[((i % n) + n) % n];
    return points[clamp(i, 0, n - 1)];
  };
  const segs: BezierSegment[] = [];
  const count = closed ? n : n - 1;
  const k = tension / 6;
  for (let i = 0; i < count; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    segs.push({
      c1: { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k },
      c2: { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k },
      to: { x: p2.x, y: p2.y },
    });
  }
  return segs;
}
