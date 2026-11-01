import { useUi } from '../../state/uiStore';
import { formatLengthShort } from '../../geometry/measurements';

const NICE = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];

/** Scale bar at the bottom left: shows a "round" length between 56 and 140 pixels. */
export function ScaleBar() {
  const scale = useUi((s) => s.viewport.scale);
  const len = NICE.find((n) => n * scale >= 56) ?? NICE[NICE.length - 1];
  const px = Math.round(len * scale);
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col items-start gap-1 text-[10.5px] font-medium tabular-nums text-muted">
      <span>{formatLengthShort(len, len < 1 ? 'cm' : 'm')}</span>
      <div className="h-[5px] border-x border-b border-current" style={{ width: px }} />
    </div>
  );
}
