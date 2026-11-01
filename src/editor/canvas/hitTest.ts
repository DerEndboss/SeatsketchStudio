import type { SceneObject, SeatDocument } from '../../types/document';
import type { Vec2 } from '../../geometry/vec';
import { type Bounds, boundsOverlap, closestPointOnPolyline, closestPointOnSegment, pointInPolygon } from '../../geometry/polygon';
import { type GeometryLookup, roomWorldPoints, segmentEnds, worldBounds, worldOutline } from '../../geometry/objects';

/** Hit-test order: small things on top first, rooms last. */
const PRIORITY: Record<SceneObject['type'], number> = {
  label: 0,
  chair: 0,
  dimension: 0,
  door: 1,
  window: 1,
  column: 1,
  table: 2,
  wall: 2,
  zone: 3,
  room: 4,
};

function near(b: Bounds, p: Vec2, tol: number): boolean {
  return p.x >= b.minX - tol && p.x <= b.maxX + tol && p.y >= b.minY - tol && p.y <= b.maxY + tol;
}

export function hitsObject(o: SceneObject, p: Vec2, lookup: GeometryLookup, tol: number): boolean {
  switch (o.type) {
    case 'dimension': {
      const [a, b] = segmentEnds(o);
      const c = closestPointOnSegment(p, a, b).point;
      return Math.hypot(p.x - c.x, p.y - c.y) <= tol * 1.5 + 0.06;
    }
    case 'room': {
      const pts = roomWorldPoints(o);
      const d = closestPointOnPolyline(p, pts, true).distance;
      const inside = pointInPolygon(p, pts);
      // Rooms are grabbed at the wall; the inside stays free for selection rectangles
      return inside ? d <= tol * 2 : d <= o.wallThickness + tol * 2;
    }
    default: {
      if (!near(worldBounds(o, lookup), p, tol)) return false;
      const outline = worldOutline(o, lookup);
      if (pointInPolygon(p, outline)) return true;
      return closestPointOnPolyline(p, outline, true).distance <= tol;
    }
  }
}

/** Topmost object under the point (world coordinates). `tol` in metres. */
export function hitObject(doc: SeatDocument, lookup: GeometryLookup, p: Vec2, tol: number): SceneObject | null {
  for (let pass = 0; pass <= 4; pass++) {
    for (let i = doc.objects.length - 1; i >= 0; i--) {
      const o = doc.objects[i];
      if (PRIORITY[o.type] !== pass) continue;
      if (hitsObject(o, p, lookup, tol)) return o;
    }
  }
  return null;
}

/** Objects that touch the selection rectangle (rooms only when fully inside). */
export function objectsInRect(doc: SeatDocument, lookup: GeometryLookup, rect: Bounds): SceneObject[] {
  const out: SceneObject[] = [];
  for (const o of doc.objects) {
    if (o.locked) continue;
    const b = worldBounds(o, lookup);
    if (o.type === 'room') {
      if (b.minX >= rect.minX && b.maxX <= rect.maxX && b.minY >= rect.minY && b.maxY <= rect.maxY) out.push(o);
      continue;
    }
    if (boundsOverlap(b, rect)) out.push(o);
  }
  return out;
}
