import type { FileRef } from '../platforms/types';
import { useEditor } from '../state/editorStore';
import { useUi, resolvedTheme, type ToolId } from '../state/uiStore';
import { useFile } from '../state/fileStore';
import { useInteraction } from '../state/interactionStore';
import { findObject } from '../state/lookup';
import { tr } from '../i18n';
import { normalizeAngle } from '../geometry/vec';
import { platform } from '../platforms';
import { baseName, parseDocument, safeFileName, serializeDocument } from '../persistence/serialize';
import {
  type AlignMode,
  type ClipboardPayload,
  type ZMove,
  alignObjects,
  copyObjects,
  deleteObjects,
  distributeObjects,
  duplicateObjects,
  expandGroups,
  groupObjects,
  markManual,
  pasteObjects,
  reorder,
  selectionBounds,
  setLocked,
  translateObjects,
  ungroupObjects,
} from './objects/docOps';
import { addGuests, withObjects } from './objects/tableOps';
import { guestNamesFromCsv } from '../persistence/csv';
import { createEmptyDocument } from './objects/factory';
import { activeController } from './interactions/controller';
import { commandById } from './keymap';
import { confirmDeletePlan, createPlan, cyclePlan, saveActiveNow, usePlans } from './projects';
import { fitView, zoomBy, zoomTo100 } from './view';

export { fitView, zoomBy, zoomTo100 };

const ed = () => useEditor.getState();
const ui = () => useUi.getState();

export const undo = () => ed().undo();
export const redo = () => ed().redo();

export function deleteSelection(): void {
  const { selection, doc } = ed();
  if (selection.length === 0) return;
  const locked = selection.filter((id) => findObject(doc, id)?.locked).length;
  ed().apply((d) => deleteObjects(d, selection));
  if (locked) ui().toast(tr('msg.lockedKept', { n: locked }), 'info');
}

export function duplicateSelection(): void {
  const { selection } = ed();
  if (selection.length === 0) return;
  let ids: string[] = [];
  ed().apply((d) => {
    const r = duplicateObjects(d, selection);
    ids = r.ids;
    return r.doc;
  });
  ed().setSelection(ids);
}

let clipboard: ClipboardPayload | null = null;
let pasteCount = 0;

export function copySelection(): void {
  const { selection, doc } = ed();
  if (selection.length === 0) return;
  clipboard = copyObjects(doc, selection);
  pasteCount = 0;
}

export function cutSelection(): void {
  copySelection();
  deleteSelection();
}

export function paste(at?: { x: number; y: number }): void {
  if (!clipboard || clipboard.objects.length === 0) return;
  const payload = clipboard;
  pasteCount++;
  let ids: string[] = [];
  ed().apply((d) => {
    let offset = { x: 0.5 * pasteCount, y: 0.5 * pasteCount };
    if (at) {
      const tmp = pasteObjects(d, payload, { x: 0, y: 0 });
      const b = selectionBounds(tmp.doc, tmp.ids);
      if (b) offset = { x: at.x - (b.minX + b.maxX) / 2, y: at.y - (b.minY + b.maxY) / 2 };
    }
    const r = pasteObjects(d, payload, offset);
    ids = r.ids;
    return r.doc;
  });
  ed().setSelection(ids);
}

export const hasClipboard = (): boolean => !!clipboard && clipboard.objects.length > 0;

export function selectAll(): void {
  const { doc } = ed();
  ed().setSelection(doc.objects.filter((o) => !o.locked && !(o.type === 'chair' && o.tableId)).map((o) => o.id));
}

export const clearSelection = (): void => ed().setSelection([]);

export function nudge(dx: number, dy: number): void {
  const { selection } = ed();
  if (selection.length) ed().apply((d) => translateObjects(d, selection, dx, dy), { coalesce: 'nudge' });
}

/** Rotate the selection around each object's own centre (table chairs rotate with their table). */
export function rotateSelection(deg: number): void {
  const { selection } = ed();
  if (!selection.length) return;
  const set = new Set(selection);
  ed().apply(
    (d) => {
      const manual = new Set<string>();
      const objects = d.objects.map((o) => {
        if (!set.has(o.id) || o.locked || o.type === 'room') return o;
        if (o.type === 'chair' && o.tableId) {
          if (set.has(o.tableId)) return o;
          manual.add(o.tableId);
        }
        return { ...o, rotation: normalizeAngle(o.rotation + deg) };
      });
      return markManual(withObjects(d, objects), manual);
    },
    { coalesce: 'rotate' },
  );
}

export function group(): void {
  const { selection } = ed();
  ed().apply((d) => groupObjects(d, selection));
}

export function ungroup(): void {
  const { selection } = ed();
  ed().apply((d) => ungroupObjects(d, selection));
}

export function toggleLock(): void {
  const { selection, doc } = ed();
  if (selection.length === 0) return;
  const lockAll = selection.some((id) => !findObject(doc, id)?.locked);
  ed().apply((d) => setLocked(d, selection, lockAll));
}

export function zOrder(move: ZMove): void {
  const { selection } = ed();
  ed().apply((d) => reorder(d, selection, move));
}

export function align(mode: AlignMode): void {
  const { selection } = ed();
  ed().apply((d) => alignObjects(d, selection, mode));
}

export function distribute(axis: 'x' | 'y'): void {
  const { selection } = ed();
  ed().apply((d) => distributeObjects(d, selection, axis));
}

export function selectGroupOf(id: string): void {
  ed().setSelection(expandGroups(ed().doc, [id]));
}

export function toggleSetting(key: 'showGrid' | 'snap' | 'showDimensions' | 'showGuestNames' | 'showTableNames'): void {
  ed().apply((d) => ({ ...d, settings: { ...d.settings, [key]: !d.settings[key] } }), { history: false });
}

export function setTool(tool: ToolId): void {
  activeController?.cancel();
  useInteraction.getState().set({ draft: null, ghost: null });
  ui().setTool(tool);
}

/** Switch between the light and dark counterpart of the current theme. */
export function toggleTheme(): void {
  const pairs = { beige: 'espresso', espresso: 'beige', sage: 'midnight', midnight: 'sage' } as const;
  ui().setTheme(pairs[resolvedTheme(ui())]);
}

/** Borderless fullscreen (F11). */
export function toggleFullscreen(): void {
  const native = window.seatsketchNative;
  if (native?.toggleFullscreen) {
    void native.toggleFullscreen();
    return;
  }
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

/* -------------------------------------------- Files -------------------------------------------- */

export async function openProject(): Promise<void> {
  try {
    const f = await platform.openProject();
    if (f) openFromText(f.content, f.name, f.ref);
  } catch (e) {
    ui().toast(tr('msg.openFailed', { error: (e as Error).message }), 'error');
  }
}

/** Open a file as a new tab. */
export function openFromText(content: string, name: string, ref: FileRef | null): boolean {
  const parsed = parseDocument(content);
  if (!parsed.ok) {
    ui().toast(parsed.error, 'error');
    return false;
  }
  createPlan(parsed.doc, { name, ref });
  for (const w of parsed.warnings) ui().toast(w, 'warning');
  if (!parsed.warnings.length) ui().toast(tr('msg.opened', { name: baseName(name) }), 'success');
  refreshRecent();
  return true;
}

/** Desktop: a file was opened by double-click while the app was already running. */
export async function openPendingNativeFile(): Promise<void> {
  const native = window.seatsketchNative;
  if (!native) return;
  const f = await native.initialFile();
  if (f) openFromText(f.content, f.name, { kind: 'path', path: f.path });
}

/** File dropped onto the window: open the project or import the guest list. */
export async function openDroppedFile(file: File): Promise<void> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.seatsketch') || name.endsWith('.json')) {
    openFromText(await file.text(), file.name, null);
    return;
  }
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    if (!usePlans.getState().activeId) return;
    const names = guestNamesFromCsv(await file.text());
    let added = 0;
    ed().apply((d) => {
      const r = addGuests(d, names);
      added = r.added.length;
      return r.doc;
    });
    ui().setPanel('guests');
    ui().toast(added ? tr('msg.guestsImported', { n: added, file: file.name }) : tr('msg.noNewNames'), added ? 'success' : 'warning');
    return;
  }
  ui().toast(tr('msg.unsupportedFile'), 'warning');
}

export async function openRecent(path: string): Promise<void> {
  try {
    const f = await platform.openRecent(path);
    if (!f) {
      ui().toast(tr('msg.notFound'), 'error');
      refreshRecent();
      return;
    }
    openFromText(f.content, f.name, f.ref);
  } catch (e) {
    ui().toast(tr('msg.openFailed', { error: (e as Error).message }), 'error');
  }
}

export async function saveProject(saveAs = false): Promise<boolean> {
  const f = useFile.getState();
  if (f.saving || !usePlans.getState().activeId) return false;
  const doc = ed().doc;
  f.setSaving(true);
  try {
    const res = await platform.saveProject(serializeDocument(doc), safeFileName(doc.meta.name), f.ref, saveAs);
    if (!res) return false;
    ed().markSaved(doc);
    useFile.getState().setFile(res.name, res.ref);
    saveActiveNow();
    ui().toast(res.ref ? tr('msg.saved', { name: res.name }) : tr('msg.downloaded', { name: res.name }), 'success');
    refreshRecent();
    return true;
  } catch (e) {
    ui().toast(tr('msg.saveFailed', { error: (e as Error).message }), 'error');
    return false;
  } finally {
    useFile.getState().setSaving(false);
  }
}

export function refreshRecent(): void {
  platform
    .recentProjects()
    .then((r) => useFile.getState().setRecent(r))
    .catch(() => undefined);
}

export function renameDocument(name: string): void {
  const clean = name.trim();
  if (!clean) return;
  ed().apply((d) => (d.meta.name === clean ? d : { ...d, meta: { ...d.meta, name: clean } }), { coalesce: 'doc-name' });
}

/* ------------------------------------- Commands by ID (keyboard) ------------------------------------- */

const hasPlan = () => !!usePlans.getState().activeId;
const GLOBAL = new Set(['newPlan', 'open', 'settings', 'shortcuts', 'fullscreen', 'toggleTheme', 'nextTab', 'prevTab']);

/** Runs a command from the registry. Returns false if it does not apply right now. */
export function runCommand(id: string): boolean {
  const def = commandById(id);
  if (!def) return false;
  if (!GLOBAL.has(id) && !hasPlan()) return false;
  if (def.tool) {
    setTool(def.tool);
    return true;
  }
  const u = ui();
  switch (id) {
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'cut': cutSelection(); break;
    case 'copy': copySelection(); break;
    case 'paste': paste(); break;
    case 'duplicate': duplicateSelection(); break;
    case 'delete':
      if (!activeController?.undoPolygonPoint()) deleteSelection();
      break;
    case 'selectAll': selectAll(); break;
    case 'group': group(); break;
    case 'ungroup': ungroup(); break;
    case 'lock': toggleLock(); break;
    case 'distribute': u.openDialog('distribute'); break;
    case 'forward': zOrder('forward'); break;
    case 'backward': zOrder('backward'); break;
    case 'front': zOrder('front'); break;
    case 'back': zOrder('back'); break;
    case 'rotateCw': rotateSelection(90); break;
    case 'rotateCcw': rotateSelection(-90); break;
    case 'rotateCwFine': rotateSelection(15); break;
    case 'rotateCcwFine': rotateSelection(-15); break;
    case 'alignLeft': align('left'); break;
    case 'alignHCenter': align('hcenter'); break;
    case 'alignRight': align('right'); break;
    case 'alignTop': align('top'); break;
    case 'alignVCenter': align('vcenter'); break;
    case 'alignBottom': align('bottom'); break;
    case 'distributeH': distribute('x'); break;
    case 'distributeV': distribute('y'); break;
    case 'zoomIn': zoomBy(1.25); break;
    case 'zoomOut': zoomBy(0.8); break;
    case 'zoomFit': fitView(); break;
    case 'zoom100': zoomTo100(); break;
    case 'zoomSelection': fitView(undefined, ed().selection.length > 0); break;
    case 'toggleGrid': toggleSetting('showGrid'); break;
    case 'toggleSnap': toggleSetting('snap'); break;
    case 'toggleDims': toggleSetting('showDimensions'); break;
    case 'toggleTableNames': toggleSetting('showTableNames'); break;
    case 'toggleGuestNames': toggleSetting('showGuestNames'); break;
    case 'toggleToolbar': u.setToolbarExpanded(!u.toolbarExpanded); break;
    case 'guests': u.setPanel(u.panel === 'guests' ? 'inspect' : 'guests'); break;
    case 'properties': u.setPanel('inspect'); break;
    case 'preview': u.setPreview(!u.preview); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'toggleTheme': toggleTheme(); break;
    case 'newPlan': createPlan(createEmptyDocument()); break;
    case 'open': void openProject(); break;
    case 'save': void saveProject(false); break;
    case 'saveAs': void saveProject(true); break;
    case 'export': u.openExport(); break;
    case 'print': u.openExport('pdf'); break;
    case 'nextTab': cyclePlan(1); break;
    case 'prevTab': cyclePlan(-1); break;
    case 'rename': u.requestFocus('project-name'); break;
    case 'deletePlan': {
      const active = usePlans.getState().activeId;
      if (active) void confirmDeletePlan(active);
      break;
    }
    case 'settings': u.openSettings('general'); break;
    case 'shortcuts': u.openSettings('shortcuts'); break;
    default:
      return false;
  }
  return true;
}
