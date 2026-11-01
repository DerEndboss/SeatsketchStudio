import type { ChairObject, Guest, SceneObject, SeatDocument, TableObject } from '../../types/document';
import { allocateAcrossTables, layoutChairs, seatingCapacity, type TableAllocation } from '../../geometry/chairPlacement';
import { chairsOf, findObject } from '../../state/lookup';
import { createChair } from './factory';
import { newId } from '../../state/ids';
import { tr } from '../../i18n';

const naturalCompare = new Intl.Collator('de', { numeric: true, sensitivity: 'base' }).compare;

export function withObjects(doc: SeatDocument, objects: SceneObject[]): SeatDocument {
  return { ...doc, objects };
}

/** Replaces objects by ID (the patch function returns the new object). */
export function mapObjects(
  doc: SeatDocument,
  ids: ReadonlySet<string> | readonly string[],
  fn: (o: SceneObject) => SceneObject,
): SeatDocument {
  const set = ids instanceof Set ? ids : new Set(ids as readonly string[]);
  let changed = false;
  const objects = doc.objects.map((o) => {
    if (!set.has(o.id)) return o;
    const n = fn(o);
    if (n !== o) changed = true;
    return n;
  });
  return changed ? withObjects(doc, objects) : doc;
}

export function updateTable(doc: SeatDocument, id: string, patch: Partial<TableObject>): SeatDocument {
  return mapObjects(doc, [id], (o) => (o.type === 'table' ? { ...o, ...patch } : o));
}

/**
 * Rearranges the chairs of a table. Existing chairs (with their guest) keep their
 * seat number, surplus ones are removed, missing ones added. Afterwards the arrangement is "automatic".
 */
export function relayoutTable(doc: SeatDocument, tableId: string, count?: number): SeatDocument {
  const table = findObject(doc, tableId);
  if (!table || table.type !== 'table') return doc;
  const existing = chairsOf(doc, tableId);
  const n = Math.max(0, Math.floor(count ?? existing.length));
  const layout = layoutChairs(table, n, doc.settings.chair);

  const keep = new Map<string, ChairObject>();
  const added: ChairObject[] = [];
  layout.poses.forEach((pose, i) => {
    const base = existing[i];
    if (base) {
      keep.set(base.id, { ...base, x: pose.x, y: pose.y, rotation: pose.rotation, seat: i, tableId });
    } else {
      added.push(createChair(pose, tableId, i));
    }
  });
  const removed = new Set(existing.slice(n).map((c) => c.id));
  const objects: SceneObject[] = [];
  for (const o of doc.objects) {
    if (removed.has(o.id)) continue;
    if (o.id === tableId && o.type === 'table') {
      objects.push(o.seating.auto ? o : { ...o, seating: { ...o.seating, auto: true } });
      continue;
    }
    objects.push(keep.get(o.id) ?? o);
  }
  objects.push(...added);
  return withObjects(doc, objects);
}

/** After shape/size changes: carry automatically arranged chairs along. */
export function reflowTables(doc: SeatDocument, tableIds: Iterable<string>): SeatDocument {
  let out = doc;
  for (const id of tableIds) {
    const t = findObject(out, id);
    if (t && t.type === 'table' && t.seating.auto && chairsOf(out, id).length > 0) out = relayoutTable(out, id);
  }
  return out;
}

/** Changes a table and carries automatically arranged chairs along. */
export function patchTable(doc: SeatDocument, id: string, patch: Partial<TableObject>): SeatDocument {
  return reflowTables(updateTable(doc, id, patch), [id]);
}

export interface DistributeResult {
  doc: SeatDocument;
  allocation: TableAllocation;
}

/** Tables in reading order (name sorted naturally). */
export function sortedTables(doc: SeatDocument, ids?: readonly string[]): TableObject[] {
  const set = ids ? new Set(ids) : null;
  return doc.objects
    .filter((o): o is TableObject => o.type === 'table' && (!set || set.has(o.id)))
    .sort((a, b) => naturalCompare(a.name, b.name));
}

/**
 * Distributes `total` chairs across the tables: larger tables get more, none more than
 * `maxPerTable` or than physically fit without overlap.
 */
export function planDistribution(doc: SeatDocument, tables: readonly TableObject[], total: number, maxPerTable: number): TableAllocation {
  return allocateAcrossTables(
    tables.map((t) => ({ id: t.id, capacity: seatingCapacity(t, doc.settings.chair) })),
    total,
    maxPerTable,
  );
}

export function distributeChairs(doc: SeatDocument, tableIds: readonly string[], total: number, maxPerTable: number): DistributeResult {
  const tables = sortedTables(doc, tableIds);
  const allocation = planDistribution(doc, tables, total, maxPerTable);
  let out = doc;
  for (const t of tables) out = relayoutTable(out, t.id, allocation.counts.get(t.id) ?? 0);
  return { doc: out, allocation };
}

/** Detach the chairs of a table: they become freely movable (world coordinates), with no table reference. */
export function detachChairs(doc: SeatDocument, chairIds: readonly string[]): SeatDocument {
  const set = new Set(chairIds);
  const touched = new Set<string>();
  const objects = doc.objects.map((o) => {
    if (!set.has(o.id) || o.type !== 'chair' || !o.tableId) return o;
    const t = findObject(doc, o.tableId);
    if (!t || t.type !== 'table') return { ...o, tableId: undefined, seat: undefined };
    touched.add(t.id);
    const r = (t.rotation * Math.PI) / 180;
    const x = t.x + o.x * Math.cos(r) - o.y * Math.sin(r);
    const y = t.y + o.x * Math.sin(r) + o.y * Math.cos(r);
    const free: ChairObject = { ...o, x, y, rotation: t.rotation + o.rotation };
    delete free.tableId;
    delete free.seat;
    return free;
  });
  let out = withObjects(doc, objects);
  for (const id of touched) out = renumberSeats(out, id);
  return out;
}

/** Close gaps in a table's seat numbers (order stays). */
export function renumberSeats(doc: SeatDocument, tableId: string): SeatDocument {
  const chairs = chairsOf(doc, tableId);
  const seat = new Map(chairs.map((c, i) => [c.id, i]));
  return mapObjects(doc, [...seat.keys()], (o) => (o.type === 'chair' && o.seat !== seat.get(o.id) ? { ...o, seat: seat.get(o.id) } : o));
}

/* ------------------------------------------ Guests ------------------------------------------ */

export function chairOfGuest(doc: SeatDocument, guestId: string): ChairObject | undefined {
  return doc.objects.find((o): o is ChairObject => o.type === 'chair' && o.guestId === guestId);
}

/** Seats a guest on a chair (a guest only ever sits on one seat). */
export function assignGuest(doc: SeatDocument, chairId: string, guestId: string | undefined): SeatDocument {
  const target = findObject(doc, chairId);
  if (target?.type === 'chair' && target.guestId === guestId) return doc;
  const objects = doc.objects.map((o) => {
    if (o.type !== 'chair') return o;
    if (o.id === chairId) return o.guestId === guestId ? o : { ...o, guestId };
    if (guestId && o.guestId === guestId) return { ...o, guestId: undefined };
    return o;
  });
  return withObjects(doc, objects);
}

/** Seat a guest on a chair by name; unknown names are created as new guests. */
export function assignGuestByName(doc: SeatDocument, chairId: string, name: string): SeatDocument {
  const clean = name.trim();
  if (!clean) return assignGuest(doc, chairId, undefined);
  const lower = clean.toLocaleLowerCase('de');
  let guest = doc.guests.find((g) => g.name.trim().toLocaleLowerCase('de') === lower);
  let out = doc;
  if (!guest) {
    guest = { id: newId('g'), name: clean };
    out = { ...out, guests: [...out.guests, guest] };
  }
  return assignGuest(out, chairId, guest.id);
}

export function addGuests(doc: SeatDocument, names: readonly string[]): { doc: SeatDocument; added: Guest[] } {
  const existing = new Set(doc.guests.map((g) => g.name.trim().toLocaleLowerCase('de')));
  const added: Guest[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = name.toLocaleLowerCase('de');
    if (existing.has(key)) continue;
    existing.add(key);
    added.push({ id: newId('g'), name });
  }
  if (added.length === 0) return { doc, added };
  return { doc: { ...doc, guests: [...doc.guests, ...added] }, added };
}

export function removeGuests(doc: SeatDocument, guestIds: readonly string[]): SeatDocument {
  const set = new Set(guestIds);
  const objects = doc.objects.map((o) => (o.type === 'chair' && o.guestId && set.has(o.guestId) ? { ...o, guestId: undefined } : o));
  return { ...doc, objects, guests: doc.guests.filter((g) => !set.has(g.id)) };
}

export function renameGuest(doc: SeatDocument, guestId: string, name: string): SeatDocument {
  const clean = name.trim();
  if (!clean) return doc;
  return { ...doc, guests: doc.guests.map((g) => (g.id === guestId ? { ...g, name: clean } : g)) };
}

/** All chairs in seating order: tables by name, then by seat number; free chairs last. */
export function chairsInSeatOrder(doc: SeatDocument): ChairObject[] {
  const out: ChairObject[] = [];
  for (const t of sortedTables(doc)) out.push(...chairsOf(doc, t.id));
  for (const o of doc.objects) if (o.type === 'chair' && !o.tableId) out.push(o);
  return out;
}

/** Seats all guests without a seat on free chairs, in order. */
export function seatUnassignedGuests(doc: SeatDocument): { doc: SeatDocument; seated: number; left: number } {
  const seatedGuests = new Set<string>();
  const known = new Set(doc.guests.map((g) => g.id));
  for (const o of doc.objects) if (o.type === 'chair' && o.guestId && known.has(o.guestId)) seatedGuests.add(o.guestId);
  const waiting = doc.guests.filter((g) => !seatedGuests.has(g.id));
  const free = chairsInSeatOrder(doc).filter((c) => !c.guestId || !known.has(c.guestId));
  const pairs = new Map<string, string>();
  const n = Math.min(waiting.length, free.length);
  for (let i = 0; i < n; i++) pairs.set(free[i].id, waiting[i].id);
  if (n === 0) return { doc, seated: 0, left: waiting.length };
  const objects = doc.objects.map((o) => (o.type === 'chair' && pairs.has(o.id) ? { ...o, guestId: pairs.get(o.id) } : o));
  return { doc: withObjects(doc, objects), seated: n, left: waiting.length - n };
}

/** "Table 3 · Seat 2" or "Single chair" (translated). */
export function seatLabel(doc: SeatDocument, chair: ChairObject): string {
  if (!chair.tableId) return tr('chair.single');
  const t = findObject(doc, chair.tableId);
  const name = t && t.type === 'table' ? t.name : tr('name.tablePrefix');
  return tr('chair.seat', { table: name, n: (chair.seat ?? 0) + 1 });
}
