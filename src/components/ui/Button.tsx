import { type ButtonHTMLAttributes, type ComponentType, type ReactNode, forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip } from './Tooltip';

export const cx = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95 shadow-[0_1px_2px_rgb(0_0_0/0.12)]',
  secondary: 'bg-field text-ink border border-line-strong hover:bg-hover active:bg-press',
  ghost: 'text-ink hover:bg-hover active:bg-press',
  subtle: 'bg-hover text-ink hover:bg-press',
  danger: 'text-danger hover:bg-danger-soft',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', icon: Icon, size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,filter,color] duration-150 disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[12.5px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 15} strokeWidth={1.75} className="shrink-0" />}
      {children}
    </button>
  );
});

export type IconComponent = LucideIcon | ComponentType<{ size?: number; strokeWidth?: number }>;

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconComponent;
  label: string;
  shortcut?: string;
  active?: boolean;
  side?: 'right' | 'bottom' | 'top' | 'left';
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'danger';
  /** 'soft' = subtle fill for toggles (grid, snapping …) */
  activeStyle?: 'solid' | 'soft';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, shortcut, active, side = 'bottom', size = 'md', tone = 'default', activeStyle = 'solid', className, type = 'button', onMouseDown, ...rest },
  ref,
) {
  const dim = size === 'lg' ? 'h-9 w-9' : size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  return (
    <Tooltip label={label} shortcut={shortcut} side={side}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={active}
        onMouseDown={(e) => {
          // clicked with the mouse: focus stays on the canvas (keyboard focus via Tab still works)
          e.preventDefault();
          onMouseDown?.(e);
        }}
        className={cx(
          'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-150 disabled:pointer-events-none disabled:opacity-35',
          dim,
          active
            ? activeStyle === 'soft'
              ? 'bg-accent-soft text-accent hover:brightness-95'
              : 'bg-accent text-accent-ink shadow-[0_1px_2px_rgb(0_0_0/0.15)]'
            : tone === 'danger'
              ? 'text-muted hover:bg-danger-soft hover:text-danger'
              : 'text-muted hover:bg-hover hover:text-ink active:bg-press',
          className,
        )}
        {...rest}
      >
        <Icon size={size === 'lg' ? 18 : 16} strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
});

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line-strong bg-field px-1 font-sans text-[10.5px] font-semibold text-muted">
      {children}
    </kbd>
  );
}
