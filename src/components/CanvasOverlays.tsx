import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowUpToLine, CircleAlert, CircleCheck, ClipboardPaste, Copy, CopyPlus, Group, Info, Lock, LockOpen, Maximize,
  MousePointer2, Scissors, Trash, TriangleAlert, Ungroup, Users, X,
} from 'lucide-react';
import { useEditor } from '../state/editorStore';
import { useUi } from '../state/uiStore';
import { useT } from '../i18n';
import { findObject } from '../state/lookup';
import { assignGuestByName, seatLabel } from '../editor/objects/tableOps';
import { shortcutLabel, useKeymap } from '../editor/keymap';
import * as cmd from '../editor/commands';
import { FloatingMenu, type MenuItem } from './ui/Overlay';
import { cx } from './ui/Button';

export function CanvasContextMenu() {
  const t = useT();
  const menu = useUi((s) => s.contextMenu);
  const overrides = useKeymap((s) => s.overrides);
  const sc = (id: string) => shortcutLabel(id, overrides);
  const close = () => useUi.getState().setContextMenu(null);
  if (!menu) return null;
  const { selection, doc } = useEditor.getState();
  const objs = selection.map((id) => findObject(doc, id)).filter((o) => !!o);
  const locked = objs.length > 0 && objs.every((o) => o!.locked);
  const grouped = objs.some((o) => o!.groupId);
  const tables = objs.filter((o) => o!.type === 'table').length;
  const items: MenuItem[] = menu.onObject
    ? [
        { label: t('cmd.copy'), icon: Copy, shortcut: sc('copy'), onSelect: cmd.copySelection },
        { label: t('cmd.cut'), icon: Scissors, shortcut: sc('cut'), onSelect: cmd.cutSelection },
        { label: t('cmd.paste'), icon: ClipboardPaste, shortcut: sc('paste'), disabled: !cmd.hasClipboard(), onSelect: () => cmd.paste(menu.world) },
        { label: t('cmd.duplicate'), icon: CopyPlus, shortcut: sc('duplicate'), onSelect: cmd.duplicateSelection },
        { separator: true, label: '' },
        ...(tables > 0 ? [{ label: tables > 1 ? t('ctx.distributeTables') : t('cmd.distribute'), icon: Users, onSelect: () => useUi.getState().openDialog('distribute') }, { separator: true, label: '' }] : []),
        { label: t('cmd.front'), icon: ArrowUpToLine, shortcut: sc('front'), onSelect: () => cmd.zOrder('front') },
        { label: t('cmd.back'), icon: ArrowDownToLine, shortcut: sc('back'), onSelect: () => cmd.zOrder('back') },
        objs.length > 1 && !grouped
          ? { label: t('cmd.group'), icon: Group, shortcut: sc('group'), onSelect: cmd.group }
          : grouped
            ? { label: t('cmd.ungroup'), icon: Ungroup, shortcut: sc('ungroup'), onSelect: cmd.ungroup }
            : { label: t('cmd.group'), icon: Group, disabled: true },
        { label: t(locked ? 'insp.unlock' : 'insp.lock'), icon: locked ? LockOpen : Lock, shortcut: sc('lock'), onSelect: cmd.toggleLock },
        { separator: true, label: '' },
        { label: t('cmd.delete'), icon: Trash, shortcut: sc('delete'), danger: true, disabled: locked, onSelect: cmd.deleteSelection },
      ]
    : [
        { label: t('cmd.paste'), icon: ClipboardPaste, shortcut: sc('paste'), disabled: !cmd.hasClipboard(), onSelect: () => cmd.paste(menu.world) },
        { label: t('cmd.selectAll'), icon: MousePointer2, shortcut: sc('selectAll'), onSelect: cmd.selectAll },
        { separator: true, label: '' },
        { label: t('cmd.zoomFit'), icon: Maximize, shortcut: sc('zoomFit'), onSelect: () => cmd.fitView() },
        { label: t('cmd.distribute'), icon: Users, onSelect: () => useUi.getState().openDialog('distribute') },
      ];
  return <FloatingMenu x={menu.x} y={menu.y} items={items} onClose={close} />;
}

export function Toasts() {
  const t = useT();
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-[95] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite" role="status">
      {toasts.map((toast) => {
        const Icon = toast.tone === 'success' ? CircleCheck : toast.tone === 'warning' ? TriangleAlert : toast.tone === 'error' ? CircleAlert : Info;
        return (
          <div key={toast.id} className="anim-pop pointer-events-auto flex max-w-[520px] items-start gap-2.5 rounded-lg bg-tip py-2 pl-3 pr-2 text-[12.5px] text-tip-ink shadow-pop">
            <Icon
              size={15}
              strokeWidth={2}
              className={cx(
                'mt-px shrink-0',
                toast.tone === 'success' ? 'text-[#9fd28c] dark:text-[#4f8a43]' : toast.tone === 'warning' ? 'text-[#efb06c] dark:text-[#b25e1c]' : toast.tone === 'error' ? 'text-[#f0907f] dark:text-[#c4402f]' : 'text-[#a9c0ec] dark:text-[#3e6bc8]',
              )}
            />
            <span className="leading-snug">{toast.text}</span>
            <button type="button" aria-label={t('app.close')} onClick={() => dismiss(toast.id)} className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100">
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function GuestPopover() {
  const t = useT();
  const pop = useUi((s) => s.guestPopover);
  const doc = useEditor((s) => s.doc);
  const listId = useId();
  const ref = useRef<HTMLInputElement>(null);
  const chair = pop ? findObject(doc, pop.chairId) : undefined;
  const current = chair?.type === 'chair' && chair.guestId ? doc.guests.find((g) => g.id === chair.guestId)?.name ?? '' : '';
  const [value, setValue] = useState(current);
  const done = useRef(false);

  useEffect(() => {
    setValue(current);
    done.current = false;
    if (pop) requestAnimationFrame(() => ref.current?.select());
  }, [pop?.chairId, current]);

  if (!pop || !chair || chair.type !== 'chair') return null;
  const close = () => useUi.getState().setGuestPopover(null);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    if (value.trim() !== current) useEditor.getState().apply((d) => assignGuestByName(d, chair.id, value));
    close();
  };

  return (
    <div className="anim-pop fixed z-[85] w-56 -translate-x-1/2 rounded-lg border border-line bg-canvas p-2 shadow-pop" style={{ left: pop.x, top: pop.y + 22 }} data-testid="guest-popover">
      <div className="mb-1.5 px-0.5 text-[11px] font-medium text-muted">{seatLabel(doc, chair)}</div>
      <input
        ref={ref}
        value={value}
        list={listId}
        autoFocus
        placeholder={t('chair.guestName')}
        aria-label={t('chair.guestName')}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            done.current = true;
            close();
          }
        }}
        className="h-8 w-full rounded-md border border-accent bg-field px-2 text-[13px] text-ink outline-none ring-2 ring-accent/20"
      />
      <datalist id={listId}>
        {doc.guests.map((g) => <option key={g.id} value={g.name} />)}
      </datalist>
      <div className="mt-1.5 px-0.5 text-[10.5px] text-faint">{t('chair.popoverHint')}</div>
    </div>
  );
}

export function PreviewBar() {
  const t = useT();
  const preview = useUi((s) => s.preview);
  if (!preview) return null;
  return (
    <div className="anim-pop fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-canvas/95 py-1.5 pl-4 pr-1.5 text-[12.5px] shadow-float backdrop-blur">
      <span className="text-muted">{t('preview.text')}</span>
      <button type="button" className="h-7 rounded-full bg-accent px-3 font-medium text-accent-ink" onClick={() => useUi.getState().setPreview(false)}>
        {t('preview.exit')}
      </button>
    </div>
  );
}
