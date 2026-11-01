import type {
  ChairObject,
  ChairSize,
  DoorObject,
  Placement,
  SceneObject,
  TableObject,
  LabelObject,
} from '../types/document';
import { type Vec2, add, rotate } from './vec';
import { type Bounds, boundsOf, rectPolygon, transformPoints } from './polygon';
import { ellipseOutline, tableOutline } from './shapes';

/** What is needed to compute world geometry (chairs are attached to tables). */
export interface GeometryLookup {
  tables: ReadonlyMap<string, TableObject>;
  chair: ChairSize;
}

export function labelLines(o: LabelObject): string[] {
  const lines = o.text.split('\n');
  return lines.length ? lines : [''];
}

/** Rough text size (for selection frames, snapping and collision; drawing uses the real font). */
export function labelSize(o: LabelObject): { width: number; height: number } {
  const lines = labelLines(o);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { width: Math.max(o.fontSize, longest * o.fontSize * 0.56), height: o.fontSize * 1.25 * lines.length };
}

/** Local side a door opens towards (+1 = +y). */
export const doorSwingSign = (d: DoorObject): 1 | -1 => (d.flip ? -1 : 1);

/** Swing area of a door (local): quarter circle(s) on the wall face. */
export function doorSwingPolygons(d: DoorObject, segments = 12): Vec2[][] {
  const s = doorSwingSign(d);
  const face = d.wallOffset + (s * d.wallDepth) / 2;
  const leaves: Array<{ hinge: Vec2; radius: number; toward: 1 | -1 }> =
    d.leaves === 2
      ? [
          { hinge: { x: -d.width / 2, y: face }, radius: d.width / 2, toward: 1 },
          { hinge: { x: d.width / 2, y: face }, radius: d.width / 2, toward: -1 },
        ]
      : [
          d.hinge === 'left'
            ? { hinge: { x: -d.width / 2, y: face }, radius: d.width, toward: 1 }
            : { hinge: { x: d.width / 2, y: face }, radius: d.width, toward: -1 },
        ];
  return leaves.map(({ hinge, radius, toward }) => {
    const pts: Vec2[] = [hinge];
    for (let k = 0; k <= segments; k++) {
      const a = ((Math.PI / 2) * k) / segments;
      // from "along the wall" (toward) to "perpendicular" (s)
      pts.push({ x: hinge.x + Math.cos(a) * radius * toward, y: hinge.y + Math.sin(a) * radius * s });
    }
    return pts;
  });
}

export function localOutline(o: SceneObject, chair: ChairSize): Vec2[] {
  switch (o.type) {
    case 'room':
      return o.points;
    case 'table':
      return tableOutline(o);
    case 'chair':
      return rectPolygon(chair.width, chair.depth);
    case 'column':
      return o.shape === 'round' ? ellipseOutline(o.width / 2, o.height / 2, 32) : rectPolygon(o.width, o.height);
    case 'wall':
      return rectPolygon(o.length, o.thickness);
    case 'zone':
      return rectPolygon(o.width, o.height);
    case 'door': {
      const s = doorSwingSign(o);
      const reach = o.leaves === 2 ? o.width / 2 : o.width;
      const y1 = o.wallOffset - (s * o.wallDepth) / 2;
      const y2 = o.wallOffset + (s * o.wallDepth) / 2 + s * reach;
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      return [
        { x: -o.width / 2, y: top },
        { x: o.width / 2, y: top },
        { x: o.width / 2, y: bottom },
        { x: -o.width / 2, y: bottom },
      ];
    }
    case 'window':
      return rectPolygon(o.width, Math.max(o.wallDepth, 0.08)).map((p) => ({ x: p.x, y: p.y + o.wallOffset }));
    case 'label': {
      const s = labelSize(o);
      return rectPolygon(s.width, s.height);
    }
    case 'dimension':
      return rectPolygon(Math.max(o.length, 0.01), 0.16);
  }
}

/** World position and rotation; for table chairs including the table transform. */
export function worldPlacement(o: SceneObject, lookup: GeometryLookup): Placement {
  if (o.type === 'chair' && o.tableId) {
    const t = lookup.tables.get(o.tableId);
    if (t) {
      const p = add(rotate({ x: o.x, y: o.y }, t.rotation), { x: t.x, y: t.y });
      return { x: p.x, y: p.y, rotation: t.rotation + o.rotation };
    }
  }
  return { x: o.x, y: o.y, rotation: o.type === 'room' ? 0 : o.rotation };
}

interface OutlineCacheEntry {
  table: TableObject | undefined;
  chair: ChairSize;
  outline: Vec2[];
  bounds: Bounds;
}
const worldCache = new WeakMap<SceneObject, OutlineCacheEntry>();

function cached(o: SceneObject, lookup: GeometryLookup): OutlineCacheEntry {
  const table = o.type === 'chair' && o.tableId ? lookup.tables.get(o.tableId) : undefined;
  const hit = worldCache.get(o);
  if (hit && hit.table === table && hit.chair === lookup.chair) return hit;
  const p = worldPlacement(o, lookup);
  const outline = transformPoints(localOutline(o, lookup.chair), p.x, p.y, p.rotation);
  const entry = { table, chair: lookup.chair, outline, bounds: boundsOf(outline) };
  worldCache.set(o, entry);
  return entry;
}

export const worldOutline = (o: SceneObject, lookup: GeometryLookup): Vec2[] => cached(o, lookup).outline;
export const worldBounds = (o: SceneObject, lookup: GeometryLookup): Bounds => cached(o, lookup).bounds;

/** Chair world pose (handy for labels and export). */
export function chairWorldPlacement(c: ChairObject, lookup: GeometryLookup): Placement {
  return worldPlacement(c, lookup);
}

/** End points of a segment object (wall, dimension line) in world coordinates. */
export function segmentEnds(o: Placement & { length: number }): [Vec2, Vec2] {
  const half = rotate({ x: o.length / 2, y: 0 }, o.rotation);
  return [
    { x: o.x - half.x, y: o.y - half.y },
    { x: o.x + half.x, y: o.y + half.y },
  ];
}

/** Segment object from two end points. */
export function segmentFromEnds(a: Vec2, b: Vec2): { x: number; y: number; rotation: number; length: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
    length: Math.hypot(dx, dy),
  };
}

/** World points of a room. */
export const roomWorldPoints = (r: { x: number; y: number; points: Vec2[] }): Vec2[] =>
  r.points.map((p) => ({ x: p.x + r.x, y: p.y + r.y }));
