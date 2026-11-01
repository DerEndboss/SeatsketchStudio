import type { ChairObject, SceneObject, SeatDocument, TableObject } from '../types/document';
import { type Bounds, boundsOf, boundsOverlap, polygonInside, polygonsIntersect, rectPolygon, transformPoints } from './polygon';
import { type GeometryLookup, doorSwingPolygons, roomWorldPoints, worldOutline, worldPlacement } from './objects';
import { seatingCapacity } from './chairPlacement';
import type { Vec2 } from './vec';

export type WarningKind = 'outside' | 'overlap' | 'door' | 'overfull' | 'blocked';

/** Translation keys of the warnings. */
export const WARNING_KEYS = {
  outside: 'warn.outside',
  overlap: 'warn.overlap',
  door: 'warn.door',
  overfull: 'warn.overfull',
  blocked: 'warn.blocked',
} as const satisfies Record<WarningKind, string>;

interface Body {
  id: string;
  kind: 'table' | 'chair' | 'column' | 'wall';
  poly: Vec2[];
  /** Shrunk outline for chair checks (chairs may go slightly under the table) */
  core: Vec2[];
  bounds: Bounds;
  tableId?: string;
}

function shrunkChair(c: ChairObject, lookup: GeometryLookup, factor: number): Vec2[] {
  const p = worldPlacement(c, lookup);
  return transformPoints(rectPolygon(lookup.chair.width * factor, lookup.chair.depth * factor), p.x, p.y, p.rotation);
}

/**
 * Checks the project for conflicts. Warnings block nothing; they only tint objects.
 * Broad phase over a grid (1 m), narrow phase with polygon intersection.
 */
export function computeWarnings(doc: SeatDocument, lookup: GeometryLookup): Map<string, WarningKind[]> {
  const warnings = new Map<string, WarningKind[]>();
  const add = (id: string, kind: WarningKind) => {
    const list = warnings.get(id);
    if (!list) warnings.set(id, [kind]);
    else if (!list.includes(kind)) list.push(kind);
  };

  const rooms = doc.objects.filter((o): o is Extract<SceneObject, { type: 'room' }> => o.type === 'room');
  const roomPolys = rooms.map((r) => roomWorldPoints(r));
  const bodies: Body[] = [];
  const doors: Array<{ id: string; polys: Vec2[][] }> = [];

  for (const o of doc.objects) {
    switch (o.type) {
      case 'table': {
        const poly = worldOutline(o, lookup);
        bodies.push({ id: o.id, kind: 'table', poly, core: poly, bounds: boundsOf(poly) });
        break;
      }
      case 'chair': {
        const poly = worldOutline(o, lookup);
        bodies.push({
          id: o.id,
          kind: 'chair',
          poly: shrunkChair(o, lookup, 0.86),
          core: shrunkChair(o, lookup, 0.6),
          bounds: boundsOf(poly),
          tableId: o.tableId,
        });
        break;
      }
      case 'column':
      case 'wall': {
        const poly = worldOutline(o, lookup);
        bodies.push({ id: o.id, kind: o.type, poly, core: poly, bounds: boundsOf(poly) });
        break;
      }
      case 'door':
        doors.push({ id: o.id, polys: doorSwingPolygons(o).map((p) => transformPoints(p, o.x, o.y, o.rotation)) });
        break;
      default:
        break;
    }
  }

  // outside the room
  if (roomPolys.length > 0) {
    for (const b of bodies) {
      if (b.kind === 'wall') continue;
      const test = b.kind === 'chair' ? b.core : b.poly;
      if (!roomPolys.some((rp) => polygonInside(test, rp, 0.005))) add(b.id, 'outside');
    }
  }

  // broad phase
  const cell = 1;
  const grid = new Map<string, number[]>();
  bodies.forEach((b, idx) => {
    const x0 = Math.floor(b.bounds.minX / cell);
    const x1 = Math.floor(b.bounds.maxX / cell);
    const y0 = Math.floor(b.bounds.minY / cell);
    const y1 = Math.floor(b.bounds.maxY / cell);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        const list = grid.get(k);
        if (list) list.push(idx);
        else grid.set(k, [idx]);
      }
    }
  });
  const tested = new Set<number>();
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ia = Math.min(list[i], list[j]);
        const ib = Math.max(list[i], list[j]);
        const key = ia * 1_000_003 + ib;
        if (tested.has(key)) continue;
        tested.add(key);
        const a = bodies[ia];
        const b = bodies[ib];
        if (!boundsOverlap(a.bounds, b.bounds)) continue;
        if (a.kind === 'wall' && b.kind === 'wall') continue;
        if (a.kind === 'column' && b.kind === 'column') continue;
        if ((a.kind === 'wall' || a.kind === 'column') && (b.kind === 'wall' || b.kind === 'column')) continue;
        // a chair at its own table may be pushed under
        if (a.kind === 'chair' && b.kind === 'table' && a.tableId === b.id) continue;
        if (b.kind === 'chair' && a.kind === 'table' && b.tableId === a.id) continue;
        let hit: boolean;
        if (a.kind === 'chair' && b.kind === 'table') hit = polygonsIntersect(a.core, b.poly);
        else if (b.kind === 'chair' && a.kind === 'table') hit = polygonsIntersect(b.core, a.poly);
        else hit = polygonsIntersect(a.poly, b.poly);
        if (!hit) continue;
        if (a.kind !== 'wall' && a.kind !== 'column') add(a.id, 'overlap');
        if (b.kind !== 'wall' && b.kind !== 'column') add(b.id, 'overlap');
      }
    }
  }

  // keep door swing areas clear
  for (const d of doors) {
    for (const poly of d.polys) {
      const pb = boundsOf(poly);
      for (const b of bodies) {
        if (b.kind === 'wall') continue;
        if (!boundsOverlap(pb, b.bounds)) continue;
        if (polygonsIntersect(b.kind === 'chair' ? b.core : b.poly, poly)) add(b.id, 'door');
      }
    }
  }

  // keep no-go zones clear
  for (const o of doc.objects) {
    if (o.type !== 'zone' || o.kind !== 'blocked') continue;
    const poly = worldOutline(o, lookup);
    const pb = boundsOf(poly);
    for (const b of bodies) {
      if (b.kind === 'wall' || b.kind === 'column') continue;
      if (!boundsOverlap(pb, b.bounds)) continue;
      if (polygonsIntersect(b.kind === 'chair' ? b.core : b.poly, poly)) add(b.id, 'blocked');
    }
  }

  // overfilled tables
  const chairCount = new Map<string, number>();
  for (const o of doc.objects) {
    if (o.type === 'chair' && o.tableId) chairCount.set(o.tableId, (chairCount.get(o.tableId) ?? 0) + 1);
  }
  for (const o of doc.objects) {
    if (o.type !== 'table') continue;
    const t = o as TableObject;
    const n = chairCount.get(t.id) ?? 0;
    if (n > 0 && t.seating.auto && n > seatingCapacity(t, lookup.chair)) add(t.id, 'overfull');
  }

  return warnings;
}
