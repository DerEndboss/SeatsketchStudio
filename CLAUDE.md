# Seatsketch Studio

Local seating plan editor by PixelCursor: rooms, walls, tables, chairs, guests and named
areas; SVG/PNG/PDF/CSV export including 3D. No backend, no accounts, no telemetry.
The project's own code is MIT, Copyright PixelCursor.

## Where things live

- Web app: `https://seatsketch.pixel-cursor.com`
- Downloads: `https://exporthub.pixel-cursor.com/download/seatsketch`
- Binaries live outside Git: locally in `release/`, published as GitHub release assets and on
  the download server.

## This repository is public

Everything here is written in English: code, comments, test names, commit messages and docs.
Nothing in the repository or its history may contain credentials, personal data, machine or
user names, local paths, or details of the hosting setup. Operational notes about servers and
deployment live in the maintainer's private notes, not here. Do not change the Git identity;
commits are signed.

## Stack and commands

React 19, **TypeScript**, Vite 8, Zustand, Konva, Three.js and Electron.
`npm run lint` runs the strict TypeScript checks, including unused variables.

```sh
npm ci
npm run dev
npm run lint          # compiler checks for app, tests, configuration and Electron
npm run test:run      # unit tests
npm run check         # compiler + unit + Playwright browser tests
npm run build         # web build plus library and font license notices
npm run dist          # Windows portable + Linux AppImage
npm run dist:flatpak  # Flatpak, needs the Linux build tools, see README
npm run test:desktop  # against .build/desktop/linux-unpacked; headless with xvfb-run -a
npm run verify:release
npm run clean         # removes build and test output only, keeps release/
```

Never commit `node_modules`, `.build`, `dist`, `dist-electron` or `release`.

## Releases

Desktop releases are bundled: small library updates ride along with the next meaningful
release. A full desktop release is due when the last published Flatpak release is at least
30 days old and changes are pending. Security fixes and important feature or bug changes
ship sooner. There is no release for age alone. For every published version, rebuild the
final packages from that version's code, license and libraries, and never overwrite existing
downloads. The full procedure is in [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

## Architecture and pitfalls

- English is the default language, without automatic OS detection. The five languages can be
  chosen in Settings and are stored under `seatsketch:lang`; native dialogs follow the choice.
- The default theme is `system`; existing explicit theme choices are preserved.
- The app starts straight on an empty plan; `CanvasStart` is a non-blocking hint. Templates
  are optional in the inspector (`TemplateLibrary`), themes stay freely selectable and stored.
- No installation guide as a release asset or download portal link.
- Geometry works in metres; table chairs store positions relative to their table.
- Chair distribution must stay **house monotone**: `allocateProportional` assigns chair by
  chair using Sainte-Laguë (with upper limits), between tables and between the sides of a
  table. One more chair gives exactly one table or side one more and never takes one away.
  Do not go back to Hare/Niemeyer (largest remainders): it had the Alabama paradox (11/13/9
  seats: 16 → 5/6/5, 17 → 6/7/4). The "House monotonicity" test block in
  `chairPlacement.test.ts` guards this.
- State and undo/redo: `src/state/editorStore.ts`; local library: `persistence/library.ts`
  and `editor/projects.ts`. Local autosave is **not** the same as saving to the project file.
- Areas: `ZoneObject`, `ZoneInspector`, focus id `zone-name`; a new object type must be
  handled completely in inspector, canvas, geometry and export.
- Browser and Electron have their own file adapters. The `.seatsketch` file format stays
  versioned and preserves unknown fields; migrations never drop data silently.
- The production CSP comes from `vite.config.ts`. No `unsafe-eval`, no development bridge
  (`__seatsketch`) in `dist`. Production Electron ignores `VITE_DEV_SERVER_URL`.
- The web download link sits at the very bottom left of `StatusBar`, points straight to the
  Seatsketch page of the download portal and is only visible when `platform.kind === 'web'`.
  A browser test checks target and position; the desktop test checks that the link is absent.
- Main process via `app://bundle`, sandboxed preload, `contextIsolation`, no Node in the
  renderer. File IPC validates the sender; user paths are written atomically.
- **Do not change the Flatpak ID `de.endboss.seatsketch`**: local projects and the desktop
  identity depend on it. Zypak instead of `--no-sandbox`; file portals instead of home
  access. No network or audio in the manifest.
- The Flatpak builder runs under `fakeroot`: a system-wide Electron BaseApp contains
  root-owned symlinks whose OSTree checkout otherwise fails with
  `fchownat: Operation not permitted`. No user installation and no full build with sudo needed.
- The ASAR contains only the app bundle, desktop shell, icon and license. `verify:release`
  checks this.
- Playwright needs an installed Chromium; isolated test profiles and output live under
  `.build/`. On Wayland, `xvfb-run` alone is not enough: Electron can still use the real
  desktop, and clicks wait for frames of the hidden window. Run the tests invisibly with
  `env -u WAYLAND_DISPLAY -u WAYLAND_SOCKET XDG_SESSION_TYPE=x11 xvfb-run -a npm run test:desktop`.
  Native tests only replace the dialog choice; preload, IPC, writing and exports stay real.
- On Linux the Windows binaries are built and checked for package content and PE signature;
  a native Windows run has to be verified separately. Downloads are not signed.
- The known minimatch advisory cascade affects the electron-builder toolchain, which is not
  shipped. No blind `npm audit fix --force` (npm proposes an old builder as a downgrade).
