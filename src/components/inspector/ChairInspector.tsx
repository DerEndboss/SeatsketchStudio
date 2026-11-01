import { useId } from 'react';
import { Armchair, Unlink, UserX } from 'lucide-react';
import type { ChairObject } from '../../types/document';
import { useEditor } from '../../state/editorStore';
import { useT } from '../../i18n';
import { getLookup } from '../../state/lookup';
import { worldPlacement } from '../../geometry/objects';
import { normalizeAngle } from '../../geometry/vec';
import { assignGuest, assignGuestByName, detachChairs, seatLabel } from '../../editor/objects/tableOps';
import { markManual } from '../../editor/objects/docOps';
import { AngleField, Row, Section, TextField } from '../ui/Fields';
import { Button } from '../ui/Button';
import { applyDoc, ObjectActions, PanelTitle, PositionRow, Warnings, useFocusKey } from './shared';

export function ChairInspector({ chair }: { chair: ChairObject }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const listId = useId();
  const guest = chair.guestId ? doc.guests.find((g) => g.id === chair.guestId) : undefined;
  const lookup = getLookup(doc);
  const world = worldPlacement(chair, lookup);
  const focus = useFocusKey('chair-guest');

  return (
    <div data-testid="inspector-chair">
      <PanelTitle icon={Armchair} title={guest ? guest.name : t('chair.free')} sub={seatLabel(doc, chair)} />
      <Warnings id={chair.id} />
      <Section title={t('chair.guest')}>
        <TextField value={guest?.name ?? ''} placeholder={t('chair.placeholder')} list={listId} focusKey={focus} aria-label={t('chair.guestName')} data-testid="chair-guest" onCommit={(v) => applyDoc((d) => assignGuestByName(d, chair.id, v))} />
        <datalist id={listId}>
          {doc.guests.map((g) => (
            <option key={g.id} value={g.name} />
          ))}
        </datalist>
        {guest && (
          <Button size="sm" variant="ghost" icon={UserX} className="self-start" onClick={() => applyDoc((d) => assignGuest(d, chair.id, undefined))}>
            {t('chair.release')}
          </Button>
        )}
      </Section>
      <Section title={t('chair.place')}>
        <Row label={t('insp.rotation')}>
          <AngleField
            value={world.rotation}
            disabled={chair.locked}
            onChange={(deg) =>
              applyDoc((d) => {
                const parent = chair.tableId ? getLookup(d).tables.get(chair.tableId) : undefined;
                const rotation = normalizeAngle(deg - (parent?.rotation ?? 0));
                const next = { ...d, objects: d.objects.map((o) => (o.id === chair.id ? { ...o, rotation } : o)) };
                return parent ? markManual(next, [parent.id]) : next;
              }, `rot:${chair.id}`)
            }
          />
        </Row>
        {!chair.tableId && <PositionRow o={chair} unit={doc.settings.unit} />}
        {chair.tableId && (
          <Button size="sm" variant="ghost" icon={Unlink} className="self-start" onClick={() => applyDoc((d) => detachChairs(d, [chair.id]))}>
            {t('chair.detach')}
          </Button>
        )}
      </Section>
      <ObjectActions o={chair} />
    </div>
  );
}
