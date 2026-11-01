import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './Button';
import { Tooltip } from './Tooltip';
import { useT } from '../../i18n';

interface SegmentedOption<T extends string> {
  value: T;
  label?: string;
  icon?: LucideIcon;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex h-7 w-full rounded-md bg-hover p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        const btn = (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.title ?? o.label}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-[5px] font-medium transition-colors duration-150',
              size === 'sm' ? 'text-[11px]' : 'text-[11.5px]',
              active ? 'bg-field text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)] dark:bg-press' : 'text-muted hover:text-ink',
            )}
          >
            {o.icon && <o.icon size={14} strokeWidth={1.75} />}
            {o.label && <span className="truncate">{o.label}</span>}
          </button>
        );
        return o.title && !o.label ? (
          <Tooltip key={o.value} label={o.title}>
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors duration-150',
        checked ? 'bg-accent' : 'bg-line-strong',
      )}
    >
      <span
        className={cx(
          'absolute left-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-150',
          checked && 'translate-x-[12px]',
        )}
      />
    </button>
  );
}

export function ToggleRow({ label, checked, onChange, hint, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; testId?: string }) {
  return (
    <label className="flex min-h-7 cursor-pointer items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[12px] text-ink">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-muted">{hint}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} testId={testId} />
    </label>
  );
}

export function Slider({
  value,
  onChange,
  onStart,
  onEnd,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  format,
  testId,
}: {
  value: number;
  onChange: (v: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  format: (v: number) => string;
  testId?: string;
}) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        data-testid={testId}
        style={{ ['--fill' as string]: fill }}
        onPointerDown={onStart}
        onPointerUp={onEnd}
        onKeyUp={onEnd}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-10 shrink-0 text-right text-[12px] font-medium tabular-nums text-ink">{format(value)}</span>
    </div>
  );
}

export function Swatches<T extends string>({
  value,
  options,
  onChange,
  colorOf,
  labelOf,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  colorOf: (v: T) => { fill: string; stroke: string };
  labelOf: (v: T) => string;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('insp.color')}>
      {options.map((o) => {
        const c = colorOf(o);
        const active = o === value;
        return (
          <Tooltip key={o} label={labelOf(o)}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={labelOf(o)}
              onClick={() => onChange(o)}
              className={cx(
                'h-6 w-6 rounded-full border-2 transition-transform duration-150 hover:scale-110',
                active ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : '',
              )}
              style={{ background: c.fill, borderColor: c.stroke }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-hover text-muted">
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className="text-[12.5px] font-semibold text-ink">{title}</div>
      {children && <div className="mt-1 text-[12px] leading-snug text-muted">{children}</div>}
    </div>
  );
}
