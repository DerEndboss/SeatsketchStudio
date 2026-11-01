import type { ChairObject, SceneObject, SeatDocument } from '../../types/document';
import { type Bounds, boundsUnion } from '../../geometry/polygon';
import { type GeometryLookup, worldBounds, worldPlacement } from '../../geometry/objects';
import { getLookup, findObject, chairsOf } from '../../state/lookup';
import { newId } from '../../state/ids';
import { renumberSeats, withObjects } from './tableOps';
import { tr } from '../../i18n';

/** Extend the selection by group members (groups are always selected together). */
export function expandGroups(doc: SeatDocument, ids: readonly string[]): string[] {
  const groups = new Set<string>();
  for (const id of ids) {
    const g = findObject(doc, id)?.groupId;
    if (g) groups.add(g);
  }
  if (groups.size === 0) return [...ids];
  const out = new Set(ids);
  for (const o of doc.objects) if (o.groupId && groups.has(o.groupId)) out.add(o.id);
  return [...out];
}

export function selectionBounds(doc: SeatDocument, ids: readonly string[], lookup: GeometryLookup = getLookup(doc)): Bounds | null {
  const list: Bounds[] = [];
  for (const id of ids) {
    const o = findObject(doc, id);
    if (o) list.push(worldBounds(o, lookup));
  }
  return boundsUnion(list);
}

/** Deletes objects (locked ones stay). Chairs of deleted tables go with them. */
export function deleteObjects(doc: SeatDocument, ids: readonly string[]): SeatDocument {
  const del = new Set<string>();
  for (const id of ids) {
    const o = findObject(doc, id);
    if (!o || o.locked) continue;
    del.add(id);
    if (o.type === 'table') for (const c of chairsOf(doc, id)) del.add(c.id);
  }
  if (del.size === 0) return doc;
  const touchedTables = new Set<string>();
  for (const id of del) {
    const o = findObject(doc, id);
    if (o?.type === 'chair' && o.tableId && !del.has(o.tableId)) touchedTables.add(o.tableId);
  }
  let out = withObjects(
    doc,
    doc.objects.filter((o) => !del.has(o.id)),
  );
  for (const t of touchedTables) out = renumberSeats(out, t);
  return out;
}

/**
 * Moves objects by (dx, dy). Chairs whose table moves along stay untouched (they are attached
 * to the table); other table chairs are moved in the table's coordinate system.
 */
export function translateObjects(doc: SeatDocument, ids: readonly string[], dx: number, dy: number): SeatDocument {
  if (dx === 0 && dy === 0) return doc;
  const set = new Set(ids);
  const lookup = getLookup(doc);
  const manualTables = new Set<string>();
  const objects = doc.objects.map((o) => {
    if (!set.has(o.id) || o.locked) return o;
    if (o.type === 'chair' && o.tableId) {
      if (set.has(o.tableId)) return o;
      const t = lookup.tables.get(o.tableId);
      if (t) {
        const r = (-t.rotation * Math.PI) / 180;
        manualTables.add(t.id);
        return { ...o, x: o.x + dx * Math.cos(r) - dy * Math.sin(r), y: o.y + dx * Math.sin(r) + dy * Math.cos(r) };
      }
    }
    return { ...o, x: o.x + dx, y: o.y + dy };
  });
  const out = withObjects(doc, objects);
  return manualTables.size ? markManual(out, manualTables) : out;
}

/** Chairs of these tables were moved by hand → no longer follow automatically. */
export function markManual(doc: SeatDocument, tableIds: Iterable<string>): SeatDocument {
  const set = new Set(tableIds);
  return withObjects(
    doc,
    doc.objects.map((o) => (o.type === 'table' && set.has(o.id) && o.seating.auto ? { ...o, seating: { ...o.seating, auto: false } } : o)),
  );
}

/* --------------------------------------- Clipboard --------------------------------------- */

export interface ClipboardPayload {
  objects: SceneObject[];
}

/** Copies objects including their table chairs. Individual table chairs are copied as free chairs. */
export function copyObjects(doc: SeatDocument, ids: readonly string[]): ClipboardPayload {
  const set = new Set(ids);
  const lookup = getLookup(doc);
  const out: SceneObject[] = [];
  const added = new Set<string>();
  for (const o of doc.objects) {
    if (!set.has(o.id) || added.has(o.id)) continue;
    if (o.type === 'chair' && o.tableId && !set.has(o.tableId)) {
      const p = worldPlacement(o, lookup);
      const free: ChairObject = { ...o, x: p.x, y: p.y, rotation: p.rotation };
      delete free.tableId;
      delete free.seat;
      out.push(free);
      added.add(o.id);
      continue;
    }
    out.push(o);
    added.add(o.id);
    if (o.type === 'table') {
      for (const c of chairsOf(doc, o.id)) {
        if (!added.has(c.id)) {
          out.push(c);
          added.add(c.id);
        }
      }
    }
  }
  return { objects: structuredClone(out) };
}

/** Pastes a copy (new IDs, without guests, offset). Returns the IDs of the top-level objects. */
export function pasteObjects(
  doc: SeatDocument,
  payload: ClipboardPayload,
  offset: { x: number; y: number },
): { doc: SeatDocument; ids: string[] } {
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  for (const o of payload.objects) idMap.set(o.id, newId(o.id.charAt(0) || 'o'));
  const fresh: SceneObject[] = [];
  const topIds: string[] = [];
  for (const src of payload.objects) {
    const o = structuredClone(src);
    o.id = idMap.get(src.id)!;
    o.locked = false;
    if (o.groupId) {
      if (!groupMap.has(o.groupId)) groupMap.set(o.groupId, newId('grp'));
      o.groupId = groupMap.get(o.groupId);
    }
    if (o.type === 'chair') {
      delete o.guestId;
      if (o.tableId && idMap.has(o.tableId)) {
        o.tableId = idMap.get(o.tableId);
        fresh.push(o);
        continue;
      }
      delete o.tableId;
      delete o.seat;
    }
    if (o.type === 'table') o.name = tr('name.copy', { name: o.name });
    o.x += offset.x;
    o.y += offset.y;
    fresh.push(o);
    topIds.push(o.id);
  }
  return { doc: withObjects(doc, [...doc.objects, ...fresh]), ids: topIds };
}

export function duplicateObjects(doc: SeatDocument, ids: readonly string[], offset = { x: 0.5, y: 0.5 }) {
  return pasteObjects(doc, copyObjects(doc, ids), offset);
}

/* ------------------------------------------- Layers ------------------------------------------- */

export type ZMove = 'forward' | 'backward' | 'front' | 'back';

export function reorder(doc: SeatDocument, ids: readonly string[], move: ZMove): SeatDocument {
  const set = new Set(ids);
  const objs = doc.objects.slice();
  if (move === 'front' || move === 'back') {
    const picked = objs.filter((o) => set.has(o.id));
    const rest = objs.filter((o) => !set.has(o.id));
    return withObjects(doc, move === 'front' ? [...rest, ...picked] : [...picked, ...rest]);
  }
  if (move === 'forward') {
    for (let i = objs.length - 2; i >= 0; i--) {
      if (set.has(objs[i].id) && !set.has(objs[i + 1].id)) [objs[i], objs[i + 1]] = [objs[i + 1], objs[i]];
    }
  } else {
    for (let i = 1; i < objs.length; i++) {
      if (set.has(objs[i].id) && !set.has(objs[i - 1].id)) [objs[i], objs[i - 1]] = [objs[i - 1], objs[i]];
    }
  }
  return withObjects(doc, objs);
}

/* -------------------------------------- Align & co. -------------------------------------- */

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** Objects that move on their own (no table chairs whose table is selected too). */
function movable(doc: SeatDocument, ids: readonly string[]): SceneObject[] {
  const set = new Set(ids);
  return ids
    .map((id) => findObject(doc, id))
    .filter((o): o is SceneObject => !!o && !o.locked && !(o.type === 'chair' && o.tableId && set.has(o.tableId)));
}

export function alignObjects(doc: SeatDocument, ids: readonly string[], mode: AlignMode): SeatDocument {
  const lookup = getLookup(doc);
  const items = movable(doc, ids);
  if (items.length < 2) return doc;
  const all = boundsUnion(items.map((o) => worldBounds(o, lookup)))!;
  let out = doc;
  for (const o of items) {
    const b = worldBounds(o, lookup);
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case 'left':
        dx = all.minX - b.minX;
        break;
      case 'right':
        dx = all.maxX - b.maxX;
        break;
      case 'hcenter':
        dx = (all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2;
        break;
      case 'top':
        dy = all.minY - b.minY;
        break;
      case 'bottom':
        dy = all.maxY - b.maxY;
        break;
      case 'vcenter':
        dy = (all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2;
        break;
    }
    out = translateObjects(out, [o.id], dx, dy);
  }
  return out;
}

/** Equal gaps between the objects (the outer ones stay put). */
export function distributeObjects(doc: SeatDocument, ids: readonly string[], axis: 'x' | 'y'): SeatDocument {
  const lookup = getLookup(doc);
  const items = movable(doc, ids).map((o) => ({ o, b: worldBounds(o, lookup) }));
  if (items.length < 3) return doc;
  const lo = (b: Bounds) => (axis === 'x' ? b.minX : b.minY);
  const hi = (b: Bounds) => (axis === 'x' ? b.maxX : b.maxY);
  items.sort((p, q) => lo(p.b) + hi(p.b) - (lo(q.b) + hi(q.b)));
  const total = hi(items[items.length - 1].b) - lo(items[0].b);
  const sizes = items.reduce((s, it) => s + hi(it.b) - lo(it.b), 0);
  const gap = (total - sizes) / (items.length - 1);
  let cursor = lo(items[0].b);
  let out = doc;
  for (const it of items) {
    const d = cursor - lo(it.b);
    out = axis === 'x' ? translateObjects(out, [it.o.id], d, 0) : translateObjects(out, [it.o.id], 0, d);
    cursor += hi(it.b) - lo(it.b) + gap;
  }
  return out;
}

export function groupObjects(doc: SeatDocument, ids: readonly string[]): SeatDocument {
  const items = movable(doc, ids);
  if (items.length < 2) return doc;
  const gid = newId('grp');
  const set = new Set(items.map((o) => o.id));
  return withObjects(
    doc,
    doc.objects.map((o) => (set.has(o.id) ? { ...o, groupId: gid } : o)),
  );
}

export function ungroupObjects(doc: SeatDocument, ids: readonly string[]): SeatDocument {
  const set = new Set(ids);
  let changed = false;
  const objects = doc.objects.map((o) => {
    if (!set.has(o.id) || !o.groupId) return o;
    changed = true;
    const n = { ...o };
    delete n.groupId;
    return n;
  });
  return changed ? withObjects(doc, objects) : doc;
}

export function setLocked(doc: SeatDocument, ids: readonly string[], locked: boolean): SeatDocument {
  const set = new Set(ids);
  return withObjects(
    doc,
    doc.objects.map((o) => (set.has(o.id) && !!o.locked !== locked ? { ...o, locked } : o)),
  );
}
