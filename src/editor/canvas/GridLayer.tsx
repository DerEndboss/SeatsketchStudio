import { useCallback } from 'react';
import { Layer, Shape } from 'react-konva';
import type Konva from 'konva';
import { type Viewport, visibleWorldBounds } from '../../geometry/coordinateSystem';
import type { Palette } from './palette';

const MIN_GAP_PX = 14;
const STEPS = [2, 2.5, 2];

/** Grid spacing that still looks calm at the current zoom (doubles/quintuples when zooming out). */
export function visibleGridStep(grid: number, scale: number): number {
  let step = grid;
  let i = 0;
  while (step * scale < MIN_GAP_PX && i < 40) {
    step *= STEPS[i % STEPS.length];
    i++;
  }
  return step;
}

interface GridLayerProps {
  viewport: Viewport;
  width: number;
  height: number;
  grid: number;
  pal: Palette;
  visible: boolean;
}

/** Subtle dot grid, drawn only in the visible area. Full metres slightly stronger. */
export function GridLayer({ viewport, width, height, grid, pal, visible }: GridLayerProps) {
  const sceneFunc = useCallback(
    (kctx: Konva.Context) => {
      if (!visible) return;
      const ctx = kctx._context;
      const scale = viewport.scale;
      const step = visibleGridStep(grid, scale);
      const major = step < 1 ? 1 : step * 5;
      const b = visibleWorldBounds(viewport, width, height);
      const x0 = Math.floor(b.minX / step);
      const x1 = Math.ceil(b.maxX / step);
      const y0 = Math.floor(b.minY / step);
      const y1 = Math.ceil(b.maxY / step);
      if ((x1 - x0) * (y1 - y0) > 60000) return;
      const s = 1.5 / scale;
      const sm = 2.2 / scale;
      const isMajor = (v: number) => Math.abs(v / major - Math.round(v / major)) < 1e-6;
      ctx.fillStyle = pal.gridMinor;
      for (let i = x0; i <= x1; i++) {
        const x = i * step;
        const mx = isMajor(x);
        for (let j = y0; j <= y1; j++) {
          const y = j * step;
          if (mx && isMajor(y)) continue;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      ctx.fillStyle = pal.gridMajor;
      const mx0 = Math.floor(b.minX / major);
      const mx1 = Math.ceil(b.maxX / major);
      const my0 = Math.floor(b.minY / major);
      const my1 = Math.ceil(b.maxY / major);
      for (let i = mx0; i <= mx1; i++) {
        for (let j = my0; j <= my1; j++) ctx.fillRect(i * major - sm / 2, j * major - sm / 2, sm, sm);
      }
    },
    [viewport, width, height, grid, pal, visible],
  );
  return (
    <Layer listening={false}>
      <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />
    </Layer>
  );
}
