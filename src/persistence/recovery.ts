import type { SeatDocument } from '../types/document';
import { parseDocument, serializeDocument } from './serialize';

/**
 * Automatic local backup: the current state always lives in browser storage.
 * After a crash or restart the app opens exactly where you left off.
 */
const KEY = 'seatsketch:recovery';

export interface RecoveryInfo {
  doc: SeatDocument;
  savedAt: string;
  fileName: string | null;
  /** File path (desktop app only) */
  path: string | null;
  /** Was the state saved as a file at backup time? */
  clean: boolean;
}

export function writeRecovery(doc: SeatDocument, fileName: string | null, clean: boolean, path: string | null = null): boolean {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), fileName, path, clean, doc: serializeDocument(doc) }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readRecovery(): RecoveryInfo | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { savedAt?: string; fileName?: string | null; path?: string | null; clean?: boolean; doc?: string };
    if (typeof data.doc !== 'string') return null;
    const parsed = parseDocument(data.doc);
    if (!parsed.ok) return null;
    return {
      doc: parsed.doc,
      savedAt: data.savedAt ?? '',
      fileName: data.fileName ?? null,
      path: typeof data.path === 'string' ? data.path : null,
      clean: data.clean === true,
    };
  } catch {
    return null;
  }
}

export function clearRecovery(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
