import { Check, Monitor } from 'lucide-react';
import { LANGS, useI18n, useT, type Lang } from '../i18n';
import { useUi } from '../state/uiStore';
import { THEMES } from '../styles/themes';
import { cx } from './ui/Button';

export function LanguageSelect({ className }: { className?: string }) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  return (
    <select
      aria-label={t('settings.language')}
      data-testid="language-select"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className={cx('h-8 rounded-md border border-line bg-field px-2 text-[12px] text-ink outline-none hover:border-line-strong focus:border-accent', className)}
    >
      {LANGS.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

export function ThemePicker({ system = true, compact = false }: { system?: boolean; compact?: boolean }) {
  const t = useT();
  const value = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  return (
    <div className={cx('grid gap-2', compact ? 'grid-cols-5' : system ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4')} role="radiogroup" aria-label={t('settings.theme')}>
      {system && (
        <button
          type="button"
          role="radio"
          aria-checked={value === 'system'}
          onClick={() => setTheme('system')}
          className={cx(
            'relative flex flex-col items-center justify-center gap-2 rounded-xl border p-2 text-[11.5px] font-medium transition-colors',
            compact ? 'min-h-11' : 'min-h-[76px]',
            value === 'system' ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-field text-muted hover:border-line-strong hover:text-ink',
          )}
        >
          <Monitor size={22} strokeWidth={1.5} />
          <span className={compact ? 'sr-only' : ''}>{t('theme.system')}</span>
          {value === 'system' && <Check size={13} className="absolute right-2 top-2" />}
        </button>
      )}
      {THEMES.map((theme) => {
        const active = value === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${t(theme.label)} ${t(theme.dark ? 'theme.dark' : 'theme.light')}`}
            onClick={() => setTheme(theme.id)}
            className={cx(
              'relative flex flex-col justify-between overflow-hidden rounded-xl border p-2 text-left transition-colors',
              compact ? 'min-h-11 justify-center' : 'min-h-[76px]',
              active ? 'border-accent bg-accent-soft' : 'border-line bg-field hover:border-line-strong',
            )}
          >
            <span className={cx("flex w-full overflow-hidden rounded-md border border-black/5", compact ? "h-6" : "h-9")} style={{ background: theme.swatch[0] }}>
              <span className="m-1.5 flex-1 rounded-sm" style={{ background: theme.swatch[1] }} />
              <span className="m-1.5 ml-0 w-4 rounded-sm" style={{ background: theme.swatch[2] }} />
              <span className="m-1.5 ml-0 w-3 rounded-full" style={{ background: theme.swatch[3] }} />
            </span>
            <span className={cx(compact ? 'sr-only' : 'px-0.5 text-[11.5px] font-medium', active ? 'text-accent' : 'text-ink')}>{t(theme.label)}</span>
            {active && <Check size={13} className="absolute right-2 top-2 text-accent" />}
          </button>
        );
      })}
    </div>
  );
}
