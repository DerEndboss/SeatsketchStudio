import { type ReactNode, type InputHTMLAttributes, useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Unit } from '../../types/document';
import { formatLength, formatNumber, parseAngle, parseLength } from '../../geometry/measurements';
import { normalizeAngle } from '../../geometry/vec';
import { cx } from './Button';
import { useT } from '../../i18n';

const FIELD =
  'h-7 w-full min-w-0 rounded-md border border-line bg-field px-2 text-[12.5px] tabular-nums text-ink outline-none transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50';

/** Input field that commits on Enter/blur and snaps back on invalid input. */
function useCommitField(display: string, onCommit: (text: string) => boolean) {
  const [text, setText] = useState(display);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(display);
  }, [display, editing]);
  return {
    value: editing ? text : display,
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      setEditing(true);
      setText(display);
      requestAnimationFrame(() => e.target.select());
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value),
    onBlur: () => {
      if (!onCommit(text)) setText(display);
      setEditing(false);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        if (!onCommit(text)) setText(display);
        else setText(text);
        (e.target as HTMLInputElement).blur();
      } else if (e.key === 'Escape') {
        setText(display);
        setEditing(false);
        requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
      }
    },
  };
}

interface LengthFieldProps {
  value: number;
  unit: Unit;
  onChange: (meters: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  prefix?: string;
  'aria-label'?: string;
  testId?: string;
}

/** Length field: shows "1.80" with its unit, accepts "180 cm", "1,8", "=1.2+0.6"; arrow keys step by the grid. */
export function LengthField({ value, unit, onChange, min = 0, max = 1000, step = 0.05, disabled, prefix, testId, ...rest }: LengthFieldProps) {
  const display = formatLength(value, unit, false);
  const commit = (text: string): boolean => {
    const v = parseLength(text, unit);
    if (v === null || !Number.isFinite(v)) return false;
    const c = Math.min(max, Math.max(min, v));
    if (Math.abs(c - value) > 1e-9) onChange(c);
    return true;
  };
  const f = useCommitField(display, commit);
  return (
    <label className="relative block min-w-0">
      {prefix && <span className="pointer-events-none absolute left-[7px] top-1/2 -translate-y-1/2 text-[10.5px] font-semibold text-faint">{prefix}</span>}
      <input
        {...f}
        disabled={disabled}
        aria-label={rest['aria-label']}
        data-testid={testId}
        inputMode="decimal"
        className={cx(FIELD, prefix ? 'pl-[19px]' : '', unit === 'cm' ? 'pr-7' : 'pr-5')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const k = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            onChange(Math.min(max, Math.max(min, Math.round((value + k) / step) * step)));
            return;
          }
          f.onKeyDown(e);
        }}
      />
      <span className="pointer-events-none absolute right-[7px] top-1/2 -translate-y-1/2 text-[11px] text-faint">{unit}</span>
    </label>
  );
}

export function AngleField({ value, onChange, disabled }: { value: number; onChange: (deg: number) => void; disabled?: boolean }) {
  const t = useT();
  const display = formatNumber(Math.round(normalizeAngle(value) * 10) / 10, 0, 1);
  const f = useCommitField(display, (text) => {
    const v = parseAngle(text);
    if (v === null) return false;
    onChange(normalizeAngle(v));
    return true;
  });
  return (
    <label className="relative block min-w-0">
      <input
        {...f}
        disabled={disabled}
        aria-label={t('field.angle')}
        inputMode="decimal"
        className={cx(FIELD, 'pr-6')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const k = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 15 : 1);
            onChange(normalizeAngle(Math.round(value) + k));
            return;
          }
          f.onKeyDown(e);
        }}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-faint">°</span>
    </label>
  );
}

/** Integer with −/+, for chair counts. */
export function CountField({
  value,
  onChange,
  min = 0,
  max = 500,
  disabled,
  testId,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  testId?: string;
  label: string;
}) {
  const t = useT();
  const f = useCommitField(String(value), (text) => {
    const n = Number.parseInt(text.replace(/\D+/g, ''), 10);
    if (!Number.isFinite(n)) return false;
    onChange(Math.min(max, Math.max(min, n)));
    return true;
  });
  const btn =
    'flex h-7 w-7 shrink-0 items-center justify-center text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className="flex h-7 min-w-0 items-stretch overflow-hidden rounded-md border border-line bg-field focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      <button type="button" className={btn} aria-label={t('field.decrease', { label })} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus size={13} />
      </button>
      <input
        {...f}
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        inputMode="numeric"
        className="w-full min-w-0 border-x border-line bg-transparent text-center text-[12.5px] font-medium tabular-nums text-ink outline-none"
      />
      <button type="button" className={btn} aria-label={t('field.increase', { label })} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus size={13} />
      </button>
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onCommit: (v: string) => void;
  /** Commit on every keystroke (for names) instead of only on blur */
  live?: boolean;
  focusKey?: string;
}

export function TextField({ value, onCommit, live, focusKey, className, ...rest }: TextFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(value);
  }, [value]);
  useEffect(() => {
    if (focusKey) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [focusKey]);
  return (
    <input
      ref={ref}
      {...rest}
      value={text}
      className={cx(FIELD, className)}
      onFocus={() => (editing.current = true)}
      onChange={(e) => {
        setText(e.target.value);
        if (live) onCommit(e.target.value);
      }}
      onBlur={() => {
        editing.current = false;
        if (!live && text !== value) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(value);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

export function Section({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3.5 last:border-b-0">
      {title && (
        <div className="mb-2.5 flex h-5 items-center justify-between">
          <h3 className="text-[11.5px] font-semibold text-ink">{title}</h3>
          {action}
        </div>
      )}
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function Row({ label, children, hint, stack }: { label: string; children: ReactNode; hint?: string; stack?: boolean }) {
  if (stack) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-muted" title={hint}>
          {label}
        </span>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2">
      <span className="truncate text-[12px] text-muted" title={hint}>
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Pair({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>;
}

export function Note({ tone = 'muted', children }: { tone?: 'muted' | 'warn' | 'danger' | 'accent'; children: ReactNode }) {
  const cls =
    tone === 'warn'
      ? 'bg-warn-soft text-warn'
      : tone === 'danger'
        ? 'bg-danger-soft text-danger'
        : tone === 'accent'
          ? 'bg-accent-soft text-accent'
          : 'bg-hover text-muted';
  return <div className={cx('rounded-md px-2.5 py-2 text-[11.5px] leading-snug', cls)}>{children}</div>;
}
