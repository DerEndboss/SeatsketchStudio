import { create } from 'zustand';
import type { Viewport } from '../geometry/coordinateSystem';
import type { Vec2 } from '../geometry/vec';
import type { TablePresetId } from '../editor/objects/factory';
import type { ThemeId } from '../editor/canvas/palette';

export type ToolId =
  | 'select'
  | 'hand'
  | 'room'
  | 'wall'
  | 'door'
  | 'window'
  | 'column'
  | 'zone'
  | 'table'
  | 'freehand'
  | 'chair'
  | 'measure'
  | 'text';

export type ThemeSetting = 'system' | ThemeId;
export type DialogId = 'distribute' | 'export' | 'settings';
export type PanelId = 'inspect' | 'guests';
export type SettingsTab = 'general' | 'shortcuts' | 'about';
export type ExportFormat = 'pdf' | 'png' | 'svg' | 'csv';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface ContextMenuState {
  x: number;
  y: number;
  world: Vec2;
  onObject: boolean;
}

export interface GuestPopoverState {
  chairId: string;
  x: number;
  y: number;
}

interface UiState {
  tool: ToolId;
  tablePreset: TablePresetId;
  viewport: Viewport;
  stageSize: { width: number; height: number };
  cursor: Vec2 | null;
  theme: ThemeSetting;
  systemDark: boolean;
  preview: boolean;
  panel: PanelId;
  dialog: DialogId | null;
  settingsTab: SettingsTab;
  exportFormat: ExportFormat;
  /** Template gallery ("+" tab or first start) */
  templatesOpen: boolean;
  toolbarExpanded: boolean;
  toasts: Toast[];
  contextMenu: ContextMenuState | null;
  guestPopover: GuestPopoverState | null;
  focusRequest: { field: string; nonce: number } | null;
  spaceDown: boolean;
  ctrlDown: boolean;

  setTool: (tool: ToolId) => void;
  setTablePreset: (p: TablePresetId) => void;
  setViewport: (v: Viewport) => void;
  setStageSize: (width: number, height: number) => void;
  setCursor: (p: Vec2 | null) => void;
  setTheme: (t: ThemeSetting) => void;
  setSystemDark: (dark: boolean) => void;
  setPreview: (on: boolean) => void;
  setPanel: (p: PanelId) => void;
  openDialog: (d: DialogId | null) => void;
  openSettings: (tab?: SettingsTab) => void;
  openExport: (format?: ExportFormat) => void;
  setTemplatesOpen: (open: boolean) => void;
  setToolbarExpanded: (open: boolean) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  setContextMenu: (m: ContextMenuState | null) => void;
  setGuestPopover: (p: GuestPopoverState | null) => void;
  requestFocus: (field: string) => void;
  setSpaceDown: (down: boolean) => void;
  setCtrlDown: (down: boolean) => void;
}

const THEME_KEY = 'seatsketch:theme';
const TOOLBAR_KEY = 'seatsketch:toolbar';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readTheme(): ThemeSetting {
  const v = read(THEME_KEY);
  if (v === 'light') return 'beige';
  if (v === 'dark') return 'espresso';
  if (v === 'system' || v === 'beige' || v === 'espresso' || v === 'sage' || v === 'midnight') return v;
  return 'beige';
}

function readSystemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

let toastSeq = 1;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
const browser = typeof window !== 'undefined';

export const useUi = create<UiState>()((set, get) => ({
  tool: 'select',
  tablePreset: 'round',
  viewport: { x: 0, y: 0, scale: 60 },
  stageSize: { width: 800, height: 600 },
  cursor: null,
  theme: browser ? readTheme() : 'system',
  systemDark: browser ? readSystemDark() : false,
  preview: false,
  panel: 'inspect',
  dialog: null,
  settingsTab: 'general',
  exportFormat: 'pdf',
  templatesOpen: false,
  toolbarExpanded: browser ? read(TOOLBAR_KEY) === 'open' : false,
  toasts: [],
  contextMenu: null,
  guestPopover: null,
  focusRequest: null,
  spaceDown: false,
  ctrlDown: false,

  setTool: (tool) => set({ tool, templatesOpen: false, contextMenu: null }),
  setTablePreset: (tablePreset) => set({ tablePreset, tool: 'table' }),
  setViewport: (viewport) => set({ viewport }),
  setStageSize: (width, height) => {
    const s = get().stageSize;
    if (s.width !== width || s.height !== height) set({ stageSize: { width, height } });
  },
  setCursor: (cursor) => set({ cursor }),
  setTheme: (theme) => {
    write(THEME_KEY, theme);
    set({ theme });
  },
  setSystemDark: (systemDark) => set({ systemDark }),
  setPreview: (preview) => set({ preview, contextMenu: null, guestPopover: null }),
  setPanel: (panel) => set({ panel }),
  openDialog: (dialog) => set({ dialog, contextMenu: null }),
  openSettings: (tab = 'general') => set({ dialog: 'settings', settingsTab: tab, contextMenu: null }),
  openExport: (format) => set({ dialog: 'export', exportFormat: format ?? get().exportFormat, contextMenu: null }),
  setTemplatesOpen: (templatesOpen) => set({ templatesOpen, panel: 'inspect', contextMenu: null, guestPopover: null }),
  setToolbarExpanded: (toolbarExpanded) => {
    write(TOOLBAR_KEY, toolbarExpanded ? 'open' : 'closed');
    set({ toolbarExpanded });
  },
  toast: (text, tone = 'info') => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] });
    toastTimers.set(id, setTimeout(() => get().dismissToast(id), tone === 'error' || tone === 'warning' ? 6000 : 3200));
  },
  dismissToast: (id) => {
    const t = toastTimers.get(id);
    if (t) clearTimeout(t);
    toastTimers.delete(id);
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },
  setContextMenu: (contextMenu) => set({ contextMenu }),
  setGuestPopover: (guestPopover) => set({ guestPopover }),
  // Focus request to the inspector; the properties tab must be visible for it
  requestFocus: (field) => set({ focusRequest: { field, nonce: Date.now() }, panel: 'inspect' }),
  setSpaceDown: (spaceDown) => {
    if (get().spaceDown !== spaceDown) set({ spaceDown });
  },
  setCtrlDown: (ctrlDown) => {
    if (get().ctrlDown !== ctrlDown) set({ ctrlDown });
  },
}));

export const resolvedTheme = (s: { theme: ThemeSetting; systemDark: boolean }): ThemeId =>
  s.theme === 'system' ? (s.systemDark ? 'espresso' : 'beige') : s.theme;
