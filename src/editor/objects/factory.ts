import {
  DEFAULT_CHAIR_GAP,
  DEFAULT_SETTINGS,
  SCHEMA_ID,
  SCHEMA_VERSION,
  type ChairObject,
  type ColumnObject,
  type CustomPath,
  type DimensionObject,
  type DoorObject,
  type LabelObject,
  type RoomObject,
  type SeatDocument,
  type SeatingConfig,
  type TableObject,
  type TableShape,
  type WallObject,
  type WindowObject,
  type ZoneKind,
  type ZoneObject,
} from '../../types/document';
import type { Vec2 } from '../../geometry/vec';
import { ensureClockwise, boundsOf, boundsCenter } from '../../geometry/polygon';
import { segmentFromEnds } from '../../geometry/objects';
import { newId } from '../../state/ids';
import { tr, type MsgKey } from '../../i18n';

export function createEmptyDocument(name = tr('name.untitled')): SeatDocument {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA_ID,
    version: SCHEMA_VERSION,
    meta: { name, created: now, modified: now },
    settings: { ...DEFAULT_SETTINGS, chair: { ...DEFAULT_SETTINGS.chair } },
    objects: [],
    guests: [],
  };
}

export type TablePresetId = 'round' | 'rect' | 'square' | 'oval' | 'rounded' | 'banquet' | 'semicircle';

export interface TablePreset {
  id: TablePresetId;
  label: MsgKey;
  shape: TableShape;
  width: number;
  height: number;
  cornerRadius: number;
  mode: SeatingConfig['mode'];
}

export const TABLE_PRESETS: readonly TablePreset[] = [
  { id: 'round', label: 'preset.round', shape: 'round', width: 1.6, height: 1.6, cornerRadius: 0, mode: 'perimeter' },
  { id: 'rect', label: 'preset.rect', shape: 'rect', width: 1.8, height: 0.8, cornerRadius: 0, mode: 'long' },
  { id: 'square', label: 'preset.square', shape: 'rect', width: 0.9, height: 0.9, cornerRadius: 0, mode: 'perimeter' },
  { id: 'oval', label: 'preset.oval', shape: 'oval', width: 2.2, height: 1.2, cornerRadius: 0, mode: 'perimeter' },
  { id: 'rounded', label: 'preset.rounded', shape: 'rect', width: 1.8, height: 0.9, cornerRadius: 0.2, mode: 'long' },
  { id: 'banquet', label: 'preset.banquet', shape: 'rect', width: 3.6, height: 0.9, cornerRadius: 0, mode: 'long' },
  { id: 'semicircle', label: 'preset.semicircle', shape: 'semicircle', width: 1.6, height: 0.8, cornerRadius: 0, mode: 'long' },
];

export const presetById = (id: TablePresetId): TablePreset => TABLE_PRESETS.find((p) => p.id === id) ?? TABLE_PRESETS[0];

export const defaultSeating = (mode: SeatingConfig['mode'] = 'perimeter'): SeatingConfig => ({
  mode,
  sides: [true, true, true, true],
  gap: DEFAULT_CHAIR_GAP,
  auto: true,
});

/** Next free name "Table N" (in the current language). */
export function nextTableName(doc: SeatDocument): string {
  let max = 0;
  for (const o of doc.objects) {
    if (o.type !== 'table') continue;
    const m = /(\d+)\s*$/.exec(o.name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${tr('name.tablePrefix')} ${max + 1}`;
}

export function createTable(
  preset: TablePreset,
  center: Vec2,
  name: string,
  size?: { width: number; height: number },
): TableObject {
  return {
    id: newId('t'),
    type: 'table',
    name,
    x: center.x,
    y: center.y,
    rotation: 0,
    shape: preset.shape,
    width: size?.width ?? preset.width,
    height: size?.height ?? preset.height,
    cornerRadius: preset.cornerRadius,
    seating: defaultSeating(preset.mode),
  };
}

export function createCustomTable(
  path: Pick<CustomPath, 'points'> & Partial<CustomPath>,
  center: Vec2,
  width: number,
  height: number,
  name: string,
): TableObject {
  return {
    id: newId('t'),
    type: 'table',
    name,
    x: center.x,
    y: center.y,
    rotation: 0,
    shape: 'custom',
    width,
    height,
    cornerRadius: 0,
    path: { points: path.points, smoothing: path.smoothing ?? 0.5, preserveCorners: path.preserveCorners ?? true },
    seating: defaultSeating('perimeter'),
  };
}

export function createChair(p: { x: number; y: number; rotation: number }, tableId?: string, seat?: number): ChairObject {
  const c: ChairObject = { id: newId('c'), type: 'chair', x: p.x, y: p.y, rotation: p.rotation };
  if (tableId) {
    c.tableId = tableId;
    c.seat = seat ?? 0;
  }
  return c;
}

/** Rectangular room with centre `center`. */
export function createRectRoom(width: number, height: number, center: Vec2 = { x: 0, y: 0 }, name = tr('name.room')): RoomObject {
  const w = width / 2;
  const h = height / 2;
  return {
    id: newId('r'),
    type: 'room',
    name,
    x: center.x,
    y: center.y,
    rotation: 0,
    points: [
      { x: -w, y: -h },
      { x: w, y: -h },
      { x: w, y: h },
      { x: -w, y: h },
    ],
    wallThickness: 0.24,
  };
}

/** Room from world points (any polygon). */
export function createPolygonRoom(world: readonly Vec2[], name = tr('name.room')): RoomObject {
  const pts = ensureClockwise(world);
  const c = boundsCenter(boundsOf(pts));
  return {
    id: newId('r'),
    type: 'room',
    name,
    x: c.x,
    y: c.y,
    rotation: 0,
    points: pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
    wallThickness: 0.24,
  };
}

export function createDoor(p: { x: number; y: number; rotation: number }, wall?: { depth: number; offset: number }): DoorObject {
  return {
    id: newId('d'),
    type: 'door',
    x: p.x,
    y: p.y,
    rotation: p.rotation,
    width: 0.9,
    leaves: 1,
    hinge: 'left',
    flip: false,
    wallDepth: wall?.depth ?? 0.2,
    wallOffset: wall?.offset ?? 0,
  };
}

export function createWindow(p: { x: number; y: number; rotation: number }, wall?: { depth: number; offset: number }): WindowObject {
  return {
    id: newId('f'),
    type: 'window',
    x: p.x,
    y: p.y,
    rotation: p.rotation,
    width: 1.2,
    wallDepth: wall?.depth ?? 0.2,
    wallOffset: wall?.offset ?? 0,
  };
}

export function createColumn(p: Vec2, shape: ColumnObject['shape'] = 'square'): ColumnObject {
  return { id: newId('s'), type: 'column', x: p.x, y: p.y, rotation: 0, shape, width: 0.4, height: 0.4 };
}

export function createWall(a: Vec2, b: Vec2, thickness = 0.12): WallObject {
  const s = segmentFromEnds(a, b);
  return { id: newId('w'), type: 'wall', ...s, thickness };
}

const ZONE_NAMES: Record<ZoneKind, MsgKey> = { area: 'name.zone.area', stage: 'name.zone.stage', blocked: 'name.zone.blocked' };

export function createZone(center: Vec2, width: number, height: number, kind: ZoneKind = 'area', name = tr(ZONE_NAMES[kind])): ZoneObject {
  return { id: newId('z'), type: 'zone', name, kind, x: center.x, y: center.y, rotation: 0, width, height };
}

export function createLabel(p: Vec2, text = tr('name.label')): LabelObject {
  return { id: newId('l'), type: 'label', x: p.x, y: p.y, rotation: 0, text, fontSize: 0.3 };
}

export function createDimension(a: Vec2, b: Vec2): DimensionObject {
  const s = segmentFromEnds(a, b);
  return { id: newId('m'), type: 'dimension', ...s };
}
