import type { GeometryLookup } from '../geometry/objects';
import type { ChairObject, SceneObject, SeatDocument, TableObject } from '../types/document';

const lookupCache = new WeakMap<readonly SceneObject[], GeometryLookup>();

/** Table index for world coordinates (cached per object array). */
export function getLookup(doc: SeatDocument): GeometryLookup {
  const hit = lookupCache.get(doc.objects);
  if (hit && hit.chair === doc.settings.chair) return hit;
  const tables = new Map<string, TableObject>();
  for (const o of doc.objects) if (o.type === 'table') tables.set(o.id, o);
  const lookup: GeometryLookup = { tables, chair: doc.settings.chair };
  lookupCache.set(doc.objects, lookup);
  return lookup;
}

const indexCache = new WeakMap<readonly SceneObject[], Map<string, SceneObject>>();

export function objectIndex(doc: SeatDocument): Map<string, SceneObject> {
  let idx = indexCache.get(doc.objects);
  if (!idx) {
    idx = new Map(doc.objects.map((o) => [o.id, o]));
    indexCache.set(doc.objects, idx);
  }
  return idx;
}

export const findObject = (doc: SeatDocument, id: string): SceneObject | undefined => objectIndex(doc).get(id);

const chairsCache = new WeakMap<readonly SceneObject[], Map<string, ChairObject[]>>();

/** Chairs per table, sorted by seat number. */
export function chairsByTable(doc: SeatDocument): Map<string, ChairObject[]> {
  let m = chairsCache.get(doc.objects);
  if (!m) {
    m = new Map();
    for (const o of doc.objects) {
      if (o.type !== 'chair' || !o.tableId) continue;
      const list = m.get(o.tableId);
      if (list) list.push(o);
      else m.set(o.tableId, [o]);
    }
    for (const list of m.values()) list.sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
    chairsCache.set(doc.objects, m);
  }
  return m;
}

export const chairsOf = (doc: SeatDocument, tableId: string): ChairObject[] => chairsByTable(doc).get(tableId) ?? [];
