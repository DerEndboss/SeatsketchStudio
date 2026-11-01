import type { ChairObject, SceneObject, SeatDocument, TableObject } from '../types/document';
import { type Vec2, add, angleOf, lerp, mul, normalize, sub } from '../geometry/vec';
import { type Bounds, boundsOf, boundsUnion, ensureClockwise, expandBounds } from '../geometry/polygon';
import { tableOutline } from '../geometry/shapes';
import { doorSwingPolygons, labelLines, segmentEnds, worldBounds } from '../geometry/objects';
import { miterOffset } from '../geometry/walls';
import { formatLength, formatLengthShort } from '../geometry/measurements';
import { LIGHT, type Palette } from '../editor/canvas/palette';
import {
  GUEST_FONT,
  GUEST_LINE,
  SEAT_FONT,
  guestLabelDistance,
  guestLabelLines,
  readableAngle,
  tableNameFont,
  tableNameOffsetY,
  zoneNameFont,
} from '../editor/objects/labels';
import { isRectRoom } from '../editor/canvas/nodes';
import { getLookup, chairsByTable } from '../state/lookup';

/*
 * True vector export: the plan is written as SVG straight from the geometry
 * (viewBox unit = metres). PNG and PDF are produced from exactly this SVG.
 */

export interface PlanSvgOptions {
  showDimensions: boolean;
  showGuestNames: boolean;
  showTableNames: boolean;
  /** null = transparent */
  background: string | null;
  /** Pixels per metre for the width/height attributes */
  pxPerMeter?: number;
  /** Font family (PDF needs one of the built-in PDF fonts) */
  fontFamily?: string;
  /** additional CSS inside the SVG (e.g. an embedded font for PNG) */
  css?: string;
}

export interface PlanSvg {
  svg: string;
  /** Size of the viewport in metres */
  width: number;
  height: number;
  bounds: Bounds;
}

const DEFAULT_FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
/** Font of the SVG currently being built. buildPlanSvg is synchronous, so a module value is enough. */
let FONT = DEFAULT_FONT;
const n = (v: number): string => {
  const s = v.toFixed(4);
  return s.includes('.') ? s.replace(/\.?0+$/, '') || '0' : s;
};
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pts = (p: readonly Vec2[]): string => p.map((q) => `${n(q.x)},${n(q.y)}`).join(' ');

/** Write rgba() as colour + opacity, which every SVG reader understands (including svg2pdf). */
function paint(attr: 'fill' | 'stroke', color: string): string {
  const m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(color);
  if (!m) return `${attr}="${color}"`;
  return `${attr}="rgb(${m[1]},${m[2]},${m[3]})" ${attr}-opacity="${m[4]}"`;
}

function text(t: string, x: number, y: number, font: number, color: string, opts: { weight?: number; rotate?: number } = {}): string {
  const tr = opts.rotate ? ` transform="rotate(${n(opts.rotate)} ${n(x)} ${n(y)})"` : '';
  // Shift the baseline so the text sits vertically centred (svg2pdf does not know dominant-baseline)
  const w = opts.weight ?? 500;
  // PDF fonts only know normal/bold; intermediate weights would fall back to Times
  const weight = FONT === DEFAULT_FONT ? String(w) : w >= 600 ? 'bold' : 'normal';
  return `<text x="${n(x)}" y="${n(y + font * 0.36)}" font-size="${n(font)}" font-family="${FONT}" font-weight="${weight}" fill="${color}" text-anchor="middle"${tr}>${esc(t)}</text>`;
}

function dimLine(a: Vec2, b: Vec2, offset: number, label: string, font: number, color: string, tick: number, extension = true): string {
  const d = normalize(sub(b, a), { x: 1, y: 0 });
  const nn = { x: d.y, y: -d.x };
  const a2 = add(a, mul(nn, offset));
  const b2 = add(b, mul(nn, offset));
  const side = offset >= 0 ? 1 : -1;
  const tp = add(lerp(a2, b2, 0.5), mul(nn, side * font * 0.85));
  const sl = mul(normalize(add(d, mul(nn, -1))), tick / 2);
  const over = mul(nn, side * tick * 0.5);
  const sw = n(0.01);
  let s = '';
  if (extension && offset !== 0) {
    s += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(a2.x + over.x)}" y2="${n(a2.y + over.y)}" stroke="${color}" stroke-width="${n(0.007)}" opacity="0.7"/>`;
    s += `<line x1="${n(b.x)}" y1="${n(b.y)}" x2="${n(b2.x + over.x)}" y2="${n(b2.y + over.y)}" stroke="${color}" stroke-width="${n(0.007)}" opacity="0.7"/>`;
  }
  s += `<line x1="${n(a2.x)}" y1="${n(a2.y)}" x2="${n(b2.x)}" y2="${n(b2.y)}" stroke="${color}" stroke-width="${sw}"/>`;
  for (const p of [a2, b2]) s += `<line x1="${n(p.x - sl.x)}" y1="${n(p.y - sl.y)}" x2="${n(p.x + sl.x)}" y2="${n(p.y + sl.y)}" stroke="${color}" stroke-width="${n(0.013)}"/>`;
  s += text(label, tp.x, tp.y, font, color, { rotate: readableAngle(angleOf(d)) });
  return s;
}

function chairSvg(c: ChairObject, doc: SeatDocument, pal: Palette, parentRotation: number, opts: PlanSvgOptions, guestNames: Map<string, string>): string {
  const { width: w, depth: d } = doc.settings.chair;
  const side = Math.min(w, d);
  const inset = side * 0.1;
  const back = side * 0.26;
  const guest = c.guestId ? guestNames.get(c.guestId) : undefined;
  const assigned = guest !== undefined;
  const worldRot = parentRotation + c.rotation;
  let s = `<g transform="translate(${n(c.x)} ${n(c.y)}) rotate(${n(c.rotation)})">`;
  s += `<rect x="${n(-w / 2)}" y="${n(-d / 2)}" width="${n(w)}" height="${n(d)}" rx="${n(side * 0.24)}" fill="${assigned ? pal.chairAssignedFrame : pal.chairFrame}"/>`;
  s += `<rect x="${n(-w / 2 + inset)}" y="${n(-d / 2 + inset)}" width="${n(w - inset * 2)}" height="${n(d - inset - back)}" rx="${n(side * 0.16)}" fill="${assigned ? pal.chairAssignedSeat : pal.chairSeat}"/>`;
  if (c.seat !== undefined) {
    const cy = (inset - back) / 2;
    s += `<g transform="translate(0 ${n(cy)}) rotate(${n(-worldRot)})">${text(String(c.seat + 1), 0, 0, SEAT_FONT, assigned ? pal.chairAssignedText : pal.chairText, { weight: 600 })}</g>`;
  }
  if (guest && opts.showGuestNames) {
    const lines = guestLabelLines(guest);
    const dist = guestLabelDistance(worldRot, lines, doc.settings.chair);
    const lh = GUEST_FONT * GUEST_LINE;
    const y0 = -((lines.length - 1) * lh) / 2;
    s += `<g transform="translate(0 ${n(dist)}) rotate(${n(-worldRot)})">${lines
      .map((l, i) => text(l, 0, y0 + i * lh, GUEST_FONT, pal.guestText, { weight: 550 }))
      .join('')}</g>`;
  }
  return `${s}</g>`;
}

function tableSvg(t: TableObject, chairs: readonly ChairObject[], doc: SeatDocument, pal: Palette, opts: PlanSvgOptions, guestNames: Map<string, string>): string {
  const tone = pal.table[t.tone ?? 'default'];
  let s = `<g transform="translate(${n(t.x)} ${n(t.y)}) rotate(${n(t.rotation)})">`;
  for (const c of chairs) s += chairSvg(c, doc, pal, t.rotation, opts, guestNames);
  s += `<polygon points="${pts(tableOutline(t))}" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="${n(0.014)}" stroke-linejoin="round"/>`;
  if (opts.showTableNames && t.name) {
    s += `<g transform="translate(0 ${n(tableNameOffsetY(t))}) rotate(${n(-t.rotation)})">${text(t.name, 0, 0, tableNameFont(t), pal.tableText, { weight: 600 })}</g>`;
  }
  return `${s}</g>`;
}

function objectSvg(o: SceneObject, doc: SeatDocument, pal: Palette, opts: PlanSvgOptions, guestNames: Map<string, string>, byTable: Map<string, ChairObject[]>): string {
  const unit = doc.settings.unit;
  switch (o.type) {
    case 'room': {
      const inner = ensureClockwise(o.points);
      const t = o.wallThickness;
      let s = `<g transform="translate(${n(o.x)} ${n(o.y)})">`;
      s += `<polygon points="${pts(inner)}" fill="${pal.floor}"/>`;
      if (t > 0) s += `<polygon points="${pts(miterOffset(inner, t / 2))}" fill="none" stroke="${pal.wall}" stroke-width="${n(t)}" stroke-linejoin="miter"/>`;
      else s += `<polygon points="${pts(inner)}" fill="none" stroke="${pal.wall}" stroke-width="${n(0.015)}"/>`;
      if (opts.showDimensions) {
        const off = t + 0.45;
        if (isRectRoom(inner)) {
          const b = boundsOf(inner);
          s += dimLine({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, off, formatLength(b.maxX - b.minX, unit), 0.2, pal.dim, 0.14);
          s += dimLine({ x: b.minX, y: b.maxY }, { x: b.minX, y: b.minY }, off, formatLength(b.maxY - b.minY, unit), 0.2, pal.dim, 0.14);
        } else {
          inner.forEach((p, i) => {
            const q = inner[(i + 1) % inner.length];
            const len = Math.hypot(q.x - p.x, q.y - p.y);
            if (len > 0.05) s += dimLine(p, q, off, formatLength(len, unit), 0.2, pal.dim, 0.14);
          });
        }
      }
      return `${s}</g>`;
    }
    case 'table':
      return tableSvg(o, byTable.get(o.id) ?? [], doc, pal, opts, guestNames);
    case 'chair':
      return chairSvg(o, doc, pal, 0, opts, guestNames);
    case 'door': {
      const w = o.width;
      const depth = Math.max(o.wallDepth, 0.02);
      const top = o.wallOffset - depth / 2;
      let s = `<g transform="translate(${n(o.x)} ${n(o.y)}) rotate(${n(o.rotation)})">`;
      s += `<rect x="${n(-w / 2)}" y="${n(top - 0.004)}" width="${n(w)}" height="${n(depth + 0.008)}" fill="${pal.floor}"/>`;
      s += `<line x1="${n(-w / 2)}" y1="${n(top)}" x2="${n(-w / 2)}" y2="${n(top + depth)}" stroke="${pal.wall}" stroke-width="${n(0.02)}"/>`;
      s += `<line x1="${n(w / 2)}" y1="${n(top)}" x2="${n(w / 2)}" y2="${n(top + depth)}" stroke="${pal.wall}" stroke-width="${n(0.02)}"/>`;
      for (const poly of doorSwingPolygons(o)) {
        const hinge = poly[0];
        const arc = poly.slice(1);
        const open = arc[arc.length - 1];
        s += `<polyline points="${pts(arc)}" fill="none" stroke="${pal.doorLeaf}" stroke-width="${n(0.008)}" stroke-dasharray="0.05 0.04" opacity="0.75"/>`;
        s += `<line x1="${n(hinge.x)}" y1="${n(hinge.y)}" x2="${n(open.x)}" y2="${n(open.y)}" stroke="${pal.doorLeaf}" stroke-width="${n(0.022)}" stroke-linecap="round"/>`;
      }
      return `${s}</g>`;
    }
    case 'window': {
      const w = o.width;
      const depth = Math.max(o.wallDepth, 0.08);
      const top = o.wallOffset - depth / 2;
      let s = `<g transform="translate(${n(o.x)} ${n(o.y)}) rotate(${n(o.rotation)})">`;
      s += `<rect x="${n(-w / 2)}" y="${n(top)}" width="${n(w)}" height="${n(depth)}" fill="${pal.floor}" stroke="${pal.window}" stroke-width="${n(0.01)}"/>`;
      for (const k of [-0.12, 0.12]) {
        s += `<line x1="${n(-w / 2)}" y1="${n(o.wallOffset + depth * k)}" x2="${n(w / 2)}" y2="${n(o.wallOffset + depth * k)}" stroke="${pal.window}" stroke-width="${n(0.01)}"/>`;
      }
      return `${s}</g>`;
    }
    case 'column':
      return o.shape === 'round'
        ? `<ellipse cx="${n(o.x)}" cy="${n(o.y)}" rx="${n(o.width / 2)}" ry="${n(o.height / 2)}" fill="${pal.wall}" transform="rotate(${n(o.rotation)} ${n(o.x)} ${n(o.y)})"/>`
        : `<rect x="${n(o.x - o.width / 2)}" y="${n(o.y - o.height / 2)}" width="${n(o.width)}" height="${n(o.height)}" fill="${pal.wall}" transform="rotate(${n(o.rotation)} ${n(o.x)} ${n(o.y)})"/>`;
    case 'wall':
      return `<rect x="${n(o.x - o.length / 2)}" y="${n(o.y - o.thickness / 2)}" width="${n(o.length)}" height="${n(o.thickness)}" fill="${pal.wall}" transform="rotate(${n(o.rotation)} ${n(o.x)} ${n(o.y)})"/>`;
    case 'zone': {
      const c = pal.zone[o.kind];
      const r = Math.min(0.12, o.width / 4, o.height / 4);
      const dash = o.kind === 'stage' ? '' : ' stroke-dasharray="0.12 0.08"';
      let s = `<g transform="translate(${n(o.x)} ${n(o.y)}) rotate(${n(o.rotation)})">`;
      s += `<rect x="${n(-o.width / 2)}" y="${n(-o.height / 2)}" width="${n(o.width)}" height="${n(o.height)}" rx="${n(r)}" ${paint('fill', c.fill)} ${paint('stroke', c.stroke)} stroke-width="${n(0.014)}"${dash}/>`;
      if (o.name) {
        const font = zoneNameFont(o);
        s += `<g transform="rotate(${n(readableAngle(o.rotation) - o.rotation)})">${text(o.name.toLocaleUpperCase(), 0, 0, font, c.text, { weight: 600 })}</g>`;
      }
      return `${s}</g>`;
    }
    case 'label': {
      const lines = labelLines(o);
      const lh = o.fontSize * 1.2;
      const y0 = -((lines.length - 1) * lh) / 2;
      let s = `<g transform="translate(${n(o.x)} ${n(o.y)}) rotate(${n(o.rotation)})">`;
      lines.forEach((l, i) => {
        if (l) s += text(l, 0, y0 + i * lh, o.fontSize, pal.label);
      });
      return `${s}</g>`;
    }
    case 'dimension': {
      const [a, b] = segmentEnds(o);
      return dimLine(a, b, 0, formatLengthShort(o.length, unit), 0.16, pal.dim, 0.14, false);
    }
  }
}

/** Viewport around all objects plus room for dimensions and names. */
export function planBounds(doc: SeatDocument, opts: Pick<PlanSvgOptions, 'showDimensions' | 'showGuestNames'>): Bounds {
  const lookup = getLookup(doc);
  const list = doc.objects.map((o) => {
    const b = worldBounds(o, lookup);
    if (o.type === 'room') return expandBounds(b, o.wallThickness + (opts.showDimensions ? 0.85 : 0.05));
    if (o.type === 'chair' && o.guestId && opts.showGuestNames) return expandBounds(b, 0.6);
    return b;
  });
  return expandBounds(boundsUnion(list) ?? { minX: -2, minY: -2, maxX: 2, maxY: 2 }, 0.3);
}

export function buildPlanSvg(doc: SeatDocument, opts: PlanSvgOptions, pal: Palette = LIGHT): PlanSvg {
  FONT = opts.fontFamily ?? DEFAULT_FONT;
  const bounds = planBounds(doc, opts);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const px = opts.pxPerMeter ?? 100;
  const guestNames = new Map(doc.guests.map((g) => [g.id, g.name]));
  const byTable = chairsByTable(doc);
  const tableIds = new Set(doc.objects.filter((o) => o.type === 'table').map((o) => o.id));
  const rooms = doc.objects.filter((o) => o.type === 'room' || o.type === 'zone');
  const rest = doc.objects.filter((o) => o.type !== 'room' && o.type !== 'zone' && !(o.type === 'chair' && o.tableId && tableIds.has(o.tableId)));
  let body = '';
  for (const o of [...rooms, ...rest]) body += objectSvg(o, doc, pal, opts, guestNames, byTable);
  const bg = opts.background
    ? `<rect x="${n(bounds.minX)}" y="${n(bounds.minY)}" width="${n(width)}" height="${n(height)}" fill="${opts.background}"/>`
    : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width * px)}" height="${n(height * px)}" viewBox="${n(bounds.minX)} ${n(bounds.minY)} ${n(width)} ${n(height)}">` +
    `<title>${esc(doc.meta.name)}</title>${opts.css ? `<defs><style>${opts.css}</style></defs>` : ''}${bg}${body}</svg>`;
  return { svg, width, height, bounds };
}
