import type { SeatDocument, SeatingConfig, TableObject, Unit } from '../types/document';
import { tr, type MsgKey } from '../i18n';
import {
  createColumn,
  createDoor,
  createEmptyDocument,
  createRectRoom,
  createTable,
  createWindow,
  createZone,
  defaultSeating,
  presetById,
  type TablePresetId,
} from '../editor/objects/factory';
import { relayoutTable } from '../editor/objects/tableOps';

/*
 * Templates for the start: deliberately calm and airy, few tables, no guests.
 * All names are generated in the current language.
 */

export type TemplateId = 'blank' | 'wedding' | 'restaurant' | 'classroom' | 'festival' | 'conference';

export interface TemplateDef {
  id: TemplateId;
  title: MsgKey;
  desc: MsgKey;
}

export const TEMPLATES: readonly TemplateDef[] = [
  { id: 'blank', title: 'tpl.blank', desc: 'tpl.blank.desc' },
  { id: 'wedding', title: 'tpl.wedding', desc: 'tpl.wedding.desc' },
  { id: 'restaurant', title: 'tpl.restaurant', desc: 'tpl.restaurant.desc' },
  { id: 'classroom', title: 'tpl.classroom', desc: 'tpl.classroom.desc' },
  { id: 'festival', title: 'tpl.festival', desc: 'tpl.festival.desc' },
  { id: 'conference', title: 'tpl.conference', desc: 'tpl.conference.desc' },
];

export interface BlankOptions {
  name: string;
  width: number;
  length: number;
  withRoom: boolean;
  unit: Unit;
}

const tableName = (n: number) => `${tr('name.tablePrefix')} ${n}`;
const sides = (top: boolean, right: boolean, bottom: boolean, left: boolean): SeatingConfig => ({
  ...defaultSeating('sides'),
  sides: [top, right, bottom, left],
});

interface Placed {
  preset: TablePresetId;
  x: number;
  y: number;
  chairs: number;
  name?: string;
  seating?: SeatingConfig;
  size?: { width: number; height: number };
  rotation?: number;
  tone?: TableObject['tone'];
}

function build(name: string, w: number, h: number, tables: Placed[], extra: (doc: SeatDocument, wall: number) => SeatDocument['objects']): SeatDocument {
  let doc = createEmptyDocument(name);
  const room = createRectRoom(w, h, { x: 0, y: 0 }, tr('name.room'));
  let n = 0;
  const made = tables.map((p) => {
    const t = createTable(presetById(p.preset), { x: p.x, y: p.y }, p.name ?? tableName(++n), p.size);
    if (p.seating) t.seating = p.seating;
    if (p.rotation) t.rotation = p.rotation;
    if (p.tone) t.tone = p.tone;
    return t;
  });
  doc = { ...doc, objects: [room, ...made] };
  doc = { ...doc, objects: [...doc.objects, ...extra(doc, room.wallThickness)] };
  tables.forEach((p, i) => {
    doc = relayoutTable(doc, made[i].id, p.chairs);
  });
  return doc;
}

const inWall = (wall: number) => ({ depth: wall, offset: -wall / 2 });

export function buildTemplate(id: TemplateId, blank?: BlankOptions): SeatDocument {
  switch (id) {
    case 'blank': {
      const o = blank ?? { name: tr('tpl.blank'), width: 10, length: 8, withRoom: true, unit: 'm' as Unit };
      const doc = createEmptyDocument(o.name || tr('name.untitled'));
      doc.settings.unit = o.unit;
      if (o.withRoom) doc.objects.push(createRectRoom(o.width, o.length, { x: 0, y: 0 }, tr('name.room')));
      return doc;
    }
    case 'wedding':
      return build(
        tr('tpl.wedding'),
        14,
        10,
        [
          { preset: 'banquet', x: 0, y: -3.95, chairs: 6, name: tr('tpl.table.head'), seating: sides(false, false, true, false), tone: 'sand' },
          { preset: 'round', x: -4.6, y: -1.15, chairs: 8 },
          { preset: 'round', x: 4.6, y: -1.15, chairs: 8 },
          { preset: 'round', x: -4.6, y: 1.95, chairs: 8 },
          { preset: 'round', x: 4.6, y: 1.95, chairs: 8 },
        ],
        (_doc, wall) => {
          const door = createDoor({ x: 0, y: 5, rotation: 180 }, inWall(wall));
          door.width = 1.6;
          door.leaves = 2;
          return [
            createZone({ x: 0, y: 0.45 }, 5, 3.6, 'area', tr('tpl.zone.dance')),
            door,
            createWindow({ x: -7, y: -1.2, rotation: -90 }, inWall(wall)),
            createWindow({ x: -7, y: 2, rotation: -90 }, inWall(wall)),
            createWindow({ x: 7, y: -1.2, rotation: 90 }, inWall(wall)),
            createWindow({ x: 7, y: 2, rotation: 90 }, inWall(wall)),
          ];
        },
      );
    case 'restaurant': {
      const two = (x: number): Placed => ({ preset: 'square', x, y: -2.9, chairs: 2, seating: sides(false, true, false, true), size: { width: 0.75, height: 0.75 } });
      const four = (x: number, y: number): Placed => ({ preset: 'rect', x, y, chairs: 4, size: { width: 1.2, height: 0.8 } });
      return build(
        tr('tpl.restaurant'),
        12,
        8,
        [two(-4.6), two(-2.2), two(0.2), two(2.6), four(-4.2, -0.4), four(-1.2, -0.4), four(1.8, -0.4), four(-4.2, 2.3), four(-1.2, 2.3), four(1.8, 2.3)],
        (_doc, wall) => [
          createZone({ x: 5.15, y: 0.6 }, 1.1, 4.4, 'area', tr('tpl.zone.bar')),
          createDoor({ x: -3, y: 4, rotation: 180 }, inWall(wall)),
          ...[-4.6, -2.2, 0.2, 2.6].map((x) => createWindow({ x, y: -4, rotation: 0 }, inWall(wall))),
        ],
      );
    }
    case 'classroom': {
      const desks: Placed[] = [];
      for (const y of [-1.2, 0.4, 2]) {
        for (const x of [-2.8, 0, 2.8]) desks.push({ preset: 'rect', x, y, chairs: 2, size: { width: 1.3, height: 0.6 }, seating: sides(false, false, true, false) });
      }
      const doc = build(
        tr('tpl.classroom'),
        9,
        7,
        [{ preset: 'rect', x: -2.8, y: -2.4, chairs: 1, name: tr('tpl.table.teacher'), size: { width: 1.4, height: 0.7 }, seating: sides(true, false, false, false), tone: 'sand' }, ...desks],
        (_doc, wall) => [
          createZone({ x: 0.6, y: -3.3 }, 3.2, 0.25, 'area', tr('tpl.zone.board')),
          createDoor({ x: 4.5, y: 2.4, rotation: 90 }, inWall(wall)),
          createWindow({ x: -4.5, y: -1.4, rotation: -90 }, inWall(wall)),
          createWindow({ x: -4.5, y: 1.2, rotation: -90 }, inWall(wall)),
        ],
      );
      doc.settings.showTableNames = false;
      return doc;
    }
    case 'festival': {
      const bench = (x: number, y: number): Placed => ({ preset: 'rect', x, y, chairs: 8, size: { width: 2.2, height: 0.6 } });
      return build(
        tr('tpl.festival'),
        18,
        12,
        [bench(-5, -0.9), bench(-1.5, -0.9), bench(2, -0.9), bench(-5, 1.9), bench(-1.5, 1.9), bench(2, 1.9)],
        (_doc, wall) => {
          const door = createDoor({ x: -1.5, y: 6, rotation: 180 }, inWall(wall));
          door.width = 2;
          door.leaves = 2;
          return [
            createZone({ x: -1.5, y: -4.3 }, 7, 2.6, 'stage', tr('tpl.zone.stage')),
            createZone({ x: 7.2, y: 0.5 }, 2, 5, 'area', tr('tpl.zone.drinks')),
            door,
            createColumn({ x: -9 + 3, y: -6 + 3 }, 'round'),
            createColumn({ x: 9 - 3, y: -6 + 3 }, 'round'),
          ];
        },
      );
    }
    case 'conference':
      return build(
        tr('tpl.conference'),
        9,
        6,
        [{ preset: 'rounded', x: -0.3, y: 0, chairs: 12, size: { width: 4.4, height: 1.4 }, seating: defaultSeating('perimeter') }],
        (_doc, wall) => [
          createZone({ x: 4.25, y: 0 }, 0.2, 2.4, 'area', tr('tpl.zone.screen')),
          createDoor({ x: -3, y: 3, rotation: 180 }, inWall(wall)),
          createWindow({ x: -1.5, y: -3, rotation: 0 }, inWall(wall)),
          createWindow({ x: 1.5, y: -3, rotation: 0 }, inWall(wall)),
        ],
      );
  }
}

/** Key figures for the template card. */
export function templateStats(doc: SeatDocument): { width: number; length: number; tables: number; seats: number } {
  const room = doc.objects.find((o) => o.type === 'room');
  let width = 0;
  let length = 0;
  if (room?.type === 'room') {
    width = Math.max(...room.points.map((p) => p.x)) - Math.min(...room.points.map((p) => p.x));
    length = Math.max(...room.points.map((p) => p.y)) - Math.min(...room.points.map((p) => p.y));
  }
  return {
    width,
    length,
    tables: doc.objects.filter((o) => o.type === 'table').length,
    seats: doc.objects.filter((o) => o.type === 'chair').length,
  };
}
