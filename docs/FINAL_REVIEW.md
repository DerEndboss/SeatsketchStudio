# Final review: Seatsketch Studio 0.2.1

## Addendum 0.2.2: chair distribution without the Alabama paradox (2 November 2026)

- **Finding:** Distribution by Hare/Niemeyer (largest remainders) was not house monotone. Three
  tables with 11/13/9 seats: 16 chairs → 5/6/5, 17 chairs → 6/7/4. One more chair took one away
  from table 3. In a fixed random benchmark (964,556 table sets × totals) this happened 28,453
  times. The same function also distributes chairs across the sides of a rectangular table;
  there, a side lost a chair at least once for 161 of 275 tested table sizes (1.40 × 0.60 m:
  fourth → fifth chair, the table end becomes empty).
- **Fix:** `allocateProportional` assigns chair by chair using Sainte-Laguë (quotient
  w / (n + 0.5), with upper limits). The distribution for t + 1 is always the one for t plus one
  chair. Same benchmark: 0 cases. The price: in 15 cases without upper limits a table lands one
  chair off its exact share (Balinski–Young: no method satisfies all fairness criteria at once).
- **Checks:** 93 unit tests (new: regression case 11/13/9, 2,000 random sets, chairs per table
  side), 17 browser workflows, desktop functional test against `linux-unpacked` **and** against
  the extracted final AppImage, Flatpak bundle installed and launched under Xvfb (editor visible,
  no download button), `verify:release` with new SHA-256 sums. Windows still only checked for PE
  structure and package content.

Status: 1 November 2026, Linux x86_64.

## Findings fixed

- **Calm start:** Start directly in the editor, without a blocking welcome dialog. Templates are
  optional in the inspector; existing plans stay in their own tab when a template is chosen.
  Themes are freely selectable and stay stored.
- **Language and theme:** English is the default without OS language detection; Settings offers
  five stored languages. New canvas hints, templates and native dialogs follow the choice too.
  The default theme is System and reacts to changes of the operating system; explicit themes are
  preserved. Existing user data stays unchanged.
- **Web integration:** Download portal without an installation guide; the start page motif shows
  table placement, seat distribution, guests and area naming in a calm loop.
- **Areas were not editable:** The object type existed in geometry, file format and rendering but
  was missing in the inspector. The new inspector offers name, kind, size, rotation, position and
  object actions. After creation and on double-click the name is focused. The object type switch
  is now fully type-checked.
- **Restored file changes were shown as saved:** The local library now remembers whether the
  state differs from the linked project file. A restart no longer resets this flag. Older library
  entries are treated as unsaved to be safe.
- **Desktop hardening:** Packaged apps ignore the development URL. File access via IPC is limited
  to the main frame of the app's own window. Navigation and permissions are restricted; temporary
  files are removed even on write errors. File URIs from the desktop are read correctly.
- **Production leftovers:** Superfluous dynamic imports and the outdated Three.js shadow setting
  were replaced. The version display comes from `package.json`. Vite no longer watches Flatpak
  intermediates.
- **Flatpak:** Its own manifest with Zypak, desktop file, MIME association, a valid 512-pixel
  icon and AppStream metadata. Font and library licenses are embedded at build time as
  `THIRD_PARTY_NOTICES.txt`.

## Checks

| Check | Scope |
| --- | --- |
| TypeScript | Interface, configuration, browser/desktop tests and Electron |
| Unit tests | 90 tests: geometry, walls, chair distribution, object operations, undo/redo, file format and exports |
| Browser tests | 17 workflows, including area editing, undo/redo, reload, file saving, keeping the unsaved marker and the download button at the bottom left |
| Production app | Packaged Electron under `app://`, active CSP and sandbox, no Node access in the renderer, no development bridge, area editing, saving, SVG/PNG/PDF/CSV, additional 3D PNG export and reopening via file URI |
| Flatpak runtime | Installed app with Zypak; the same desktop functional test inside the sandbox |
| AppImage runtime | Final AppImage started in extraction mode; the same desktop functional test including 3D PNG and restart passed |
| Portal file access | File shared through the document portal; writing to a temporary file and atomic replacement checked inside the sandbox |
| Offline start | Visible app window with unchanged manifest permissions, without network access |
| Package content | ASAR without sources, tests, `node_modules`, development scripts or source maps; version match, CSP and license texts checked |
| Bundle match | Finished bundle installed; contained ASAR matched by SHA-256 against the checked production archive, version and license notices read from the installed package |
| Metadata | Desktop file and AppStream validated; the Flatpak export checks icon and desktop integration |

The automated Flatpak functional test temporarily needs network access to attach the test
inspector, plus access to its isolated temporary test directory. These test permissions are
**not part of the shipped manifest**. The separate launch test uses the actual release
permissions. Native dialogs are replaced deliberately in the functional test; preload, IPC, file
writing and export stay real. Portal file access was additionally checked separately.

## Remaining notes

- `npm audit` reports **15 moderate, no high or critical findings**. Affected is the
  `electron-builder` toolchain, in particular its older `minimatch` dependencies. These packages
  are not part of the production archive. The downgrade to an old builder proposed by npm was
  not applied. The finding stays open for future updates of the build environment.
- X11/Xvfb was tested on the build machine. A separate test on a native Wayland desktop or a
  second Linux machine was not performed.
- Delivery: web app plus freshly built Windows portable, Linux AppImage and Flatpak packages.
  Windows is checked for PE format and production archive; a native Windows run has not happened.
- The bundle is prepared for direct installation and sharing. A publisher signature and a
  Flathub publication are not part of this review.
- A rebuild needs the Flatpak build tools named in the README. For the review they were provided
  locally without a system-wide installation.

## Handover

`release/` contains the Windows/Linux packages, `SHA256SUMS` and release metadata, without an
installation guide. The checksum is generated from the finished bundle. `npm run release:flatpak`
repeats the automated checks and builds this release set. `npm run clean` removes build and test
output and keeps `release/`.

Result: 90 unit tests and 17 browser tests passed; production test of the packaged app and a
repeated functional test from the final, installed Flatpak passed. The final bundle contains 41
library and font license notices. The runtime tests use SwiftShader as a reproducible software
graphics driver for the 3D export.

## Integration

MIT license. Live web app at `seatsketch.pixel-cursor.com` with its own HTTPS certificate. A
card with a seating plan motif on the PixelCursor start page; a page on the download portal
with versioned Windows/Linux files. The web download button sits at the bottom left and is
hidden in native packages. Binaries live on the server outside Git and outside `dist`; a normal
web deploy does not remove them.
