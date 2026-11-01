import { contextBridge, ipcRenderer } from 'electron';

/** Narrow, validated bridge to the main process. The renderer gets no Node access. */
contextBridge.exposeInMainWorld('seatsketchNative', {
  platform: process.platform,
  openProject: () => ipcRenderer.invoke('project:open'),
  openPath: (p: string) => ipcRenderer.invoke('project:openPath', p),
  saveProject: (p: string | null, content: string, suggestedName: string) => ipcRenderer.invoke('project:save', p, content, suggestedName),
  exportFile: (suggestedName: string, data: Uint8Array, filter: { name: string; extensions: string[] }) =>
    ipcRenderer.invoke('file:export', suggestedName, data, filter),
  recentProjects: () => ipcRenderer.invoke('project:recent'),
  initialFile: () => ipcRenderer.invoke('project:initial'),
  toggleFullscreen: () => ipcRenderer.invoke('window:fullscreen'),
});

// Second launch with a file (double-click while the app is running)
ipcRenderer.on('project:openRequest', () => {
  window.dispatchEvent(new CustomEvent('seatsketch:open-request'));
});
