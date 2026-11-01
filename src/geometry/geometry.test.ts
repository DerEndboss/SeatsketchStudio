import { describe, expect, it } from 'vitest';
import { fitBounds, screenToWorld, worldToScreen, zoomAt } from './coordinateSystem';
import { formatLength, parseLength } from './measurements';
import {
  catmullRomToBezier,
  customTableOutline,
  processStroke,
  simplifyClosed,
  simplifyRDP,
  smoothClosedPath,
} from './pathSmoothing';
import { boundsOf, isSelfIntersecting, polygonArea, pointInPolygon, signedArea, untangle } from './polygon';
import { measurePolyline, offsetClosedPolygon, pointAtDistance } from './perimeterSampling';
import { ellipseOutline, roundedRectOutline, semicircleOutline, tableOutline } from './shapes';
import { snapMove, targetFromBounds } from './snapping';
import { distance, facingRotation, rotate } from './vec';
import type { Vec2 } from './vec';

describe('Coordinate system', () => {
  it('world → screen → world is lossless', () => {
    const v = { x: 123.4, y: -56.7, scale: 87.5 };
    const p = { x: 3.21, y: -7.65 };
    const back = screenToWorld(v, worldToScreen(v, p));
    expect(back.x).toBeCloseTo(p.x, 10);
    expect(back.y).toBeCloseTo(p.y, 10);
  });

  it('zoomAt keeps the point under the mouse pointer fixed', () => {
    const v = { x: 10, y: 20, scale: 100 };
    const anchor = { x: 400, y: 300 };
    const before = screenToWorld(v, anchor);
    const z = zoomAt(v, anchor, 1.7);
    const after = screenToWorld(z, anchor);
    expect(z.scale).toBeCloseTo(170);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('fitBounds centres a 12 × 8 m room', () => {
    const v = fitBounds({ minX: 0, minY: 0, maxX: 12, maxY: 8 }, 1264, 864, 32);
    expect(v.scale).toBeCloseTo(100);
    const c = worldToScreen(v, { x: 6, y: 4 });
    expect(c.x).toBeCloseTo(632);
    expect(c.y).toBeCloseTo(432);
  });

  it('scale is independent of pixel density: 1.8 m at 100 px/m is exactly 180 px', () => {
    const v = { x: 0, y: 0, scale: 100 };
    expect(distance(worldToScreen(v, { x: 0, y: 0 }), worldToScreen(v, { x: 1.8, y: 0 }))).toBeCloseTo(180);
  });
});

describe('Measurements', () => {
  it('formats German', () => {
    expect(formatLength(1.8, 'm')).toBe('1,80 m');
    expect(formatLength(0.45, 'cm')).toBe('45 cm');
    expect(formatLength(12, 'm')).toBe('12,00 m');
  });

  it('reads input with comma, dot and units', () => {
    expect(parseLength('1,80', 'm')).toBeCloseTo(1.8);
    expect(parseLength('1.8 m', 'm')).toBeCloseTo(1.8);
    expect(parseLength('180cm', 'm')).toBeCloseTo(1.8);
    expect(parseLength('180', 'cm')).toBeCloseTo(1.8);
    expect(parseLength('1800 mm', 'm')).toBeCloseTo(1.8);
    expect(parseLength('=1,2+0,6', 'm')).toBeCloseTo(1.8);
    expect(parseLength('abc', 'm')).toBeNull();
    expect(parseLength('', 'm')).toBeNull();
  });
});

describe('Polygons', () => {
  it('shapes are clockwise (positive area)', () => {
    expect(signedArea(roundedRectOutline(1.8, 0.8, 0))).toBeGreaterThan(0);
    expect(signedArea(roundedRectOutline(1.8, 0.8, 0.2))).toBeGreaterThan(0);
    expect(signedArea(ellipseOutline(1, 0.5))).toBeGreaterThan(0);
    expect(signedArea(semicircleOutline(1.6, 0.8))).toBeGreaterThan(0);
  });

  it('rectangle area is exact', () => {
    expect(polygonArea(roundedRectOutline(1.8, 0.8, 0))).toBeCloseTo(1.44);
  });

  it('untangle turns a figure eight into its larger loop', () => {
    // large loop on the right, small one on the left, crossing at x = 0
    const eight: Vec2[] = [
      { x: 0, y: 0 },
      { x: 2, y: -1 },
      { x: 2, y: 1 },
      { x: 0, y: 0.0001 },
      { x: -0.5, y: -0.3 },
      { x: -0.5, y: 0.3 },
    ];
    const crossed: Vec2[] = [
      { x: -1, y: -1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
    ];
    expect(isSelfIntersecting(crossed)).toBe(true);
    const fixed = untangle(crossed);
    expect(isSelfIntersecting(fixed)).toBe(false);
    expect(polygonArea(fixed)).toBeCloseTo(1, 5);
    expect(isSelfIntersecting(untangle(eight))).toBe(false);
  });
});

/** Organic "kidney table" as a freehand raw path with jitter noise. */
function kidneyStroke(jitter = 0.01, n = 220): Vec2[] {
  const pts: Vec2[] = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + 0.28 * Math.cos(2 * a) - 0.18 * Math.sin(a);
    pts.push({ x: Math.cos(a) * r * 1.1 + rnd() * jitter, y: Math.sin(a) * r * 0.6 + rnd() * jitter });
  }
  return pts;
}

describe('Path smoothing', () => {
  it('RDP keeps end points and removes collinear points', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0.0001 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const s = simplifyRDP(line, 0.01);
    expect(s).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('closed simplification clearly reduces the point count', () => {
    const raw = kidneyStroke();
    const s = simplifyClosed(raw, 0.02);
    expect(s.length).toBeLessThan(raw.length / 3);
    expect(s.length).toBeGreaterThanOrEqual(6);
  });

  it('strength 0 leaves the polygon unchanged', () => {
    const square = roundedRectOutline(1, 1, 0);
    expect(smoothClosedPath(square, { strength: 0, preserveCorners: false })).toEqual(square);
  });

  it('smoothing does not change the table size', () => {
    const p = processStroke(kidneyStroke(), 0.002)!;
    expect(p).not.toBeNull();
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const outline = customTableOutline({ points: p.points, smoothing: s, preserveCorners: false }, 2.2, 1.1);
      const b = boundsOf(outline);
      expect(b.maxX - b.minX).toBeCloseTo(2.2, 6);
      expect(b.maxY - b.minY).toBeCloseTo(1.1, 6);
      expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 6);
      expect(isSelfIntersecting(outline)).toBe(false);
      expect(signedArea(outline)).toBeGreaterThan(0);
    }
  });

  it('slider acts continuously: small change → small change in shape', () => {
    const p = processStroke(kidneyStroke(), 0.002)!;
    const outlineAt = (s: number) =>
      customTableOutline({ points: p.points, smoothing: s, preserveCorners: false }, 2, 1);
    const a = outlineAt(0.5);
    const b = outlineAt(0.51);
    // Comparison via arc-length sampling (point counts may stay the same)
    const pa = measurePolyline(a, true);
    const pb = measurePolyline(b, true);
    let maxDev = 0;
    for (let i = 0; i < 50; i++) {
      const qa = pointAtDistance(pa, (i / 50) * pa.length).point;
      let best = Infinity;
      for (const q of b) best = Math.min(best, distance(qa, q));
      maxDev = Math.max(maxDev, best);
    }
    expect(pb.length).toBeGreaterThan(0);
    expect(maxDev).toBeLessThan(0.03);
  });

  it('strong smoothing rounds a square, with corner preservation it stays angular', () => {
    const square = roundedRectOutline(1, 1, 0);
    const smooth = smoothClosedPath(square, { strength: 1, preserveCorners: false });
    const keep = smoothClosedPath(square, { strength: 1, preserveCorners: true });
    const cornerDist = (pts: Vec2[]) => Math.min(...pts.map((q) => distance(q, { x: 0.5, y: -0.5 })));
    expect(cornerDist(smooth)).toBeGreaterThan(0.05);
    expect(cornerDist(keep)).toBeLessThan(1e-9);
  });

  it('survives broken input', () => {
    expect(processStroke([], 0.01)).toBeNull();
    expect(processStroke([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0.01)).toBeNull();
    // stroke without area (there and back)
    expect(processStroke([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0.001 }], 0.001)).toBeNull();
    // NaN points are ignored
    const sq = [{ x: 0, y: 0 }, { x: NaN, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(processStroke(sq, 0.001)).not.toBeNull();
  });

  it('a freehand figure eight becomes the larger loop instead of nonsense', () => {
    const pts: Vec2[] = [];
    for (let i = 0; i < 200; i++) {
      const t = (i / 200) * Math.PI * 2;
      pts.push({ x: Math.sin(t) * 1.5, y: Math.sin(t) * Math.cos(t) * (t < Math.PI ? 1 : 0.4) });
    }
    const p = processStroke(pts, 0.002);
    expect(p).not.toBeNull();
    const outline = customTableOutline({ points: p!.points, smoothing: 0.5, preserveCorners: false }, p!.width, p!.height);
    expect(isSelfIntersecting(outline)).toBe(false);
  });

  it('Catmull-Rom creates one Bézier segment per point and hits every point', () => {
    const pts = ellipseOutline(1, 0.5, 16);
    const segs = catmullRomToBezier(pts, true);
    expect(segs).toHaveLength(16);
    segs.forEach((s, i) => {
      expect(s.to.x).toBeCloseTo(pts[(i + 1) % 16].x);
      expect(s.to.y).toBeCloseTo(pts[(i + 1) % 16].y);
    });
  });
});

describe('Outlines', () => {
  it('the offset of a circle is a larger circle', () => {
    const c = ellipseOutline(0.8, 0.8, 96);
    const off = offsetClosedPolygon(c, 0.3);
    for (const p of off) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1.1, 2);
  });

  it('the offset of an indentation creates no loops', () => {
    const p = processStroke(kidneyStroke(0), 0.002)!;
    const outline = customTableOutline({ points: p.points, smoothing: 0, preserveCorners: false }, 2.4, 1.2);
    const off = offsetClosedPolygon(outline, 0.3);
    expect(isSelfIntersecting(off)).toBe(false);
    for (const q of outline) expect(pointInPolygon(q, off)).toBe(true);
  });

  it('half-round has the right size', () => {
    const b = boundsOf(tableOutline({ shape: 'semicircle', width: 1.6, height: 0.8, cornerRadius: 0 }));
    expect(b.maxX - b.minX).toBeCloseTo(1.6);
    expect(b.maxY - b.minY).toBeCloseTo(0.8, 2);
  });
});

describe('Snapping', () => {
  it('snaps to the edge of a neighbour and creates a guide', () => {
    const r = snapMove({
      moving: { minX: 2.03, minY: 5, maxX: 3.03, maxY: 6 },
      anchor: { x: 2.53, y: 5.5 },
      targets: [targetFromBounds({ minX: 0, minY: 0, maxX: 2, maxY: 1 })],
      threshold: 0.05,
      grid: 0.5,
    });
    expect(r.dx).toBeCloseTo(-0.03);
    expect(r.guides.some((g) => g.orientation === 'v' && Math.abs(g.pos - 2) < 1e-9)).toBe(true);
    // y: no target in range → grid (centre 5.5 already lies on the 0.5 grid)
    expect(r.dy).toBeCloseTo(0);
  });

  it('without a target the centre snaps to the grid', () => {
    const r = snapMove({
      moving: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      anchor: { x: 0.62, y: 0.38 },
      targets: [],
      threshold: 0.05,
      grid: 0.25,
    });
    expect(0.62 + r.dx).toBeCloseTo(0.5);
    expect(0.38 + r.dy).toBeCloseTo(0.5);
  });
});

describe('Chair orientation', () => {
  it('facingRotation turns the chair front in the requested direction', () => {
    for (const dir of [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0.6, y: 0.8 },
    ]) {
      const front = rotate({ x: 0, y: -1 }, facingRotation(dir));
      expect(front.x).toBeCloseTo(dir.x);
      expect(front.y).toBeCloseTo(dir.y);
    }
  });
});
