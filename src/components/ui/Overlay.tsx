import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { tr } from '../../i18n';
import { cx } from './Button';

/* --------------------------------------------- Dialog --------------------------------------------- */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  testId?: string;
  canClose?: boolean;
}

export function Dialog({ open, onClose, title, description, children, footer, width = 420, testId, canClose = true }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = requestAnimationFrame(() => {
      const root = ref.current;
      const first =
        root?.querySelector<HTMLElement>('[data-autofocus]') ??
        root?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
      first?.focus();
      if (first instanceof HTMLInputElement) first.select();
    });
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-key-capture]')) return;
      if (e.key === 'Escape' && canClose) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (el) => !el.hasAttribute('disabled'),
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, canClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="anim-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/25 p-6 backdrop-blur-[1px] dark:bg-black/50"
      onPointerDown={(e) => canClose && e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className="anim-pop flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-canvas shadow-pop"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-[12px] leading-snug text-muted">{description}</p>}
          </div>
          {canClose && (
            <button type="button" data-close aria-label={tr('app.close')} onClick={onClose} className="-mr-1 rounded-md p-1 text-muted hover:bg-hover hover:text-ink">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="scroll-thin min-h-0 overflow-y-auto px-5 py-3">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------- Menus ---------------------------------------------- */

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  separator?: boolean;
  /** Section heading instead of an item */
  heading?: boolean;
}

/** Floating menu at a screen position (context menu) or below an anchor. */
export function FloatingMenu({ x, y, items, onClose, minWidth = 210 }: { x: number; y: number; items: MenuItem[]; onClose: () => void; minWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
  }, [x, y]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        const n = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
        btns[n]?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="anim-pop fixed z-[90] rounded-lg border border-line bg-canvas p-1 shadow-pop"
      style={{ left: pos.x, top: pos.y, minWidth }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : it.heading ? (
          <div key={i} className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
            {it.label}
          </div>
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect?.();
            }}
            className={cx(
              'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[12.5px] outline-none transition-colors disabled:opacity-35',
              it.danger ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft' : 'text-ink hover:bg-hover focus:bg-hover',
            )}
          >
            <span className="flex w-4 justify-center text-muted">
              {it.icon ? <it.icon size={15} strokeWidth={1.75} className={it.danger ? 'text-danger' : ''} /> : it.checked ? '✓' : null}
            </span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.shortcut && <span className="text-[11px] text-faint">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** Button that opens a menu below it. */
export function MenuButton({ items, children, align = 'start' }: { items: () => MenuItem[]; children: (open: boolean, toggle: (e: React.MouseEvent<HTMLElement>) => void) => ReactNode; align?: 'start' | 'end' }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    if (anchor) {
      setAnchor(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setAnchor({ x: align === 'end' ? r.right - 230 : r.left, y: r.bottom + 6 });
  };
  return (
    <>
      {children(!!anchor, toggle)}
      {anchor && <FloatingMenu x={anchor.x} y={anchor.y} items={items()} onClose={() => setAnchor(null)} minWidth={230} />}
    </>
  );
}
