import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../i18n';
import { useEditor } from '../state/editorStore';
import { createPlan } from '../editor/projects';
import { createEmptyDocument } from '../editor/objects/factory';
import { activatePlan, confirmDeletePlan, movePlan, usePlans } from '../editor/projects';
import { cx } from './ui/Button';
import { Tooltip } from './ui/Tooltip';

export function ProjectTabs() {
  const t = useT();
  const plans = usePlans((s) => s.plans);
  const activeId = usePlans((s) => s.activeId);
  const activeName = useEditor((s) => s.doc.meta.name);
  const [dragOver, setDragOver] = useState<number | null>(null);
  return (
    <nav className="flex h-9 shrink-0 items-end gap-1 overflow-x-auto border-b border-line bg-panel px-2" aria-label={t('tabs.label')} data-testid="project-tabs">
      <div role="tablist" className="flex h-full min-w-0 items-end gap-1" aria-label={t('tabs.label')}>
        {plans.map((plan, index) => {
          const active = plan.id === activeId;
          return (
            <div
              key={plan.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-seatsketch-tab', plan.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-seatsketch-tab')) {
                  e.preventDefault();
                  setDragOver(index);
                }
              }}
              onDragLeave={() => setDragOver((v) => (v === index ? null : v))}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('application/x-seatsketch-tab');
                if (id) movePlan(id, index);
                setDragOver(null);
              }}
              onDragEnd={() => setDragOver(null)}
              className={cx(
                'group relative flex h-8 min-w-0 max-w-56 items-center rounded-t-lg border-x border-t transition-colors',
                active ? 'border-line bg-canvas text-ink' : 'border-transparent text-muted hover:bg-hover hover:text-ink',
                dragOver === index && 'ring-1 ring-accent',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`plan-tab-${plan.id}`}
                onClick={() => activatePlan(plan.id)}
                className="h-full min-w-0 max-w-48 truncate px-3 text-left text-[11.5px] font-medium"
                title={active ? activeName : plan.name}
              >
                {active ? activeName : plan.name}
              </button>
              <Tooltip label={t('tabs.delete')} side="bottom">
                <button
                  type="button"
                  aria-label={`${t('tabs.delete')}: ${active ? activeName : plan.name}`}
                  data-testid={`close-plan-${plan.id}`}
                  onClick={() => void confirmDeletePlan(plan.id)}
                  className={cx(
                    'mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint transition-opacity hover:bg-danger-soft hover:text-danger',
                    active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
                  )}
                >
                  <X size={12} />
                </button>
              </Tooltip>
            </div>
          );
        })}
      </div>
      <Tooltip label={t('tabs.new')} side="bottom">
        <button
          type="button"
          aria-label={t('tabs.new')}
          data-testid="new-plan-tab"
          onClick={() => createPlan(createEmptyDocument())}
          className="mb-1 ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
        >
          <Plus size={15} />
        </button>
      </Tooltip>
    </nav>
  );
}
