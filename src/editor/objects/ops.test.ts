import { describe, expect, it } from 'vitest';
import type { ChairObject, SeatDocument } from '../../types/document';
import { createChair, createEmptyDocument, createRectRoom, createTable, presetById } from './factory';
import {
  addGuests,
  assignGuest,
  assignGuestByName,
  chairsInSeatOrder,
  detachChairs,
  distributeChairs,
  patchTable,
  relayoutTable,
  removeGuests,
  seatUnassignedGuests,
  withObjects,
} from './tableOps';
import { alignObjects, copyObjects, deleteObjects, distributeObjects, duplicateObjects, pasteObjects, translateObjects } from './docOps';
import { chairsOf, getLookup } from '../../state/lookup';
import { worldPlacement } from '../../geometry/objects';
import { createExampleDocument } from '../../persistence/example';

function docWith(...tables: ReturnType<typeof createTable>[]): SeatDocument {
  return withObjects(createEmptyDocument('Test'), tables);
}

const chairs = (d: SeatDocument): ChairObject[] => d.objects.filter((o): o is ChairObject => o.type === 'chair');

describe('Chairs of a table (expected/actual)', () => {
  it('8 chairs at a round table → exactly 8, seats 1–8', () => {
    const t = createTable(presetById('round'), { x: 0, y: 0 }, 'Tisch 1');
    const d = relayoutTable(docWith(t), t.id, 8);
    const list = chairsOf(d, t.id);
    expect(list).toHaveLength(8);
    expect(list.map((c) => c.seat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('fewer chairs: guests on kept seats stay, the others become free', () => {
    const t = createTable(presetById('round'), { x: 0, y: 0 }, 'Tisch 1');
    let d = relayoutTable(docWith(t), t.id, 8);
    d = addGuests(d, ['Anna', 'Ben']).doc;
    const [anna, ben] = d.guests;
    const list = chairsOf(d, t.id);
    d = assignGuest(d, list[1].id, anna.id);
    d = assignGuest(d, list[6].id, ben.id);
    d = relayoutTable(d, t.id, 4);
    expect(chairsOf(d, t.id)).toHaveLength(4);
    expect(chairs(d).find((c) => c.guestId === anna.id)?.id).toBe(list[1].id);
    expect(chairs(d).some((c) => c.guestId === ben.id)).toBe(false);
    expect(d.guests).toHaveLength(2);
  });

  it('enlarge the table: automatically arranged chairs move along (count stays)', () => {
    const t = createTable(presetById('rect'), { x: 0, y: 0 }, 'Tisch 1');
    let d = relayoutTable(docWith(t), t.id, 6);
    const yBefore = Math.max(...chairsOf(d, t.id).map((c) => c.y));
    d = patchTable(d, t.id, { height: 1.2 });
    expect(chairsOf(d, t.id)).toHaveLength(6);
    expect(Math.max(...chairsOf(d, t.id).map((c) => c.y))).toBeCloseTo(yBefore + 0.2, 6);
  });

  it('chairs moved by hand stay put on resize', () => {
    const t = createTable(presetById('rect'), { x: 0, y: 0 }, 'Tisch 1');
    let d = relayoutTable(docWith(t), t.id, 6);
    const c = chairsOf(d, t.id)[0];
    d = translateObjects(d, [c.id], 0.3, 0);
    const moved = chairsOf(d, t.id)[0];
    d = patchTable(d, t.id, { width: 3 });
    expect(chairsOf(d, t.id)[0].x).toBe(moved.x);
  });

  it('move and rotate the table: chairs follow in world coordinates', () => {
    const t = createTable(presetById('rect'), { x: 0, y: 0 }, 'Tisch 1');
    let d = relayoutTable(docWith(t), t.id, 6);
    const c0 = chairsOf(d, t.id)[0];
    const before = worldPlacement(c0, getLookup(d));
    d = translateObjects(d, [t.id], 2, 1);
    d = patchTable(d, t.id, { rotation: 90 });
    const after = worldPlacement(chairsOf(d, t.id)[0], getLookup(d));
    // (x, y) → rotated by 90°: (−y, x), then translated
    expect(after.x).toBeCloseTo(-before.y + 2, 6);
    expect(after.y).toBeCloseTo(before.x + 1, 6);
    expect(after.rotation).toBeCloseTo(before.rotation + 90, 6);
  });

  it('detach chairs: same world position, independent of the table afterwards', () => {
    const t = createTable(presetById('round'), { x: 3, y: 2 }, 'Tisch 1');
    let d = relayoutTable(docWith({ ...t, rotation: 30 }), t.id, 4);
    const c = chairsOf(d, t.id)[2];
    const before = worldPlacement(c, getLookup(d));
    d = detachChairs(d, [c.id]);
    const free = chairs(d).find((x) => x.id === c.id)!;
    expect(free.tableId).toBeUndefined();
    expect(free.x).toBeCloseTo(before.x, 9);
    expect(free.y).toBeCloseTo(before.y, 9);
    expect(chairsOf(d, t.id).map((x) => x.seat)).toEqual([0, 1, 2]);
  });
});

describe('Distribute chairs across all tables (expected/actual)', () => {
  it('example project: 30 chairs, max 6 → exactly 30, never more than 6 at a table', () => {
    const d0 = createExampleDocument();
    const ids = d0.objects.filter((o) => o.type === 'table').map((o) => o.id);
    const { doc, allocation } = distributeChairs(d0, ids, 30, 6);
    expect(chairs(doc)).toHaveLength(30);
    expect(allocation.placed).toBe(30);
    for (const id of ids) expect(chairsOf(doc, id).length).toBeLessThanOrEqual(6);
  });

  it('more chairs than room → all full up to the maximum, the rest is reported', () => {
    const a = createTable(presetById('round'), { x: 0, y: 0 }, 'A');
    const b = createTable(presetById('square'), { x: 5, y: 0 }, 'B');
    const { doc, allocation } = distributeChairs(docWith(a, b), [a.id, b.id], 50, 8);
    expect(allocation.requested).toBe(50);
    expect(chairsOf(doc, a.id)).toHaveLength(8);
    expect(chairsOf(doc, b.id)).toHaveLength(4);
    expect(allocation.placed).toBe(12);
  });

  it('larger tables get more chairs', () => {
    const small = createTable(presetById('square'), { x: 0, y: 0 }, 'Klein');
    const big = createTable(presetById('banquet'), { x: 5, y: 0 }, 'Large');
    const { doc } = distributeChairs(docWith(small, big), [small.id, big.id], 12, 20);
    expect(chairsOf(doc, big.id).length).toBeGreaterThan(chairsOf(doc, small.id).length);
    expect(chairsOf(doc, big.id).length + chairsOf(doc, small.id).length).toBe(12);
  });
});

describe('Guests (expected/actual)', () => {
  it('paste names: duplicates and blank lines are skipped', () => {
    const { doc, added } = addGuests(createEmptyDocument(), ['Anna', ' anna ', '', 'Ben  Müller', 'Ben Müller']);
    expect(added.map((g) => g.name)).toEqual(['Anna', 'Ben Müller']);
    expect(doc.guests).toHaveLength(2);
  });

  it('fill free seats: order table 1, table 2 … by seat number; the rest is counted', () => {
    const t1 = createTable(presetById('square'), { x: 0, y: 0 }, 'Tisch 1');
    const t2 = createTable(presetById('square'), { x: 3, y: 0 }, 'Tisch 2');
    let d = relayoutTable(relayoutTable(docWith(t2, t1), t1.id, 2), t2.id, 2);
    d = addGuests(d, ['A', 'B', 'C', 'D', 'E']).doc;
    const r = seatUnassignedGuests(d);
    expect(r.seated).toBe(4);
    expect(r.left).toBe(1);
    const names = new Map(r.doc.guests.map((g) => [g.id, g.name]));
    expect(chairsInSeatOrder(r.doc).map((c) => names.get(c.guestId!))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('a guest never sits on two seats', () => {
    const t = createTable(presetById('square'), { x: 0, y: 0 }, 'Tisch 1');
    let d = relayoutTable(docWith(t), t.id, 4);
    const [c1, c2] = chairsOf(d, t.id);
    d = assignGuestByName(d, c1.id, 'Clara');
    d = assignGuestByName(d, c2.id, 'clara');
    expect(d.guests).toHaveLength(1);
    expect(chairs(d).filter((c) => c.guestId)).toHaveLength(1);
    expect(chairs(d).find((c) => c.guestId)?.id).toBe(c2.id);
  });

  it('deleting a guest frees the seat', () => {
    const t = createTable(presetById('square'), { x: 0, y: 0 }, 'Tisch 1');
    let d = relayoutTable(docWith(t), t.id, 4);
    d = assignGuestByName(d, chairsOf(d, t.id)[0].id, 'Dora');
    d = removeGuests(d, [d.guests[0].id]);
    expect(chairs(d).every((c) => !c.guestId)).toBe(true);
  });
});

describe('Editing', () => {
  it('deleting a table deletes its chairs too, locked objects stay', () => {
    const t = createTable(presetById('round'), { x: 0, y: 0 }, 'Tisch 1');
    const room = { ...createRectRoom(10, 8), locked: true };
    let d = relayoutTable(withObjects(createEmptyDocument(), [room, t]), t.id, 8);
    d = deleteObjects(d, [t.id, room.id]);
    expect(d.objects.map((o) => o.type)).toEqual(['room']);
  });

  it('duplicate: new IDs, chairs attached to the new table, no guests copied', () => {
    const t = createTable(presetById('round'), { x: 0, y: 0 }, 'Tisch 1');
    let d = relayoutTable(docWith(t), t.id, 6);
    d = assignGuestByName(d, chairsOf(d, t.id)[0].id, 'Eva');
    const { doc, ids } = duplicateObjects(d, [t.id]);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(t.id);
    expect(chairsOf(doc, ids[0])).toHaveLength(6);
    expect(chairsOf(doc, ids[0]).every((c) => !c.guestId)).toBe(true);
    expect(chairs(doc)).toHaveLength(12);
  });

  it('copy a single table chair → free chair at the same world position (+ offset)', () => {
    const t = createTable(presetById('round'), { x: 2, y: 2 }, 'Tisch 1');
    const d = relayoutTable(docWith(t), t.id, 4);
    const c = chairsOf(d, t.id)[1];
    const w = worldPlacement(c, getLookup(d));
    const { doc, ids } = pasteObjects(d, copyObjects(d, [c.id]), { x: 1, y: 0 });
    const pasted = doc.objects.find((o) => o.id === ids[0]) as ChairObject;
    expect(pasted.tableId).toBeUndefined();
    expect(pasted.x).toBeCloseTo(w.x + 1, 9);
    expect(pasted.y).toBeCloseTo(w.y, 9);
  });

  it('align left and distribute evenly', () => {
    const a = createChair({ x: 0, y: 0, rotation: 0 });
    const b = createChair({ x: 3, y: 1, rotation: 0 });
    const c = createChair({ x: 1, y: 2, rotation: 0 });
    let d = withObjects(createEmptyDocument(), [a, b, c]);
    d = alignObjects(d, [a.id, b.id, c.id], 'left');
    expect(d.objects.map((o) => o.x)).toEqual([0, 0, 0]);
    d = withObjects(createEmptyDocument(), [a, { ...b, x: 10 }, { ...c, x: 1 }]);
    d = distributeObjects(d, [a.id, b.id, c.id], 'x');
    expect(d.objects.find((o) => o.id === c.id)!.x).toBeCloseTo(5, 9);
  });
});
