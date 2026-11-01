import type { SceneObject } from '../../types/document';
import { type Vec2, lerp, normalizeAngle } from '../../geometry/vec';
import { toWorld } from '../../geometry/polygon';
import { type GeometryLookup, labelSize, roomWorldPoints, segmentEnds, worldPlacement } from '../../geometry/objects';

export type HandleKind = 'resize' | 'rotate' | 'vertex' | 'edge' | 'end';

export interface Handle {
  id: string;
  kind: HandleKind;
  pos: Vec2;
  cursor: string;
  /** Direction of the handle in the local system (−1, 0, 1) */
  sx: number;
  sy: number;
  index: number;
}

/** Screen distance of the rotation handle above the top edge. */
export const ROTATE_OFFSET_PX = 26;
export const HANDLE_HIT_PX = 8;

const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

function resizeCursor(sx: number, sy: number, rotation: number): string {
  const deg = (Math.atan2(sy, sx) * 180) / Math.PI + rotation;
  const idx = Math.round(normalizeAngle(deg) / 45);
  return CURSORS[((idx % 4) + 4) % 4];
}

/** Local extent (width × height) of scalable objects. */
export function localSize(o: SceneObject): { w: number; h: number } | null {
  switch (o.type) {
    case 'table':
    case 'column':
    case 'zone':
      return { w: o.width, h: o.height };
    case 'door':
      return { w: o.width, h: Math.max(o.wallDepth, 0.1) };
    case 'window':
      return { w: o.width, h: Math.max(o.wallDepth, 0.1) };
    default:
      return null;
  }
}

/** Handles for a single selected object. */
export function handlesFor(o: SceneObject, lookup: GeometryLookup, scale: number): Handle[] {
  if (o.locked) return [];
  const out: Handle[] = [];
  const place = worldPlacement(o, lookup);
  const toW = (p: Vec2) => toWorld(p, place.x, place.y, place.rotation);
  const rotateHandle = (topY: number) => {
    out.push({
      id: 'rotate',
      kind: 'rotate',
      pos: toW({ x: 0, y: topY - ROTATE_OFFSET_PX / scale }),
      cursor: 'grab',
      sx: 0,
      sy: -1,
      index: 0,
    });
  };

  switch (o.type) {
    case 'table':
    case 'column':
    case 'zone':
    case 'door':
    case 'window': {
      const s = localSize(o)!;
      const keepRound = (o.type === 'table' && o.shape === 'round') || (o.type === 'column' && o.shape === 'round' && o.width === o.height);
      const onlyX = o.type === 'door' || o.type === 'window';
      const yOff = o.type === 'door' || o.type === 'window' ? o.wallOffset : 0;
      for (let sy = -1; sy <= 1; sy++) {
        for (let sx = -1; sx <= 1; sx++) {
          if (sx === 0 && sy === 0) continue;
          if (onlyX && sy !== 0) continue;
          if (keepRound && (sx === 0 || sy === 0)) continue;
          out.push({
            id: `r${sx}${sy}`,
            kind: 'resize',
            pos: toW({ x: (sx * s.w) / 2, y: yOff + (sy * s.h) / 2 }),
            cursor: resizeCursor(sx, sy, place.rotation),
            sx,
            sy,
            index: 0,
          });
        }
      }
      // For tables the rotation handle sits beyond the chairs so it does not land on a chair
      if (o.type === 'table') rotateHandle(-s.h / 2 - o.seating.gap - lookup.chair.depth);
      else if (o.type === 'column' || o.type === 'zone') rotateHandle(-s.h / 2);
      else rotateHandle(yOff - s.h / 2);
      break;
    }
    case 'chair':
      rotateHandle(-lookup.chair.depth / 2);
      break;
    case 'label':
      rotateHandle(-labelSize(o).height / 2);
      break;
    case 'wall':
    case 'dimension': {
      const [a, b] = segmentEnds(o);
      out.push({ id: 'end0', kind: 'end', pos: a, cursor: 'move', sx: -1, sy: 0, index: 0 });
      out.push({ id: 'end1', kind: 'end', pos: b, cursor: 'move', sx: 1, sy: 0, index: 1 });
      break;
    }
    case 'room': {
      // Order as stored: the indices must match room.points
      const pts = roomWorldPoints(o);
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        const horizontal = Math.abs(q.y - p.y) < Math.abs(q.x - p.x);
        out.push({ id: `e${i}`, kind: 'edge', pos: lerp(p, q, 0.5), cursor: horizontal ? 'ns-resize' : 'ew-resize', sx: 0, sy: 0, index: i });
      });
      pts.forEach((p, i) => out.push({ id: `v${i}`, kind: 'vertex', pos: p, cursor: 'move', sx: 0, sy: 0, index: i }));
      break;
    }
  }
  return out;
}

export function hitHandle(handles: readonly Handle[], p: Vec2, scale: number): Handle | null {
  const r = HANDLE_HIT_PX / scale;
  // Corners/end points before edge midpoints so small objects stay grabbable
  const order = [...handles].sort((a, b) => rank(a) - rank(b));
  for (const h of order) if (Math.abs(p.x - h.pos.x) <= r && Math.abs(p.y - h.pos.y) <= r) return h;
  return null;
}

const rank = (h: Handle): number => (h.kind === 'vertex' || h.kind === 'end' ? 0 : h.kind === 'rotate' ? 1 : h.sx !== 0 && h.sy !== 0 ? 2 : 3);
