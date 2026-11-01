import { describe, expect, it } from 'vitest';
import { miterOffset, roomWallPieces, snapToRoomWall } from './walls';
import { createRectRoom } from '../editor/objects/factory';
import { rotate } from './vec';

describe('Walls', () => {
  it('mitre: rectangle 4 × 2 offset outwards by 0.1 → 4.2 × 2.2 with sharp corners', () => {
    const out = miterOffset(
      [
        { x: -2, y: -1 },
        { x: 2, y: -1 },
        { x: 2, y: 1 },
        { x: -2, y: 1 },
      ],
      0.1,
    );
    expect(out[0].x).toBeCloseTo(-2.1, 9);
    expect(out[0].y).toBeCloseTo(-1.1, 9);
    expect(out[2].x).toBeCloseTo(2.1, 9);
    expect(out[2].y).toBeCloseTo(1.1, 9);
  });

  it('a door snaps into the nearest wall and faces into the room', () => {
    const room = createRectRoom(10, 6);
    // just inside the bottom wall
    const snap = snapToRoomWall({ x: 1, y: 2.85 }, [room], 0.9, 0.6);
    expect(snap).not.toBeNull();
    expect(snap!.y).toBeCloseTo(3, 9);
    expect(snap!.x).toBeCloseTo(1, 9);
    expect(snap!.wallDepth).toBe(room.wallThickness);
    // local +y points into the room (upwards)
    const inward = rotate({ x: 0, y: 1 }, snap!.rotation);
    expect(inward.y).toBeLessThan(-0.99);
  });

  it('an opening is not pushed past a room corner', () => {
    const room = createRectRoom(10, 6);
    const snap = snapToRoomWall({ x: 4.95, y: 3.05 }, [room], 1.2, 0.6);
    expect(snap!.x).toBeLessThanOrEqual(5 - 0.6 + 1e-9);
  });

  it('far away from any wall: no snapping', () => {
    const room = createRectRoom(10, 6);
    expect(snapToRoomWall({ x: 0, y: 0 }, [room], 0.9, 0.6)).toBeNull();
  });
});

describe('Wall pieces for 3D', () => {
  it('a door in the middle of the bottom wall splits it into wall / door / wall', () => {
    const room = createRectRoom(10, 6);
    const pieces = roomWallPieces(room, [{ x: 0, y: 3, rotation: 180, width: 1, kind: 'door' }]);
    const doors = pieces.filter((p) => p.kind === 'door');
    expect(doors).toHaveLength(1);
    expect(doors[0].length).toBeCloseTo(1, 9);
    // 4 walls + 1 extra piece from the split + door
    expect(pieces.filter((p) => p.kind === 'wall')).toHaveLength(5);
    const wallLength = pieces.filter((p) => p.kind === 'wall').reduce((s, p) => s + p.length, 0);
    expect(wallLength).toBeCloseTo(2 * 10 + 2 * 6 - 1, 9);
  });

  it('cuts at openings are square, corners are mitred', () => {
    const room = createRectRoom(4, 4);
    const pieces = roomWallPieces(room, [{ x: 0, y: -2, rotation: 0, width: 1.2, kind: 'window' }]);
    const win = pieces.find((p) => p.kind === 'window')!;
    const [i0, , , o0] = win.quad;
    expect(o0.x).toBeCloseTo(i0.x, 9);
    expect(Math.abs(o0.y - i0.y)).toBeCloseTo(room.wallThickness, 9);
    const corner = pieces[0].quad[3];
    expect(Math.abs(corner.x)).toBeCloseTo(2 + room.wallThickness, 9);
  });

  it('perpendicular or distant objects cut no opening', () => {
    const room = createRectRoom(10, 6);
    const pieces = roomWallPieces(room, [
      { x: 0, y: 3, rotation: 90, width: 1, kind: 'door' },
      { x: 0, y: 0, rotation: 180, width: 1, kind: 'door' },
    ]);
    expect(pieces.every((p) => p.kind === 'wall')).toBe(true);
    expect(pieces).toHaveLength(4);
  });
});
