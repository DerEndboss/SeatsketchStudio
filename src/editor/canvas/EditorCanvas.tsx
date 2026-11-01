import { useEffect, useRef } from 'react';
import { Stage } from 'react-konva';
import type Konva from 'konva';
import { useEditor } from '../../state/editorStore';
import { useUi, resolvedTheme } from '../../state/uiStore';
import { Controller } from '../interactions/controller';
import { fitView } from '../commands';
import { GridLayer } from './GridLayer';
import { SceneLayer } from './SceneLayer';
import { OverlayLayer } from './OverlayLayer';
import { paletteFor } from './palette';
import { ScaleBar } from './ScaleBar';

let fittedOnce = false;

/** The canvas: Konva stage plus pointer controller on the surrounding element. */
export function EditorCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const viewport = useUi((s) => s.viewport);
  const size = useUi((s) => s.stageSize);
  const preview = useUi((s) => s.preview);
  const theme = useUi(resolvedTheme);
  const grid = useEditor((s) => s.doc.settings.gridSize);
  const showGrid = useEditor((s) => s.doc.settings.showGrid);
  const pal = paletteFor(theme);

  useEffect(() => {
    const el = hostRef.current!;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      useUi.getState().setStageSize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
      if (!fittedOnce && r.width > 50) {
        fittedOnce = true;
        fitView();
      }
    });
    ro.observe(el);
    const controller = new Controller(el);
    return () => {
      ro.disconnect();
      controller.destroy();
    };
  }, []);

  useEffect(() => {
    // Redraw after the web font has loaded (Konva measures text while drawing)
    void document.fonts?.ready.then(() => stageRef.current?.batchDraw());
  }, []);

  return (
    <div ref={hostRef} className="absolute inset-0 touch-none select-none overflow-hidden outline-none" data-testid="canvas">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        listening={false}
      >
        <GridLayer viewport={viewport} width={size.width} height={size.height} grid={grid} pal={pal} visible={showGrid && !preview} />
        <SceneLayer pal={pal} />
        {!preview && <OverlayLayer pal={pal} />}
      </Stage>
      <ScaleBar />
    </div>
  );
}
