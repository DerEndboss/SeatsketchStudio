import { useMemo, useState } from 'react';
import { version } from '../../../package.json';
import { Info, Keyboard, Plus, RotateCcw, Search, Settings2, X } from 'lucide-react';
import { useT } from '../../i18n';
import { useUi, type SettingsTab } from '../../state/uiStore';
import { COMMANDS, GROUPS, commandById, commandForBinding, eventToBinding, formatBinding, keysFor, useKeymap } from '../../editor/keymap';
import { Button, IconButton, Kbd, cx } from '../ui/Button';
import { Dialog } from '../ui/Overlay';
import { TextField, Note } from '../ui/Fields';
import { ThemePicker } from '../ThemePicker';

export function SettingsDialog() {
  const open = useUi((s) => s.dialog === 'settings');
  const tab = useUi((s) => s.settingsTab);
  const t = useT();
  if (!open) return null;
  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Settings2 }> = [
    { id: 'general', label: t('settings.general'), icon: Settings2 },
    { id: 'shortcuts', label: t('settings.shortcuts'), icon: Keyboard },
    { id: 'about', label: t('settings.about'), icon: Info },
  ];
  return (
    <Dialog open onClose={() => useUi.getState().openDialog(null)} title={t('settings.title')} width={860} testId="settings-dialog">
      <div className="grid min-h-[440px] grid-cols-[150px_minmax(0,1fr)] gap-5">
        <nav className="flex flex-col gap-1 border-r border-line pr-4" aria-label={t('settings.title')}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => useUi.getState().openSettings(item.id)}
              className={cx(
                'flex h-9 items-center gap-2 rounded-lg px-3 text-left text-[12.5px] font-medium transition-colors',
                tab === item.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-ink',
              )}
            >
              <item.icon size={16} strokeWidth={1.75} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 pb-2">
          {tab === 'general' && <GeneralSettings />}
          {tab === 'shortcuts' && <ShortcutSettings />}
          {tab === 'about' && <AboutSettings />}
        </div>
      </div>
    </Dialog>
  );
}

function GeneralSettings() {
  const t = useT();
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">{t('settings.theme')}</h3>
        <ThemePicker />
      </section>
      <Note>{t('app.local')}</Note>
    </div>
  );
}

function AboutSettings() {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <img src="./logo.png" alt="" className="mb-4 h-20 w-20" draggable={false} />
      <h3 className="text-xl font-semibold tracking-tight text-ink">{t('app.name')}</h3>
      <p className="mt-1 text-[12px] text-muted">{t('settings.version', { v: version })}</p>
      <p className="mt-5 max-w-md text-[12.5px] leading-relaxed text-muted">{t('settings.aboutText')}</p>
      <p className="mt-3 max-w-md text-[12px] leading-relaxed text-muted">{t('app.local')}</p>
      <a href="https://pixel-cursor.com" target="_blank" rel="noopener noreferrer" className="mt-5 rounded px-3 py-2 text-[12px] font-medium text-accent outline-none hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent">
        PixelCursor ↗
      </a>
    </div>
  );
}

interface Capture {
  id: string;
  index: number;
}

function ShortcutSettings() {
  const t = useT();
  const overrides = useKeymap((s) => s.overrides);
  const setKeys = useKeymap((s) => s.setKeys);
  const reset = useKeymap((s) => s.reset);
  const resetAll = useKeymap((s) => s.resetAll);
  const [query, setQuery] = useState('');
  const [capture, setCapture] = useState<Capture | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => {
      const keys = keysFor(c.id, overrides).map(formatBinding).join(' ').toLocaleLowerCase();
      return t(c.label).toLocaleLowerCase().includes(q) || keys.includes(q);
    });
  }, [overrides, query, t]);

  const assign = (id: string, index: number, binding: string) => {
    const owner = commandForBinding(binding);
    if (owner && owner !== id) {
      const ownerKeys = keysFor(owner).filter((k) => k !== binding);
      setKeys(owner, ownerKeys);
      const def = commandById(owner);
      if (def) useUi.getState().toast(t('settings.conflict', { key: formatBinding(binding), command: t(def.label) }), 'info');
    }
    const current = keysFor(id).filter((k, i) => i === index || k !== binding);
    if (index < current.length) current[index] = binding;
    else current.push(binding);
    setKeys(id, current);
    setCapture(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2 text-faint" />
          <TextField value={query} live onCommit={setQuery} aria-label={t('settings.search')} placeholder={t('settings.search')} className="pl-8" />
        </div>
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={resetAll}>
          {t('settings.resetAll')}
        </Button>
      </div>
      <div className="scroll-thin -mr-2 max-h-[440px] space-y-4 overflow-y-auto pr-2">
        {GROUPS.map((group) => {
          const commands = visible.filter((c) => c.group === group);
          if (!commands.length) return null;
          return (
            <section key={group}>
              <h3 className="sticky top-0 z-10 bg-canvas py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">{t(`cmdgroup.${group}`)}</h3>
              <div className="divide-y divide-line rounded-lg border border-line px-3">
                {commands.map((command) => {
                  const keys = keysFor(command.id, overrides);
                  const capturing = capture?.id === command.id;
                  return (
                    <div key={command.id} className="flex min-h-12 flex-wrap items-center gap-2 py-2">
                      <span className="min-w-[150px] flex-1 text-[12px] text-ink">{t(command.label)}</span>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {keys.map((key, index) => (
                          <span key={`${key}-${index}`} className="inline-flex items-center rounded border border-line-strong bg-field">
                            <button
                              type="button"
                              data-key-capture
                              onClick={() => setCapture({ id: command.id, index })}
                              onBlur={() => capture && setCapture(null)}
                              onKeyDown={(e) => {
                                if (!capturing || capture.index !== index) return;
                                e.preventDefault();
                                e.stopPropagation();
                                if (e.key === 'Escape') {
                                  setCapture(null);
                                  return;
                                }
                                const binding = eventToBinding(e);
                                if (binding) assign(command.id, index, binding);
                              }}
                              className="px-1.5 py-0.5 text-[10.5px] font-medium text-muted outline-none"
                            >
                              {capturing && capture.index === index ? t('settings.press') : formatBinding(key)}
                            </button>
                            <button
                              type="button"
                              aria-label={t('settings.remove')}
                              onClick={() => setKeys(command.id, keys.filter((_, i) => i !== index))}
                              className="px-1 text-faint hover:text-danger"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                        {!keys.length && <span className="px-1 text-[11px] text-faint">{t('settings.disabled')}</span>}
                        {capturing && capture.index === keys.length ? (
                          <button
                            type="button"
                            data-key-capture
                            autoFocus
                            onBlur={() => setCapture(null)}
                            onKeyDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (e.key === 'Escape') return setCapture(null);
                              const binding = eventToBinding(e);
                              if (binding) assign(command.id, keys.length, binding);
                            }}
                            className="rounded border border-accent bg-accent-soft px-2 py-1 text-[10.5px] text-accent outline-none"
                          >
                            {t('settings.press')}
                          </button>
                        ) : (
                          <IconButton icon={Plus} size="sm" label={t('settings.add')} onClick={() => setCapture({ id: command.id, index: keys.length })} />
                        )}
                        <Button size="sm" variant="ghost" onClick={() => (keys.length ? setKeys(command.id, []) : reset(command.id))}>
                          {keys.length ? t('settings.disable') : t('settings.enable')}
                        </Button>
                        {overrides[command.id] && (
                          <IconButton icon={RotateCcw} size="sm" label={t('settings.reset')} onClick={() => reset(command.id)} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="rounded-lg bg-hover p-3">
        <p className="mb-2 text-[11px] text-muted">{t('settings.fixedHint')}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted">
          <span><Kbd>{t('key.Escape')}</Kbd> {t('cmd.cancel')}</span>
          <span><Kbd>{t('key.Enter')}</Kbd> {t('cmd.finish')}</span>
          <span><Kbd>{t('key.Space')}</Kbd> {t('cmd.pan')}</span>
          <span><Kbd>{t('key.arrows')}</Kbd> {t('cmd.nudge')}</span>
        </div>
      </div>
    </div>
  );
}
