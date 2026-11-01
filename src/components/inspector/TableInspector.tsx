import { useMemo } from 'react';
import { Circle, Unlink, RotateCcw, RotateCw, Wand, Shapes } from 'lucide-react';
import { TABLE_TONES, type SeatingConfig, type TableObject, type TableShape, type TableTone } from '../../types/document';
import { useEditor } from '../../state/editorStore';
import { useUi, resolvedTheme } from '../../state/uiStore';
import { useT, type MsgKey } from '../../i18n';
import { chairsOf } from '../../state/lookup';
import { seatingCapacity, suggestedChairCount } from '../../geometry/chairPlacement';
import { normalizeAngle } from '../../geometry/vec';
import { detachChairs, patchTable, relayoutTable, updateTable } from '../../editor/objects/tableOps';
import { paletteFor } from '../../editor/canvas/palette';
import { AngleField, CountField, LengthField, Note, Pair, Row, Section, TextField } from '../ui/Fields';
import { Segmented, Slider, Swatches, ToggleRow } from '../ui/Controls';
import { Button, IconButton, cx } from '../ui/Button';
import { applyDoc, ObjectActions, PanelTitle, PositionRow, Warnings, useFocusKey } from './shared';

const SHAPES: ReadonlyArray<{ value: Exclude<TableShape, 'custom'>; label: MsgKey }> = [
  { value: 'rect', label: 'shape.rect' },
  { value: 'round', label: 'shape.round' },
  { value: 'oval', label: 'shape.oval' },
  { value: 'semicircle', label: 'shape.semicircle' },
];
const SIDE_NAMES: readonly MsgKey[] = ['side.top', 'side.right', 'side.bottom', 'side.left'];
const TONE_KEYS: Record<TableTone, MsgKey> = { default: 'tone.default', sand: 'tone.sand', sage: 'tone.sage', sky: 'tone.sky', rose: 'tone.rose', slate: 'tone.slate' };

export function TableInspector({ table }: { table: TableObject }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const unit = doc.settings.unit;
  const chairSize = doc.settings.chair;
  const chairs = chairsOf(doc, table.id);
  const { shape, width, height, cornerRadius, path, seating } = table;
  const capacity = useMemo(() => seatingCapacity({ shape, width, height, cornerRadius, path, seating }, chairSize), [shape, width, height, cornerRadius, path, seating, chairSize]);
  const suggested = useMemo(
    () => suggestedChairCount({ shape, width, height, cornerRadius, path, seating }, chairSize),
    [shape, width, height, cornerRadius, path, seating, chairSize],
  );
  const nameFocus = useFocusKey('table-name');
  const theme = useUi(resolvedTheme);
  const pal = paletteFor(theme);
  const id = table.id;
  const locked = !!table.locked;

  const set = (patch: Partial<TableObject>, key: string) => applyDoc((d) => patchTable(d, id, patch), `${key}:${id}`);
  const setSeating = (patch: Partial<SeatingConfig>) =>
    applyDoc((d) => relayoutTable(updateTable(d, id, { seating: { ...table.seating, ...patch } }), id), `seating:${id}`);
  const setCount = (n: number) => applyDoc((d) => relayoutTable(d, id, n), `count:${id}`);

  const setShape = (shape: Exclude<TableShape, 'custom'>) => {
    let patch: Partial<TableObject> = { shape };
    if (shape === 'round') {
      const d = Math.max(table.width, table.height);
      patch = { ...patch, width: d, height: d };
    } else if (table.shape === 'round') {
      patch = { ...patch, height: shape === 'semicircle' ? table.width / 2 : table.width * 0.6 };
    }
    if (shape === 'semicircle' && table.seating.mode === 'sides') patch.seating = { ...table.seating, mode: 'long' };
    if (shape !== 'rect' && table.seating.mode === 'sides') patch.seating = { ...table.seating, mode: 'perimeter' };
    set(patch, 'shape');
  };

  const isRect = table.shape === 'rect';
  const modeOptions =
    table.shape === 'rect'
      ? ([
          { value: 'perimeter', label: t('table.modePerimeter') },
          { value: 'long', label: t('table.modeLong') },
          { value: 'sides', label: t('table.modeSides') },
        ] as const)
      : table.shape === 'semicircle'
        ? ([
            { value: 'perimeter', label: t('table.modePerimeter') },
            { value: 'long', label: t('table.modeArc') },
          ] as const)
        : null;
  const shapeLabel = table.shape === 'custom' ? t('shape.custom') : t('table.sub', { shape: t(SHAPES.find((s) => s.value === table.shape)?.label ?? 'shape.rect') });

  return (
    <div data-testid="inspector-table">
      <PanelTitle icon={table.shape === 'custom' ? Shapes : Circle} title={table.name || t('name.tablePrefix')} sub={shapeLabel} />
      <Warnings id={id} />
      <Section>
        <Row label={t('insp.name')}>
          <TextField
            value={table.name}
            live
            focusKey={nameFocus}
            disabled={locked}
            aria-label={t('table.name')}
            data-testid="table-name"
            onCommit={(v) => applyDoc((d) => updateTable(d, id, { name: v }), `name:${id}`)}
          />
        </Row>
        {table.shape !== 'custom' && (
          <Row label={t('insp.shape')} stack>
            <Segmented ariaLabel={t('insp.shape')} size="sm" value={table.shape} options={SHAPES.map((s) => ({ ...s, label: t(s.label) }))} onChange={setShape} />
          </Row>
        )}
        {table.shape === 'round' ? (
          <Row label={t('insp.diameter')}>
            <LengthField value={table.width} unit={unit} min={0.3} max={20} disabled={locked} onChange={(v) => set({ width: v, height: v }, 'size')} aria-label={t('insp.diameter')} />
          </Row>
        ) : (
          <Row label={t('insp.size')}>
            <Pair>
              <LengthField prefix={t('insp.width').slice(0, 1)} value={table.width} unit={unit} min={0.3} max={50} disabled={locked} onChange={(v) => set({ width: v }, 'size')} aria-label={t('insp.width')} testId="table-width" />
              <LengthField prefix={t('insp.depth').slice(0, 1)} value={table.height} unit={unit} min={0.3} max={50} disabled={locked} onChange={(v) => set({ height: v }, 'size')} aria-label={t('insp.depth')} testId="table-depth" />
            </Pair>
          </Row>
        )}
        {isRect && (
          <Row label={t('insp.corners')}>
            <LengthField value={table.cornerRadius} unit={unit} min={0} max={Math.min(table.width, table.height) / 2} step={0.01} disabled={locked} onChange={(v) => set({ cornerRadius: v }, 'radius')} aria-label={t('insp.corners')} />
          </Row>
        )}
        <Row label={t('insp.rotation')}>
          <div className="flex items-center gap-1">
            <AngleField value={table.rotation} disabled={locked} onChange={(v) => set({ rotation: v }, 'rot')} />
            <IconButton icon={RotateCcw} size="sm" label="−90°" disabled={locked} onClick={() => set({ rotation: normalizeAngle(table.rotation - 90) }, 'rot90')} />
            <IconButton icon={RotateCw} size="sm" label="+90°" disabled={locked} onClick={() => set({ rotation: normalizeAngle(table.rotation + 90) }, 'rot90')} />
          </div>
        </Row>
        <PositionRow o={table} unit={unit} />
      </Section>

      {table.shape === 'custom' && table.path && (
        <Section title={t('table.freeform')}>
          <Slider label={t('table.smoothing')} value={table.path.smoothing} min={0} max={1} step={0.01} testId="smoothing" format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => set({ path: { ...table.path!, smoothing: v } }, 'smooth')} />
          <ToggleRow label={t('table.preserveCorners')} hint={t('table.preserveCornersHint')} checked={table.path.preserveCorners} onChange={(v) => set({ path: { ...table.path!, preserveCorners: v } }, 'corners')} />
        </Section>
      )}

      <Section title={t('table.chairs')}>
        <Row label={t('table.count')}>
          <CountField label={t('table.countLabel')} value={chairs.length} min={0} max={300} onChange={setCount} testId="chair-count" />
        </Row>
        {chairs.length === 0 && suggested > 0 && (
          <Button variant="primary" size="sm" icon={Wand} onClick={() => setCount(suggested)} data-testid="add-chairs">
            {t('table.addChairs', { n: suggested })}
          </Button>
        )}
        {modeOptions && (
          <Row label={t('table.arrangement')} stack>
            <Segmented ariaLabel={t('table.arrangement')} size="sm" value={table.seating.mode as (typeof modeOptions)[number]['value']} options={modeOptions} onChange={(mode) => setSeating({ mode })} />
          </Row>
        )}
        {isRect && table.seating.mode === 'sides' && (
          <Row label={t('table.sides')} stack>
            <div className="grid grid-cols-4 gap-1">
              {SIDE_NAMES.map((key, i) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={table.seating.sides[i]}
                  onClick={() => {
                    const sides = [...table.seating.sides] as SeatingConfig['sides'];
                    sides[i] = !sides[i];
                    setSeating({ sides });
                  }}
                  className={cx('h-7 rounded-md text-[11px] font-medium transition-colors', table.seating.sides[i] ? 'bg-accent text-accent-ink' : 'bg-hover text-muted hover:text-ink')}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </Row>
        )}
        <Row label={t('table.gap')} hint={t('table.gapHint')}>
          <LengthField value={table.seating.gap} unit={unit} min={0} max={1} step={0.01} onChange={(gap) => setSeating({ gap })} aria-label={t('table.gap')} />
        </Row>
        <Note tone={chairs.length > capacity ? 'warn' : 'muted'}>
          {chairs.length > capacity ? t('table.overfull', { n: capacity }) : t('table.capacity', { n: capacity, w: Math.round(chairSize.width * 100) })}
        </Note>
        {!table.seating.auto && chairs.length > 0 && (
          <Note tone="accent">
            <span className="flex items-center justify-between gap-2">
              <span>{t('table.manual')}</span>
              <button type="button" className="shrink-0 font-semibold underline-offset-2 hover:underline" onClick={() => applyDoc((d) => relayoutTable(d, id))}>
                {t('table.relayout')}
              </button>
            </span>
          </Note>
        )}
        {chairs.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={Unlink}
            className="self-start"
            onClick={() => {
              applyDoc((d) => detachChairs(d, chairs.map((c) => c.id)));
              useUi.getState().toast(t('table.detached'), 'info');
            }}
          >
            {t('table.detach')}
          </Button>
        )}
      </Section>

      <Section title={t('insp.color')}>
        <Swatches<TableTone> value={table.tone ?? 'default'} options={TABLE_TONES} onChange={(tone) => set({ tone }, 'tone')} colorOf={(tone) => pal.table[tone]} labelOf={(tone) => t(TONE_KEYS[tone])} />
      </Section>
      <ObjectActions o={table} />
    </div>
  );
}
