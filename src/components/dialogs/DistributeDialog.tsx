import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useEditor } from '../../state/editorStore';
import { useUi } from '../../state/uiStore';
import { useT } from '../../i18n';
import { chairsOf } from '../../state/lookup';
import { seatingCapacity } from '../../geometry/chairPlacement';
import { distributeChairs, planDistribution, sortedTables } from '../../editor/objects/tableOps';
import { Button, cx } from '../ui/Button';
import { CountField, Note } from '../ui/Fields';
import { Segmented } from '../ui/Controls';
import { Dialog } from '../ui/Overlay';

export function DistributeDialog() {
  const open = useUi((s) => s.dialog === 'distribute');
  const close = () => useUi.getState().openDialog(null);
  return open ? <DistributeBody onClose={close} /> : null;
}

function DistributeBody({ onClose }: { onClose: () => void }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const allTables = useMemo(() => sortedTables(doc), [doc]);
  const selectedTables = useMemo(() => sortedTables(doc, selection), [doc, selection]);
  const [scope, setScope] = useState<'selection' | 'all'>(selectedTables.length > 0 ? 'selection' : 'all');
  const tables = scope === 'selection' && selectedTables.length > 0 ? selectedTables : allTables;
  const current = tables.reduce((s, table) => s + chairsOf(doc, table.id).length, 0);
  const capacityTotal = tables.reduce((s, table) => s + seatingCapacity(table, doc.settings.chair), 0);
  const [total, setTotal] = useState(() => Math.max(current, Math.min(doc.guests.length || 0, capacityTotal)) || Math.min(capacityTotal, tables.length * 8));
  const [max, setMax] = useState(8);
  const plan = useMemo(() => planDistribution(doc, tables, total, max), [doc, tables, total, max]);
  const short = plan.requested - plan.placed;

  const apply = () => {
    const ids = tables.map((table) => table.id);
    useEditor.getState().apply((d) => distributeChairs(d, ids, total, max).doc);
    useUi.getState().toast(t('dist.done', { n: plan.placed, t: t('count.tables', { n: tables.length }) }), short > 0 ? 'warning' : 'success');
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('dist.title')}
      description={t('dist.desc')}
      width={460}
      testId="distribute-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('confirm.cancel')}</Button>
          <Button variant="primary" icon={Users} onClick={apply} disabled={tables.length === 0} data-testid="distribute-apply">
            {t('dist.apply', { n: plan.placed })}
          </Button>
        </>
      }
    >
      {allTables.length === 0 ? (
        <Note>{t('dist.noTables')}</Note>
      ) : (
        <div className="flex flex-col gap-4">
          {selectedTables.length > 0 && selectedTables.length < allTables.length && (
            <Segmented
              ariaLabel={t('dist.scope')}
              value={scope}
              onChange={setScope}
              options={[
                { value: 'selection', label: t('dist.selected', { n: selectedTables.length }) },
                { value: 'all', label: t('dist.all', { n: allTables.length }) },
              ]}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink">{t('dist.total')}</span>
              <CountField label={t('dist.total')} value={total} min={0} max={5000} onChange={setTotal} testId="distribute-total" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink">{t('dist.max')}</span>
              <CountField label={t('dist.max')} value={max} min={1} max={200} onChange={setMax} testId="distribute-max" />
            </label>
          </div>
          {doc.guests.length > 0 && doc.guests.length !== total && (
            <button type="button" className="-mt-2 self-start text-[11.5px] font-medium text-accent hover:underline" onClick={() => setTotal(doc.guests.length)}>
              {t('dist.asGuests', { n: doc.guests.length })}
            </button>
          )}
          <div className="rounded-lg border border-line">
            <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[11.5px] text-muted">
              <span>{t('dist.preview')}</span>
              <span className="tabular-nums" data-testid="distribute-summary">{t('dist.summary', { placed: plan.placed, requested: plan.requested, available: plan.available })}</span>
            </div>
            <ul className="scroll-thin max-h-56 overflow-y-auto py-1">
              {tables.map((table) => {
                const n = plan.counts.get(table.id) ?? 0;
                const cap = Math.min(max, seatingCapacity(table, doc.settings.chair));
                return (
                  <li key={table.id} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="w-24 truncate text-[12px] text-ink">{table.name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
                      <div className={cx('h-full rounded-full transition-[width] duration-200', n === cap ? 'bg-accent' : 'bg-accent/60')} style={{ width: `${cap ? (n / cap) * 100 : 0}%` }} />
                    </div>
                    <span className="w-14 text-right text-[12px] font-medium tabular-nums text-ink">{n}<span className="text-faint"> / {cap}</span></span>
                  </li>
                );
              })}
            </ul>
          </div>
          {short > 0 && <Note tone="warn">{t('dist.short', { n: short })}</Note>}
          {current > 0 && <Note>{t('dist.existing', { n: current })}</Note>}
        </div>
      )}
    </Dialog>
  );
}
