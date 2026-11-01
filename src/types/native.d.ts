/** Bridge from electron/preload.cts, only present in the desktop app. */
interface SeatsketchNativeFile {
  path: string;
  name: string;
  content: string;
}

interface SeatsketchNative {
  platform: string;
  openProject(): Promise<SeatsketchNativeFile | null>;
  openPath(path: string): Promise<SeatsketchNativeFile | null>;
  saveProject(path: string | null, content: string, suggestedName: string): Promise<{ path: string; name: string } | null>;
  exportFile(
    suggestedName: string,
    data: Uint8Array,
    filter: { name: string; extensions: string[] },
  ): Promise<string | null>;
  recentProjects(): Promise<Array<{ path: string; name: string }>>;
  /** Path of a file opened by double-click (at startup), otherwise null */
  initialFile(): Promise<SeatsketchNativeFile | null>;
  /** Toggle borderless fullscreen */
  toggleFullscreen?(): Promise<boolean>;
  /** Language for native dialogs */
  setLanguage?(lang: string): void;
}

interface Window {
  seatsketchNative?: SeatsketchNative;
  showOpenFilePicker?: (opts?: unknown) => Promise<Array<import('../platforms/types').FileSystemFileHandleLike>>;
  showSaveFilePicker?: (opts?: unknown) => Promise<import('../platforms/types').FileSystemFileHandleLike>;
}
