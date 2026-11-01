import { FILE_EXTENSION } from '../types/document';
import type { ExportRequest, OpenedFile, PlatformAdapter, SavedFile, FileRef } from './types';

const PROJECT_TYPES = [
  {
    description: 'Seatsketch-Projekt',
    accept: { 'application/json': [`.${FILE_EXTENSION}`] },
  },
];

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

function download(data: Blob, name: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function pickFileClassic(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const done = (f: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** Browser: File System Access API (Chrome/Edge) with a download fallback (Firefox/Safari). */
export const webAdapter: PlatformAdapter = {
  kind: 'web',

  async openProject(): Promise<OpenedFile | null> {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: PROJECT_TYPES, excludeAcceptAllOption: false });
        const file = await handle.getFile();
        return { name: file.name, content: await file.text(), ref: { kind: 'handle', handle } };
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    const file = await pickFileClassic(`.${FILE_EXTENSION},application/json`);
    if (!file) return null;
    return { name: file.name, content: await file.text(), ref: null };
  },

  async saveProject(content, suggestedName, ref, saveAs): Promise<SavedFile | null> {
    const blob = new Blob([content], { type: 'application/json' });
    let handleRef: FileRef | null = !saveAs && ref?.kind === 'handle' ? ref : null;
    if (!handleRef && window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: `${suggestedName}.${FILE_EXTENSION}`, types: PROJECT_TYPES });
        handleRef = { kind: 'handle', handle };
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    if (handleRef && handleRef.kind === 'handle') {
      const w = await handleRef.handle.createWritable();
      await w.write(blob);
      await w.close();
      return { name: handleRef.handle.name, ref: handleRef };
    }
    const name = `${suggestedName}.${FILE_EXTENSION}`;
    download(blob, name);
    return { name, ref: null };
  },

  async exportFile(req: ExportRequest): Promise<boolean> {
    const name = `${req.suggestedName}.${req.extension}`;
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: req.description, accept: { [req.mime]: [`.${req.extension}`] } }],
        });
        const w = await handle.createWritable();
        await w.write(req.data);
        await w.close();
        return true;
      } catch (e) {
        if (isAbort(e)) return false;
        throw e;
      }
    }
    download(req.data, name);
    return true;
  },

  async recentProjects() {
    return [];
  },

  async openRecent() {
    return null;
  },
};
