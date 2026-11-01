import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, FilePlus, FolderOpen } from 'lucide-react';
import { useI18n, useT } from '../../i18n';
import { useEditor } from '../../state/editorStore';
import { useFile } from '../../state/fileStore';
import { useUi } from '../../state/uiStore';
import { buildTemplate, TEMPLATES, templateStats, type TemplateId } from '../../persistence/templates';
import { buildPlanSvg } from '../../export/svg';
import { createPlan, usePlans } from '../../editor/projects';
import { openProject, openRecent } from '../../editor/commands';
import { formatLength } from '../../geometry/measurements';
import type { Unit } from '../../types/document';
import { Button, cx } from '../ui/Button';
import { Dialog } from '../ui/Overlay';
import { LengthField, Row, TextField } from '../ui/Fields';
import { Segmented, ToggleRow } from '../ui/Controls';
import { LanguageSelect, ThemePicker } from '../ThemePicker';

export function WelcomeDialog() {
  const open = useUi((s) => s.welcome);
  const hasPlans = usePlans((s) => s.plans.length > 0);
  return open ? <WelcomeBody hasPlans={hasPlans} /> : null;
}

function WelcomeBody({ hasPlans }: { hasPlans: boolean }) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const currentUnit = useEditor((s) => s.doc.settings.unit);
  const recent = useFile((s) => s.recent);
  const [selected, setSelected] = useState<TemplateId>('blank');
  const [setup, setSetup] = useState(false);
  const [name, setName] = useState('');
  const [withRoom, setWithRoom] = useState(true);
  const [width, setWidth] = useState(10);
  const [length, setLength] = useState(8);
  const [unit, setUnit] = useState<Unit>(currentUnit);
  const close = () => {
    if (hasPlans) useUi.getState().setWelcome(false);
  };
  const previews = useMemo(
    () =>
      Object.fromEntries(
        TEMPLATES.map((def) => {
          const doc = buildTemplate(def.id);
          const { svg } = buildPlanSvg(doc, { showDimensions: false, showGuestNames: false, showTableNames: false, background: null, pxPerMeter: 32 });
          return [def.id, svg];
        }),
      ) as Record<TemplateId, string>,
    [lang],
  );
  const def = TEMPLATES.find((x) => x.id === selected) ?? TEMPLATES[0];
  const stats = useMemo(() => templateStats(buildTemplate(selected)), [selected, lang]);

  const beginSetup = () => {
    setName(t(def.title));
    setSetup(true);
  };
  const create = () => {
    const doc = buildTemplate(selected, { name: name.trim() || t('name.untitled'), width, length, withRoom, unit });
    doc.meta.name = name.trim() || t('name.untitled');
    doc.settings.unit = unit;
    createPlan(doc);
  };

  return (
    <Dialog open onClose={close} canClose={hasPlans} title={t('welcome.hello')} width={960} testId="welcome-dialog">
      {!setup ? (
        <div className="flex flex-col gap-5 pb-1">
          <div className="flex items-center gap-3">
            <img src="./logo.png" alt="" className="h-12 w-12" draggable={false} />
            <div className="min-w-0">
              <div className="text-[17px] font-semibold tracking-tight text-ink">{t('app.name')}</div>
              <div className="text-[11.5px] text-muted">{t('app.tagline')}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11.5px] text-muted">{t('welcome.language')}</span>
              <LanguageSelect />
            </div>
          </div>
          <div className="pt-1 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">{t('welcome.title')}</h2>
            <p className="mx-auto mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-muted">{t('welcome.subtitle')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3" role="radiogroup" aria-label={t('welcome.title')}>
            {TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected === item.id}
                data-testid={`template-${item.id}`}
                onClick={() => setSelected(item.id)}
                onDoubleClick={beginSetup}
                className={cx(
                  'group overflow-hidden rounded-xl border bg-field text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float',
                  selected === item.id ? 'border-accent ring-2 ring-accent/15' : 'border-line',
                )}
              >
                <span className="flex h-[104px] items-center justify-center overflow-hidden border-b border-line bg-canvas p-2 [&_svg]:h-full [&_svg]:max-h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: previews[item.id] }} />
                <span className="block p-3">
                  <span className={cx('block text-[13px] font-semibold', selected === item.id ? 'text-accent' : 'text-ink')}>{t(item.title)}</span>
                  <span className="mt-1 block min-h-8 text-[11px] leading-snug text-muted">{t(item.desc)}</span>
                </span>
              </button>
            ))}
          </div>
          <section>
            <div className="mb-2 text-[11.5px] font-medium text-muted">{t('welcome.theme')}</div>
            <ThemePicker />
          </section>
          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
              <span className="font-medium text-muted">{t('welcome.recent')}:</span>
              {recent.slice(0, 3).map((r) => (
                <button key={r.path} type="button" onClick={() => void openRecent(r.path)} className="rounded-md bg-hover px-2 py-1 text-ink hover:bg-press">
                  {r.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line pt-3">
            <Button variant="ghost" icon={FolderOpen} onClick={() => void openProject()}>
              {t('welcome.open')}
            </Button>
            <div className="flex gap-2">
              {hasPlans && <Button variant="ghost" onClick={close}>{t('welcome.cancel')}</Button>}
              <Button variant="primary" icon={ArrowRight} onClick={beginSetup} data-testid="welcome-next">
                {t('welcome.next')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-xl flex-col gap-5 py-2">
          <div className="text-center">
            <h2 className="text-xl font-semibold tracking-tight text-ink">{t('welcome.setupTitle')}</h2>
            <p className="mt-1 text-[12px] text-muted">{t('welcome.setupSubtitle')}</p>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-line bg-field p-3">
            <div className="h-24 w-40 shrink-0 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: previews[selected] }} />
            <div>
              <div className="text-[13px] font-semibold text-ink">{t(def.title)}</div>
              <p className="mt-1 text-[11.5px] leading-snug text-muted">{t(def.desc)}</p>
              {selected !== 'blank' && (
                <p className="mt-2 text-[11px] text-muted">
                  {t('tpl.meta', {
                    size: `${formatLength(stats.width, unit)} × ${formatLength(stats.length, unit)}`,
                    tables: t('count.tables', { n: stats.tables }),
                    seats: t('count.seats', { n: stats.seats }),
                  })}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Row label={t('welcome.planName')}>
              <TextField value={name} live onCommit={setName} aria-label={t('welcome.planName')} data-autofocus data-testid="welcome-name" />
            </Row>
            {selected === 'blank' && (
              <>
                <ToggleRow label={t('welcome.withRoom')} checked={withRoom} onChange={setWithRoom} testId="welcome-with-room" />
                {withRoom && (
                  <>
                    <Row label={t('welcome.roomWidth')}>
                      <LengthField value={width} unit={unit} min={1} max={500} step={0.5} onChange={setWidth} aria-label={t('welcome.roomWidth')} testId="welcome-width" />
                    </Row>
                    <Row label={t('welcome.roomLength')}>
                      <LengthField value={length} unit={unit} min={1} max={500} step={0.5} onChange={setLength} aria-label={t('welcome.roomLength')} testId="welcome-length" />
                    </Row>
                  </>
                )}
              </>
            )}
            <Row label={t('welcome.unit')}>
              <Segmented
                value={unit}
                onChange={setUnit}
                ariaLabel={t('welcome.unit')}
                options={[
                  { value: 'm', label: t('doc.meter') },
                  { value: 'cm', label: t('doc.centimeter') },
                ]}
              />
            </Row>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setSetup(false)}>
              {t('welcome.back')}
            </Button>
            <Button variant="primary" icon={FilePlus} onClick={create} data-testid="welcome-create">
              {t('welcome.create')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
