import { create } from 'zustand';
import type { SeatDocument } from '../types/document';
import type { Viewport } from '../geometry/coordinateSystem';
import type { FileRef } from '../platforms/types';
import { useEditor, isDirty } from '../state/editorStore';
import { useUi } from '../state/uiStore';
import { useFile } from '../state/fileStore';
import { useInteraction } from '../state/interactionStore';
import { newId } from '../state/ids';
import { tr } from '../i18n';
import { type PlanMeta, readIndex, readPlan, removePlan, writeIndex, writePlan } from '../persistence/library';
import { createEmptyDocument } from './objects/factory';
import { activeController } from './interactions/controller';
import { fitView } from './view';

/*
 * Plans as tabs. The active plan lives in the editor store; on switching, its state
 * (history, selection, view, file link) is stashed and the new one loaded.
 */

interface PlansState {
  plans: PlanMeta[];
  activeId: string | null;
}

export const usePlans = create<PlansState>()(() => ({ plans: [], activeId: null }));

interface Session {
  doc: SeatDocument;
  past: SeatDocument[];
  future: SeatDocument[];
  selection: string[];
  savedDoc: SeatDocument | null;
  viewport: Viewport;
  ref: FileRef | null;
}

const sessions = new Map<string, Session>();
let warnedFull = false;

function persistIndex(): void {
  const { plans, activeId } = usePlans.getState();
  if (!writeIndex({ plans, activeId }) && !warnedFull) {
    warnedFull = true;
    useUi.getState().toast(tr('msg.storageFull'), 'error');
  }
}

/** Save the current plan immediately (autosave, tab switch, closing). */
export function saveActiveNow(): void {
  const { activeId, plans } = usePlans.getState();
  if (!activeId) return;
  const ed = useEditor.getState();
  if (ed.txBase) return;
  const f = useFile.getState();
  if (!writePlan(activeId, ed.doc) && !warnedFull) {
    warnedFull = true;
    useUi.getState().toast(tr('msg.storageFull'), 'error');
  }
  const next = plans.map((p) =>
    p.id === activeId
      ? {
          ...p,
          name: ed.doc.meta.name,
          updatedAt: new Date().toISOString(),
          fileName: f.fileName,
          filePath: f.ref?.kind === 'path' ? f.ref.path : null,
          dirty: isDirty(ed),
        }
      : p,
  );
  usePlans.setState({ plans: next });
  persistIndex();
}

function stashActive(): void {
  const { activeId } = usePlans.getState();
  if (!activeId) return;
  activeController?.cancel();
  saveActiveNow();
  const ed = useEditor.getState();
  sessions.set(activeId, {
    doc: ed.doc,
    past: ed.past,
    future: ed.future,
    selection: ed.selection,
    savedDoc: ed.savedDoc,
    viewport: useUi.getState().viewport,
    ref: useFile.getState().ref,
  });
}

function loadIntoEditor(id: string): void {
  const meta = usePlans.getState().plans.find((p) => p.id === id);
  if (!meta) return;
  useInteraction.getState().reset();
  const ui = useUi.getState();
  ui.setContextMenu(null);
  ui.setGuestPopover(null);
  const s = sessions.get(id);
  if (s) {
    useEditor.setState({ doc: s.doc, past: s.past, future: s.future, selection: s.selection, savedDoc: s.savedDoc, txBase: null, lastCoalesce: null });
    useFile.getState().setFile(meta.fileName, s.ref);
    ui.setViewport(s.viewport);
    return;
  }
  const doc = readPlan(id) ?? createEmptyDocument(meta.name);
  useEditor.getState().load(doc, { saved: !!meta.fileName && meta.dirty === false });
  useFile.getState().setFile(meta.fileName, meta.filePath ? { kind: 'path', path: meta.filePath } : null);
  requestAnimationFrame(() => fitView(doc));
}

/** Start: load the library. Returns false if there are no plans yet. */
export function initPlans(): boolean {
  const index = readIndex();
  usePlans.setState(index);
  if (!index.activeId) return false;
  loadIntoEditor(index.activeId);
  return true;
}

export function activatePlan(id: string): void {
  const { activeId, plans } = usePlans.getState();
  if (id === activeId || !plans.some((p) => p.id === id)) {
    useUi.getState().setWelcome(false);
    return;
  }
  stashActive();
  usePlans.setState({ activeId: id });
  persistIndex();
  loadIntoEditor(id);
  useUi.getState().setWelcome(false);
}

/** Create a new plan as a tab to the right of the active one and open it. */
export function createPlan(doc: SeatDocument, file?: { name: string | null; ref: FileRef | null }): string {
  stashActive();
  const id = newId('p');
  const meta: PlanMeta = {
    id,
    name: doc.meta.name,
    updatedAt: new Date().toISOString(),
    fileName: file?.name ?? null,
    filePath: file?.ref?.kind === 'path' ? file.ref.path : null,
    dirty: !file?.name,
  };
  writePlan(id, doc);
  const { plans, activeId } = usePlans.getState();
  const at = activeId ? plans.findIndex((p) => p.id === activeId) + 1 : plans.length;
  const next = [...plans.slice(0, at), meta, ...plans.slice(at)];
  usePlans.setState({ plans: next, activeId: id });
  persistIndex();
  useInteraction.getState().reset();
  useEditor.getState().load(doc, { saved: !!file?.name });
  useFile.getState().setFile(meta.fileName, file?.ref ?? null);
  useUi.getState().setWelcome(false);
  useUi.getState().setPreview(false);
  requestAnimationFrame(() => fitView(doc));
  return id;
}

/** Delete a plan permanently. Without plans the start view appears again. */
export function deletePlan(id: string): void {
  const { plans, activeId } = usePlans.getState();
  const idx = plans.findIndex((p) => p.id === id);
  if (idx < 0) return;
  removePlan(id);
  sessions.delete(id);
  const rest = plans.filter((p) => p.id !== id);
  if (id !== activeId) {
    usePlans.setState({ plans: rest });
    persistIndex();
    return;
  }
  const neighbor = rest[idx] ?? rest[idx - 1] ?? null;
  usePlans.setState({ plans: rest, activeId: neighbor?.id ?? null });
  persistIndex();
  if (neighbor) {
    loadIntoEditor(neighbor.id);
  } else {
    activeController?.cancel();
    useEditor.getState().load(createEmptyDocument(tr('name.untitled')));
    useFile.getState().setFile(null, null);
    useUi.getState().setWelcome(true);
  }
}

export async function confirmDeletePlan(id: string): Promise<void> {
  const meta = usePlans.getState().plans.find((p) => p.id === id);
  if (!meta) return;
  const name = id === usePlans.getState().activeId ? useEditor.getState().doc.meta.name : meta.name;
  const ok = await useFile.getState().ask({
    title: tr('tabs.deleteTitle', { name }),
    body: tr('tabs.deleteBody'),
    confirm: tr('tabs.deleteConfirm'),
    cancel: tr('confirm.cancel'),
    danger: true,
  });
  if (!ok) return;
  deletePlan(id);
  useUi.getState().toast(tr('tabs.deleted', { name }), 'info');
}

export function cyclePlan(dir: 1 | -1): void {
  const { plans, activeId } = usePlans.getState();
  if (plans.length < 2 || !activeId) return;
  const i = plans.findIndex((p) => p.id === activeId);
  activatePlan(plans[(i + dir + plans.length) % plans.length].id);
}

export function movePlan(id: string, to: number): void {
  const { plans } = usePlans.getState();
  const from = plans.findIndex((p) => p.id === id);
  if (from < 0) return;
  const next = plans.slice();
  const [m] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, m);
  usePlans.setState({ plans: next });
  persistIndex();
}

/** Unsaved file changes in the active plan? */
export const activeDirty = (): boolean => !!useFile.getState().fileName && isDirty(useEditor.getState());
