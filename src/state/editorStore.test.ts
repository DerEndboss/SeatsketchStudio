import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from './editorStore';
import { createEmptyDocument, createTable, presetById } from '../editor/objects/factory';
import { translateObjects } from '../editor/objects/docOps';
import { withObjects } from '../editor/objects/tableOps';

const ed = () => useEditor.getState();

describe('Undo/Redo', () => {
  beforeEach(() => ed().load(createEmptyDocument('Test')));

  it('every change is one step, undo/redo restore exactly', () => {
    const t = createTable(presetById('round'), { x: 0, y: 0 }, 'Tisch 1');
    const d0 = ed().doc;
    ed().apply((d) => withObjects(d, [...d.objects, t]));
    const d1 = ed().doc;
    ed().apply((d) => translateObjects(d, [t.id], 1, 0));
    expect(ed().past).toHaveLength(2);
    ed().undo();
    expect(ed().doc).toBe(d1);
    ed().undo();
    expect(ed().doc).toBe(d0);
    ed().redo();
    ed().redo();
    expect(ed().doc.objects[0].x).toBe(1);
    expect(ed().future).toHaveLength(0);
  });

  it('same coalesce key = a single undo step (sliders, typing)', () => {
    const t = createTable(presetById('rect'), { x: 0, y: 0 }, 'Tisch 1');
    ed().apply((d) => withObjects(d, [t]));
    for (let i = 1; i <= 10; i++) ed().apply((d) => translateObjects(d, [t.id], 0.1, 0), { coalesce: 'nudge' });
    expect(ed().past).toHaveLength(2);
    ed().undo();
    expect(ed().doc.objects[0].x).toBe(0);
  });

  it('transaction (dragging): many previews, one undo step; cancelling restores the start', () => {
    const t = createTable(presetById('rect'), { x: 0, y: 0 }, 'Tisch 1');
    ed().apply((d) => withObjects(d, [t]));
    const before = ed().doc;
    ed().begin();
    for (let i = 1; i <= 20; i++) ed().preview(translateObjects(before, [t.id], i * 0.1, 0));
    ed().commit();
    expect(ed().past).toHaveLength(2);
    expect(ed().doc.objects[0].x).toBeCloseTo(2, 9);

    const mid = ed().doc;
    ed().begin();
    ed().preview(translateObjects(mid, [t.id], 5, 5));
    ed().cancel();
    expect(ed().doc).toBe(mid);
    expect(ed().past).toHaveLength(2);
  });

  it('a click without movement creates no undo step', () => {
    ed().begin();
    ed().commit();
    expect(ed().past).toHaveLength(0);
  });

  it('the selection drops objects deleted by undo', () => {
    const t = createTable(presetById('rect'), { x: 0, y: 0 }, 'Tisch 1');
    ed().apply((d) => withObjects(d, [t]));
    ed().setSelection([t.id]);
    ed().undo();
    expect(ed().selection).toEqual([]);
  });

  it('view options without an undo step', () => {
    ed().apply((d) => ({ ...d, settings: { ...d.settings, showGrid: false } }), { history: false });
    expect(ed().past).toHaveLength(0);
    expect(ed().doc.settings.showGrid).toBe(false);
  });
});
