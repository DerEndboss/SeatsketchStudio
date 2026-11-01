import {
  ChevronDown,
  Download,
  Ellipsis,
  Eye,
  FilePlus,
  FolderOpen,
  Grid3x3,
  Keyboard,
  LayoutGrid,
  Magnet,
  Maximize,
  Minus,
  Plus,
  Redo2,
  RulerDimensionLine,
  Save,
  Settings,
  Undo2,
  Users,
} from 'lucide-react';
import { useEditor, isDirty } from '../state/editorStore';
import { useUi } from '../state/uiStore';
import { useFile } from '../state/fileStore';
import { useT } from '../i18n';
import { zoomPercent } from '../geometry/coordinateSystem';
import { SNAP_STEPS, formatLengthShort } from '../geometry/measurements';
import { shortcutLabel, useKeymap } from '../editor/keymap';
import * as cmd from '../editor/commands';
import { Button, IconButton, cx } from './ui/Button';
import { MenuButton, type MenuItem } from './ui/Overlay';
import { Tooltip } from './ui/Tooltip';
import { TextField } from './ui/Fields';

function SaveStatus() {
  const t = useT();
  const dirty = useEditor(isDirty);
  const fileName = useFile((s) => s.fileName);
  const saving = useFile((s) => s.saving);
  const overrides = useKeymap((s) => s.overrides);
  const saveKey = shortcutLabel('save', overrides) ?? '—';
  const [dot, text, tip] = saving
    ? ['bg-accent animate-pulse', t('status.saving'), '']
    : !fileName
      ? ['bg-faint', t('status.local'), t('status.localTip', { key: saveKey })]
      : dirty
        ? ['bg-warn', t('status.unsaved'), t('status.unsavedTip', { file: fileName, key: saveKey })]
        : ['bg-success', t('status.saved'), fileName];
  return (
    <Tooltip label={tip || text} disabled={!tip}>
      <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted" data-testid="save-status">
        <span className={cx('h-1.5 w-1.5 rounded-full', dot)} />
        {text}
      </span>
    </Tooltip>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-line" />;
}

export function TopBar() {
  const t = useT();
  const name = useEditor((s) => s.doc.meta.name);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const settings = useEditor((s) => s.doc.settings);
  const zoom = useUi((s) => zoomPercent(s.viewport));
  const recent = useFile((s) => s.recent);
  const overrides = useKeymap((s) => s.overrides);
  const ui = useUi.getState;
  const sc = (id: string) => shortcutLabel(id, overrides);

  const fileMenu = (): MenuItem[] => [
    { label: t('cmd.newPlan'), icon: FilePlus, shortcut: sc('newPlan'), onSelect: () => cmd.runCommand('newPlan') },
    { label: 'Templates', icon: LayoutGrid, onSelect: () => ui().setTemplatesOpen(true) },
    { label: t('cmd.open'), icon: FolderOpen, shortcut: sc('open'), onSelect: () => void cmd.openProject() },
    { label: t('cmd.save'), icon: Save, shortcut: sc('save'), onSelect: () => void cmd.saveProject(false) },
    { label: t('cmd.saveAs'), shortcut: sc('saveAs'), onSelect: () => void cmd.saveProject(true) },
    ...(recent.length
      ? [
          { separator: true, label: '' },
          { heading: true, label: t('menu.recent') },
          ...recent.slice(0, 6).map((r) => ({ label: r.name, onSelect: () => void cmd.openRecent(r.path) })),
        ]
      : []),
    { separator: true, label: '' },
    { heading: true, label: t('menu.unit') },
    {
      label: t('menu.unitM'),
      checked: settings.unit === 'm',
      onSelect: () => useEditor.getState().apply((d) => ({ ...d, settings: { ...d.settings, unit: 'm' } }), { history: false }),
    },
    {
      label: t('menu.unitCm'),
      checked: settings.unit === 'cm',
      onSelect: () => useEditor.getState().apply((d) => ({ ...d, settings: { ...d.settings, unit: 'cm' } }), { history: false }),
    },
    { separator: true, label: '' },
    { label: t('cmd.fullscreen'), icon: Maximize, shortcut: sc('fullscreen'), onSelect: cmd.toggleFullscreen },
    { label: t('cmd.settings'), icon: Settings, shortcut: sc('settings'), onSelect: () => ui().openSettings('general') },
    { label: t('cmd.shortcuts'), icon: Keyboard, shortcut: sc('shortcuts'), onSelect: () => ui().openSettings('shortcuts') },
  ];

  const snapMenu = (): MenuItem[] => [
    { label: t(settings.snap ? 'top.snapDisable' : 'top.snapEnable'), icon: Magnet, shortcut: sc('toggleSnap'), onSelect: () => cmd.toggleSetting('snap') },
    { separator: true, label: '' },
    { heading: true, label: t('top.snapStep') },
    ...SNAP_STEPS.map((s) => ({
      label: s.label,
      checked: Math.abs(s.value - settings.snapStep) < 1e-9,
      onSelect: () =>
        useEditor.getState().apply((d) => ({ ...d, settings: { ...d.settings, snapStep: s.value, snap: true } }), { history: false }),
    })),
  ];

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel pl-3 pr-2" data-testid="topbar">
      <img src="./logo.png" alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0 select-none" draggable={false} />
      <div className="flex min-w-0 items-center gap-3">
        <TextField
          value={name}
          onCommit={cmd.renameDocument}
          focusKey={useUi((s) => (s.focusRequest?.field === 'project-name' ? String(s.focusRequest.nonce) : undefined))}
          aria-label={t('top.projectName')}
          data-testid="project-name"
          className="h-7 w-[220px] max-w-[24vw] border-transparent bg-transparent px-1.5 text-[13px] font-semibold hover:border-line focus:bg-field"
        />
        <SaveStatus />
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <IconButton icon={Undo2} label={t('cmd.undo')} shortcut={sc('undo')} disabled={!canUndo} onClick={cmd.undo} data-testid="undo" />
        <IconButton icon={Redo2} label={t('cmd.redo')} shortcut={sc('redo')} disabled={!canRedo} onClick={cmd.redo} data-testid="redo" />
        <Divider />
        <IconButton icon={Minus} label={t('cmd.zoomOut')} shortcut={sc('zoomOut')} size="sm" onClick={() => cmd.zoomBy(0.8)} />
        <Tooltip label={t('top.zoomFit')} shortcut={sc('zoomFit')}>
          <button
            type="button"
            onClick={() => cmd.fitView()}
            className="h-7 w-12 rounded-md text-[12px] font-medium tabular-nums text-ink hover:bg-hover"
            data-testid="zoom"
          >
            {zoom} %
          </button>
        </Tooltip>
        <IconButton icon={Plus} label={t('cmd.zoomIn')} shortcut={sc('zoomIn')} size="sm" onClick={() => cmd.zoomBy(1.25)} />
        <Divider />
        <IconButton icon={Grid3x3} label={t('top.grid')} shortcut={sc('toggleGrid')} active={settings.showGrid} activeStyle="soft" onClick={() => cmd.toggleSetting('showGrid')} data-testid="toggle-grid" />
        <MenuButton items={snapMenu}>
          {(open, toggle) => (
            <Tooltip label={t('top.snapValue', { value: settings.snap ? SNAP_STEPS.find((s) => Math.abs(s.value - settings.snapStep) < 1e-9)?.label ?? formatLengthShort(settings.snapStep, 'cm') : t('top.snapOff') })}>
              <button
                type="button"
                onClick={toggle}
                aria-label={t('top.snap')}
                aria-expanded={open}
                data-testid="toggle-snap"
                className={cx(
                  'flex h-8 items-center gap-0.5 rounded-md px-1.5 transition-colors',
                  settings.snap ? 'bg-accent-soft text-accent hover:brightness-95' : 'text-muted hover:bg-hover hover:text-ink',
                )}
              >
                <Magnet size={16} strokeWidth={1.75} />
                <ChevronDown size={12} strokeWidth={2} />
              </button>
            </Tooltip>
          )}
        </MenuButton>
        <IconButton icon={RulerDimensionLine} label={t('top.dims')} shortcut={sc('toggleDims')} active={settings.showDimensions} activeStyle="soft" onClick={() => cmd.toggleSetting('showDimensions')} data-testid="toggle-dimensions" />
        <Divider />
        <Button variant="secondary" icon={Users} onClick={() => ui().openDialog('distribute')} data-testid="open-distribute" className="mr-1">
          {t('top.distribute')}
        </Button>
        <IconButton icon={Eye} label={t('cmd.preview')} shortcut={sc('preview')} onClick={() => ui().setPreview(true)} data-testid="preview" />
        <Button variant="primary" icon={Download} onClick={() => ui().openExport()} data-testid="open-export" className="mx-1">
          {t('top.export')}
        </Button>
        <IconButton icon={Settings} label={t('cmd.settings')} shortcut={sc('settings')} onClick={() => ui().openSettings('general')} data-testid="open-settings" />
        <MenuButton items={fileMenu} align="end">
          {(open, toggle) => <IconButton icon={Ellipsis} label={t('top.menu')} active={open} activeStyle="soft" onClick={toggle} data-testid="menu" />}
        </MenuButton>
      </div>
    </header>
  );
}
