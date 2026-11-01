import type { Vec2 } from './vec';
import { customTableOutline } from './pathSmoothing';
import type { TableObject, SideFlags } from '../types/document';

/** Ellipse (or circle) clockwise, starting at the top. */
export function ellipseOutline(rx: number, ry: number, segments = 96, cx = 0, cy = 0): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = -Math.PI / 2 + (i / segments) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

/** Rectangle with optionally rounded corners, clockwise from the top left. */
export function roundedRectOutline(width: number, height: number, radius: number, cornerSegments = 8): Vec2[] {
  const w = width / 2;
  const h = height / 2;
  const r = Math.max(0, Math.min(radius, w, h));
  if (r < 1e-6) {
    return [
      { x: -w, y: -h },
      { x: w, y: -h },
      { x: w, y: h },
      { x: -w, y: h },
    ];
  }
  const corners: Array<{ c: Vec2; from: number }> = [
    { c: { x: -w + r, y: -h + r }, from: 180 },
    { c: { x: w - r, y: -h + r }, from: 270 },
    { c: { x: w - r, y: h - r }, from: 0 },
    { c: { x: -w + r, y: h - r }, from: 90 },
  ];
  const pts: Vec2[] = [];
  for (const { c, from } of corners) {
    for (let k = 0; k <= cornerSegments; k++) {
      const a = ((from + (90 * k) / cornerSegments) * Math.PI) / 180;
      pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
    }
  }
  return pts;
}

/** Half-round: straight edge at the top (y = −h/2), arc downwards. */
export function semicircleOutline(width: number, height: number, segments = 64): Vec2[] {
  const rx = width / 2;
  const top = -height / 2;
  // top left → (straight edge) → top right → arc via the bottom back to the left
  const pts: Vec2[] = [{ x: -rx, y: top }];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI;
    pts.push({ x: Math.cos(a) * rx, y: top + Math.sin(a) * height });
  }
  return pts;
}

const primitiveCache = new Map<string, Vec2[]>();

/** Outline of a table in local coordinates (metres, clockwise). */
export function tableOutline(t: Pick<TableObject, 'shape' | 'width' | 'height' | 'cornerRadius' | 'path'>): Vec2[] {
  if (t.shape === 'custom' && t.path) return customTableOutline(t.path, t.width, t.height);
  const key = `${t.shape}|${t.width.toFixed(5)}|${t.height.toFixed(5)}|${t.cornerRadius.toFixed(5)}`;
  const cached = primitiveCache.get(key);
  if (cached) return cached;
  let out: Vec2[];
  switch (t.shape) {
    case 'round':
    case 'oval':
      out = ellipseOutline(t.width / 2, t.height / 2);
      break;
    case 'semicircle':
      out = semicircleOutline(t.width, t.height);
      break;
    default:
      out = roundedRectOutline(t.width, t.height, t.cornerRadius);
  }
  if (primitiveCache.size > 400) primitiveCache.clear();
  primitiveCache.set(key, out);
  return out;
}

export interface TableSide {
  a: Vec2;
  b: Vec2;
  normal: Vec2;
  length: number;
}

/** Sides of a rectangular table clockwise: top, right, bottom, left. */
export function rectSides(width: number, height: number): TableSide[] {
  const w = width / 2;
  const h = height / 2;
  return [
    { a: { x: -w, y: -h }, b: { x: w, y: -h }, normal: { x: 0, y: -1 }, length: width },
    { a: { x: w, y: -h }, b: { x: w, y: h }, normal: { x: 1, y: 0 }, length: height },
    { a: { x: w, y: h }, b: { x: -w, y: h }, normal: { x: 0, y: 1 }, length: width },
    { a: { x: -w, y: h }, b: { x: -w, y: -h }, normal: { x: -1, y: 0 }, length: height },
  ];
}

/** Which sides of a rectangular table are occupied according to the seating. */
export function enabledSides(t: Pick<TableObject, 'width' | 'height' | 'seating'>): SideFlags {
  switch (t.seating.mode) {
    case 'perimeter':
      return [true, true, true, true];
    case 'long':
      return t.width >= t.height ? [true, false, true, false] : [false, true, false, true];
    default:
      return t.seating.sides;
  }
}
