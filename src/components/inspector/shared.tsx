import { Copy, Lock, LockOpen, Trash, TriangleAlert } from 'lucide-react';
import type { SceneObject, SeatDocument } from '../../types/document';
import { useEditor } from '../../state/editorStore';
import { useUi } from '../../state/uiStore';
import { useInteraction } from '../../state/interactionStore';
import { useT } from '../../i18n';
import { mapObjects } from '../../editor/objects/tableOps';
import { WARNING_KEYS } from '../../geometry/collisionDetection';
import { getLookup } from '../../state/lookup';
import { worldPlacement } from '../../geometry/objects';
import * as cmd from '../../editor/commands';
import { Button } from '../ui/Button';
import { LengthField, Note, Pair, Row, Section } from '../ui/Fields';

/** Change one object; the same `key` within a short time = one undo step (typing, sliders). */
export function patchObject<T extends SceneObject>(id: string, fn: (o: T) => T, key?: string): void {
  useEditor.getState().apply((d) => mapObjects(d, [id], (o) => fn(o as T)), key ? { coalesce: `${key}:${id}` } : undefined);
}

export function applyDoc(fn: (d: SeatDocument) => SeatDocument, key?: string): void {
  useEditor.getState().apply(fn, key ? { coalesce: key } : undefined);
}

export function useFocusKey(field: string): string | undefined {
  const req = useUi((s) => s.focusRequest);
  return req && req.field === field ? `${field}:${req.nonce}` : undefined;
}

export function Warnings({ id }: { id: string }) {
  const t = useT();
  const list = useInteraction((s) => s.warnings.get(id));
  if (!list?.length) return null;
  return (
    <div className="px-4 pt-3">
      <Note tone="warn">
        <span className="flex items-start gap-1.5">
          <TriangleAlert size={13} strokeWidth={2} className="mt-px shrink-0" />
          <span>{t('insp.warning', { list: list.map((k) => t(WARNING_KEYS[k])).join(t('insp.and')) })}</span>
        </span>
      </Note>
    </div>
  );
}

export function PositionRow({ o, unit }: { o: SceneObject; unit: SeatDocument['settings']['unit'] }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const p = worldPlacement(o, getLookup(doc));
  return (
    <Row label={t('insp.position')}>
      <Pair>
        <LengthField
          prefix="X"
          value={p.x}
          unit={unit}
          min={-10000}
          max={10000}
          aria-label={`${t('insp.position')} X`}
          onChange={(x) => patchObject(o.id, (q) => ({ ...q, x: q.x + (x - p.x) }), 'pos')}
        />
        <LengthField
          prefix="Y"
          value={p.y}
          unit={unit}
          min={-10000}
          max={10000}
          aria-label={`${t('insp.position')} Y`}
          onChange={(y) => patchObject(o.id, (q) => ({ ...q, y: q.y + (y - p.y) }), 'pos')}
        />
      </Pair>
    </Row>
  );
}

export function ObjectActions({ o, extra }: { o: SceneObject; extra?: React.ReactNode }) {
  const t = useT();
  return (
    <Section>
      <div className="flex flex-wrap gap-1.5">
        {extra}
        <Button size="sm" icon={Copy} onClick={cmd.duplicateSelection} disabled={o.type === 'chair' && !!o.tableId}>
          {t('insp.duplicate')}
        </Button>
        <Button size="sm" icon={o.locked ? LockOpen : Lock} onClick={cmd.toggleLock}>
          {t(o.locked ? 'insp.unlock' : 'insp.lock')}
        </Button>
        <Button size="sm" variant="danger" icon={Trash} onClick={cmd.deleteSelection} disabled={o.locked} data-testid="delete">
          {t('insp.delete')}
        </Button>
      </div>
    </Section>
  );
}

export function PanelTitle({ title, sub, icon: Icon }: { title: string; sub?: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-hover text-muted">
        <Icon size={15} strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-semibold text-ink">{title}</div>
        {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
      </div>
    </div>
  );
}
