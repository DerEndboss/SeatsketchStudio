import type { ChairObject, DoorObject, RoomObject, SceneObject, SeatDocument, TableObject, WindowObject } from '../../types/document';
import { type Vec2, add, angleOf, distance, dot, mul, normalize, normalizeAngle, rotate, roundTo, sub } from '../../geometry/vec';
import { type Bounds, boundsFromPoints, signedArea, toLocal, translateBounds } from '../../geometry/polygon';
import { type Viewport, screenToWorld, worldToScreen, zoomAt } from '../../geometry/coordinateSystem';
import { type SnapTarget, constrainTo45, snapAngle, snapMove, snapPoint, targetFromBounds } from '../../geometry/snapping';
import { roomWorldPoints, segmentEnds, segmentFromEnds, worldBounds, worldPlacement } from '../../geometry/objects';
import { snapPoseToTable } from '../../geometry/chairPlacement';
import { processStroke } from '../../geometry/pathSmoothing';
import { snapToRoomWall } from '../../geometry/walls';
import { useEditor } from '../../state/editorStore';
import { useUi } from '../../state/uiStore';
import { useInteraction } from '../../state/interactionStore';
import { chairsOf, findObject, getLookup } from '../../state/lookup';
import { hitObject, objectsInRect } from '../canvas/hitTest';
import { type Handle, handlesFor, hitHandle } from '../canvas/handles';
import {
  createChair,
  createColumn,
  createCustomTable,
  createDimension,
  createDoor,
  createLabel,
  createPolygonRoom,
  createRectRoom,
  createTable,
  createWall,
  createWindow,
  createZone,
  nextTableName,
  presetById,
} from '../objects/factory';
import { duplicateObjects, expandGroups, markManual, selectionBounds, translateObjects } from '../objects/docOps';
import { assignGuest, reflowTables, relayoutTable, renumberSeats, withObjects } from '../objects/tableOps';
import { tr } from '../../i18n';

const DRAG_THRESHOLD_PX = 3;
const CLICK_PX = 5;
const SNAP_PX = 7;
const GUEST_MIME = 'application/x-seatsketch-guest';

type Mode =
  | { kind: 'idle' }
  | { kind: 'pan'; start: Vec2; vp: Viewport }
  | { kind: 'marquee'; start: Vec2; additive: boolean; base: string[] }
  | {
      kind: 'move';
      startWorld: Vec2;
      startScreen: Vec2;
      ids: string[];
      base: SeatDocument;
      started: boolean;
      clickedId: string;
      toggleOff: boolean;
      targets: SnapTarget[];
      bounds: Bounds | null;
      anchor: Vec2;
    }
  | { kind: 'handle'; handle: Handle; id: string; base: SeatDocument; startWorld: Vec2; startAngle: number }
  | { kind: 'rect'; target: 'room' | 'table' | 'zone'; start: Vec2; startScreen: Vec2 }
  | { kind: 'stroke'; points: Vec2[]; startScreen: Vec2; lastScreen: Vec2 }
  | { kind: 'segment'; target: 'wall' | 'measure'; start: Vec2 };

interface PointerInfo {
  screen: Vec2;
  world: Vec2;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

export let activeController: Controller | null = null;

/**
 * Pointer logic of the canvas as a small state machine. Runs completely outside of
 * React: intermediate states go into the document via `preview` (without an undo step) or into the
 * interaction store; exactly one undo step is created on release.
 */
export class Controller {
  private mode: Mode = { kind: 'idle' };
  private pendingMove: PointerEvent | null = null;
  private frame = 0;
  private lastInfo: PointerInfo | null = null;
  private readonly unsubUi: () => void;

  constructor(private readonly el: HTMLElement) {
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerCancel);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('dblclick', this.onDoubleClick);
    el.addEventListener('contextmenu', this.onContextMenu);
    el.addEventListener('dragover', this.onDragOver);
    el.addEventListener('drop', this.onDrop);
    // Update the cursor immediately when Space/Ctrl are pressed without the mouse moving
    this.unsubUi = useUi.subscribe((s, prev) => {
      if ((s.spaceDown !== prev.spaceDown || s.ctrlDown !== prev.ctrlDown) && this.mode.kind === 'idle' && this.lastInfo) {
        this.hover({ ...this.lastInfo, ctrl: s.ctrlDown });
      }
    });
    activeController = this;
  }

  destroy(): void {
    const el = this.el;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerCancel);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('dblclick', this.onDoubleClick);
    el.removeEventListener('contextmenu', this.onContextMenu);
    el.removeEventListener('dragover', this.onDragOver);
    el.removeEventListener('drop', this.onDrop);
    this.unsubUi();
    cancelAnimationFrame(this.frame);
    if (activeController === this) activeController = null;
  }

  /* --------------------------------------------- Helpers --------------------------------------------- */

  private info(e: MouseEvent): PointerInfo {
    const r = this.el.getBoundingClientRect();
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
    return {
      screen,
      world: screenToWorld(useUi.getState().viewport, screen),
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey || e.metaKey,
    };
  }

  private get scale(): number {
    return useUi.getState().viewport.scale;
  }

  private snapStep(info: PointerInfo): number | null {
    const s = useEditor.getState().doc.settings;
    return s.snap && !info.ctrl ? s.snapStep : null;
  }

  private snapPt(p: Vec2, info: PointerInfo): Vec2 {
    return snapPoint(p, this.snapStep(info));
  }

  private setCursor(c: string): void {
    if (this.el.style.cursor !== c) this.el.style.cursor = c;
  }

  get busy(): boolean {
    return this.mode.kind !== 'idle';
  }

  /** Cancel the running action (Esc). Returns true if something was cancelled. */
  cancel(): boolean {
    const ix = useInteraction.getState();
    if (this.mode.kind !== 'idle') {
      if (this.mode.kind === 'move' || this.mode.kind === 'handle') useEditor.getState().cancel();
      this.mode = { kind: 'idle' };
      ix.reset();
      return true;
    }
    if (ix.draft) {
      ix.set({ draft: null });
      return true;
    }
    return false;
  }

  /** Finish the polygon draft (Enter / double-click / click on the first point). */
  finishPolygon(): boolean {
    const d = useInteraction.getState().draft;
    if (!d || d.kind !== 'polygon') return false;
    const pts = d.points.filter((p, i) => i === 0 || distance(p, d.points[i - 1]) > 1e-6);
    useInteraction.getState().set({ draft: null });
    if (pts.length < 3 || Math.abs(signedArea(pts)) < 0.05) {
      useUi.getState().toast(tr('msg.polygonMin'), 'warning');
      return true;
    }
    if (d.target === 'room') {
      const room = createPolygonRoom(pts);
      this.addObjects([room]);
      useUi.getState().setTool('select');
    } else {
      const res = processStroke(pts, 0.001);
      if (!res) {
        useUi.getState().toast(tr('msg.tableTooSmall'), 'warning');
        return true;
      }
      const doc = useEditor.getState().doc;
      const cm = (v: number) => roundTo(v, 0.01);
      const t = createCustomTable(
        { points: res.points, smoothing: 0, preserveCorners: true },
        { x: cm(res.center.x), y: cm(res.center.y) },
        cm(res.width),
        cm(res.height),
        nextTableName(doc),
      );
      this.addObjects([t]);
    }
    return true;
  }

  /** Remove the last polygon point (Backspace). */
  undoPolygonPoint(): boolean {
    const ix = useInteraction.getState();
    const d = ix.draft;
    if (!d || d.kind !== 'polygon') return false;
    if (d.points.length <= 1) ix.set({ draft: null });
    else ix.set({ draft: { ...d, points: d.points.slice(0, -1) } });
    return true;
  }

  private addObjects(objs: SceneObject[], opts: { select?: boolean } = {}): void {
    const ed = useEditor.getState();
    ed.apply((doc) => {
      const rooms = objs.filter((o) => o.type === 'room');
      const rest = objs.filter((o) => o.type !== 'room');
      return withObjects(doc, [...rooms, ...doc.objects, ...rest]);
    });
    if (opts.select !== false) ed.setSelection(objs.filter((o) => o.type !== 'chair' || !o.tableId).map((o) => o.id));
  }

  /* ------------------------------------------- Pointer down ------------------------------------------- */

  private onPointerDown = (e: PointerEvent): void => {
    const ui = useUi.getState();
    // commit inputs first (blur applies values), then close the popover
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    if (ui.contextMenu) ui.setContextMenu(null);
    if (ui.guestPopover) ui.setGuestPopover(null);
    const info = this.info(e);
    this.lastInfo = info;

    // Pan the view: middle mouse button, hand tool, Space or Ctrl + left click
    const panButton = e.button === 1 || (e.button === 0 && (ui.tool === 'hand' || ui.spaceDown || info.ctrl || ui.preview));
    if (panButton) {
      e.preventDefault();
      this.el.setPointerCapture(e.pointerId);
      this.mode = { kind: 'pan', start: info.screen, vp: ui.viewport };
      this.setCursor('grabbing');
      return;
    }
    if (e.button !== 0) return;
    this.el.setPointerCapture(e.pointerId);

    switch (ui.tool) {
      case 'select':
        this.downSelect(info);
        break;
      case 'room':
        if (this.addPolygonPoint(info, 'room')) break;
        this.mode = { kind: 'rect', target: 'room', start: this.snapPt(info.world, info), startScreen: info.screen };
        break;
      case 'table':
        this.mode = { kind: 'rect', target: 'table', start: this.snapPt(info.world, info), startScreen: info.screen };
        break;
      case 'zone':
        this.mode = { kind: 'rect', target: 'zone', start: this.snapPt(info.world, info), startScreen: info.screen };
        break;
      case 'freehand':
        if (this.addPolygonPoint(info, 'table')) break;
        this.mode = { kind: 'stroke', points: [info.world], startScreen: info.screen, lastScreen: info.screen };
        useInteraction.getState().set({ draft: { kind: 'stroke', points: [info.world] }, ghost: null });
        break;
      case 'wall':
      case 'measure': {
        const start = this.snapPt(info.world, info);
        this.mode = { kind: 'segment', target: ui.tool, start };
        useInteraction.getState().set({ draft: { kind: 'segment', target: ui.tool, a: start, b: start } });
        break;
      }
      case 'chair':
        this.placeChair(info);
        break;
      case 'door':
      case 'window':
      case 'column': {
        const ghost = this.ghostFor(ui.tool, info);
        if (ghost) this.addObjects([{ ...ghost }]);
        break;
      }
      case 'text': {
        const label = createLabel(this.snapPt(info.world, info));
        this.addObjects([label]);
        ui.setTool('select');
        ui.requestFocus('label-text');
        break;
      }
      default:
        break;
    }
  };

  private downSelect(info: PointerInfo): void {
    const ed = useEditor.getState();
    const doc = ed.doc;
    const lookup = getLookup(doc);
    const scale = this.scale;
    const sel = ed.selection;

    if (sel.length === 1) {
      const o = findObject(doc, sel[0]);
      if (o) {
        const h = hitHandle(handlesFor(o, lookup, scale), info.world, scale);
        if (h) {
          const place = worldPlacement(o, lookup);
          ed.begin();
          this.mode = {
            kind: 'handle',
            handle: h,
            id: o.id,
            base: doc,
            startWorld: info.world,
            startAngle: angleOf(sub(info.world, place)) + 90,
          };
          useInteraction.getState().set({ activeHandle: h.id, hoverId: null });
          return;
        }
      }
    }

    const hit = hitObject(doc, lookup, info.world, 4 / scale);
    if (!hit) {
      const base = info.shift ? sel : [];
      if (!info.shift) ed.setSelection([]);
      this.mode = { kind: 'marquee', start: info.world, additive: info.shift, base };
      return;
    }
    const group = expandGroups(doc, [hit.id]);
    let ids = sel;
    let toggleOff = false;
    if (info.shift) {
      if (sel.includes(hit.id)) toggleOff = true;
      else ids = [...sel, ...group.filter((id) => !sel.includes(id))];
    } else if (!sel.includes(hit.id)) {
      ids = group;
    }
    ed.setSelection(ids);
    this.mode = {
      kind: 'move',
      startWorld: info.world,
      startScreen: info.screen,
      ids: ids.filter((id) => !findObject(doc, id)?.locked),
      base: doc,
      started: false,
      clickedId: hit.id,
      toggleOff,
      targets: [],
      bounds: null,
      anchor: { x: 0, y: 0 },
    };
  }

  /** Click into a running polygon draft. */
  private addPolygonPoint(info: PointerInfo, target: 'room' | 'table'): boolean {
    const ix = useInteraction.getState();
    const d = ix.draft;
    if (!d || d.kind !== 'polygon' || d.target !== target) return false;
    const first = d.points[0];
    const vp = useUi.getState().viewport;
    if (d.points.length >= 3 && distance(worldToScreen(vp, first), info.screen) <= 10) {
      this.finishPolygon();
      return true;
    }
    let p = this.snapPt(info.world, info);
    if (info.shift && d.points.length > 0) p = constrainTo45(d.points[d.points.length - 1], p);
    ix.set({ draft: { ...d, points: [...d.points, p], cursor: p } });
    return true;
  }

  /* ------------------------------------------- Pointer move ------------------------------------------- */

  private onPointerMove = (e: PointerEvent): void => {
    this.pendingMove = e;
    if (!this.frame) this.frame = requestAnimationFrame(this.flushMove);
  };

  private flushMove = (): void => {
    this.frame = 0;
    const e = this.pendingMove;
    this.pendingMove = null;
    if (e) this.handleMove(e);
  };

  private handleMove(e: PointerEvent): void {
    const info = this.info(e);
    this.lastInfo = info;
    const ui = useUi.getState();
    ui.setCursor(info.world);
    const m = this.mode;
    switch (m.kind) {
      case 'idle':
        this.hover(info);
        return;
      case 'pan':
        ui.setViewport({ ...m.vp, x: m.vp.x + info.screen.x - m.start.x, y: m.vp.y + info.screen.y - m.start.y });
        return;
      case 'marquee': {
        const rect = boundsFromPoints(m.start, info.world);
        useInteraction.getState().set({ marquee: rect });
        const doc = useEditor.getState().doc;
        const hits = objectsInRect(doc, getLookup(doc), rect).map((o) => o.id);
        const ids = expandGroups(doc, m.additive ? [...new Set([...m.base, ...hits])] : hits);
        useEditor.getState().setSelection(ids);
        return;
      }
      case 'move':
        this.moveSelection(m, info);
        return;
      case 'handle':
        this.dragHandle(m, info);
        return;
      case 'rect': {
        let b = this.snapPt(info.world, info);
        if (info.shift) {
          const s = Math.max(Math.abs(b.x - m.start.x), Math.abs(b.y - m.start.y));
          b = { x: m.start.x + Math.sign(b.x - m.start.x || 1) * s, y: m.start.y + Math.sign(b.y - m.start.y || 1) * s };
        }
        if (distance(info.screen, m.startScreen) >= CLICK_PX) {
          useInteraction.getState().set({ draft: { kind: 'rect', target: m.target, a: m.start, b }, ghost: null });
        }
        return;
      }
      case 'stroke': {
        if (distance(info.screen, m.lastScreen) < 1.5) return;
        m.lastScreen = info.screen;
        m.points.push(info.world);
        useInteraction.getState().set({ draft: { kind: 'stroke', points: m.points } });
        return;
      }
      case 'segment': {
        let b = this.snapPt(info.world, info);
        if (info.shift) b = constrainTo45(m.start, b);
        useInteraction.getState().set({ draft: { kind: 'segment', target: m.target, a: m.start, b } });
        return;
      }
    }
  }

  private hover(info: PointerInfo): void {
    const ui = useUi.getState();
    const ix = useInteraction.getState();
    if (ui.preview) {
      this.setCursor('grab');
      return;
    }
    if (ui.spaceDown || info.ctrl || ui.tool === 'hand') {
      this.setCursor('grab');
      if (ix.hoverId || ix.ghost) ix.set({ hoverId: null, ghost: null });
      return;
    }
    const ed = useEditor.getState();
    const doc = ed.doc;
    const lookup = getLookup(doc);
    if (ui.tool === 'select') {
      if (ed.selection.length === 1) {
        const o = findObject(doc, ed.selection[0]);
        const h = o ? hitHandle(handlesFor(o, lookup, this.scale), info.world, this.scale) : null;
        if (h) {
          this.setCursor(h.cursor);
          if (ix.hoverId) ix.set({ hoverId: null });
          return;
        }
      }
      const hit = hitObject(doc, lookup, info.world, 4 / this.scale);
      this.setCursor(hit ? (hit.locked ? 'default' : 'move') : 'default');
      if ((hit?.id ?? null) !== ix.hoverId) ix.set({ hoverId: hit?.id ?? null });
      return;
    }
    this.setCursor('crosshair');
    if (ix.hoverId) ix.set({ hoverId: null });
    if (ix.draft?.kind === 'polygon') {
      let p = this.snapPt(info.world, info);
      if (info.shift && ix.draft.points.length) p = constrainTo45(ix.draft.points[ix.draft.points.length - 1], p);
      ix.set({ draft: { ...ix.draft, cursor: p } });
      return;
    }
    const ghost = this.ghostFor(ui.tool, info);
    ix.set({ ghost });
  }

  /** Preview of the object a click with the current tool would create. */
  private ghostFor(tool: string, info: PointerInfo): SceneObject | null {
    const doc = useEditor.getState().doc;
    const p = this.snapPt(info.world, info);
    switch (tool) {
      case 'table': {
        const preset = presetById(useUi.getState().tablePreset);
        return { ...createTable(preset, p, ''), id: '__ghost' };
      }
      case 'chair': {
        const att = info.shift || info.alt ? null : this.chairAttachment(doc, info.world);
        if (att) return { ...createChair(att.pose, undefined), id: '__ghost', x: att.world.x, y: att.world.y, rotation: att.world.rotation };
        return { ...createChair({ x: p.x, y: p.y, rotation: 0 }), id: '__ghost' };
      }
      case 'door':
      case 'window': {
        const width = tool === 'door' ? 0.9 : 1.2;
        const rooms = doc.objects.filter((o): o is RoomObject => o.type === 'room');
        const snap = info.shift || info.alt ? null : snapToRoomWall(info.world, rooms, width, 0.6);
        const wall = snap ? { depth: snap.wallDepth, offset: snap.wallOffset } : undefined;
        const at = snap ? { x: snap.x, y: snap.y, rotation: snap.rotation } : { x: p.x, y: p.y, rotation: 0 };
        const o = tool === 'door' ? createDoor(at, wall) : createWindow(at, wall);
        return o;
      }
      case 'column':
        return createColumn(p);
      default:
        return null;
    }
  }

  /** Nearest table whose edge a chair would dock to. */
  private chairAttachment(
    doc: SeatDocument,
    world: Vec2,
  ): { table: TableObject; pose: { x: number; y: number; rotation: number }; world: { x: number; y: number; rotation: number } } | null {
    const chair = doc.settings.chair;
    let best: { table: TableObject; pose: { x: number; y: number; rotation: number }; d: number } | null = null;
    for (const o of doc.objects) {
      if (o.type !== 'table') continue;
      const local = toLocal(world, o.x, o.y, o.rotation);
      const reach = Math.max(o.width, o.height) / 2 + chair.depth + o.seating.gap + 0.5;
      if (Math.hypot(local.x, local.y) > reach) continue;
      const { pose, distance: d } = snapPoseToTable(o, local, chair);
      if (d > chair.depth + o.seating.gap + 0.3) continue;
      if (!best || d < best.d) best = { table: o, pose, d };
    }
    if (!best) return null;
    const t = best.table;
    const w = add(rotate({ x: best.pose.x, y: best.pose.y }, t.rotation), t);
    return { table: t, pose: best.pose, world: { x: w.x, y: w.y, rotation: t.rotation + best.pose.rotation } };
  }

  private placeChair(info: PointerInfo): void {
    const ed = useEditor.getState();
    const doc = ed.doc;
    // Shift (or Alt, if the desktop lets it through) = place freely
    const att = info.shift || info.alt ? null : this.chairAttachment(doc, info.world);
    if (att) {
      const t = att.table;
      const chairs = chairsOf(doc, t.id);
      if (t.seating.auto) {
        // automatically arranged table: one more seat, evenly distributed
        ed.apply((d) => relayoutTable(d, t.id, chairs.length + 1));
        const after = chairsOf(useEditor.getState().doc, t.id);
        const newest = after.find((c) => !chairs.some((o) => o.id === c.id));
        if (newest) ed.setSelection([newest.id]);
        return;
      }
      const seat = chairs.reduce((m, c) => Math.max(m, (c.seat ?? -1) + 1), 0);
      const c = createChair(att.pose, t.id, seat);
      this.addObjects([c], { select: false });
      ed.setSelection([c.id]);
      return;
    }
    const p = this.snapPt(info.world, info);
    this.addObjects([createChair({ x: p.x, y: p.y, rotation: 0 })]);
  }

  /* ------------------------------------------- Move ------------------------------------------- */

  private moveSelection(m: Extract<Mode, { kind: 'move' }>, info: PointerInfo): void {
    const ed = useEditor.getState();
    if (!m.started) {
      if (distance(info.screen, m.startScreen) < DRAG_THRESHOLD_PX || m.ids.length === 0) return;
      m.started = true;
      ed.begin();
      if (info.alt) {
        const dup = duplicateObjects(m.base, m.ids, { x: 0, y: 0 });
        m.base = dup.doc;
        m.ids = dup.ids;
        ed.setSelection(dup.ids);
      }
      const set = new Set(m.ids);
      const lookup = getLookup(m.base);
      m.targets = m.base.objects
        .filter((o) => !set.has(o.id) && o.type !== 'chair')
        .map((o) => targetFromBounds(worldBounds(o, lookup)));
      m.bounds = selectionBounds(m.base, m.ids, lookup);
      const single = m.ids.length === 1 ? findObject(m.base, m.ids[0]) : undefined;
      if (single?.type === 'room') {
        const pts = roomWorldPoints(single);
        m.anchor = pts[0];
      } else if (single) {
        const p = worldPlacement(single, lookup);
        m.anchor = { x: p.x, y: p.y };
      } else if (m.bounds) {
        m.anchor = { x: m.bounds.minX, y: m.bounds.minY };
      }
      useInteraction.getState().set({ hoverId: null });
    }
    const raw = sub(info.world, m.startWorld);
    const single = m.ids.length === 1 ? findObject(m.base, m.ids[0]) : undefined;

    if (single?.type === 'chair') {
      ed.preview(this.moveChair(m.base, single, raw, info));
      return;
    }
    if (single && (single.type === 'door' || single.type === 'window') && !info.ctrl) {
      const lookup = getLookup(m.base);
      const p = worldPlacement(single, lookup);
      const target = add(p, raw);
      const rooms = m.base.objects.filter((o): o is RoomObject => o.type === 'room');
      const snap = snapToRoomWall(target, rooms, single.width, 0.4);
      if (snap) {
        const next: DoorObject | WindowObject = {
          ...single,
          x: snap.x,
          y: snap.y,
          rotation: snap.rotation,
          wallDepth: snap.wallDepth,
          wallOffset: snap.wallOffset,
        };
        ed.preview(withObjects(m.base, m.base.objects.map((o) => (o.id === single.id ? next : o))));
        useInteraction.getState().set({ guides: [] });
        return;
      }
    }

    let dx = raw.x;
    let dy = raw.y;
    if (m.bounds) {
      const res = snapMove({
        moving: translateBounds(m.bounds, dx, dy),
        anchor: add(m.anchor, raw),
        targets: info.ctrl ? [] : m.targets,
        threshold: SNAP_PX / this.scale,
        grid: this.snapStep(info),
      });
      dx += res.dx;
      dy += res.dy;
      useInteraction.getState().set({ guides: res.guides });
    }
    if (info.shift) {
      // Shift: horizontal or vertical only
      if (Math.abs(raw.x) > Math.abs(raw.y)) dy = 0;
      else dx = 0;
    }
    ed.preview(translateObjects(m.base, m.ids, dx, dy));
  }

  /** Drag a single chair: it docks to table edges or becomes free. */
  private moveChair(base: SeatDocument, chair: ChairObject, delta: Vec2, info: PointerInfo): SeatDocument {
    const lookup = getLookup(base);
    const start = worldPlacement(chair, lookup);
    const target = add(start, delta);
    const att = info.ctrl ? null : this.chairAttachment(base, target);
    let next: ChairObject;
    if (att) {
      const seat =
        chair.tableId === att.table.id
          ? chair.seat
          : chairsOf(base, att.table.id).reduce((m, c) => Math.max(m, (c.seat ?? -1) + 1), 0);
      next = { ...chair, tableId: att.table.id, seat, x: att.pose.x, y: att.pose.y, rotation: att.pose.rotation };
    } else {
      const p = this.snapPt(target, info);
      next = { ...chair, x: p.x, y: p.y, rotation: start.rotation };
      delete next.tableId;
      delete next.seat;
    }
    let doc = withObjects(base, base.objects.map((o) => (o.id === chair.id ? next : o)));
    const touched = [chair.tableId, next.tableId].filter((id): id is string => !!id);
    if (chair.tableId && chair.tableId !== next.tableId) doc = renumberSeats(doc, chair.tableId);
    doc = markManual(doc, touched);
    useInteraction.getState().set({ guides: [] });
    return doc;
  }

  /* ---------------------------------------------- Handles ---------------------------------------------- */

  private dragHandle(m: Extract<Mode, { kind: 'handle' }>, info: PointerInfo): void {
    const ed = useEditor.getState();
    const o = findObject(m.base, m.id);
    if (!o) return;
    const lookup = getLookup(m.base);
    const h = m.handle;
    const step = this.snapStep(info);

    if (h.kind === 'rotate') {
      const place = worldPlacement(o, lookup);
      const ang = angleOf(sub(info.world, place)) + 90;
      let world = place.rotation + (ang - m.startAngle);
      world = info.shift ? snapAngle(world, 15, 0, true) : snapAngle(world, 15, 2.5, false);
      const parent = o.type === 'chair' && o.tableId ? lookup.tables.get(o.tableId) : undefined;
      const rotation = normalizeAngle(roundTo(world - (parent?.rotation ?? 0), 0.01));
      let doc = withObjects(m.base, m.base.objects.map((x) => (x.id === o.id ? ({ ...x, rotation } as SceneObject) : x)));
      if (parent) doc = markManual(doc, [parent.id]);
      ed.preview(doc);
      return;
    }

    if (h.kind === 'resize' && (o.type === 'door' || o.type === 'window')) {
      // Openings: width only, the opposite edge stays put
      const q = toLocal(info.world, o.x, o.y, o.rotation);
      let w2 = Math.max(0.4, h.sx * q.x + o.width / 2);
      if (step) w2 = Math.max(0.4, roundTo(w2, step));
      const shift = rotate({ x: (h.sx * (w2 - o.width)) / 2, y: 0 }, o.rotation);
      const next = { ...o, width: w2, x: o.x + shift.x, y: o.y + shift.y };
      ed.preview(withObjects(m.base, m.base.objects.map((x) => (x.id === o.id ? next : x))));
      return;
    }

    if (h.kind === 'resize' && (o.type === 'table' || o.type === 'column' || o.type === 'zone')) {
      const w = o.width;
      const hgt = o.height;
      const q = toLocal(info.world, o.x, o.y, o.rotation);
      const min = o.type === 'table' ? 0.3 : o.type === 'zone' ? 0.5 : 0.1;
      let w2 = h.sx ? Math.max(min, h.sx * q.x + w / 2) : w;
      let h2 = h.sy ? Math.max(min, h.sy * q.y + hgt / 2) : hgt;
      if (step) {
        if (h.sx) w2 = Math.max(min, roundTo(w2, step));
        if (h.sy) h2 = Math.max(min, roundTo(h2, step));
      }
      const round = (o.type === 'table' && o.shape === 'round') || (o.type === 'column' && o.shape === 'round' && o.width === o.height);
      if (round) {
        w2 = h2 = Math.max(w2, h2);
      } else if (info.shift && h.sx && h.sy) {
        const k = Math.max(w2 / w, h2 / hgt);
        w2 = w * k;
        h2 = hgt * k;
      }
      const shift = rotate({ x: (h.sx * (w2 - w)) / 2, y: (h.sy * (h2 - hgt)) / 2 }, o.rotation);
      const next = { ...o, width: w2, height: h2, x: o.x + shift.x, y: o.y + shift.y };
      let doc = withObjects(m.base, m.base.objects.map((x) => (x.id === o.id ? next : x)));
      if (o.type === 'table') doc = reflowTables(doc, [o.id]);
      ed.preview(doc);
      return;
    }

    if ((h.kind === 'vertex' || h.kind === 'edge') && o.type === 'room') {
      const pts = roomWorldPoints(o);
      let next: Vec2[];
      if (h.kind === 'vertex') {
        next = pts.slice();
        let p = this.snapPt(info.world, info);
        if (info.shift) {
          const prev = pts[(h.index - 1 + pts.length) % pts.length];
          p = constrainTo45(prev, p);
        }
        next[h.index] = p;
      } else {
        const a = pts[h.index];
        const b = pts[(h.index + 1) % pts.length];
        const d = normalize(sub(b, a));
        const sign = signedArea(pts) >= 0 ? 1 : -1;
        const n = { x: d.y * sign, y: -d.x * sign };
        let delta = dot(sub(info.world, m.startWorld), n);
        if (step) delta = roundTo(delta, step);
        next = pts.map((p, i) => (i === h.index || i === (h.index + 1) % pts.length ? add(p, mul(n, delta)) : p));
      }
      const room: RoomObject = { ...o, points: next.map((p) => ({ x: p.x - o.x, y: p.y - o.y })) };
      ed.preview(withObjects(m.base, m.base.objects.map((x) => (x.id === o.id ? room : x))));
      return;
    }

    if (h.kind === 'end' && (o.type === 'wall' || o.type === 'dimension')) {
      const ends = segmentEnds(o);
      const other = ends[1 - h.index];
      let p = this.snapPt(info.world, info);
      if (info.shift) p = constrainTo45(other, p);
      const seg = h.index === 0 ? segmentFromEnds(p, other) : segmentFromEnds(other, p);
      if (seg.length < 0.02) return;
      ed.preview(withObjects(m.base, m.base.objects.map((x) => (x.id === o.id ? ({ ...x, ...seg } as SceneObject) : x))));
    }
  }

  /* -------------------------------------------- Pointer up -------------------------------------------- */

  private onPointerUp = (e: PointerEvent): void => {
    if (this.pendingMove) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.flushMove();
    }
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    const info = this.info(e);
    const m = this.mode;
    this.mode = { kind: 'idle' };
    const ix = useInteraction.getState();
    const ed = useEditor.getState();
    const ui = useUi.getState();

    switch (m.kind) {
      case 'pan':
        this.setCursor(ui.tool === 'hand' || ui.spaceDown || info.ctrl || ui.preview ? 'grab' : 'default');
        break;
      case 'marquee':
        ix.set({ marquee: null });
        break;
      case 'move':
        if (m.started) {
          ed.commit();
          ix.set({ guides: [] });
        } else if (m.toggleOff) {
          const group = new Set(expandGroups(ed.doc, [m.clickedId]));
          ed.setSelection(ed.selection.filter((id) => !group.has(id)));
        } else if (!info.shift && ed.selection.length > 1) {
          ed.setSelection(expandGroups(ed.doc, [m.clickedId]));
        }
        break;
      case 'handle': {
        // Store rooms clockwise again after editing corners
        const o = findObject(ed.doc, m.id);
        if (o?.type === 'room' && signedArea(o.points) < 0) {
          ed.preview(withObjects(ed.doc, ed.doc.objects.map((x) => (x.id === o.id ? { ...o, points: o.points.slice().reverse() } : x))));
        }
        ed.commit();
        ix.set({ activeHandle: null });
        break;
      }
      case 'rect':
        this.finishRect(m, info);
        break;
      case 'stroke':
        this.finishStroke(m, info);
        break;
      case 'segment': {
        ix.set({ draft: null });
        let b = this.snapPt(info.world, info);
        if (info.shift) b = constrainTo45(m.start, b);
        if (distance(m.start, b) < 0.05) break;
        if (m.target === 'wall') this.addObjects([createWall(m.start, b)]);
        else this.addObjects([createDimension(m.start, b)]);
        break;
      }
      default:
        break;
    }
    this.lastInfo = info;
  };

  private finishRect(m: Extract<Mode, { kind: 'rect' }>, info: PointerInfo): void {
    const ix = useInteraction.getState();
    const draft = ix.draft;
    ix.set({ draft: null });
    const ui = useUi.getState();
    const isClick = distance(info.screen, m.startScreen) < CLICK_PX || !draft || draft.kind !== 'rect';
    if (m.target === 'room') {
      if (isClick) {
        ix.set({ draft: { kind: 'polygon', target: 'room', points: [m.start], cursor: m.start } });
        ui.toast(tr('msg.roomPolygon'), 'info');
        return;
      }
      const w = Math.abs(draft.b.x - draft.a.x);
      const h = Math.abs(draft.b.y - draft.a.y);
      if (w < 0.5 || h < 0.5) {
        ui.toast(tr('msg.roomTooSmall'), 'warning');
        return;
      }
      const room = createRectRoom(w, h, { x: (draft.a.x + draft.b.x) / 2, y: (draft.a.y + draft.b.y) / 2 });
      this.addObjects([room]);
      ui.setTool('select');
      return;
    }
    if (m.target === 'zone') {
      const w = isClick ? 3 : Math.abs(draft.b.x - draft.a.x);
      const h = isClick ? 2 : Math.abs(draft.b.y - draft.a.y);
      if (w < 0.5 || h < 0.5) {
        ui.toast(tr('msg.zoneTooSmall'), 'warning');
        return;
      }
      const center = isClick ? m.start : { x: (draft.a.x + draft.b.x) / 2, y: (draft.a.y + draft.b.y) / 2 };
      this.addObjects([createZone(center, w, h)]);
      ui.setTool('select');
      ui.setPanel('inspect');
      ui.requestFocus('zone-name');
      return;
    }
    const doc = useEditor.getState().doc;
    const preset = presetById(ui.tablePreset);
    if (isClick) {
      this.addObjects([createTable(preset, m.start, nextTableName(doc))]);
      return;
    }
    let w = Math.abs(draft.b.x - draft.a.x);
    let h = Math.abs(draft.b.y - draft.a.y);
    if (preset.shape === 'round') w = h = Math.max(w, h);
    if (w < 0.3 || h < 0.3) {
      this.addObjects([createTable(preset, m.start, nextTableName(doc))]);
      return;
    }
    const center = { x: (draft.a.x + draft.b.x) / 2, y: (draft.a.y + draft.b.y) / 2 };
    if (preset.shape === 'round') {
      center.x = draft.a.x + (Math.sign(draft.b.x - draft.a.x) || 1) * (w / 2);
      center.y = draft.a.y + (Math.sign(draft.b.y - draft.a.y) || 1) * (h / 2);
    }
    this.addObjects([createTable(preset, center, nextTableName(doc), { width: w, height: h })]);
  }

  private finishStroke(m: Extract<Mode, { kind: 'stroke' }>, info: PointerInfo): void {
    const ix = useInteraction.getState();
    ix.set({ draft: null });
    const travelled = m.points.reduce((s, p, i) => (i ? s + distance(p, m.points[i - 1]) : 0), 0) * this.scale;
    if (distance(info.screen, m.startScreen) < CLICK_PX && travelled < CLICK_PX * 2) {
      const p = this.snapPt(info.world, info);
      ix.set({ draft: { kind: 'polygon', target: 'table', points: [p], cursor: p } });
      useUi.getState().toast(tr('msg.tablePolygon'), 'info');
      return;
    }
    const res = processStroke(m.points, 2 / this.scale);
    if (!res) {
      useUi.getState().toast(tr('msg.tableTooSmall'), 'warning');
      return;
    }
    const doc = useEditor.getState().doc;
    // Round size and position to whole centimetres; exact values can be typed in afterwards
    const cm = (v: number) => roundTo(v, 0.01);
    const center = { x: cm(res.center.x), y: cm(res.center.y) };
    this.addObjects([createCustomTable({ points: res.points }, center, cm(res.width), cm(res.height), nextTableName(doc))]);
  }

  private onPointerCancel = (e: PointerEvent): void => {
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    this.cancel();
  };

  private onPointerLeave = (): void => {
    if (this.mode.kind !== 'idle') return;
    useUi.getState().setCursor(null);
    const ix = useInteraction.getState();
    if (ix.hoverId || ix.ghost) ix.set({ hoverId: null, ghost: null });
  };

  /* ---------------------------------------------- Zoom ---------------------------------------------- */

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const ui = useUi.getState();
    // an input field anchored to the chair would be misplaced after zooming
    if (ui.guestPopover) ui.setGuestPopover(null);
    const info = this.info(e);
    const vp = ui.viewport;
    const lineMode = e.deltaMode === 1;
    const dy = lineMode ? e.deltaY * 32 : e.deltaY;
    const dx = lineMode ? e.deltaX * 32 : e.deltaX;
    // Pinch (trackpad) and Ctrl+wheel zoom finely, a normal mouse wheel zooms in steps,
    // two-finger scrolling on the trackpad pans the view.
    const mouseWheel = lineMode || (dx === 0 && Math.abs(dy) >= 40 && Number.isInteger(dy));
    if (e.ctrlKey || e.metaKey) {
      ui.setViewport(zoomAt(vp, info.screen, Math.exp(-dy * 0.01)));
    } else if (mouseWheel && !e.shiftKey) {
      ui.setViewport(zoomAt(vp, info.screen, Math.exp(-dy * 0.0016)));
    } else if (e.shiftKey && dx === 0) {
      ui.setViewport({ ...vp, x: vp.x - dy });
    } else {
      ui.setViewport({ ...vp, x: vp.x - dx, y: vp.y - dy });
    }
    ui.setCursor(screenToWorld(useUi.getState().viewport, info.screen));
  };

  /* ----------------------------------- Double-click & context menu ----------------------------------- */

  private onDoubleClick = (e: MouseEvent): void => {
    const ui = useUi.getState();
    if (ui.preview) return;
    const d = useInteraction.getState().draft;
    if (d?.kind === 'polygon') {
      this.finishPolygon();
      return;
    }
    if (ui.tool !== 'select') return;
    const info = this.info(e);
    const ed = useEditor.getState();
    const doc = ed.doc;
    const lookup = getLookup(doc);
    const hit = hitObject(doc, lookup, info.world, 4 / this.scale);
    if (!hit) return;
    if (hit.type === 'chair') {
      ed.setSelection([hit.id]);
      const p = worldPlacement(hit, lookup);
      const s = worldToScreen(ui.viewport, p);
      const r = this.el.getBoundingClientRect();
      ui.setGuestPopover({ chairId: hit.id, x: s.x + r.left, y: s.y + r.top });
    } else if (hit.type === 'table') {
      ed.setSelection([hit.id]);
      ui.requestFocus('table-name');
    } else if (hit.type === 'label') {
      ed.setSelection([hit.id]);
      ui.requestFocus('label-text');
    } else if (hit.type === 'zone') {
      ed.setSelection([hit.id]);
      ui.setPanel('inspect');
      ui.requestFocus('zone-name');
    } else if (hit.type === 'room' && !hit.locked) {
      this.insertRoomVertex(hit, info.world);
    }
  };

  private insertRoomVertex(room: RoomObject, p: Vec2): void {
    const pts = roomWorldPoints(room);
    let best = { i: -1, d: Infinity, point: p };
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ab = sub(b, a);
      const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-12)));
      const q = add(a, mul(ab, t));
      const d = distance(p, q);
      if (d < best.d) best = { i, d, point: q };
    }
    if (best.i < 0) return;
    const local = sub(best.point, room);
    const points = [...room.points.slice(0, best.i + 1), local, ...room.points.slice(best.i + 1)];
    useEditor.getState().apply((doc) => withObjects(doc, doc.objects.map((o) => (o.id === room.id ? { ...room, points } : o))));
    useEditor.getState().setSelection([room.id]);
    useUi.getState().toast(tr('msg.vertexAdded'), 'info');
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const ui = useUi.getState();
    if (ui.preview || this.mode.kind !== 'idle') return;
    if (useInteraction.getState().draft) {
      this.cancel();
      return;
    }
    const info = this.info(e);
    const ed = useEditor.getState();
    const hit = hitObject(ed.doc, getLookup(ed.doc), info.world, 4 / this.scale);
    if (hit && !ed.selection.includes(hit.id)) ed.setSelection(expandGroups(ed.doc, [hit.id]));
    ui.setContextMenu({ x: e.clientX, y: e.clientY, world: info.world, onObject: !!hit });
  };

  /* --------------------------------------- Guests via drag & drop --------------------------------------- */

  private onDragOver = (e: DragEvent): void => {
    if (!e.dataTransfer?.types.includes(GUEST_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
    const info = this.info(e);
    const doc = useEditor.getState().doc;
    const hit = hitObject(doc, getLookup(doc), info.world, 6 / this.scale);
    const id = hit?.type === 'chair' ? hit.id : null;
    const ix = useInteraction.getState();
    if (ix.hoverId !== id) ix.set({ hoverId: id });
  };

  private onDrop = (e: DragEvent): void => {
    const guestId = e.dataTransfer?.getData(GUEST_MIME);
    if (!guestId) return;
    e.preventDefault();
    const info = this.info(e);
    const ed = useEditor.getState();
    const hit = hitObject(ed.doc, getLookup(ed.doc), info.world, 6 / this.scale);
    useInteraction.getState().set({ hoverId: null });
    if (hit?.type !== 'chair') {
      useUi.getState().toast(tr('guests.dropOnChair'), 'info');
      return;
    }
    ed.apply((doc) => assignGuest(doc, hit.id, guestId));
    ed.setSelection([hit.id]);
  };

  /** Last known pointer position (for pasting at the mouse position). */
  get lastWorld(): Vec2 | null {
    return this.lastInfo?.world ?? null;
  }
}

export { GUEST_MIME };
