import { app, BrowserWindow, dialog, ipcMain, net, protocol, screen, shell, Menu } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { promises as fs, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/*
 * Seatsketch Studio: desktop shell.
 * The app runs on its own protocol (app://bundle/…) instead of file://, so the strict
 * Content-Security-Policy applies and localStorage stays stable. File access exists only through
 * the few IPC channels below; the renderer itself has no Node access.
 */

const SCHEME = 'app';
const EXT = 'seatsketch';
const DIST = path.join(__dirname, '..', 'dist');
const DEV_URL = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;
const MAX_RECENT = 8;

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } },
]);

let win: BrowserWindow | null = null;
let pendingFile: string | null = findFileArg(process.argv);
/** Paths the user picked themselves (dialog, double-click, recent files). Only those are written to. */
const granted = new Set<string>();

const T = { open: 'Open plan', save: 'Save plan', export: 'Export', project: 'Seatsketch project' };

function findFileArg(argv: readonly string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue;
    try {
      const file = arg.startsWith('file:') ? fileURLToPath(arg) : arg;
      if (file.toLowerCase().endsWith(`.${EXT}`)) return path.resolve(file);
    } catch {
      // Ignore invalid file URIs from the desktop.
    }
  }
  return null;
}

if (process.platform === 'linux') app.setDesktopName('de.endboss.seatsketch.desktop');

/* --------------------------------------- Recent files --------------------------------------- */

const recentFile = () => path.join(app.getPath('userData'), 'recent.json');

async function readRecent(): Promise<string[]> {
  try {
    const data = JSON.parse(await fs.readFile(recentFile(), 'utf8')) as unknown;
    return Array.isArray(data) ? data.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

async function pushRecent(p: string): Promise<void> {
  const list = [p, ...(await readRecent()).filter((x) => x !== p)].slice(0, MAX_RECENT);
  await fs.mkdir(path.dirname(recentFile()), { recursive: true });
  await fs.writeFile(recentFile(), JSON.stringify(list, null, 1));
  app.addRecentDocument(p);
}

async function readProject(p: string): Promise<{ path: string; name: string; content: string } | null> {
  try {
    const content = await fs.readFile(p, 'utf8');
    granted.add(p);
    await pushRecent(p);
    return { path: p, name: path.basename(p), content };
  } catch {
    return null;
  }
}

/** Write atomically: temp file first, then rename. A crash never destroys the old file. */
async function writeAtomic(p: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${p}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, p);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}

/* -------------------------------------------- IPC -------------------------------------------- */

function registerIpc(): void {
  const filters = () => [{ name: T.project, extensions: [EXT] }];
  const handle = (channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
        throw new Error('Not allowed');
      }
      return listener(event, ...args);
    });
  };

  handle('window:fullscreen', () => {
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  });

  handle('project:open', async () => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, { title: T.open, filters: filters(), properties: ['openFile'] });
    if (res.canceled || !res.filePaths[0]) return null;
    return readProject(res.filePaths[0]);
  });

  handle('project:openPath', async (_e, p: unknown) => {
    if (typeof p !== 'string' || !p.toLowerCase().endsWith(`.${EXT}`)) return null;
    const allowed = await readRecent();
    if (!allowed.includes(p) && p !== pendingFile) return null;
    return readProject(p);
  });

  handle('project:initial', async () => {
    const p = pendingFile;
    pendingFile = null;
    return p ? readProject(p) : null;
  });

  handle('project:save', async (_e, p: unknown, content: unknown, suggestedName: unknown) => {
    if (!win || typeof content !== 'string') return null;
    let target = typeof p === 'string' && p ? p : null;
    if (target && !granted.has(target) && !(await readRecent()).includes(target)) target = null;
    if (!target) {
      const res = await dialog.showSaveDialog(win, {
        title: T.save,
        defaultPath: path.join(app.getPath('documents'), `${String(suggestedName || 'Seating plan')}.${EXT}`),
        filters: filters(),
      });
      if (res.canceled || !res.filePath) return null;
      target = res.filePath.toLowerCase().endsWith(`.${EXT}`) ? res.filePath : `${res.filePath}.${EXT}`;
    }
    await writeAtomic(target, content);
    granted.add(target);
    await pushRecent(target);
    return { path: target, name: path.basename(target) };
  });

  handle('file:export', async (_e, suggestedName: unknown, data: unknown, filter: unknown) => {
    if (!win || !(data instanceof Uint8Array)) return null;
    const f = filter as { name?: string; extensions?: string[] } | null;
    const res = await dialog.showSaveDialog(win, {
      title: T.export,
      defaultPath: path.join(app.getPath('documents'), String(suggestedName || 'Export')),
      filters: f?.extensions?.length ? [{ name: String(f.name ?? 'File'), extensions: f.extensions.map(String) }] : [],
    });
    if (res.canceled || !res.filePath) return null;
    await writeAtomic(res.filePath, data);
    return res.filePath;
  });

  handle('project:recent', async () => {
    const list = await readRecent();
    const out: Array<{ path: string; name: string }> = [];
    for (const p of list) {
      try {
        await fs.access(p);
        out.push({ path: p, name: path.basename(p) });
      } catch {
        /* skip files that have disappeared */
      }
    }
    return out;
  });
}

/* ------------------------------------------- Window ------------------------------------------- */

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const windowFile = () => path.join(app.getPath('userData'), 'window.json');

async function readWindowState(): Promise<WindowState> {
  const fallback: WindowState = { width: 1440, height: 900, maximized: false };
  try {
    const s = JSON.parse(await fs.readFile(windowFile(), 'utf8')) as Partial<WindowState>;
    if (typeof s.width !== 'number' || typeof s.height !== 'number') return fallback;
    const state: WindowState = { width: s.width, height: s.height, maximized: s.maximized === true };
    // only restore if the position is on an existing screen
    if (typeof s.x === 'number' && typeof s.y === 'number') {
      const visible = screen.getAllDisplays().some((d) => {
        const a = d.workArea;
        return s.x! >= a.x - 50 && s.y! >= a.y - 50 && s.x! < a.x + a.width - 100 && s.y! < a.y + a.height - 100;
      });
      if (visible) {
        state.x = s.x;
        state.y = s.y;
      }
    }
    return state;
  } catch {
    return fallback;
  }
}

function saveWindowState(w: BrowserWindow): void {
  try {
    const b = w.getNormalBounds();
    const state: WindowState = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: w.isMaximized() };
    writeFileSync(windowFile(), JSON.stringify(state));
  } catch {
    /* not critical */
  }
}

async function createWindow(): Promise<void> {
  const state = await readWindowState();
  win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 600,
    title: 'Seatsketch Studio',
    backgroundColor: '#f5f2ed',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => {
    if (state.maximized) win?.maximize();
    win?.show();
  });
  win.on('close', () => {
    if (win) saveWindowState(win);
  });

  // No navigation away from the app; links open in the browser
  win.webContents.on('will-navigate', (e, url) => {
    const target = new URL(url);
    const allowed = target.protocol === `${SCHEME}:` && target.hostname === 'bundle';
    if (!allowed && !(DEV_URL && target.origin === new URL(DEV_URL).origin)) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12' && !app.isPackaged) win?.webContents.toggleDevTools();
  });

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadURL(`${SCHEME}://bundle/index.html`);
  win.on('closed', () => (win = null));
}

const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const file = findFileArg(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (file) {
        pendingFile = file;
        win.webContents.send('project:openRequest');
      }
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle(SCHEME, (req) => {
      const { hostname, pathname } = new URL(req.url);
      if (hostname !== 'bundle') return new Response('Not allowed', { status: 403 });
      const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.normalize(path.join(DIST, rel));
      if (!file.startsWith(DIST + path.sep)) return new Response('Not allowed', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    registerIpc();
    void createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
