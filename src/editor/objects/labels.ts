import type { ChairSize, TableObject } from '../../types/document';
import { DEG, clamp, normalizeAngle } from '../../geometry/vec';

/* Shared labelling rules for canvas and export, so both look the same. */

export const GUEST_FONT = 0.135;
export const GUEST_LINE = 1.15;
export const SEAT_FONT = 0.12;
const CHAR_WIDTH = 0.56;

/** Shorten long names: "Maximilian von Hohenstein" → "Maximilian v. H." */
export function shortGuestName(name: string, max = 16): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const parts = clean.split(' ');
  if (parts.length > 1) {
    const short = `${parts[0]} ${parts
      .slice(1)
      .map((p) => `${p.charAt(0)}.`)
      .join(' ')}`;
    if (short.length <= max + 4) return short;
  }
  return `${clean.slice(0, max - 1)}…`;
}

export const estimateTextWidth = (text: string, font: number): number => Math.max(font, text.length * font * CHAR_WIDTH);

/**
 * Guest names on two lines (first name / rest), so that even with closely spaced chairs they
 * still fit next to each other: "Clara Wolf" → ["Clara", "Wolf"].
 */
export function guestLabelLines(name: string): string[] {
  const clean = name.trim().replace(/\s+/g, ' ');
  const space = clean.indexOf(' ');
  if (space < 0) return [shortGuestName(clean, 12)];
  return [shortGuestName(clean.slice(0, space), 12), shortGuestName(clean.slice(space + 1), 12)];
}

export function guestLabelSize(lines: readonly string[], font = GUEST_FONT): { width: number; height: number } {
  return {
    width: Math.max(...lines.map((l) => estimateTextWidth(l, font))),
    height: lines.length * font * GUEST_LINE,
  };
}

/**
 * Distance of the name centre from the chair centre (along the backrest direction, local +y),
 * so the horizontal text does not cover the chair, however the chair is rotated.
 */
export function guestLabelDistance(worldRotation: number, lines: readonly string[], chair: ChairSize, font = GUEST_FONT): number {
  const r = worldRotation * DEG;
  const bx = Math.abs(-Math.sin(r));
  const by = Math.abs(Math.cos(r));
  const size = guestLabelSize(lines, font);
  return chair.depth / 2 + 0.035 + bx * (size.width / 2) + by * (size.height / 2);
}

export function tableNameFont(t: Pick<TableObject, 'width' | 'height' | 'shape'>): number {
  const minSide = t.shape === 'semicircle' ? Math.min(t.width / 2, t.height) : Math.min(t.width, t.height);
  return clamp(minSide * 0.17, 0.1, 0.22);
}

/** Font size for area names (capitals with letter-spacing). */
export function zoneNameFont(z: { width: number; height: number; name: string }): number {
  const byHeight = z.height * 0.16;
  const byWidth = (z.width * 0.8) / Math.max(4, z.name.length * 0.72);
  return clamp(Math.min(byHeight, byWidth), 0.12, 0.6);
}

/** Rotate the text angle so that text is never upside down. */
export function readableAngle(deg: number): number {
  const a = normalizeAngle(deg);
  if (a > 90) return a - 180;
  if (a <= -90) return a + 180;
  return a;
}

/** Half-round tables: name at the centroid (slightly towards the straight edge). */
export function tableNameOffsetY(t: Pick<TableObject, 'shape' | 'height'>): number {
  return t.shape === 'semicircle' ? -t.height * 0.08 : 0;
}
