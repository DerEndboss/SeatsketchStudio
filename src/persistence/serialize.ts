import {
  DEFAULT_CHAIR_GAP,
  DEFAULT_SETTINGS,
  OBJECT_TYPES,
  SCHEMA_ID,
  SCHEMA_VERSION,
  TABLE_TONES,
  type CustomPath,
  type DocSettings,
  type Guest,
  type ObjectType,
  type SceneObject,
  type SeatDocument,
  type SeatingConfig,
  type SideFlags,
  type TableTone,
} from '../types/document';
import type { Vec2 } from '../geometry/vec';
import { tr } from '../i18n';

/*
 * File format .seatsketch: versioned JSON, all lengths in metres.
 * Principles:
 *  - Unknown fields on known objects are preserved (written back).
 *  - Unknown or broken objects and unknown top-level fields end up in
 *    `preserved` and are written back unchanged on save.
 *  - Nothing is dropped silently: every anomaly produces a warning.
 */

export type ParseResult = { ok: true; doc: SeatDocument; warnings: string[] } | { ok: false; error: string };

const KNOWN_ROOT = new Set(['schema', 'version', 'meta', 'settings', 'objects', 'guests', 'preserved']);

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const pos = (v: unknown, d: number): number => {
  const n = num(v);
  return n !== null && n > 0 ? n : d;
};

export function serializeDocument(doc: SeatDocument): string {
  const out: Raw = {
    ...(doc.preserved?.root ?? {}),
    schema: SCHEMA_ID,
    version: Math.max(SCHEMA_VERSION, doc.version),
    meta: { ...doc.meta, modified: new Date().toISOString() },
    settings: doc.settings,
    objects: [...doc.objects, ...((doc.preserved?.objects as SceneObject[] | undefined) ?? [])],
    guests: doc.guests,
  };
  return `${JSON.stringify(out, null, 1)}\n`;
}

function points(v: unknown): Vec2[] | null {
  if (!Array.isArray(v)) return null;
  const out: Vec2[] = [];
  for (const p of v) {
    if (!isObj(p)) return null;
    const x = num(p.x);
    const y = num(p.y);
    if (x === null || y === null) return null;
    out.push({ x, y });
  }
  return out;
}

function sides(v: unknown): SideFlags {
  if (Array.isArray(v) && v.length === 4 && v.every((b) => typeof b === 'boolean')) return v as SideFlags;
  return [true, true, true, true];
}

function seating(v: unknown): SeatingConfig {
  const r = isObj(v) ? v : {};
  const mode = r.mode === 'perimeter' || r.mode === 'long' || r.mode === 'sides' ? r.mode : 'perimeter';
  const gap = num(r.gap);
  return { ...r, mode, sides: sides(r.sides), gap: gap !== null && gap >= 0 ? gap : DEFAULT_CHAIR_GAP, auto: bool(r.auto, true) };
}

/** Validates an object. Returns null if it cannot be displayed safely. */
function normalizeObject(raw: Raw): SceneObject | null {
  const type = raw.type as ObjectType;
  if (!OBJECT_TYPES.includes(type)) return null;
  const id = str(raw.id);
  const x = num(raw.x);
  const y = num(raw.y);
  if (!id || x === null || y === null) return null;
  const base = {
    ...raw,
    id,
    x,
    y,
    rotation: num(raw.rotation) ?? 0,
    locked: raw.locked === true ? true : undefined,
    groupId: str(raw.groupId) ?? undefined,
  };
  switch (type) {
    case 'room': {
      const pts = points(raw.points);
      if (!pts || pts.length < 3) return null;
      return { ...base, type, name: str(raw.name) ?? 'Raum', points: pts, wallThickness: Math.max(0, num(raw.wallThickness) ?? 0.24) };
    }
    case 'table': {
      const shape = raw.shape;
      if (shape !== 'rect' && shape !== 'round' && shape !== 'oval' && shape !== 'semicircle' && shape !== 'custom') return null;
      let path: CustomPath | undefined;
      if (shape === 'custom') {
        const p = isObj(raw.path) ? raw.path : null;
        const pts = p ? points(p.points) : null;
        if (!p || !pts || pts.length < 3) return null;
        path = { ...p, points: pts, smoothing: Math.min(1, Math.max(0, num(p.smoothing) ?? 0.5)), preserveCorners: bool(p.preserveCorners, true) };
      }
      const tone = TABLE_TONES.includes(raw.tone as TableTone) ? (raw.tone as TableTone) : undefined;
      return {
        ...base,
        type,
        name: str(raw.name) ?? 'Tisch',
        shape,
        width: pos(raw.width, 1.6),
        height: pos(raw.height, 0.8),
        cornerRadius: Math.max(0, num(raw.cornerRadius) ?? 0),
        path,
        seating: seating(raw.seating),
        tone,
      };
    }
    case 'chair':
      return {
        ...base,
        type,
        tableId: str(raw.tableId) ?? undefined,
        seat: num(raw.seat) ?? undefined,
        guestId: str(raw.guestId) ?? undefined,
      };
    case 'door':
      return {
        ...base,
        type,
        width: pos(raw.width, 0.9),
        leaves: raw.leaves === 2 ? 2 : 1,
        hinge: raw.hinge === 'right' ? 'right' : 'left',
        flip: bool(raw.flip, false),
        wallDepth: Math.max(0, num(raw.wallDepth) ?? 0.2),
        wallOffset: num(raw.wallOffset) ?? 0,
      };
    case 'window':
      return {
        ...base,
        type,
        width: pos(raw.width, 1.2),
        wallDepth: Math.max(0, num(raw.wallDepth) ?? 0.2),
        wallOffset: num(raw.wallOffset) ?? 0,
      };
    case 'column':
      return { ...base, type, shape: raw.shape === 'round' ? 'round' : 'square', width: pos(raw.width, 0.4), height: pos(raw.height, 0.4) };
    case 'wall':
      return { ...base, type, length: pos(raw.length, 1), thickness: pos(raw.thickness, 0.12) };
    case 'zone': {
      const kind = raw.kind === 'stage' || raw.kind === 'blocked' ? raw.kind : 'area';
      return { ...base, type, name: str(raw.name) ?? '', kind, width: pos(raw.width, 2), height: pos(raw.height, 2) };
    }
    case 'label':
      return { ...base, type, text: str(raw.text) ?? '', fontSize: pos(raw.fontSize, 0.3) };
    case 'dimension':
      return { ...base, type, length: Math.max(0, num(raw.length) ?? 0) };
  }
}

function normalizeSettings(v: unknown): DocSettings {
  const r = isObj(v) ? v : {};
  const chair = isObj(r.chair) ? r.chair : {};
  return {
    ...r,
    unit: r.unit === 'cm' ? 'cm' : 'm',
    gridSize: pos(r.gridSize, DEFAULT_SETTINGS.gridSize),
    snapStep: pos(r.snapStep, DEFAULT_SETTINGS.snapStep),
    showGrid: bool(r.showGrid, true),
    snap: bool(r.snap, true),
    showDimensions: bool(r.showDimensions, true),
    showGuestNames: bool(r.showGuestNames, true),
    showTableNames: bool(r.showTableNames, true),
    chair: { width: pos(chair.width, DEFAULT_SETTINGS.chair.width), depth: pos(chair.depth, DEFAULT_SETTINGS.chair.depth) },
  };
}

/** Migrations: version n → n+1. (Version 1 is the first; new versions are appended here.) */
const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {};

export function parseDocument(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: tr('msg.fileInvalidJson') };
  }
  if (!isObj(data)) return { ok: false, error: tr('msg.fileUnknown') };
  if (data.schema !== SCHEMA_ID) return { ok: false, error: tr('msg.fileNotOurs') };
  let version = num(data.version);
  if (version === null || version < 1) return { ok: false, error: tr('msg.fileNoVersion') };

  const warnings: string[] = [];
  let raw: Raw = data;
  if (version > SCHEMA_VERSION) {
    warnings.push(tr('msg.fileWarnNewer', { v: version }));
  } else {
    while (version < SCHEMA_VERSION) {
      const m = MIGRATIONS[version];
      if (!m) return { ok: false, error: tr('msg.fileNoMigration', { v: version }) };
      raw = m(raw);
      version++;
    }
  }

  const preservedRoot: Raw = isObj(raw.preserved) && isObj(raw.preserved.root) ? { ...raw.preserved.root } : {};
  for (const k of Object.keys(raw)) if (!KNOWN_ROOT.has(k)) preservedRoot[k] = raw[k];
  const preservedObjects: unknown[] =
    isObj(raw.preserved) && Array.isArray(raw.preserved.objects) ? [...raw.preserved.objects] : [];

  const objects: SceneObject[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const o of Array.isArray(raw.objects) ? raw.objects : []) {
    const n = isObj(o) ? normalizeObject(o) : null;
    if (!n || seen.has(n.id)) {
      preservedObjects.push(o);
      skipped++;
      continue;
    }
    seen.add(n.id);
    objects.push(n);
  }
  if (skipped > 0) {
    warnings.push(tr('msg.fileWarnSkipped', { n: skipped }));
  }

  const guests: Guest[] = [];
  for (const g of Array.isArray(raw.guests) ? raw.guests : []) {
    if (isObj(g) && str(g.id) && str(g.name) !== null) guests.push({ ...g, id: g.id as string, name: g.name as string });
  }
  const guestIds = new Set(guests.map((g) => g.id));
  const tableIds = new Set(objects.filter((o) => o.type === 'table').map((o) => o.id));
  let orphanChairs = 0;
  let missingGuests = 0;
  for (const o of objects) {
    if (o.type !== 'chair') continue;
    if (o.tableId && !tableIds.has(o.tableId)) {
      delete o.tableId;
      delete o.seat;
      orphanChairs++;
    }
    if (o.guestId && !guestIds.has(o.guestId)) {
      guests.push({ id: o.guestId, name: tr('name.unknownGuest') });
      guestIds.add(o.guestId);
      missingGuests++;
    }
  }
  if (orphanChairs) warnings.push(tr('msg.fileWarnOrphans', { n: orphanChairs }));
  if (missingGuests) warnings.push(tr('msg.fileWarnGuests', { n: missingGuests, name: tr('name.unknownGuest') }));

  const meta = isObj(raw.meta) ? raw.meta : {};
  const now = new Date().toISOString();
  const doc: SeatDocument = {
    schema: SCHEMA_ID,
    version: Math.max(SCHEMA_VERSION, num(raw.version) ?? SCHEMA_VERSION),
    meta: {
      ...meta,
      name: str(meta.name) ?? tr('name.untitled'),
      created: str(meta.created) ?? now,
      modified: str(meta.modified) ?? now,
    },
    settings: normalizeSettings(raw.settings),
    objects,
    guests,
  };
  if (preservedObjects.length || Object.keys(preservedRoot).length) {
    doc.preserved = {};
    if (preservedObjects.length) doc.preserved.objects = preservedObjects;
    if (Object.keys(preservedRoot).length) doc.preserved.root = preservedRoot;
  }
  return { ok: true, doc, warnings };
}

/** File name without extension and without path. */
export function baseName(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? name;
  return file.replace(/\.[^.]+$/, '');
}

export function safeFileName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean || tr('name.untitled');
}
