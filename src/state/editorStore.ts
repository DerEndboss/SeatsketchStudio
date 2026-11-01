import { create } from 'zustand';
import type { SeatDocument } from '../types/document';
import { createEmptyDocument } from '../editor/objects/factory';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;

export interface ApplyOptions {
  /** Consecutive changes with the same key (e.g. slider, typing) = one undo step */
  coalesce?: string;
  /** false = changes the document without creating an undo step (e.g. view options) */
  history?: boolean;
}

export interface EditorState {
  doc: SeatDocument;
  past: SeatDocument[];
  future: SeatDocument[];
  selection: string[];
  /** State at the last save; unsaved = doc !== savedDoc */
  savedDoc: SeatDocument | null;
  /** Starting state of a running interaction (dragging, rotating …) */
  txBase: SeatDocument | null;
  lastCoalesce: { key: string; at: number } | null;

  apply: (recipe: (doc: SeatDocument) => SeatDocument, opts?: ApplyOptions) => void;
  begin: () => void;
  preview: (next: SeatDocument) => void;
  commit: () => void;
  cancel: () => void;
  undo: () => void;
  redo: () => void;
  setSelection: (ids: readonly string[]) => void;
  load: (doc: SeatDocument, opts?: { saved?: boolean }) => void;
  markSaved: (doc?: SeatDocument) => void;
}

function pushPast(past: SeatDocument[], doc: SeatDocument): SeatDocument[] {
  const next = past.length >= HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT + 1) : past.slice();
  next.push(doc);
  return next;
}

/** Equal if only new wrappers were created around the same objects (e.g. map without changes). */
export function sameDocument(a: SeatDocument, b: SeatDocument): boolean {
  if (a === b) return true;
  if (a.meta !== b.meta || a.settings !== b.settings || a.guests !== b.guests || a.preserved !== b.preserved || a.version !== b.version) {
    return false;
  }
  const x = a.objects;
  const y = b.objects;
  if (x === y) return true;
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

function validSelection(doc: SeatDocument, ids: readonly string[]): string[] {
  if (ids.length === 0) return [];
  const exists = new Set(doc.objects.map((o) => o.id));
  return ids.filter((id) => exists.has(id));
}

export const useEditor = create<EditorState>()((set, get) => ({
  doc: createEmptyDocument(),
  past: [],
  future: [],
  selection: [],
  savedDoc: null,
  txBase: null,
  lastCoalesce: null,

  apply: (recipe, opts = {}) => {
    const s = get();
    const next = recipe(s.doc);
    if (sameDocument(next, s.doc)) return;
    if (s.txBase || opts.history === false) {
      set({ doc: next, selection: validSelection(next, s.selection) });
      return;
    }
    const now = Date.now();
    const merge =
      opts.coalesce !== undefined &&
      s.lastCoalesce !== null &&
      s.lastCoalesce.key === opts.coalesce &&
      now - s.lastCoalesce.at < COALESCE_MS &&
      s.past.length > 0;
    set({
      doc: next,
      past: merge ? s.past : pushPast(s.past, s.doc),
      future: [],
      selection: validSelection(next, s.selection),
      lastCoalesce: opts.coalesce !== undefined ? { key: opts.coalesce, at: now } : null,
    });
  },

  begin: () => {
    const s = get();
    if (!s.txBase) set({ txBase: s.doc });
  },

  preview: (next) => {
    if (!get().txBase) return;
    set({ doc: next });
  },

  commit: () => {
    const s = get();
    if (!s.txBase) return;
    if (sameDocument(s.doc, s.txBase)) {
      set({ doc: s.txBase, txBase: null });
      return;
    }
    set({
      past: pushPast(s.past, s.txBase),
      future: [],
      txBase: null,
      lastCoalesce: null,
      selection: validSelection(s.doc, s.selection),
    });
  },

  cancel: () => {
    const s = get();
    if (!s.txBase) return;
    set({ doc: s.txBase, txBase: null, selection: validSelection(s.txBase, s.selection) });
  },

  undo: () => {
    const s = get();
    if (s.txBase || s.past.length === 0) return;
    const prev = s.past[s.past.length - 1];
    set({
      doc: prev,
      past: s.past.slice(0, -1),
      future: [s.doc, ...s.future],
      selection: validSelection(prev, s.selection),
      lastCoalesce: null,
    });
  },

  redo: () => {
    const s = get();
    if (s.txBase || s.future.length === 0) return;
    const next = s.future[0];
    set({
      doc: next,
      past: pushPast(s.past, s.doc),
      future: s.future.slice(1),
      selection: validSelection(next, s.selection),
      lastCoalesce: null,
    });
  },

  setSelection: (ids) => {
    const cur = get().selection;
    if (cur.length === ids.length && cur.every((id, i) => id === ids[i])) return;
    set({ selection: [...ids] });
  },

  load: (doc, opts = {}) => {
    set({
      doc,
      past: [],
      future: [],
      selection: [],
      txBase: null,
      lastCoalesce: null,
      savedDoc: opts.saved ? doc : null,
    });
  },

  markSaved: (doc) => set({ savedDoc: doc ?? get().doc }),
}));

export const isDirty = (s: Pick<EditorState, 'doc' | 'savedDoc'>): boolean => s.doc !== s.savedDoc;
