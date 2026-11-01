import { type Vec2, add, angleOf, clamp, cross, dot, mul, normalize, outwardNormal, sub } from './vec';
import { closestPointOnSegment, ensureClockwise } from './polygon';
import type { RoomObject } from '../types/document';
import { roomWorldPoints } from './objects';

/**
 * Offsets a closed polygon (clockwise) outwards by `d`, with mitres,
 * i.e. sharp corners like real walls. Very sharp corners are limited.
 */
export function miterOffset(poly: readonly Vec2[], d: number, miterLimit = 4): Vec2[] {
  const src = ensureClockwise(poly);
  const n = src.length;
  if (n < 3 || d === 0) return src;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = src[(i - 1 + n) % n];
    const cur = src[i];
    const next = src[(i + 1) % n];
    const n1 = outwardNormal(normalize(sub(cur, prev), { x: 1, y: 0 }));
    const n2 = outwardNormal(normalize(sub(next, cur), { x: 1, y: 0 }));
    const bis = normalize(add(n1, n2), n1);
    const cos = dot(bis, n1);
    const len = Math.min(Math.abs(d) / Math.max(cos, 1e-6), Math.abs(d) * miterLimit);
    out.push(add(cur, mul(bis, Math.sign(d) * len)));
  }
  return out;
}

export interface WallSnap {
  x: number;
  y: number;
  /** Rotation such that local +x runs along the wall and +y points into the room */
  rotation: number;
  wallDepth: number;
  /** Wall centre relative to the object axis (the axis lies on the inner face of the wall) */
  wallOffset: number;
  roomId: string;
  distance: number;
}

/**
 * Finds the nearest room wall for a door or window of width `width`.
 * The opening is shifted so that it lies completely on the wall (not across corners).
 */
export function snapToRoomWall(
  p: Vec2,
  rooms: readonly RoomObject[],
  width: number,
  maxDistance: number,
): WallSnap | null {
  let best: WallSnap | null = null;
  for (const room of rooms) {
    const pts = ensureClockwise(roomWorldPoints(room));
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (edgeLen < width + 0.02) continue;
      const hit = closestPointOnSegment(p, a, b);
      const dist = Math.hypot(p.x - hit.point.x, p.y - hit.point.y);
      // The distance to the wall centre counts; clicks directly on the wall should grab too
      const dir = normalize(sub(b, a));
      const signed = cross(dir, sub(p, a)) < 0 ? dist : -dist; // >0 outside
      const wallCenterDist = Math.abs(signed - room.wallThickness / 2);
      if (wallCenterDist > maxDistance + room.wallThickness / 2) continue;
      if (best && wallCenterDist >= best.distance) continue;
      const half = width / 2 / edgeLen;
      const t = clamp(hit.t, half, 1 - half);
      const pos = add(a, mul(sub(b, a), t));
      best = {
        x: pos.x,
        y: pos.y,
        rotation: angleOf(dir),
        wallDepth: room.wallThickness,
        wallOffset: -room.wallThickness / 2,
        roomId: room.id,
        distance: wallCenterDist,
      };
    }
  }
  return best;
}

export interface WallOpening {
  x: number;
  y: number;
  rotation: number;
  width: number;
  kind: 'door' | 'window';
}

export interface WallPiece {
  /** Quad clockwise: inner start, inner end, outer end, outer start (world coordinates) */
  quad: [Vec2, Vec2, Vec2, Vec2];
  kind: 'wall' | 'door' | 'window';
  /** Length along the wall */
  length: number;
}

/**
 * Splits the walls of a room into pieces: full wall, door opening, window.
 * Corners are mitred (gap-free), cuts at openings are square.
 * An opening belongs to a wall if it is parallel and its axis lies inside the wall.
 */
export function roomWallPieces(room: RoomObject, openings: readonly WallOpening[]): WallPiece[] {
  const pts = ensureClockwise(roomWorldPoints(room));
  const t = room.wallThickness;
  const n = pts.length;
  if (n < 3 || t <= 0) return [];
  const outer = miterOffset(pts, t);
  const pieces: WallPiece[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const oa = outer[i];
    const ob = outer[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) continue;
    const dir = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const nrm = outwardNormal(dir);
    const edgeAngle = angleOf(dir);
    const spans: Array<{ s0: number; s1: number; kind: 'door' | 'window' }> = [];
    for (const o of openings) {
      const rel = sub(o, a);
      const s = dot(rel, dir);
      const across = dot(rel, nrm);
      const parallel = Math.abs(Math.sin(((o.rotation - edgeAngle) * Math.PI) / 180)) < 0.1;
      if (!parallel || across < -0.06 || across > t + 0.06 || s < -o.width / 2 || s > L + o.width / 2) continue;
      spans.push({ s0: clamp(s - o.width / 2, 0, L), s1: clamp(s + o.width / 2, 0, L), kind: o.kind });
    }
    spans.sort((p, q) => p.s0 - q.s0);
    // merge overlapping openings (door wins)
    const merged: typeof spans = [];
    for (const sp of spans) {
      const last = merged[merged.length - 1];
      if (last && sp.s0 <= last.s1) {
        last.s1 = Math.max(last.s1, sp.s1);
        if (sp.kind === 'door') last.kind = 'door';
      } else merged.push({ ...sp });
    }
    const innerAt = (s: number) => add(a, mul(dir, s));
    const outerAt = (s: number) => (s <= 1e-9 ? oa : s >= L - 1e-9 ? ob : add(innerAt(s), mul(nrm, t)));
    const push = (s0: number, s1: number, kind: WallPiece['kind']) => {
      if (s1 - s0 < 1e-4) return;
      pieces.push({ quad: [innerAt(s0), innerAt(s1), outerAt(s1), outerAt(s0)], kind, length: s1 - s0 });
    };
    let cursor = 0;
    for (const sp of merged) {
      push(cursor, sp.s0, 'wall');
      push(sp.s0, sp.s1, sp.kind);
      cursor = sp.s1;
    }
    push(cursor, L, 'wall');
  }
  return pieces;
}
