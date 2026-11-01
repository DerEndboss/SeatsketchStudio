import { Fragment } from 'react';
import { Circle, Group, Layer, Line, Rect, Text } from 'react-konva';
import { useShallow } from 'zustand/react/shallow';
import type { SceneObject, SeatDocument, Unit } from '../../types/document';
import { type Vec2, add, distance, lerp } from '../../geometry/vec';
import { boundsUnion, polygonArea } from '../../geometry/polygon';
import { type GeometryLookup, roomWorldPoints, worldBounds, worldOutline, worldPlacement } from '../../geometry/objects';
import { tableOutline } from '../../geometry/shapes';
import { miterOffset } from '../../geometry/walls';
import { formatAngle, formatArea, formatLength } from '../../geometry/measurements';
import { useEditor } from '../../state/editorStore';
import { useUi } from '../../state/uiStore';
import { useInteraction, type Draft } from '../../state/interactionStore';
import { chairsOf, findObject, getLookup } from '../../state/lookup';
import { handlesFor } from './handles';
import { presetById } from '../objects/factory';
import { FONT_FAMILY, type Palette } from './palette';
import { ObjectNode, flat } from './nodes';
import { tr } from '../../i18n';

/** High-contrast dimension/info badge at screen size. */
function Pill({ at, text, scale, pal, tone = 'accent' }: { at: Vec2; text: string; scale: number; pal: Palette; tone?: 'accent' | 'warn' | 'dark' }) {
  const w = Math.ceil(text.length * 6.6 + 16);
  const h = 21;
  const fill = tone === 'accent' ? pal.accent : tone === 'warn' ? pal.warn : '#2B2723';
  return (
    <Group x={at.x} y={at.y} scaleX={1 / scale} scaleY={1 / scale} listening={false}>
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={7} fill={fill} listening={false} />
      <Text
        x={-w / 2}
        y={-h / 2 + 0.5}
        width={w}
        height={h}
        text={text}
        fontSize={11.5}
        fontFamily={FONT_FAMILY}
        fontStyle="600"
        fill="#FFFFFF"
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  );
}

function objectSizeText(o: SceneObject, doc: SeatDocument, unit: Unit): string | null {
  const L = (v: number) => formatLength(v, unit);
  switch (o.type) {
    case 'table': {
      const n = chairsOf(doc, o.id).length;
      const size = o.shape === 'round' ? `Ø ${L(o.width)}` : `${L(o.width)} × ${L(o.height)}`;
      return n ? `${size} · ${tr('count.seats', { n })}` : size;
    }
    case 'column':
      return o.shape === 'round' && o.width === o.height ? `Ø ${L(o.width)}` : `${L(o.width)} × ${L(o.height)}`;
    case 'door':
    case 'window':
      return L(o.width);
    case 'wall':
      return `${L(o.length)} · ${tr('wall.thick', { v: L(o.thickness) })}`;
    case 'dimension':
      return L(o.length);
    case 'room': {
      const pts = roomWorldPoints(o);
      return `${formatArea(polygonArea(pts))}`;
    }
    case 'zone':
      return `${L(o.width)} × ${L(o.height)} · ${formatArea(o.width * o.height)}`;
    default:
      return null;
  }
}

function Highlight({ o, lookup, pal, scale, kind }: { o: SceneObject; lookup: GeometryLookup; pal: Palette; scale: number; kind: 'select' | 'hover' | 'warn' }) {
  if (o.type === 'room') {
    const pts = roomWorldPoints(o);
    const outer = o.wallThickness > 0 ? miterOffset(pts, o.wallThickness) : pts;
    const color = kind === 'warn' ? pal.warn : pal.accent;
    return (
      <Group listening={false} opacity={kind === 'hover' ? 0.6 : 1}>
        <Line points={flat(pts)} closed stroke={color} strokeWidth={kind === 'select' ? 2 : 1.5} strokeScaleEnabled={false} listening={false} />
        <Line points={flat(outer)} closed stroke={color} strokeWidth={1} strokeScaleEnabled={false} listening={false} dash={[6 / scale, 4 / scale]} />
      </Group>
    );
  }
  const outline = worldOutline(o, lookup);
  if (kind === 'hover') {
    return <Line points={flat(outline)} closed stroke={pal.accent} strokeWidth={1.5} strokeScaleEnabled={false} opacity={0.7} listening={false} />;
  }
  const strong = o.type === 'chair' || o.type === 'column';
  return (
    <Line
      points={flat(outline)}
      closed
      fill={kind === 'warn' ? pal.warnFill : strong ? pal.accentFillStrong : pal.accentFill}
      stroke={kind === 'warn' ? pal.warn : pal.accent}
      strokeWidth={2}
      strokeScaleEnabled={false}
      lineJoin="round"
      listening={false}
    />
  );
}

function DraftView({ draft, pal, scale, unit, tablePreset }: { draft: Draft; pal: Palette; scale: number; unit: Unit; tablePreset: ReturnType<typeof presetById> }) {
  const dash = [6 / scale, 4 / scale];
  switch (draft.kind) {
    case 'rect': {
      const x = Math.min(draft.a.x, draft.b.x);
      const y = Math.min(draft.a.y, draft.b.y);
      let w = Math.abs(draft.b.x - draft.a.x);
      let h = Math.abs(draft.b.y - draft.a.y);
      let center = { x: x + w / 2, y: y + h / 2 };
      if (draft.target === 'table' && tablePreset.shape === 'round') {
        w = h = Math.max(w, h);
        center = {
          x: draft.a.x + (Math.sign(draft.b.x - draft.a.x) || 1) * (w / 2),
          y: draft.a.y + (Math.sign(draft.b.y - draft.a.y) || 1) * (h / 2),
        };
      }
      const label = `${formatLength(w, unit)} × ${formatLength(h, unit)}`;
      const top = { x: center.x, y: center.y - h / 2 - 18 / scale };
      return (
        <Group listening={false}>
          {draft.target === 'table' ? (
            <Line
              x={center.x}
              y={center.y}
              points={flat(tableOutline({ shape: tablePreset.shape, width: Math.max(w, 0.01), height: Math.max(h, 0.01), cornerRadius: tablePreset.cornerRadius }))}
              closed
              fill={pal.accentFill}
              stroke={pal.accent}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
              dash={dash}
            />
          ) : (
            <Rect x={center.x - w / 2} y={center.y - h / 2} width={w} height={h} fill={pal.accentFill} stroke={pal.accent} strokeWidth={1.5} strokeScaleEnabled={false} dash={dash} />
          )}
          <Pill at={top} text={label} scale={scale} pal={pal} />
        </Group>
      );
    }
    case 'stroke': {
      const pts = draft.points;
      if (pts.length < 2) return null;
      const f = new Array<number>(pts.length * 2);
      pts.forEach((p, i) => {
        f[i * 2] = p.x;
        f[i * 2 + 1] = p.y;
      });
      const first = pts[0];
      const last = pts[pts.length - 1];
      return (
        <Group listening={false}>
          <Line points={f} stroke={pal.accent} strokeWidth={2.5} strokeScaleEnabled={false} lineCap="round" lineJoin="round" tension={0} />
          <Line points={[last.x, last.y, first.x, first.y]} stroke={pal.accent} strokeWidth={1.25} strokeScaleEnabled={false} dash={dash} opacity={0.6} />
        </Group>
      );
    }
    case 'polygon': {
      const pts = [...draft.points, draft.cursor];
      const first = draft.points[0];
      const last = draft.points[draft.points.length - 1];
      const len = distance(last, draft.cursor);
      const canClose = draft.points.length >= 3;
      return (
        <Group listening={false}>
          {draft.points.length >= 2 && (
            <Line points={flat(draft.points)} fill={pal.accentFill} closed stroke={undefined} listening={false} />
          )}
          <Line points={flat(pts)} stroke={pal.accent} strokeWidth={2} strokeScaleEnabled={false} lineJoin="round" />
          {draft.points.length >= 2 && (
            <Line points={[draft.cursor.x, draft.cursor.y, first.x, first.y]} stroke={pal.accent} strokeWidth={1} strokeScaleEnabled={false} dash={dash} opacity={0.6} />
          )}
          {draft.points.map((p, i) => (
            <Circle
              key={i}
              x={p.x}
              y={p.y}
              radius={(i === 0 && canClose ? 6 : 3.5) / scale}
              fill={i === 0 && canClose ? pal.accent : pal.handleFill}
              stroke={pal.accent}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
            />
          ))}
          {len > 0.01 && <Pill at={add(lerp(last, draft.cursor, 0.5), { x: 0, y: -16 / scale })} text={formatLength(len, unit)} scale={scale} pal={pal} />}
        </Group>
      );
    }
    case 'segment': {
      const len = distance(draft.a, draft.b);
      return (
        <Group listening={false}>
          {draft.target === 'wall' && len > 0 && (
            <Line points={[draft.a.x, draft.a.y, draft.b.x, draft.b.y]} stroke={pal.wall} strokeWidth={0.12} opacity={0.45} lineCap="butt" />
          )}
          <Line points={[draft.a.x, draft.a.y, draft.b.x, draft.b.y]} stroke={pal.accent} strokeWidth={2} strokeScaleEnabled={false} lineCap="round" />
          <Circle x={draft.a.x} y={draft.a.y} radius={3.5 / scale} fill={pal.accent} />
          <Circle x={draft.b.x} y={draft.b.y} radius={3.5 / scale} fill={pal.accent} />
          {len > 0.01 && <Pill at={add(lerp(draft.a, draft.b, 0.5), { x: 0, y: -18 / scale })} text={formatLength(len, unit)} scale={scale} pal={pal} />}
        </Group>
      );
    }
  }
}

/** Everything above the plan: warnings, selection, handles, guides, drafts. */
export function OverlayLayer({ pal }: { pal: Palette }) {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const scale = useUi((s) => s.viewport.scale);
  const tool = useUi((s) => s.tool);
  const tablePresetId = useUi((s) => s.tablePreset);
  const ix = useInteraction(
    useShallow((s) => ({
      hoverId: s.hoverId,
      guides: s.guides,
      marquee: s.marquee,
      draft: s.draft,
      ghost: s.ghost,
      warnings: s.warnings,
      activeHandle: s.activeHandle,
    })),
  );
  const lookup = getLookup(doc);
  const unit = doc.settings.unit;
  const selected = selection.map((id) => findObject(doc, id)).filter((o): o is SceneObject => !!o);
  const single = selected.length === 1 ? selected[0] : null;
  const showHandles = tool === 'select' && single && !single.locked;
  const handles = showHandles ? handlesFor(single, lookup, scale) : [];
  const guestNames = new Map(doc.guests.map((g) => [g.id, g.name]));

  const warned: SceneObject[] = [];
  for (const id of ix.warnings.keys()) {
    const o = findObject(doc, id);
    if (o) warned.push(o);
  }
  const hover = ix.hoverId && !selection.includes(ix.hoverId) ? findObject(doc, ix.hoverId) : undefined;

  // Info badge above the selection (including chairs)
  let info: { at: Vec2; text: string } | null = null;
  if (single) {
    const text = objectSizeText(single, doc, unit);
    if (text) {
      const parts = [single, ...(single.type === 'table' ? chairsOf(doc, single.id) : [])];
      const b = boundsUnion(parts.map((o) => worldBounds(o, lookup)))!;
      info = { at: { x: (b.minX + b.maxX) / 2, y: b.minY - 20 / scale }, text };
    }
  }
  const multiBounds = selected.length > 1 ? boundsUnion(selected.map((o) => worldBounds(o, lookup))) : null;
  const rotating = ix.activeHandle === 'rotate' && single ? worldPlacement(single, lookup) : null;

  return (
    <Layer listening={false}>
      {warned.map((o) => (
        <Highlight key={`w-${o.id}`} o={o} lookup={lookup} pal={pal} scale={scale} kind="warn" />
      ))}
      {hover && <Highlight o={hover} lookup={lookup} pal={pal} scale={scale} kind="hover" />}
      {selected.map((o) => (
        <Highlight key={`s-${o.id}`} o={o} lookup={lookup} pal={pal} scale={scale} kind="select" />
      ))}
      {multiBounds && (
        <Rect
          x={multiBounds.minX - 4 / scale}
          y={multiBounds.minY - 4 / scale}
          width={multiBounds.maxX - multiBounds.minX + 8 / scale}
          height={multiBounds.maxY - multiBounds.minY + 8 / scale}
          stroke={pal.accent}
          strokeWidth={1}
          strokeScaleEnabled={false}
          dash={[5 / scale, 4 / scale]}
          listening={false}
        />
      )}
      {multiBounds && (
        <Pill
          at={{ x: (multiBounds.minX + multiBounds.maxX) / 2, y: multiBounds.minY - 22 / scale }}
          text={`${tr('count.objects', { n: selected.length })} · ${formatLength(multiBounds.maxX - multiBounds.minX, unit)} × ${formatLength(multiBounds.maxY - multiBounds.minY, unit)}`}
          scale={scale}
          pal={pal}
        />
      )}

      {ix.guides.map((g, i) =>
        g.orientation === 'v' ? (
          <Line key={`g${i}`} points={[g.pos, g.from - 0.3, g.pos, g.to + 0.3]} stroke={pal.guide} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
        ) : (
          <Line key={`g${i}`} points={[g.from - 0.3, g.pos, g.to + 0.3, g.pos]} stroke={pal.guide} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
        ),
      )}

      {handles.map((h) => {
        const s = 1 / scale;
        if (h.kind === 'rotate') {
          return (
            <Fragment key={h.id}>
              <Circle x={h.pos.x} y={h.pos.y} radius={5.5 * s} fill={pal.handleFill} stroke={pal.accent} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
              <Circle x={h.pos.x} y={h.pos.y} radius={2 * s} fill={pal.accent} listening={false} />
            </Fragment>
          );
        }
        if (h.kind === 'vertex' || h.kind === 'end') {
          return <Circle key={h.id} x={h.pos.x} y={h.pos.y} radius={5 * s} fill={pal.handleFill} stroke={pal.accent} strokeWidth={1.75} strokeScaleEnabled={false} listening={false} />;
        }
        if (h.kind === 'edge') {
          return <Rect key={h.id} x={h.pos.x - 4 * s} y={h.pos.y - 4 * s} width={8 * s} height={8 * s} cornerRadius={2 * s} fill={pal.accent} listening={false} />;
        }
        return (
          <Rect
            key={h.id}
            x={h.pos.x - 4.5 * s}
            y={h.pos.y - 4.5 * s}
            width={9 * s}
            height={9 * s}
            cornerRadius={1.5 * s}
            fill={pal.handleFill}
            stroke={pal.accent}
            strokeWidth={1.5}
            strokeScaleEnabled={false}
            listening={false}
          />
        );
      })}

      {info && <Pill at={info.at} text={info.text} scale={scale} pal={pal} />}
      {rotating && <Pill at={rotating} text={formatAngle(Math.round(rotating.rotation * 10) / 10)} scale={scale} pal={pal} tone="dark" />}

      {ix.marquee && (
        <Rect
          x={ix.marquee.minX}
          y={ix.marquee.minY}
          width={ix.marquee.maxX - ix.marquee.minX}
          height={ix.marquee.maxY - ix.marquee.minY}
          fill={pal.marqueeFill}
          stroke={pal.accent}
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}

      {ix.ghost && (
        <Group opacity={0.5} listening={false}>
          <ObjectNode
            obj={ix.ghost}
            pal={pal}
            unit={unit}
            chairSize={doc.settings.chair}
            showDims={false}
            showTableNames={false}
            showGuestNames={false}
            guestNames={guestNames}
            chairs={[]}
          />
        </Group>
      )}
      {ix.draft && <DraftView draft={ix.draft} pal={pal} scale={scale} unit={unit} tablePreset={presetById(tablePresetId)} />}
    </Layer>
  );
}
