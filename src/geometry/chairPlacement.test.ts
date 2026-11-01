import { describe, expect, it } from 'vitest';
import {
  allocateAcrossTables,
  allocateProportional,
  layoutChairs,
  seatingCapacity,
  snapPoseToTable,
} from './chairPlacement';
import { processStroke } from './pathSmoothing';
import { closestPointOnPolyline, pointInPolygon, rectPolygon, transformPoints, polygonsIntersect } from './polygon';
import { tableOutline } from './shapes';
import { distance, rotate } from './vec';
import type { Vec2 } from './vec';
import type { ChairSize, SeatingConfig, TableObject } from '../types/document';

const CHAIR: ChairSize = { width: 0.45, depth: 0.45 };
const seating = (over: Partial<SeatingConfig> = {}): SeatingConfig => ({
  mode: 'perimeter',
  sides: [true, true, true, true],
  gap: 0.05,
  auto: true,
  ...over,
});

function table(over: Partial<TableObject>): TableObject {
  return {
    id: 't',
    type: 'table',
    name: 'Tisch',
    x: 0,
    y: 0,
    rotation: 0,
    shape: 'rect',
    width: 1.8,
    height: 0.8,
    cornerRadius: 0,
    seating: seating(),
    ...over,
  };
}

const chairPoly = (p: { x: number; y: number; rotation: number }) =>
  transformPoints(rectPolygon(CHAIR.width, CHAIR.depth), p.x, p.y, p.rotation);

/** No two chairs may overlap (slightly shrunk, touching is fine). */
function noChairOverlaps(poses: Array<{ x: number; y: number; rotation: number }>) {
  const polys = poses.map((p) => transformPoints(rectPolygon(CHAIR.width * 0.98, CHAIR.depth * 0.98), p.x, p.y, p.rotation));
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      expect(polygonsIntersect(polys[i], polys[j]), `chairs ${i} and ${j} overlap`).toBe(false);
    }
  }
}

/** The chair front faces the table: the point in front of the chair is closer to the table than the backrest. */
function facesTable(t: TableObject, p: { x: number; y: number; rotation: number }) {
  const outline = tableOutline(t);
  const front = rotate({ x: 0, y: -0.2 }, p.rotation);
  const pf = { x: p.x + front.x, y: p.y + front.y };
  const pb = { x: p.x - front.x, y: p.y - front.y };
  expect(closestPointOnPolyline(pf, outline).distance).toBeLessThan(closestPointOnPolyline(pb, outline).distance);
}

describe('Round table', () => {
  const t = table({ shape: 'round', width: 1.6, height: 1.6 });

  it('8 chairs → exactly 8, same distance to the centre, equal angles', () => {
    const { poses, overfull } = layoutChairs(t, 8, CHAIR);
    expect(poses).toHaveLength(8);
    expect(overfull).toBe(false);
    const r = 0.8 + 0.05 + CHAIR.depth / 2;
    for (const p of poses) expect(Math.hypot(p.x, p.y)).toBeCloseTo(r, 2);
    const angles = poses.map((p) => Math.atan2(p.y, p.x));
    for (let i = 0; i < 8; i++) {
      let d = angles[(i + 1) % 8] - angles[i];
      if (d < 0) d += Math.PI * 2;
      expect(d).toBeCloseTo(Math.PI / 4, 2);
    }
    // first seat at the top centre
    expect(poses[0].x).toBeCloseTo(0, 3);
    expect(poses[0].y).toBeLessThan(0);
    poses.forEach((p) => facesTable(t, p));
    noChairOverlaps(poses);
  });

  it('capacity: as many chairs as fit without overlap, one more overlaps', () => {
    const cap = seatingCapacity(t, CHAIR);
    expect(cap).toBeGreaterThanOrEqual(10);
    expect(cap).toBeLessThanOrEqual(13);
    const { poses, overfull } = layoutChairs(t, cap, CHAIR);
    expect(overfull).toBe(false);
    noChairOverlaps(poses);
    const more = layoutChairs(t, cap + 1, CHAIR);
    expect(more.overfull).toBe(true);
    expect(more.poses).toHaveLength(cap + 1);
  });
});

describe('Rectangular table 1.80 × 0.80', () => {
  it('long sides only, 6 chairs → 3 top + 3 bottom', () => {
    const t = table({ seating: seating({ mode: 'long' }) });
    const { poses } = layoutChairs(t, 6, CHAIR);
    expect(poses).toHaveLength(6);
    const top = poses.filter((p) => p.y < 0);
    const bottom = poses.filter((p) => p.y > 0);
    expect(top).toHaveLength(3);
    expect(bottom).toHaveLength(3);
    expect(top.map((p) => p.x)).toEqual([-0.6, 0, 0.6].map((x) => expect.closeTo(x, 6)));
    for (const p of top) expect(p.y).toBeCloseTo(-(0.4 + 0.05 + 0.225), 6);
    for (const p of top) expect(Math.abs(p.rotation) % 360).toBeCloseTo(180, 6);
    for (const p of bottom) expect(p.rotation).toBeCloseTo(0, 6);
    noChairOverlaps(poses);
  });

  it('all around, 6 chairs → 2 / 1 / 2 / 1', () => {
    const t = table({});
    const { poses } = layoutChairs(t, 6, CHAIR);
    const count = (f: (p: Vec2) => boolean) => poses.filter(f).length;
    expect(count((p) => p.y < -0.4)).toBe(2);
    expect(count((p) => p.y > 0.4)).toBe(2);
    expect(count((p) => p.x > 0.9)).toBe(1);
    expect(count((p) => p.x < -0.9)).toBe(1);
    noChairOverlaps(poses);
    poses.forEach((p) => facesTable(t, p));
  });

  it('individual sides: top only → all at the top', () => {
    const t = table({ seating: seating({ mode: 'sides', sides: [true, false, false, false] }) });
    const { poses, capacity } = layoutChairs(t, 3, CHAIR);
    expect(capacity).toBe(3);
    expect(poses.every((p) => p.y < 0)).toBe(true);
  });

  it('5 chairs on the long sides → 3 + 2', () => {
    const t = table({ seating: seating({ mode: 'long' }) });
    const { poses } = layoutChairs(t, 5, CHAIR);
    expect(poses.filter((p) => p.y < 0)).toHaveLength(3);
    expect(poses.filter((p) => p.y > 0)).toHaveLength(2);
  });

  it('too many chairs → warning, but all placed anyway', () => {
    const t = table({ seating: seating({ mode: 'long' }) });
    const r = layoutChairs(t, 10, CHAIR);
    expect(r.poses).toHaveLength(10);
    expect(r.overfull).toBe(true);
    expect(r.capacity).toBe(6);
  });

  it('banquet 2.40 m seats 4 per long side', () => {
    const t = table({ width: 2.4, height: 0.8, seating: seating({ mode: 'long' }) });
    expect(seatingCapacity(t, CHAIR)).toBe(8);
  });
});

describe('Oval and freehand tables', () => {
  it('oval: equal arc spacing, symmetric, no overlap', () => {
    const t = table({ shape: 'oval', width: 2.2, height: 1.2 });
    const { poses } = layoutChairs(t, 8, CHAIR);
    expect(poses).toHaveLength(8);
    // symmetric about the y axis: every chair has a mirrored counterpart
    for (const p of poses) {
      expect(poses.some((q) => Math.abs(q.x + p.x) < 1e-3 && Math.abs(q.y - p.y) < 1e-3)).toBe(true);
    }
    noChairOverlaps(poses);
    poses.forEach((p) => facesTable(t, p));
  });

  it('freehand kidney table: exactly N chairs, all outside, all facing the table', () => {
    const raw: Vec2[] = [];
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      const r = 1 + 0.3 * Math.cos(2 * a) - 0.2 * Math.sin(a);
      raw.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.55 });
    }
    const p = processStroke(raw, 0.002)!;
    for (const smoothing of [0, 0.5, 1]) {
      const t = table({
        shape: 'custom',
        width: 2.4,
        height: 1.2,
        path: { points: p.points, smoothing, preserveCorners: false },
      });
      const outline = tableOutline(t);
      for (const n of [4, 7, 10]) {
        const { poses } = layoutChairs(t, n, CHAIR);
        expect(poses).toHaveLength(n);
        for (const pose of poses) {
          expect(pointInPolygon(pose, outline)).toBe(false);
          const d = closestPointOnPolyline(pose, outline).distance;
          expect(d).toBeGreaterThan(0.05 + CHAIR.depth / 2 - 0.02);
          facesTable(t, pose);
        }
        noChairOverlaps(poses);
      }
    }
  });

  it('freehand: equal gaps between neighbours (arc length on the chair track)', () => {
    const raw: Vec2[] = [];
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      raw.push({ x: Math.cos(a) * 1.2 + 0.2 * Math.cos(3 * a), y: Math.sin(a) * 0.7 });
    }
    const p = processStroke(raw, 0.002)!;
    const t = table({ shape: 'custom', width: 2.4, height: 1.4, path: { points: p.points, smoothing: 0.6, preserveCorners: false } });
    const { poses } = layoutChairs(t, 9, CHAIR);
    const gaps = poses.map((q, i) => distance(q, poses[(i + 1) % poses.length]));
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    for (const g of gaps) expect(Math.abs(g - mean) / mean).toBeLessThan(0.12);
  });

  it('half-round, arc side only: all chairs below the straight edge', () => {
    const t = table({ shape: 'semicircle', width: 1.6, height: 0.8, seating: seating({ mode: 'long' }) });
    const { poses } = layoutChairs(t, 4, CHAIR);
    expect(poses).toHaveLength(4);
    for (const pose of poses) expect(pose.y).toBeGreaterThan(-0.4);
    noChairOverlaps(poses);
  });
});

describe('Proportional distribution (expected/actual)', () => {
  it('the sum is always right and no limit is exceeded', () => {
    const cases: Array<[number[], number, number[]]> = [
      [[1, 1, 1], 10, [4, 4, 4]],
      [[13, 13, 13, 13, 6, 6], 30, [8, 8, 8, 8, 6, 6]],
      [[3, 1], 7, [10, 10]],
      [[5, 5, 5], 0, [5, 5, 5]],
      [[2, 0, 2], 3, [5, 5, 5]],
    ];
    for (const [w, total, caps] of cases) {
      const r = allocateProportional(w, total, caps);
      const capSum = caps.reduce((s, c) => s + c, 0);
      expect(r.reduce((s, x) => s + x, 0)).toBe(Math.min(total, capSum));
      r.forEach((x, i) => expect(x).toBeLessThanOrEqual(caps[i]));
    }
  });

  it('10 across three equal tables → 4/3/3', () => {
    expect(allocateProportional([1, 1, 1], 10)).toEqual([4, 3, 3]);
  });

  it('no weights → evenly', () => {
    expect(allocateProportional([0, 0], 5, [5, 5])).toEqual([3, 2]);
  });
});

describe('Distribute chairs across tables (expected/actual)', () => {
  const round = (id: string) => ({ id, capacity: seatingCapacity(table({ shape: 'round', width: 1.6, height: 1.6 }), CHAIR) });
  const rect = (id: string) => ({ id, capacity: seatingCapacity(table({ seating: seating({ mode: 'long' }) }), CHAIR) });

  it('30 chairs, max 8, 4 round + 2 rectangular → exactly 30, round ones get more', () => {
    const r = allocateAcrossTables([round('a'), round('b'), round('c'), round('d'), rect('e'), rect('f')], 30, 8);
    expect(r.placed).toBe(30);
    for (const n of r.counts.values()) expect(n).toBeLessThanOrEqual(8);
    expect(r.counts.get('a')!).toBeGreaterThan(r.counts.get('e')!);
  });

  it('more chairs than room → all tables full (up to max), the rest is reported', () => {
    const r = allocateAcrossTables([round('a'), rect('b')], 40, 8);
    expect(r.counts.get('a')).toBe(8);
    expect(r.counts.get('b')).toBe(6);
    expect(r.placed).toBe(14);
    expect(r.requested - r.placed).toBe(26);
  });

  it('max per table is never exceeded', () => {
    const r = allocateAcrossTables([round('a'), round('b')], 20, 5);
    expect(r.counts.get('a')).toBe(5);
    expect(r.counts.get('b')).toBe(5);
  });

  it('0 chairs → all 0', () => {
    const r = allocateAcrossTables([round('a'), rect('b')], 0, 8);
    expect([...r.counts.values()]).toEqual([0, 0]);
  });
});

describe('Dock a chair to a table edge', () => {
  it('point next to a rectangular table → chair at the right distance, facing the table', () => {
    const t = table({});
    const { pose } = snapPoseToTable(t, { x: 0.3, y: 0.9 }, CHAIR);
    expect(pose.x).toBeCloseTo(0.3);
    expect(pose.y).toBeCloseTo(0.4 + 0.05 + 0.225);
    expect(pose.rotation).toBeCloseTo(0);
    const poly = chairPoly(pose);
    expect(polygonsIntersect(poly, tableOutline(t))).toBe(false);
  });
});
