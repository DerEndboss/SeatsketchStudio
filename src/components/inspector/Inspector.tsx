import { useEditor } from '../../state/editorStore';
import { useUi } from '../../state/uiStore';
import { useT } from '../../i18n';
import { findObject } from '../../state/lookup';
import type { SceneObject } from '../../types/document';
import { cx } from '../ui/Button';
import { TableInspector } from './TableInspector';
import { ChairInspector } from './ChairInspector';
import { MultiInspector } from './MultiInspector';
import { DocumentInspector } from './DocumentInspector';
import { TemplateLibrary } from '../TemplateLibrary';
import { GuestPanel } from './GuestPanel';
import {
  ColumnInspector,
  DimensionInspector,
  DoorInspector,
  LabelInspector,
  RoomInspector,
  WallInspector,
  WindowInspector,
  ZoneInspector,
} from './ObjectInspectors';

function SingleInspector({ o }: { o: SceneObject }) {
  const unit = useEditor((s) => s.doc.settings.unit);
  switch (o.type) {
    case 'table':
      return <TableInspector table={o} />;
    case 'chair':
      return <ChairInspector chair={o} />;
    case 'room':
      return <RoomInspector room={o} unit={unit} />;
    case 'door':
      return <DoorInspector door={o} unit={unit} />;
    case 'window':
      return <WindowInspector win={o} unit={unit} />;
    case 'column':
      return <ColumnInspector col={o} unit={unit} />;
    case 'wall':
      return <WallInspector wall={o} unit={unit} />;
    case 'label':
      return <LabelInspector label={o} unit={unit} />;
    case 'dimension':
      return <DimensionInspector dim={o} unit={unit} />;
    case 'zone':
      return <ZoneInspector zone={o} unit={unit} />;
  }
  const unhandled: never = o;
  return unhandled;
}

/** Right sidebar: properties of the selection or the guest list. */
export function Inspector() {
  const t = useT();
  const panel = useUi((s) => s.panel);
  const templatesOpen = useUi((s) => s.templatesOpen);
  const setPanel = useUi((s) => s.setPanel);
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const objects = selection.map((id) => findObject(doc, id)).filter((o): o is SceneObject => !!o);
  const guests = doc.guests.length;

  const tab = (id: 'inspect' | 'guests', label: string, count?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={panel === id}
      data-testid={`tab-${id}`}
      onClick={() => setPanel(id)}
      className={cx(
        'relative flex h-10 items-center gap-1.5 px-1 text-[12.5px] font-medium transition-colors',
        panel === id ? 'text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {label}
      {count !== undefined && count > 0 && <span className="rounded-full bg-hover px-1.5 text-[10.5px] tabular-nums text-muted">{count}</span>}
      {panel === id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
    </button>
  );

  return (
    <aside className="flex w-[316px] shrink-0 flex-col border-l border-line bg-panel" aria-label={t('insp.properties')} data-testid="inspector">
      <div role="tablist" className="flex shrink-0 gap-4 border-b border-line px-4">
        {tab('inspect', t('insp.properties'))}
        {tab('guests', t('insp.guests'), guests)}
      </div>
      {panel === 'guests' ? (
        <GuestPanel />
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {templatesOpen ? (
            <TemplateLibrary />
          ) : objects.length === 0 ? (
            <DocumentInspector />
          ) : objects.length === 1 ? (
            <SingleInspector key={objects[0].id} o={objects[0]} />
          ) : (
            <MultiInspector objects={objects} />
          )}
        </div>
      )}
    </aside>
  );
}
