import { memo, useMemo } from 'react';
import { Ellipse, Group, Line, Rect, Text } from 'react-konva';
import type {
  ChairObject,
  ChairSize,
  ColumnObject,
  DimensionObject,
  DoorObject,
  LabelObject,
  RoomObject,
  SceneObject,
  TableObject,
  Unit,
  WallObject,
  WindowObject,
  ZoneObject,
} from '../../types/document';
import { type Vec2, add, angleOf, lerp, mul, normalize, sub } from '../../geometry/vec';
import { boundsOf, ensureClockwise } from '../../geometry/polygon';
import { tableOutline } from '../../geometry/shapes';
import { doorSwingPolygons, labelLines, segmentEnds } from '../../geometry/objects';
import { miterOffset } from '../../geometry/walls';
import { formatLength, formatLengthShort } from '../../geometry/measurements';
import { FONT_FAMILY, type Palette } from './palette';
import {
  GUEST_FONT,
  GUEST_LINE,
  SEAT_FONT,
  estimateTextWidth,
  guestLabelDistance,
  guestLabelLines,
  guestLabelSize,
  readableAngle,
  tableNameFont,
  tableNameOffsetY,
  zoneNameFont,
} from '../objects/labels';

/*
 * Konva building blocks for all objects. Everything is drawn in metres (the stage scales),
 * while stroke widths are in screen pixels (strokeScaleEnabled = false).
 * None of the nodes listens to events; hits are computed geometrically (hitTest.ts).
 */

const flatCache = new WeakMap<readonly Vec2[], number[]>();
export function flat(points: readonly Vec2[]): number[] {
  let f = flatCache.get(points);
  if (!f) {
    f = new Array<number>(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      f[i * 2] = points[i].x;
      f[i * 2 + 1] = points[i].y;
    }
    flatCache.set(points, f);
  }
  return f;
}

/** Text at world size. It is drawn in centimetres and scaled down, which avoids
 * rounding problems some browsers have with font sizes below 1 px. */
const TEXT_K = 100;

interface WorldTextProps {
  text: string;
  font: number;
  color: string;
  x?: number;
  y?: number;
  rotation?: number;
  width?: number;
  weight?: number;
  opacity?: number;
}

export function WorldText({ text, font, color, x = 0, y = 0, rotation = 0, width, weight = 500, opacity }: WorldTextProps) {
  const w = width ?? Math.max(estimateTextWidth(text, font) * 1.5, font * 4);
  return (
    <Group x={x} y={y} rotation={rotation} scaleX={1 / TEXT_K} scaleY={1 / TEXT_K} listening={false} opacity={opacity}>
      <Text
        text={text}
        fontSize={font * TEXT_K}
        fontFamily={FONT_FAMILY}
        fontStyle={String(weight)}
        fill={color}
        width={w * TEXT_K}
        x={(-w * TEXT_K) / 2}
        y={-font * TEXT_K * 0.6}
        align="center"
        wrap="none"
        ellipsis
        lineHeight={1.2}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

interface DimLineProps {
  a: Vec2;
  b: Vec2;
  /** Offset of the dimension line from a→b (positive = left of the direction of travel = outside for clockwise polygons) */
  offset: number;
  label: string;
  font: number;
  color: string;
  tick: number;
  extension?: boolean;
}

/** Architectural dimension chain with extension lines, tick marks and labels. */
export function DimLine({ a, b, offset, label, font, color, tick, extension = true }: DimLineProps) {
  const d = normalize(sub(b, a), { x: 1, y: 0 });
  const n = { x: d.y, y: -d.x };
  const a2 = add(a, mul(n, offset));
  const b2 = add(b, mul(n, offset));
  const side = offset >= 0 ? 1 : -1;
  const mid = lerp(a2, b2, 0.5);
  const textPos = add(mid, mul(n, side * font * 0.85));
  const slash = mul(normalize(add(d, mul(n, -1))), tick / 2);
  const over = mul(n, side * tick * 0.5);
  return (
    <Group listening={false}>
      {extension && offset !== 0 && (
        <>
          <Line points={[a.x, a.y, a2.x + over.x, a2.y + over.y]} stroke={color} strokeWidth={0.75} strokeScaleEnabled={false} opacity={0.7} />
          <Line points={[b.x, b.y, b2.x + over.x, b2.y + over.y]} stroke={color} strokeWidth={0.75} strokeScaleEnabled={false} opacity={0.7} />
        </>
      )}
      <Line points={[a2.x, a2.y, b2.x, b2.y]} stroke={color} strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={[a2.x - slash.x, a2.y - slash.y, a2.x + slash.x, a2.y + slash.y]} stroke={color} strokeWidth={1.25} strokeScaleEnabled={false} />
      <Line points={[b2.x - slash.x, b2.y - slash.y, b2.x + slash.x, b2.y + slash.y]} stroke={color} strokeWidth={1.25} strokeScaleEnabled={false} />
      <WorldText text={label} font={font} color={color} x={textPos.x} y={textPos.y} rotation={readableAngle(angleOf(d))} />
    </Group>
  );
}

export const isRectRoom = (pts: readonly Vec2[]): boolean =>
  pts.length === 4 &&
  pts.every((p, i) => {
    const q = pts[(i + 1) % 4];
    return Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.y - q.y) < 1e-6;
  });

/* ------------------------------------------- Room ------------------------------------------- */

interface RoomNodeProps {
  room: RoomObject;
  pal: Palette;
  showDims: boolean;
  unit: Unit;
}

export const RoomNode = memo(function RoomNode({ room, pal, showDims, unit }: RoomNodeProps) {
  const inner = useMemo(() => ensureClockwise(room.points), [room.points]);
  const t = room.wallThickness;
  const wallLine = useMemo(() => (t > 0 ? miterOffset(inner, t / 2) : null), [inner, t]);
  const dims = useMemo(() => {
    if (!showDims) return [];
    const off = t + 0.45;
    if (isRectRoom(inner)) {
      const b = boundsOf(inner);
      return [
        { a: { x: b.minX, y: b.minY }, b: { x: b.maxX, y: b.minY }, len: b.maxX - b.minX },
        { a: { x: b.minX, y: b.maxY }, b: { x: b.minX, y: b.minY }, len: b.maxY - b.minY },
      ].map((d) => ({ ...d, off }));
    }
    return inner.map((p, i) => {
      const q = inner[(i + 1) % inner.length];
      return { a: p, b: q, len: Math.hypot(q.x - p.x, q.y - p.y), off };
    });
  }, [inner, showDims, t]);
  return (
    <Group x={room.x} y={room.y} listening={false}>
      <Line points={flat(inner)} closed fill={pal.floor} listening={false} perfectDrawEnabled={false} />
      {wallLine ? (
        <Line points={flat(wallLine)} closed stroke={pal.wall} strokeWidth={t} lineJoin="miter" listening={false} perfectDrawEnabled={false} />
      ) : (
        <Line points={flat(inner)} closed stroke={pal.wall} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
      )}
      {dims.map((d, i) =>
        d.len > 0.05 ? (
          <DimLine key={i} a={d.a} b={d.b} offset={d.off} label={formatLength(d.len, unit)} font={0.2} color={pal.dim} tick={0.14} />
        ) : null,
      )}
    </Group>
  );
});

/* ------------------------------------------- Chair ------------------------------------------- */

interface ChairNodeProps {
  chair: ChairObject;
  size: ChairSize;
  pal: Palette;
  guestName?: string;
  /** Rotation of the table (for upright text) */
  parentRotation: number;
  showNames: boolean;
}

export const ChairNode = memo(function ChairNode({ chair, size, pal, guestName, parentRotation, showNames }: ChairNodeProps) {
  const { width: w, depth: d } = size;
  const assigned = guestName !== undefined;
  const side = Math.min(w, d);
  const inset = side * 0.1;
  const back = side * 0.26;
  const worldRot = parentRotation + chair.rotation;
  const lines = guestName ? guestLabelLines(guestName) : null;
  const labelDist = lines ? guestLabelDistance(worldRot, lines, size) : 0;
  return (
    <Group x={chair.x} y={chair.y} rotation={chair.rotation} listening={false}>
      <Rect
        x={-w / 2}
        y={-d / 2}
        width={w}
        height={d}
        cornerRadius={side * 0.24}
        fill={assigned ? pal.chairAssignedFrame : pal.chairFrame}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Rect
        x={-w / 2 + inset}
        y={-d / 2 + inset}
        width={w - inset * 2}
        height={d - inset - back}
        cornerRadius={side * 0.16}
        fill={assigned ? pal.chairAssignedSeat : pal.chairSeat}
        listening={false}
        perfectDrawEnabled={false}
      />
      {chair.seat !== undefined && (
        <WorldText
          text={String(chair.seat + 1)}
          font={SEAT_FONT}
          color={assigned ? pal.chairAssignedText : pal.chairText}
          y={(inset - back) / 2}
          rotation={-worldRot}
          width={side}
          weight={600}
        />
      )}
      {showNames && lines && (
        <Group y={labelDist} rotation={-worldRot} listening={false}>
          <GuestLabel lines={lines} color={pal.guestText} />
        </Group>
      )}
    </Group>
  );
});

/** Two-line guest name, centred around (0, 0). */
function GuestLabel({ lines, color }: { lines: string[]; color: string }) {
  const size = guestLabelSize(lines);
  const w = size.width * 1.35 + 0.1;
  return (
    <Group scaleX={1 / TEXT_K} scaleY={1 / TEXT_K} listening={false}>
      <Text
        text={lines.join('\n')}
        fontSize={GUEST_FONT * TEXT_K}
        lineHeight={GUEST_LINE}
        fontFamily={FONT_FAMILY}
        fontStyle="550"
        fill={color}
        width={w * TEXT_K}
        x={(-w * TEXT_K) / 2}
        y={(-size.height * TEXT_K) / 2}
        align="center"
        wrap="none"
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

/* ------------------------------------------- Table ------------------------------------------- */

interface TableNodeProps {
  table: TableObject;
  chairs: readonly ChairObject[];
  guestNames: ReadonlyMap<string, string>;
  chairSize: ChairSize;
  pal: Palette;
  showTableNames: boolean;
  showGuestNames: boolean;
}

function sameTableProps(a: TableNodeProps, b: TableNodeProps): boolean {
  if (
    a.table !== b.table ||
    a.pal !== b.pal ||
    a.chairSize !== b.chairSize ||
    a.showTableNames !== b.showTableNames ||
    a.showGuestNames !== b.showGuestNames ||
    a.chairs.length !== b.chairs.length
  ) {
    return false;
  }
  for (let i = 0; i < a.chairs.length; i++) {
    const c = a.chairs[i];
    if (c !== b.chairs[i]) return false;
    if (c.guestId && a.guestNames.get(c.guestId) !== b.guestNames.get(c.guestId)) return false;
  }
  return true;
}

export const TableNode = memo(function TableNode({ table, chairs, guestNames, chairSize, pal, showTableNames, showGuestNames }: TableNodeProps) {
  const outline = tableOutline(table);
  const tone = pal.table[table.tone ?? 'default'];
  const font = tableNameFont(table);
  return (
    <Group x={table.x} y={table.y} rotation={table.rotation} listening={false}>
      {chairs.map((c) => (
        <ChairNode
          key={c.id}
          chair={c}
          size={chairSize}
          pal={pal}
          guestName={c.guestId ? guestNames.get(c.guestId) : undefined}
          parentRotation={table.rotation}
          showNames={showGuestNames}
        />
      ))}
      <Line
        points={flat(outline)}
        closed
        fill={tone.fill}
        stroke={tone.stroke}
        strokeWidth={1.25}
        strokeScaleEnabled={false}
        lineJoin="round"
        listening={false}
        perfectDrawEnabled={false}
      />
      {showTableNames && table.name && (
        <Group y={tableNameOffsetY(table)} rotation={-table.rotation} listening={false}>
          <WorldText text={table.name} font={font} color={pal.tableText} width={Math.max(table.width, table.height) * 0.92} weight={600} />
        </Group>
      )}
    </Group>
  );
}, sameTableProps);

/* ------------------------------------- Doors, windows, columns ------------------------------------- */

export const DoorNode = memo(function DoorNode({ door, pal }: { door: DoorObject; pal: Palette }) {
  const w = door.width;
  const depth = Math.max(door.wallDepth, 0.02);
  const top = door.wallOffset - depth / 2;
  const swings = useMemo(() => doorSwingPolygons(door), [door]);
  return (
    <Group x={door.x} y={door.y} rotation={door.rotation} listening={false}>
      <Rect x={-w / 2} y={top - 0.004} width={w} height={depth + 0.008} fill={pal.floor} listening={false} />
      <Line points={[-w / 2, top, -w / 2, top + depth]} stroke={pal.wall} strokeWidth={2} strokeScaleEnabled={false} />
      <Line points={[w / 2, top, w / 2, top + depth]} stroke={pal.wall} strokeWidth={2} strokeScaleEnabled={false} />
      {swings.map((poly, i) => {
        const hinge = poly[0];
        const arc = poly.slice(1);
        const open = arc[arc.length - 1];
        return (
          <Group key={i} listening={false}>
            <Line points={flat(arc)} stroke={pal.doorLeaf} strokeWidth={1} strokeScaleEnabled={false} dash={[0.05, 0.04]} opacity={0.75} />
            <Line points={[hinge.x, hinge.y, open.x, open.y]} stroke={pal.doorLeaf} strokeWidth={2.25} strokeScaleEnabled={false} lineCap="round" />
          </Group>
        );
      })}
    </Group>
  );
});

export const WindowNode = memo(function WindowNode({ win, pal }: { win: WindowObject; pal: Palette }) {
  const w = win.width;
  const depth = Math.max(win.wallDepth, 0.08);
  const top = win.wallOffset - depth / 2;
  return (
    <Group x={win.x} y={win.y} rotation={win.rotation} listening={false}>
      <Rect x={-w / 2} y={top} width={w} height={depth} fill={pal.floor} stroke={pal.window} strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={[-w / 2, win.wallOffset - depth * 0.12, w / 2, win.wallOffset - depth * 0.12]} stroke={pal.window} strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={[-w / 2, win.wallOffset + depth * 0.12, w / 2, win.wallOffset + depth * 0.12]} stroke={pal.window} strokeWidth={1} strokeScaleEnabled={false} />
    </Group>
  );
});

export const ColumnNode = memo(function ColumnNode({ col, pal }: { col: ColumnObject; pal: Palette }) {
  return (
    <Group x={col.x} y={col.y} rotation={col.rotation} listening={false}>
      {col.shape === 'round' ? (
        <Ellipse radiusX={col.width / 2} radiusY={col.height / 2} fill={pal.wall} listening={false} />
      ) : (
        <Rect x={-col.width / 2} y={-col.height / 2} width={col.width} height={col.height} fill={pal.wall} listening={false} />
      )}
    </Group>
  );
});

export const WallNode = memo(function WallNode({ wall, pal }: { wall: WallObject; pal: Palette }) {
  return (
    <Group x={wall.x} y={wall.y} rotation={wall.rotation} listening={false}>
      <Rect x={-wall.length / 2} y={-wall.thickness / 2} width={wall.length} height={wall.thickness} fill={pal.wall} listening={false} />
    </Group>
  );
});

export const ZoneNode = memo(function ZoneNode({ zone, pal }: { zone: ZoneObject; pal: Palette }) {
  const c = pal.zone[zone.kind];
  const font = zoneNameFont(zone);
  const name = zone.name.toLocaleUpperCase('de');
  const dashed = zone.kind !== 'stage';
  const r = Math.min(0.12, zone.width / 4, zone.height / 4);
  return (
    <Group x={zone.x} y={zone.y} rotation={zone.rotation} listening={false}>
      <Rect
        x={-zone.width / 2}
        y={-zone.height / 2}
        width={zone.width}
        height={zone.height}
        cornerRadius={r}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth={zone.kind === 'stage' ? 1.25 : 1.5}
        strokeScaleEnabled={false}
        dash={dashed ? [0.12, 0.08] : undefined}
        listening={false}
        perfectDrawEnabled={false}
      />
      {name && (
        <Group rotation={readableAngle(zone.rotation) - zone.rotation} listening={false}>
          <Group scaleX={1 / TEXT_K} scaleY={1 / TEXT_K} listening={false}>
            <Text
              text={name}
              fontSize={font * TEXT_K}
              fontFamily={FONT_FAMILY}
              fontStyle="600"
              letterSpacing={font * TEXT_K * 0.14}
              fill={c.text}
              width={Math.max(zone.width, zone.height) * TEXT_K}
              x={(-Math.max(zone.width, zone.height) * TEXT_K) / 2}
              y={-font * TEXT_K * 0.6}
              align="center"
              wrap="none"
              ellipsis
              listening={false}
            />
          </Group>
        </Group>
      )}
    </Group>
  );
});

export const LabelNode = memo(function LabelNode({ label, pal }: { label: LabelObject; pal: Palette }) {
  const lines = labelLines(label);
  const width = Math.max(...lines.map((l) => estimateTextWidth(l, label.fontSize))) * 1.4 + label.fontSize;
  const height = lines.length * label.fontSize * 1.2;
  return (
    <Group x={label.x} y={label.y} rotation={label.rotation} scaleX={1 / TEXT_K} scaleY={1 / TEXT_K} listening={false}>
      <Text
        text={label.text}
        fontSize={label.fontSize * TEXT_K}
        fontFamily={FONT_FAMILY}
        fontStyle="500"
        fill={pal.label}
        width={width * TEXT_K}
        x={(-width * TEXT_K) / 2}
        y={(-height * TEXT_K) / 2}
        align="center"
        lineHeight={1.2}
        listening={false}
      />
    </Group>
  );
});

export const DimensionNode = memo(function DimensionNode({ dim, pal, unit }: { dim: DimensionObject; pal: Palette; unit: Unit }) {
  const [a, b] = segmentEnds(dim);
  return <DimLine a={a} b={b} offset={0} extension={false} label={formatLengthShort(dim.length, unit)} font={0.16} color={pal.dim} tick={0.14} />;
});

/* ------------------------------------------- Dispatch ------------------------------------------- */

interface ObjectNodeProps {
  obj: SceneObject;
  pal: Palette;
  unit: Unit;
  chairSize: ChairSize;
  showDims: boolean;
  showTableNames: boolean;
  showGuestNames: boolean;
  guestNames: ReadonlyMap<string, string>;
  chairs?: readonly ChairObject[];
}

/** Draws any object (for ghost previews and free chairs). */
export function ObjectNode({ obj, pal, unit, chairSize, showDims, showTableNames, showGuestNames, guestNames, chairs }: ObjectNodeProps) {
  switch (obj.type) {
    case 'room':
      return <RoomNode room={obj} pal={pal} showDims={showDims} unit={unit} />;
    case 'table':
      return (
        <TableNode
          table={obj}
          chairs={chairs ?? []}
          guestNames={guestNames}
          chairSize={chairSize}
          pal={pal}
          showTableNames={showTableNames}
          showGuestNames={showGuestNames}
        />
      );
    case 'chair':
      return (
        <ChairNode
          chair={obj}
          size={chairSize}
          pal={pal}
          guestName={obj.guestId ? guestNames.get(obj.guestId) : undefined}
          parentRotation={0}
          showNames={showGuestNames}
        />
      );
    case 'door':
      return <DoorNode door={obj} pal={pal} />;
    case 'window':
      return <WindowNode win={obj} pal={pal} />;
    case 'column':
      return <ColumnNode col={obj} pal={pal} />;
    case 'wall':
      return <WallNode wall={obj} pal={pal} />;
    case 'zone':
      return <ZoneNode zone={obj} pal={pal} />;
    case 'label':
      return <LabelNode label={obj} pal={pal} />;
    case 'dimension':
      return <DimensionNode dim={obj} pal={pal} unit={unit} />;
  }
}
