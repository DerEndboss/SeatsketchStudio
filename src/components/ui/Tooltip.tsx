import { type ReactElement, type ReactNode, cloneElement, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  label: ReactNode;
  shortcut?: string;
  side?: 'right' | 'bottom' | 'top' | 'left';
  children: ReactElement<{
    onPointerEnter?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  }>;
  disabled?: boolean;
}

let lastHide = 0;

/** Light tooltip with a keyboard shortcut. Appears after a delay, instantly when moving on to the next one. */
export function Tooltip({ label, shortcut, side = 'bottom', children, disabled }: TooltipProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (disabled) return children;

  const show = (el: Element) => {
    if (timer.current) clearTimeout(timer.current);
    const delay = Date.now() - lastHide < 400 ? 0 : 450;
    timer.current = setTimeout(() => setRect(el.getBoundingClientRect()), delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    if (rect) lastHide = Date.now();
    setRect(null);
  };

  const child = cloneElement(children, {
    onPointerEnter: (e: React.PointerEvent) => {
      children.props.onPointerEnter?.(e);
      if (e.pointerType === 'mouse') show(e.currentTarget);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      children.props.onPointerLeave?.(e);
      hide();
    },
    onPointerDown: (e: React.PointerEvent) => {
      children.props.onPointerDown?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      if ((e.currentTarget as HTMLElement).matches(':focus-visible')) show(e.currentTarget);
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      hide();
    },
  });

  let style: React.CSSProperties = {};
  if (rect) {
    const gap = 8;
    switch (side) {
      case 'right':
        style = { left: rect.right + gap, top: rect.top + rect.height / 2, transform: 'translateY(-50%)' };
        break;
      case 'left':
        style = { right: window.innerWidth - rect.left + gap, top: rect.top + rect.height / 2, transform: 'translateY(-50%)' };
        break;
      case 'top':
        style = { left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + gap, transform: 'translateX(-50%)' };
        break;
      default:
        style = {
          left: Math.min(Math.max(8, rect.left + rect.width / 2), window.innerWidth - 8),
          top: rect.bottom + gap,
          transform: 'translateX(-50%)',
        };
    }
  }

  return (
    <>
      {child}
      {rect &&
        createPortal(
          <div
            role="tooltip"
            style={style}
            className="anim-fade pointer-events-none fixed z-[100] flex items-center gap-2 whitespace-nowrap rounded-md bg-tip px-2 py-1 text-[11.5px] font-medium text-tip-ink shadow-float"
          >
            <span>{label}</span>
            {shortcut && (
              <kbd className="rounded bg-tip-ink/15 px-1 font-sans text-[10.5px] font-semibold text-tip-ink/75">
                {shortcut}
              </kbd>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
