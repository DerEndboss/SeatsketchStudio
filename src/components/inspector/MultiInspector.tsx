import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Boxes,
  Copy,
  Group,
  Lock,
  Trash,
  Ungroup,
  Users,
} from 'lucide-react';
import { TABLE_TONES, type SceneObject, type TableTone } from '../../types/document';
import { useUi, resolvedTheme } from '../../state/uiStore';
import { useT, type MsgKey } from '../../i18n';
import { mapObjects } from '../../editor/objects/tableOps';
import { paletteFor } from '../../editor/canvas/palette';
import * as cmd from '../../editor/commands';
import { Button, IconButton } from '../ui/Button';
import { Section } from '../ui/Fields';
import { Swatches } from '../ui/Controls';
import { PanelTitle, applyDoc } from './shared';

const TYPE_KEYS: Record<SceneObject['type'], MsgKey> = {
  room: 'type.room', table: 'type.table', chair: 'type.chair', door: 'type.door', window: 'type.window', column: 'type.column', wall: 'type.wall', zone: 'type.zone', label: 'type.label', dimension: 'type.dimension',
};
const TONE_KEYS: Record<TableTone, MsgKey> = { default: 'tone.default', sand: 'tone.sand', sage: 'tone.sage', sky: 'tone.sky', rose: 'tone.rose', slate: 'tone.slate' };

export function MultiInspector({ objects }: { objects: SceneObject[] }) {
  const t = useT();
  const theme = useUi(resolvedTheme);
  const pal = paletteFor(theme);
  const counts = new Map<SceneObject['type'], number>();
  for (const o of objects) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
  const summary = [...counts.entries()].map(([type, n]) => t(TYPE_KEYS[type], { n })).join(' · ');
  const tables = objects.filter((o) => o.type === 'table');
  const grouped = objects.some((o) => o.groupId);
  const allLocked = objects.every((o) => o.locked);

  return (
    <div data-testid="inspector-multi">
      <PanelTitle icon={Boxes} title={t('multi.title', { n: objects.length })} sub={summary} />
      <Section title={t('multi.align')}>
        <div className="flex flex-wrap gap-0.5">
          <IconButton icon={AlignStartVertical} label={t('cmd.alignLeft')} size="sm" onClick={() => cmd.align('left')} />
          <IconButton icon={AlignCenterVertical} label={t('cmd.alignHCenter')} size="sm" onClick={() => cmd.align('hcenter')} />
          <IconButton icon={AlignEndVertical} label={t('cmd.alignRight')} size="sm" onClick={() => cmd.align('right')} />
          <IconButton icon={AlignStartHorizontal} label={t('cmd.alignTop')} size="sm" onClick={() => cmd.align('top')} />
          <IconButton icon={AlignCenterHorizontal} label={t('cmd.alignVCenter')} size="sm" onClick={() => cmd.align('vcenter')} />
          <IconButton icon={AlignEndHorizontal} label={t('cmd.alignBottom')} size="sm" onClick={() => cmd.align('bottom')} />
          <div className="mx-1 h-7 w-px bg-line" />
          <IconButton icon={AlignHorizontalDistributeCenter} label={t('cmd.distributeH')} size="sm" disabled={objects.length < 3} onClick={() => cmd.distribute('x')} />
          <IconButton icon={AlignVerticalDistributeCenter} label={t('cmd.distributeV')} size="sm" disabled={objects.length < 3} onClick={() => cmd.distribute('y')} />
        </div>
      </Section>
      {tables.length > 0 && (
        <Section title={t('count.tables', { n: tables.length })}>
          <Button variant="primary" size="sm" icon={Users} className="self-start" onClick={() => useUi.getState().openDialog('distribute')} data-testid="distribute-selected">
            {t('multi.distributeSelected')}
          </Button>
          <Swatches<TableTone>
            value={tables.every((table) => (table.tone ?? 'default') === (tables[0].tone ?? 'default')) ? tables[0].tone ?? 'default' : ('' as TableTone)}
            options={TABLE_TONES}
            colorOf={(tone) => pal.table[tone]}
            labelOf={(tone) => t(TONE_KEYS[tone])}
            onChange={(tone) => applyDoc((d) => mapObjects(d, tables.map((table) => table.id), (o) => (o.type === 'table' ? { ...o, tone } : o)))}
          />
        </Section>
      )}
      <Section>
        <div className="flex flex-wrap gap-1.5">
          {grouped ? (
            <Button size="sm" icon={Ungroup} onClick={cmd.ungroup}>{t('cmd.ungroup')}</Button>
          ) : (
            <Button size="sm" icon={Group} onClick={cmd.group}>{t('cmd.group')}</Button>
          )}
          <Button size="sm" icon={Copy} onClick={cmd.duplicateSelection}>{t('insp.duplicate')}</Button>
          <Button size="sm" icon={Lock} onClick={cmd.toggleLock}>{t(allLocked ? 'insp.unlock' : 'insp.lock')}</Button>
          <Button size="sm" variant="danger" icon={Trash} onClick={cmd.deleteSelection}>{t('insp.delete')}</Button>
        </div>
      </Section>
    </div>
  );
}
