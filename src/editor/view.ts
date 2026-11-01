import type { SeatDocument } from '../types/document';
import { useEditor } from '../state/editorStore';
import { useUi } from '../state/uiStore';
import { findObject, getLookup } from '../state/lookup';
import { BASE_PX_PER_M, fitBounds, zoomAt } from '../geometry/coordinateSystem';
import { boundsUnion, expandBounds } from '../geometry/polygon';
import { worldBounds } from '../geometry/objects';

/** Fit everything (or only the selection) into the view. */
export function fitView(doc: SeatDocument = useEditor.getState().doc, onlySelection = false): void {
  const ui = useUi.getState();
  const { stageSize } = ui;
  const lookup = getLookup(doc);
  const ids = onlySelection ? useEditor.getState().selection : [];
  const objs = ids.length ? ids.map((id) => findObject(doc, id)).filter((o) => !!o) : doc.objects;
  const b = boundsUnion(objs.map((o) => worldBounds(o!, lookup)));
  if (!b) {
    ui.setViewport({ scale: BASE_PX_PER_M * 0.6, x: stageSize.width / 2, y: stageSize.height / 2 });
    return;
  }
  const rooms = doc.objects.some((o) => o.type === 'room');
  const margin = rooms && !ids.length ? 1.0 : 0.4;
  ui.setViewport(fitBounds(expandBounds(b, margin), stageSize.width, stageSize.height, 48));
}

export function zoomBy(factor: number): void {
  const { viewport, stageSize } = useUi.getState();
  useUi.getState().setViewport(zoomAt(viewport, { x: stageSize.width / 2, y: stageSize.height / 2 }, factor));
}

export function zoomTo100(): void {
  const { viewport } = useUi.getState();
  zoomBy(BASE_PX_PER_M / viewport.scale);
}
