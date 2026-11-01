import type { Vec2 } from '../geometry/vec';

/**
 * Project format of Seatsketch Studio.
 *
 * All lengths are in metres, all angles in degrees (clockwise, y points down).
 * Objects store their centre (x, y) in world coordinates, except chairs attached to a
 * table: their x/y/rotation are local to the table, so that when the table is moved or
 * rotated they follow automatically.
 */

export const SCHEMA_ID = 'seatsketch-studio';
export const SCHEMA_VERSION = 1;
export const FILE_EXTENSION = 'seatsketch';

export type Unit = 'm' | 'cm';

export interface Placement {
  x: number;
  y: number;
  rotation: number;
}

interface ObjectBase extends Placement {
  id: string;
  locked?: boolean;
  groupId?: string;
}

export type TableShape = 'rect' | 'round' | 'oval' | 'semicircle' | 'custom';

/** Subtle table colours for grouping (family, department, class …). */
export type TableTone = 'default' | 'sand' | 'sage' | 'sky' | 'rose' | 'slate';
export const TABLE_TONES: readonly TableTone[] = ['default', 'sand', 'sage', 'sky', 'rose', 'slate'];

/** perimeter = all around, long = long sides only (half-round: arc side only), sides = choose sides individually */
export type SeatingMode = 'perimeter' | 'long' | 'sides';

/** Order: top, right, bottom, left */
export type SideFlags = [boolean, boolean, boolean, boolean];

export interface SeatingConfig {
  mode: SeatingMode;
  sides: SideFlags;
  /** Distance from the seat front edge to the table edge in m */
  gap: number;
  /** true while the chairs are arranged automatically (becomes false on manual moves) */
  auto: boolean;
}

/** Freehand/polygon shape. Points are normalised to the bounding box (-0.5 … 0.5). */
export interface CustomPath {
  points: Vec2[];
  /** 0 = angular (simplified polygon), 1 = strongly smoothed */
  smoothing: number;
  preserveCorners: boolean;
}

export interface RoomObject extends ObjectBase {
  type: 'room';
  name: string;
  /** Vertices relative to (x, y), clockwise */
  points: Vec2[];
  wallThickness: number;
}

export interface TableObject extends ObjectBase {
  type: 'table';
  name: string;
  shape: TableShape;
  width: number;
  height: number;
  cornerRadius: number;
  path?: CustomPath;
  seating: SeatingConfig;
  tone?: TableTone;
}

export interface ChairObject extends ObjectBase {
  type: 'chair';
  tableId?: string;
  /** Seat number at the table (0-based, displayed +1) */
  seat?: number;
  guestId?: string;
}

export interface DoorObject extends ObjectBase {
  type: 'door';
  width: number;
  leaves: 1 | 2;
  hinge: 'left' | 'right';
  /** true = opens towards the other side of the wall */
  flip: boolean;
  wallDepth: number;
  /** Offset of the wall centre from the object axis (local y) */
  wallOffset: number;
}

export interface WindowObject extends ObjectBase {
  type: 'window';
  width: number;
  wallDepth: number;
  wallOffset: number;
}

export interface ColumnObject extends ObjectBase {
  type: 'column';
  shape: 'round' | 'square';
  width: number;
  height: number;
}

export interface WallObject extends ObjectBase {
  type: 'wall';
  length: number;
  thickness: number;
}

/** Area on the floor: dance floor, stage or no-go zone (nothing should stand there). */
export type ZoneKind = 'area' | 'stage' | 'blocked';

export interface ZoneObject extends ObjectBase {
  type: 'zone';
  name: string;
  kind: ZoneKind;
  width: number;
  height: number;
}

export interface LabelObject extends ObjectBase {
  type: 'label';
  text: string;
  fontSize: number;
}

export interface DimensionObject extends ObjectBase {
  type: 'dimension';
  length: number;
}

export type SceneObject =
  | RoomObject
  | TableObject
  | ChairObject
  | DoorObject
  | WindowObject
  | ColumnObject
  | WallObject
  | ZoneObject
  | LabelObject
  | DimensionObject;

export type ObjectType = SceneObject['type'];

export const OBJECT_TYPES: readonly ObjectType[] = [
  'room',
  'table',
  'chair',
  'door',
  'window',
  'column',
  'wall',
  'zone',
  'label',
  'dimension',
];

export interface Guest {
  id: string;
  name: string;
}

export interface ChairSize {
  width: number;
  depth: number;
}

export interface DocSettings {
  unit: Unit;
  gridSize: number;
  snapStep: number;
  showGrid: boolean;
  snap: boolean;
  showDimensions: boolean;
  showGuestNames: boolean;
  showTableNames: boolean;
  chair: ChairSize;
}

/** Data from newer versions or foreign fields; written back unchanged on save. */
export interface PreservedData {
  objects?: unknown[];
  root?: Record<string, unknown>;
}

export interface SeatDocument {
  schema: typeof SCHEMA_ID;
  version: number;
  meta: {
    name: string;
    created: string;
    modified: string;
  };
  settings: DocSettings;
  objects: SceneObject[];
  guests: Guest[];
  preserved?: PreservedData;
}

/** Distance chair front edge ↔ table edge for new tables (m). */
export const DEFAULT_CHAIR_GAP = 0.05;

export const DEFAULT_SETTINGS: DocSettings = {
  unit: 'm',
  gridSize: 0.5,
  snapStep: 0.05,
  showGrid: true,
  snap: true,
  showDimensions: true,
  showGuestNames: true,
  showTableNames: true,
  chair: { width: 0.45, depth: 0.45 },
};
