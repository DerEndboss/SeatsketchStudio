import type { TablePresetId } from '../editor/objects/factory';

/** Mini floor plan of the table shape with hinted chairs. */
export function TablePresetIcon({ id, size = 22 }: { id: TablePresetId; size?: number }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 } as const;
  const chair = { fill: 'currentColor', opacity: 0.45 } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {id === 'round' && (
        <>
          <circle cx="12" cy="12" r="5.5" {...s} />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <rect key={a} x="10.6" y="2.2" width="2.8" height="2.4" rx="0.8" transform={`rotate(${a} 12 12)`} {...chair} />
          ))}
        </>
      )}
      {id === 'rect' && (
        <>
          <rect x="4" y="9" width="16" height="6" rx="0.8" {...s} />
          {[6.5, 11, 15.5].map((x) => (
            <g key={x}>
              <rect x={x - 1.2} y="5.2" width="2.8" height="2.4" rx="0.8" {...chair} />
              <rect x={x - 1.2} y="16.4" width="2.8" height="2.4" rx="0.8" {...chair} />
            </g>
          ))}
        </>
      )}
      {id === 'square' && (
        <>
          <rect x="7" y="7" width="10" height="10" rx="0.8" {...s} />
          <rect x="10.6" y="3" width="2.8" height="2.4" rx="0.8" {...chair} />
          <rect x="10.6" y="18.6" width="2.8" height="2.4" rx="0.8" {...chair} />
          <rect x="3" y="10.8" width="2.4" height="2.8" rx="0.8" {...chair} />
          <rect x="18.6" y="10.8" width="2.4" height="2.8" rx="0.8" {...chair} />
        </>
      )}
      {id === 'oval' && <ellipse cx="12" cy="12" rx="8.5" ry="5" {...s} />}
      {id === 'rounded' && <rect x="4" y="8" width="16" height="8" rx="3" {...s} />}
      {id === 'banquet' && (
        <>
          <rect x="1.5" y="10" width="21" height="4" rx="0.6" {...s} />
          {[4, 8, 12, 16, 20].map((x) => (
            <rect key={x} x={x - 1.2} y="6.4" width="2.4" height="2.2" rx="0.7" {...chair} />
          ))}
        </>
      )}
      {id === 'semicircle' && <path d="M4 8.5 H20 A8 8 0 0 1 4 8.5 Z" {...s} strokeLinejoin="round" />}
    </svg>
  );
}
