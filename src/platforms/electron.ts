import type { OpenedFile, PlatformAdapter } from './types';

/** Desktop app: real file dialogs and paths via the preload bridge (IPC). */
export function createElectronAdapter(native: SeatsketchNative): PlatformAdapter {
  const toOpened = (f: SeatsketchNativeFile | null): OpenedFile | null =>
    f ? { name: f.name, content: f.content, ref: { kind: 'path', path: f.path } } : null;

  return {
    kind: 'electron',
    async openProject() {
      return toOpened(await native.openProject());
    },
    async saveProject(content, suggestedName, ref, saveAs) {
      const path = !saveAs && ref?.kind === 'path' ? ref.path : null;
      const res = await native.saveProject(path, content, suggestedName);
      return res ? { name: res.name, ref: { kind: 'path', path: res.path } } : null;
    },
    async exportFile(req) {
      const data = new Uint8Array(await req.data.arrayBuffer());
      const path = await native.exportFile(`${req.suggestedName}.${req.extension}`, data, {
        name: req.description,
        extensions: [req.extension],
      });
      return path !== null;
    },
    async recentProjects() {
      return native.recentProjects();
    },
    async openRecent(path) {
      return toOpened(await native.openPath(path));
    },
  };
}
