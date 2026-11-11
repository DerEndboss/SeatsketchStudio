# Seatsketch Studio: product and release

## Purpose

Create seating plans the way you would in a drawing program: draw rooms and tables, let the
app distribute chairs, assign guests, add named areas for a dance floor, stage or no-go zones,
and export print-ready plans. Local, offline, and without an account, backend or telemetry.

## Delivery

- Browser app at `seatsketch.pixel-cursor.com`.
- Windows portable, Linux AppImage and Flatpak through its own page on the download portal.
- Its own card with a hover motif on the PixelCursor start page.
- A web-only download button at the **bottom left** that leads straight to the Seatsketch
  page of the download portal; it stays hidden in native desktop builds.
- MIT license; no generated packages, data or secrets in Git.

## What stays

The existing TypeScript/React/Konva editor remains the foundation: English as the default
language, language choice in Settings, freely selectable themes, shortcuts, templates, the
plan library, undo/redo, file import and the exports. Geometry in metres, a versioned
`.seatsketch` format. Local backup and saving to project files are two different things.

## Definition of done

Compiler checks, unit and browser tests and the production Electron test are green. Area
naming, the saved state after a restart, the export formats and the download link are
checked. Production packages ship without sources, test tooling or the debug bridge, with
license notices and SHA-256 sums. The web app is live over HTTPS, download files are kept
apart from `dist`, link targets and hashes are verified. The Windows package content is
checked, and the limit of a missing native Windows test is documented.

The app starts directly in the editor without a welcome dialog. Templates are optional in the
sidebar, themes freely selectable there. No installation guide on the download portal.

Default theme: system. Explicit language and theme settings stay stored.
