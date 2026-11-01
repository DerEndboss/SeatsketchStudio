/**
 * 2D vectors in world coordinates (metres). The y axis points down (as on the canvas),
 * so positive angles rotate visually clockwise.
 */
export interface Vec2 {
  x: number;
  y: number;
}

export const DEG = Math.PI / 180;

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** z component of the cross product */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const distanceSq = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function normalize(a: Vec2, fallback: Vec2 = { x: 0, y: -1 }): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-12 ? { ...fallback } : { x: a.x / l, y: a.y / l };
}

/** Outward normal of an edge with direction d, for polygons with positive area (clockwise). */
export const outwardNormal = (d: Vec2): Vec2 => ({ x: d.y, y: -d.x });

export function rotate(p: Vec2, deg: number): Vec2 {
  if (deg === 0) return { x: p.x, y: p.y };
  const r = deg * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export const rotateAround = (p: Vec2, center: Vec2, deg: number): Vec2 =>
  add(center, rotate(sub(p, center), deg));

/** Angle of a direction vector in degrees (0 = right, 90 = down). */
export const angleOf = (d: Vec2): number => Math.atan2(d.y, d.x) / DEG;

/**
 * Rotation of a chair so that its front points in direction `dir`.
 * An unrotated chair faces up (−y), the backrest is at the bottom (+y).
 */
export const facingRotation = (dir: Vec2): number => Math.atan2(dir.x, -dir.y) / DEG;

/** Normalise an angle to (−180, 180]. */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  return a;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Round to a multiple of `step` without floating point artefacts like 1.7999999. */
export function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  const r = Math.round(value / step) * step;
  return Number(r.toFixed(6));
}

export const approxEqual = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;
