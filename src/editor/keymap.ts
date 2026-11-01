import { create } from 'zustand';
import { tr, type MsgKey } from '../i18n';
import type { ToolId } from '../state/uiStore';

/*
 * Commands with keyboard shortcuts. Each binding is a string like "Mod+Shift+Z"
 * (Mod = Ctrl or Cmd). Custom bindings override the defaults and are
 * stored locally; an empty list means "disabled".
 */

export type CommandGroup = 'tools' | 'edit' | 'arrange' | 'view' | 'file';

export interface CommandDef {
  id: string;
  group: CommandGroup;
  label: MsgKey;
  keys: string[];
  tool?: ToolId;
}

const tool = (id: ToolId, label: MsgKey, key: string): CommandDef => ({ id: `tool.${id}`, group: 'tools', label, keys: [key], tool: id });

export const COMMANDS: readonly CommandDef[] = [
  tool('select', 'tool.select', 'V'),
  tool('hand', 'tool.hand', 'H'),
  tool('room', 'tool.room', 'R'),
  tool('wall', 'tool.wall', 'W'),
  tool('door', 'tool.door', 'D'),
  tool('window', 'tool.window', 'F'),
  tool('column', 'tool.column', 'S'),
  tool('zone', 'tool.zone', 'A'),
  tool('table', 'tool.table', 'T'),
  tool('freehand', 'tool.freehand', 'P'),
  tool('chair', 'tool.chair', 'C'),
  tool('measure', 'tool.measure', 'M'),
  tool('text', 'tool.text', 'L'),

  { id: 'undo', group: 'edit', label: 'cmd.undo', keys: ['Mod+Z'] },
  { id: 'redo', group: 'edit', label: 'cmd.redo', keys: ['Mod+Shift+Z', 'Mod+Y'] },
  { id: 'cut', group: 'edit', label: 'cmd.cut', keys: ['Mod+X'] },
  { id: 'copy', group: 'edit', label: 'cmd.copy', keys: ['Mod+C'] },
  { id: 'paste', group: 'edit', label: 'cmd.paste', keys: ['Mod+V'] },
  { id: 'duplicate', group: 'edit', label: 'cmd.duplicate', keys: ['Mod+D'] },
  { id: 'delete', group: 'edit', label: 'cmd.delete', keys: ['Delete', 'Backspace'] },
  { id: 'selectAll', group: 'edit', label: 'cmd.selectAll', keys: ['Mod+A'] },
  { id: 'group', group: 'edit', label: 'cmd.group', keys: ['Mod+G'] },
  { id: 'ungroup', group: 'edit', label: 'cmd.ungroup', keys: ['Mod+Shift+G'] },
  { id: 'lock', group: 'edit', label: 'cmd.lock', keys: ['Mod+Shift+L'] },
  { id: 'distribute', group: 'edit', label: 'cmd.distribute', keys: ['Shift+D'] },

  { id: 'forward', group: 'arrange', label: 'cmd.forward', keys: ['Mod+]'] },
  { id: 'backward', group: 'arrange', label: 'cmd.backward', keys: ['Mod+['] },
  { id: 'front', group: 'arrange', label: 'cmd.front', keys: ['Mod+Alt+]'] },
  { id: 'back', group: 'arrange', label: 'cmd.back', keys: ['Mod+Alt+['] },
  { id: 'rotateCw', group: 'arrange', label: 'cmd.rotateCw', keys: ['E'] },
  { id: 'rotateCcw', group: 'arrange', label: 'cmd.rotateCcw', keys: ['Q'] },
  { id: 'rotateCwFine', group: 'arrange', label: 'cmd.rotateCwFine', keys: ['Shift+E'] },
  { id: 'rotateCcwFine', group: 'arrange', label: 'cmd.rotateCcwFine', keys: ['Shift+Q'] },
  { id: 'alignLeft', group: 'arrange', label: 'cmd.alignLeft', keys: ['Alt+A'] },
  { id: 'alignHCenter', group: 'arrange', label: 'cmd.alignHCenter', keys: ['Alt+H'] },
  { id: 'alignRight', group: 'arrange', label: 'cmd.alignRight', keys: ['Alt+D'] },
  { id: 'alignTop', group: 'arrange', label: 'cmd.alignTop', keys: ['Alt+W'] },
  { id: 'alignVCenter', group: 'arrange', label: 'cmd.alignVCenter', keys: ['Alt+V'] },
  { id: 'alignBottom', group: 'arrange', label: 'cmd.alignBottom', keys: ['Alt+S'] },
  { id: 'distributeH', group: 'arrange', label: 'cmd.distributeH', keys: ['Alt+Shift+H'] },
  { id: 'distributeV', group: 'arrange', label: 'cmd.distributeV', keys: ['Alt+Shift+V'] },

  { id: 'zoomIn', group: 'view', label: 'cmd.zoomIn', keys: ['Mod+=', 'Mod++'] },
  { id: 'zoomOut', group: 'view', label: 'cmd.zoomOut', keys: ['Mod+-'] },
  { id: 'zoomFit', group: 'view', label: 'cmd.zoomFit', keys: ['Mod+0', '!'] },
  { id: 'zoom100', group: 'view', label: 'cmd.zoom100', keys: ['Mod+1'] },
  { id: 'zoomSelection', group: 'view', label: 'cmd.zoomSelection', keys: ['Mod+2'] },
  { id: 'toggleGrid', group: 'view', label: 'cmd.toggleGrid', keys: ['Shift+G'] },
  { id: 'toggleSnap', group: 'view', label: 'cmd.toggleSnap', keys: ['Shift+N'] },
  { id: 'toggleDims', group: 'view', label: 'cmd.toggleDims', keys: ['Shift+M'] },
  { id: 'toggleTableNames', group: 'view', label: 'cmd.toggleTableNames', keys: ['Shift+T'] },
  { id: 'toggleGuestNames', group: 'view', label: 'cmd.toggleGuestNames', keys: ['Shift+P'] },
  { id: 'toggleToolbar', group: 'view', label: 'cmd.toggleToolbar', keys: ['Mod+B'] },
  { id: 'guests', group: 'view', label: 'cmd.guests', keys: ['G'] },
  { id: 'properties', group: 'view', label: 'cmd.properties', keys: ['I'] },
  { id: 'preview', group: 'view', label: 'cmd.preview', keys: ['Shift+F'] },
  { id: 'fullscreen', group: 'view', label: 'cmd.fullscreen', keys: ['F11'] },
  { id: 'toggleTheme', group: 'view', label: 'cmd.toggleTheme', keys: ['Alt+T'] },

  { id: 'newPlan', group: 'file', label: 'cmd.newPlan', keys: ['Mod+N', 'Alt+N'] },
  { id: 'open', group: 'file', label: 'cmd.open', keys: ['Mod+O'] },
  { id: 'save', group: 'file', label: 'cmd.save', keys: ['Mod+S'] },
  { id: 'saveAs', group: 'file', label: 'cmd.saveAs', keys: ['Mod+Shift+S'] },
  { id: 'export', group: 'file', label: 'cmd.export', keys: ['Mod+E'] },
  { id: 'print', group: 'file', label: 'cmd.print', keys: ['Mod+P'] },
  { id: 'nextTab', group: 'file', label: 'cmd.nextTab', keys: ['Mod+Tab', 'Alt+ArrowRight'] },
  { id: 'prevTab', group: 'file', label: 'cmd.prevTab', keys: ['Mod+Shift+Tab', 'Alt+ArrowLeft'] },
  { id: 'rename', group: 'file', label: 'cmd.rename', keys: ['F2'] },
  { id: 'deletePlan', group: 'file', label: 'cmd.deletePlan', keys: [] },
  { id: 'settings', group: 'file', label: 'cmd.settings', keys: ['Mod+,'] },
  { id: 'shortcuts', group: 'file', label: 'cmd.shortcuts', keys: ['?', 'F1'] },
];

export const GROUPS: readonly CommandGroup[] = ['tools', 'edit', 'arrange', 'view', 'file'];
export const commandById = (id: string): CommandDef | undefined => COMMANDS.find((c) => c.id === id);

/** Binding from a key press: case-insensitive, punctuation without Shift. */
export function eventToBinding(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  const k = e.key;
  if (!k || k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta' || k === 'AltGraph' || k === 'Dead' || k === 'Unidentified') return null;
  let key = k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k;
  if (key === 'Esc') key = 'Escape';
  const symbol = k.length === 1 && !/[\p{L}\p{N}]/u.test(k);
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && !symbol) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

const KEY = 'seatsketch:keymap';

function readOverrides(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : null;
    if (!data || typeof data !== 'object') return {};
    const out: Record<string, string[]> = {};
    for (const [id, v] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string') && commandById(id)) out[id] = v as string[];
    }
    return out;
  } catch {
    return {};
  }
}

interface KeymapState {
  overrides: Record<string, string[]>;
  setKeys: (id: string, keys: string[]) => void;
  reset: (id: string) => void;
  resetAll: () => void;
}

function persist(overrides: Record<string, string[]>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

export const useKeymap = create<KeymapState>()((set, get) => ({
  overrides: typeof window === 'undefined' ? {} : readOverrides(),
  setKeys: (id, keys) => {
    const def = commandById(id);
    if (!def) return;
    const next = { ...get().overrides };
    const same = keys.length === def.keys.length && keys.every((k, i) => k === def.keys[i]);
    if (same) delete next[id];
    else next[id] = keys;
    persist(next);
    set({ overrides: next });
  },
  reset: (id) => {
    const next = { ...get().overrides };
    delete next[id];
    persist(next);
    set({ overrides: next });
  },
  resetAll: () => {
    persist({});
    set({ overrides: {} });
  },
}));

export const keysFor = (id: string, overrides: Record<string, string[]> = useKeymap.getState().overrides): string[] =>
  overrides[id] ?? commandById(id)?.keys ?? [];

const lookupCache = new WeakMap<object, Map<string, string>>();

/** Binding → command (current mapping, cached). */
export function commandForBinding(binding: string): string | undefined {
  const { overrides } = useKeymap.getState();
  let map = lookupCache.get(overrides);
  if (!map) {
    map = new Map();
    for (const c of COMMANDS) for (const k of keysFor(c.id, overrides)) if (!map.has(k)) map.set(k, c.id);
    lookupCache.set(overrides, map);
  }
  return map.get(binding);
}

/** Split "Mod++" correctly (the key itself can be "+"). */
export function splitBinding(b: string): string[] {
  if (b === '+') return ['+'];
  if (b.endsWith('++')) return [...b.slice(0, -2).split('+').filter(Boolean), '+'];
  return b.split('+');
}

/** Readable form: "Mod+Shift+Z" → "Ctrl+⇧+Z" (depending on the language). */
export function formatBinding(binding: string): string {
  return splitBinding(binding)
    .map((p) => {
      if (p === 'Mod') return tr('key.mod');
      if (p === 'Shift') return tr('key.shift');
      if (p === 'Alt') return tr('key.alt');
      const known = `key.${p}` as MsgKey;
      const label = tr(known);
      return label === known ? p : label;
    })
    .join(' ');
}

/** First shortcut of a command for tooltips (or undefined if disabled). */
export function shortcutLabel(id: string, overrides?: Record<string, string[]>): string | undefined {
  const k = keysFor(id, overrides)[0];
  return k ? formatBinding(k) : undefined;
}
