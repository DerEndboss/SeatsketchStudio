import { useMemo } from 'react';
import { Layer } from 'react-konva';
import { useEditor } from '../../state/editorStore';
import { chairsByTable } from '../../state/lookup';
import type { ChairObject } from '../../types/document';
import { ObjectNode } from './nodes';
import type { Palette } from './palette';

const NO_CHAIRS: readonly ChairObject[] = [];

/** The plan itself: rooms at the bottom, then all objects in layer order. */
export function SceneLayer({ pal }: { pal: Palette }) {
  const doc = useEditor((s) => s.doc);
  const { settings } = doc;
  const guestNames = useMemo(() => new Map(doc.guests.map((g) => [g.id, g.name])), [doc.guests]);
  const byTable = chairsByTable(doc);
  // Rooms and floor areas at the bottom, everything else above in layer order
  const rooms = doc.objects.filter((o) => o.type === 'room' || o.type === 'zone');
  const rest = doc.objects.filter((o) => o.type !== 'room' && o.type !== 'zone' && !(o.type === 'chair' && o.tableId && byTable.has(o.tableId) && hasTable(doc.objects, o.tableId)));

  const common = {
    pal,
    unit: settings.unit,
    chairSize: settings.chair,
    showDims: settings.showDimensions,
    showTableNames: settings.showTableNames,
    showGuestNames: settings.showGuestNames,
    guestNames,
  };

  return (
    <Layer listening={false}>
      {rooms.map((o) => (
        <ObjectNode key={o.id} obj={o} {...common} />
      ))}
      {rest.map((o) => (
        <ObjectNode key={o.id} obj={o} {...common} chairs={o.type === 'table' ? byTable.get(o.id) ?? NO_CHAIRS : undefined} />
      ))}
    </Layer>
  );
}

const tableSets = new WeakMap<readonly unknown[], Set<string>>();
function hasTable(objects: readonly { id: string; type: string }[], id: string): boolean {
  let set = tableSets.get(objects);
  if (!set) {
    set = new Set(objects.filter((o) => o.type === 'table').map((o) => o.id));
    tableSets.set(objects, set);
  }
  return set.has(id);
}
