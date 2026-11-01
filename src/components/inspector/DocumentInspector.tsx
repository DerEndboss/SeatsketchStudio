import { LayoutGrid, Users, FileText } from 'lucide-react';
import { ThemePicker } from '../ThemePicker';
import { useEditor } from '../../state/editorStore';
import { useUi } from '../../state/uiStore';
import { useT } from '../../i18n';
import { polygonArea } from '../../geometry/polygon';
import { formatArea } from '../../geometry/measurements';
import { reflowTables } from '../../editor/objects/tableOps';
import * as cmd from '../../editor/commands';
import { Button, cx } from '../ui/Button';
import { LengthField, Note, Row, Section } from '../ui/Fields';
import { Segmented, ToggleRow } from '../ui/Controls';
import { PanelTitle, applyDoc } from './shared';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-lg bg-hover px-2.5 py-2">
      <div className="text-[15px] font-semibold tabular-nums text-ink">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

const CHAIR_PRESETS = [
  { id: 'folding', label: 'chairsize.folding', width: 0.4, depth: 0.4 },
  { id: 'standard', label: 'chairsize.standard', width: 0.45, depth: 0.45 },
  { id: 'padded', label: 'chairsize.padded', width: 0.5, depth: 0.52 },
  { id: 'armchair', label: 'chairsize.armchair', width: 0.62, depth: 0.62 },
] as const;

export function DocumentInspector() {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const s = doc.settings;
  const tables = doc.objects.filter((o) => o.type === 'table').length;
  const chairs = doc.objects.filter((o) => o.type === 'chair');
  const seated = chairs.filter((c) => c.type === 'chair' && c.guestId).length;
  const area = doc.objects.reduce((a, o) => a + (o.type === 'room' ? polygonArea(o.points) : 0), 0);
  const empty = doc.objects.length === 0;
  const setSettings = (patch: Partial<typeof s>) =>
    useEditor.getState().apply((d) => ({ ...d, settings: { ...d.settings, ...patch } }), { history: false });
  const toggle = (key: 'showGrid' | 'showDimensions' | 'showTableNames' | 'showGuestNames') => cmd.toggleSetting(key);
  const changeChair = (width: number, depth: number) =>
    applyDoc((d) => {
      const next = { ...d, settings: { ...d.settings, chair: { width, depth } } };
      return reflowTables(next, next.objects.filter((o) => o.type === 'table').map((o) => o.id));
    }, 'chair-size');
  const activePreset = CHAIR_PRESETS.find((p) => Math.abs(p.width - s.chair.width) < 0.001 && Math.abs(p.depth - s.chair.depth) < 0.001)?.id;

  if (empty) return (
    <div data-testid="inspector-document">
      <PanelTitle icon={FileText} title={doc.meta.name} sub="A fresh page. All yours." />
      <Section title="Appearance"><ThemePicker compact /></Section>
      <Section>
        <p className="text-[12px] leading-relaxed text-muted">Start with a sketch, or borrow a starting point.</p>
        <Button variant="ghost" icon={LayoutGrid} className="justify-start" data-testid="sidebar-templates" onClick={() => useUi.getState().setTemplatesOpen(true)}>Explore templates</Button>
      </Section>
    </div>
  );
  return (
    <div data-testid="inspector-document">
      <PanelTitle icon={FileText} title={doc.meta.name} sub={t('insp.nothing')} />
        <Section title={t('doc.overview')}>
          <div className="grid grid-cols-2 gap-1.5">
            <Stat value={tables} label={t('tool.table')} />
            <Stat value={chairs.length} label={t('tool.chair')} />
            <Stat value={`${seated}/${doc.guests.length}`} label={t('doc.guestsSeated')} />
            <Stat value={area > 0 ? formatArea(area) : '–'} label={t('doc.area')} />
          </div>
          <Button variant="ghost" icon={LayoutGrid} onClick={() => useUi.getState().setTemplatesOpen(true)}>Templates</Button>
          <Button variant="primary" icon={Users} className="mt-1" onClick={() => useUi.getState().openDialog('distribute')} disabled={tables === 0}>
            {t('doc.distributeAll')}
          </Button>
        </Section>
      <Section title={t('doc.display')}>
        <ToggleRow label={t('doc.grid')} checked={s.showGrid} onChange={() => toggle('showGrid')} />
        <ToggleRow label={t('doc.dims')} checked={s.showDimensions} onChange={() => toggle('showDimensions')} />
        <ToggleRow label={t('doc.tableNames')} checked={s.showTableNames} onChange={() => toggle('showTableNames')} />
        <ToggleRow label={t('doc.guestNames')} checked={s.showGuestNames} onChange={() => toggle('showGuestNames')} testId="toggle-guest-names" />
      </Section>
      <Section title={t('doc.gridUnit')}>
        <Row label={t('doc.gridSize')}>
          <Segmented
            ariaLabel={t('doc.gridSize')}
            size="sm"
            value={String(s.gridSize)}
            options={[
              { value: '0.1', label: '10 cm' },
              { value: '0.25', label: '25 cm' },
              { value: '0.5', label: '50 cm' },
              { value: '1', label: '1 m' },
            ]}
            onChange={(v) => setSettings({ gridSize: Number(v) })}
          />
        </Row>
        <Row label={t('doc.snapCm')}>
          <Segmented
            ariaLabel={t('top.snapStep')}
            size="sm"
            value={String(s.snapStep)}
            options={[
              { value: '0.05', label: '5' },
              { value: '0.1', label: '10' },
              { value: '0.25', label: '25' },
              { value: '0.5', label: '50' },
              { value: '1', label: '100' },
            ]}
            onChange={(v) => setSettings({ snapStep: Number(v), snap: true })}
          />
        </Row>
        <Row label={t('doc.unit')}>
          <Segmented
            ariaLabel={t('doc.unit')}
            size="sm"
            value={s.unit}
            options={[
              { value: 'm', label: t('doc.meter') },
              { value: 'cm', label: t('doc.centimeter') },
            ]}
            onChange={(unit) => setSettings({ unit })}
          />
        </Row>
      </Section>
      <Section title={t('chairsize.title')}>
        <Note>{t('chairsize.hint')}</Note>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('doc.chairSize')}>
          {CHAIR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={activePreset === preset.id}
              data-testid={`chair-preset-${preset.id}`}
              onClick={() => changeChair(preset.width, preset.depth)}
              className={cx(
                'rounded-md border px-2 py-1.5 text-[11.5px] transition-colors',
                activePreset === preset.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-field text-muted hover:text-ink',
              )}
            >
              {t(preset.label)}
            </button>
          ))}
        </div>
        {!activePreset && <div className="text-[11px] text-muted">{t('chairsize.custom')}</div>}
        <Row label={t('insp.width')}>
          <LengthField value={s.chair.width} unit={s.unit} min={0.25} max={1.2} step={0.01} aria-label={t('insp.width')} testId="chair-width" onChange={(width) => changeChair(width, s.chair.depth)} />
        </Row>
        <Row label={t('insp.depth')}>
          <LengthField value={s.chair.depth} unit={s.unit} min={0.25} max={1.2} step={0.01} aria-label={t('insp.depth')} testId="chair-depth" onChange={(depth) => changeChair(s.chair.width, depth)} />
        </Row>
      </Section>
    </div>
  );
}
