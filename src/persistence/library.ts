import type { SeatDocument } from '../types/document';
import { parseDocument, serializeDocument } from './serialize';

/*
 * Local plan library: every plan is stored as its own JSON in the device's storage,
 * plus a small index (tab order, active plan, file link).
 */

export interface PlanMeta {
  id: string;
  name: string;
  updatedAt: string;
  /** Linked file (for saving with Ctrl+S) */
  fileName: string | null;
  /** File path, desktop app only */
  filePath: string | null;
  /** Local changes since the last save to the linked file. */
  dirty?: boolean;
}

export interface LibraryIndex {
  plans: PlanMeta[];
  activeId: string | null;
}

const INDEX_KEY = 'seatsketch:library';
const planKey = (id: string) => `seatsketch:plan:${id}`;

export function readIndex(): LibraryIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return { plans: [], activeId: null };
    const data = JSON.parse(raw) as Partial<LibraryIndex>;
    const plans = Array.isArray(data.plans)
      ? data.plans.filter((p): p is PlanMeta => !!p && typeof p.id === 'string' && typeof p.name === 'string')
      : [];
    const activeId = typeof data.activeId === 'string' && plans.some((p) => p.id === data.activeId) ? data.activeId : plans[0]?.id ?? null;
    return { plans, activeId };
  } catch {
    return { plans: [], activeId: null };
  }
}

/** false = storage full or unavailable */
export function writeIndex(index: LibraryIndex): boolean {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

export function readPlan(id: string): SeatDocument | null {
  try {
    const raw = localStorage.getItem(planKey(id));
    if (!raw) return null;
    const parsed = parseDocument(raw);
    return parsed.ok ? parsed.doc : null;
  } catch {
    return null;
  }
}

export function writePlan(id: string, doc: SeatDocument): boolean {
  try {
    localStorage.setItem(planKey(id), serializeDocument(doc));
    return true;
  } catch {
    return false;
  }
}

export function removePlan(id: string): void {
  try {
    localStorage.removeItem(planKey(id));
  } catch {
    /* ignore */
  }
}
