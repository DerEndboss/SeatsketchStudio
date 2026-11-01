import { create } from 'zustand';
import type { Guide } from '../geometry/snapping';
import type { Bounds } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec';
import type { WarningKind } from '../geometry/collisionDetection';
import type { SceneObject } from '../types/document';

/** Drafts shown in the overlay while drawing (not yet in the document). */
export type Draft =
  | { kind: 'rect'; target: 'room' | 'table' | 'zone'; a: Vec2; b: Vec2 }
  | { kind: 'stroke'; points: Vec2[] }
  | { kind: 'polygon'; target: 'room' | 'table'; points: Vec2[]; cursor: Vec2 }
  | { kind: 'segment'; target: 'wall' | 'measure'; a: Vec2; b: Vec2 };

/**
 * Transient interaction state, kept apart from the document so that hover, guides and
 * drafts only redraw the overlay and never the scene.
 */
interface InteractionState {
  hoverId: string | null;
  guides: Guide[];
  marquee: Bounds | null;
  draft: Draft | null;
  ghost: SceneObject | null;
  /** Handle currently being edited (for the size readout while scaling) */
  activeHandle: string | null;
  warnings: ReadonlyMap<string, WarningKind[]>;
  set: (patch: Partial<Omit<InteractionState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

export const useInteraction = create<InteractionState>()((set) => ({
  hoverId: null,
  guides: [],
  marquee: null,
  draft: null,
  ghost: null,
  activeHandle: null,
  warnings: new Map(),
  set: (patch) => set(patch),
  reset: () => set({ guides: [], marquee: null, draft: null, ghost: null, activeHandle: null }),
}));
