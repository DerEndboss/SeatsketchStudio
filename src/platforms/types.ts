/** Reference to an opened project file: a path or a file handle, depending on the platform. */
export type FileRef = { kind: 'path'; path: string } | { kind: 'handle'; handle: FileSystemFileHandleLike };

export interface FileSystemFileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
}

export interface OpenedFile {
  name: string;
  content: string;
  ref: FileRef | null;
}

export interface SavedFile {
  name: string;
  ref: FileRef | null;
}

export interface RecentFile {
  name: string;
  path: string;
}

export interface ExportRequest {
  data: Blob;
  suggestedName: string;
  mime: string;
  extension: string;
  description: string;
}

/** Everything platform-specific behind one interface; the editor itself only knows this one. */
export interface PlatformAdapter {
  kind: 'web' | 'electron';
  openProject(): Promise<OpenedFile | null>;
  /** `ref` = existing file (save), null or saveAs = dialog (save as) */
  saveProject(content: string, suggestedName: string, ref: FileRef | null, saveAs: boolean): Promise<SavedFile | null>;
  exportFile(req: ExportRequest): Promise<boolean>;
  recentProjects(): Promise<RecentFile[]>;
  openRecent(path: string): Promise<OpenedFile | null>;
}
