import { create } from 'zustand';
import type { FileRef, RecentFile } from '../platforms/types';

interface ConfirmRequest {
  title: string;
  body: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface FileState {
  /** File name of the opened/saved file (null = never saved) */
  fileName: string | null;
  ref: FileRef | null;
  recent: RecentFile[];
  saving: boolean;
  confirm: ConfirmRequest | null;
  setFile: (fileName: string | null, ref: FileRef | null) => void;
  setRecent: (recent: RecentFile[]) => void;
  setSaving: (saving: boolean) => void;
  ask: (req: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>;
  answer: (ok: boolean) => void;
}

export const useFile = create<FileState>()((set, get) => ({
  fileName: null,
  ref: null,
  recent: [],
  saving: false,
  confirm: null,
  setFile: (fileName, ref) => set({ fileName, ref }),
  setRecent: (recent) => set({ recent }),
  setSaving: (saving) => set({ saving }),
  ask: (req) =>
    new Promise<boolean>((resolve) => {
      get().confirm?.resolve(false);
      set({ confirm: { ...req, resolve } });
    }),
  answer: (ok) => {
    const c = get().confirm;
    set({ confirm: null });
    c?.resolve(ok);
  },
}));
