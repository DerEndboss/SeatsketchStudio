import type { SeatDocument, TableObject } from '../types/document';
import {
  createColumn,
  createDoor,
  createEmptyDocument,
  createLabel,
  createRectRoom,
  createTable,
  createWindow,
  presetById,
} from '../editor/objects/factory';
import { addGuests, assignGuest, relayoutTable } from '../editor/objects/tableOps';
import { chairsOf } from '../state/lookup';

/** Example project "Banquet hall": 12 × 8 m, four round and two rectangular tables, a few guests. */
export function createExampleDocument(): SeatDocument {
  let doc = createEmptyDocument('Festsaal');
  const room = createRectRoom(12, 8, { x: 0, y: 0 }, 'Festsaal');
  const wall = room.wallThickness;

  const round = presetById('round');
  const rounds: TableObject[] = [
    createTable(round, { x: -3, y: -0.15 }, 'Tisch 1'),
    createTable(round, { x: 3, y: -0.15 }, 'Tisch 2'),
    createTable(round, { x: -3, y: 2.62 }, 'Tisch 3'),
    createTable(round, { x: 3, y: 2.62 }, 'Tisch 4'),
  ];
  const rect = presetById('rect');
  const head: TableObject[] = [
    { ...createTable(rect, { x: -0.95, y: -3.25 }, 'Tisch A'), tone: 'sand', seating: { mode: 'sides', sides: [false, false, true, false], gap: 0.05, auto: true } },
    { ...createTable(rect, { x: 0.95, y: -3.25 }, 'Tisch B'), tone: 'sand', seating: { mode: 'sides', sides: [false, false, true, false], gap: 0.05, auto: true } },
  ];

  const door = createDoor({ x: 0, y: 4, rotation: 180 }, { depth: wall, offset: -wall / 2 });
  door.width = 1.6;
  door.leaves = 2;
  const windows = [
    createWindow({ x: -6, y: -1.5, rotation: -90 }, { depth: wall, offset: -wall / 2 }),
    createWindow({ x: -6, y: 1.8, rotation: -90 }, { depth: wall, offset: -wall / 2 }),
    createWindow({ x: 6, y: -1.5, rotation: 90 }, { depth: wall, offset: -wall / 2 }),
    createWindow({ x: 6, y: 1.8, rotation: 90 }, { depth: wall, offset: -wall / 2 }),
  ];
  const columns = [createColumn({ x: -5.2, y: -3.2 }), createColumn({ x: 5.2, y: -3.2 })];
  const label = createLabel({ x: 0, y: 1.2 }, 'Dance floor');
  label.fontSize = 0.32;

  doc = { ...doc, objects: [room, ...head, ...rounds, door, ...windows, ...columns, label] };
  for (const t of head) doc = relayoutTable(doc, t.id, 3);
  for (const t of rounds) doc = relayoutTable(doc, t.id, 8);

  const added = addGuests(doc, [
    'Anna Berger',
    'Ben Schulz',
    'Clara Wolf',
    'David Neumann',
    'Emma Fischer',
    'Felix Braun',
    'Greta Hoffmann',
    'Jonas Keller',
    'Lena Richter',
    'Moritz Krause',
    'Nora Lehmann',
  ]);
  doc = added.doc;
  // Head tables complete; at table 1 the seats facing the dance floor and those opposite
  const seats = [...head.flatMap((t) => chairsOf(doc, t.id)), ...chairsOf(doc, rounds[0].id).filter((c) => [1, 2, 3, 6].includes(c.seat ?? -1))];
  added.added.slice(0, seats.length).forEach((g, i) => {
    doc = assignGuest(doc, seats[i].id, g.id);
  });
  return doc;
}
