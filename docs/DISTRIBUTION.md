# Release maintenance

Production downloads are the Windows portable executable, Linux AppImage and Linux Flatpak.
Build with `npm run dist`, then `npm run dist:flatpak`; both share the web bundle and must run
sequentially. The Flatpak pipeline requires the Platform, SDK and Electron2 BaseApp on 25.08,
`flatpak-builder >= 1.4`, `fakeroot` and AppStream Compose. Temporary outputs stay under `.build/`.
The builder runs under fakeroot so OSTree can preserve root-owned symlink metadata from a
system-installed BaseApp without a privileged build or separate user installation.
On a Wayland host, run desktop tests with
`env -u WAYLAND_DISPLAY -u WAYLAND_SOCKET XDG_SESSION_TYPE=x11 xvfb-run -a npm run test:desktop`.
This keeps Electron on the virtual X11 display rather than an occluded real desktop window.

On Debian 13 prefer native `flatpak-builder` and `appstream-compose` from apt,
with the BaseApp and runtimes installed system-wide. Wrapping Flatpak's sandboxed
Builder with host `fakeroot` fails at namespace creation; the Builder app does not
include fakeroot. For a one-off build without root privileges, the Debian packages
`flatpak-builder`, `appstream-compose` and `libappstream-compose0` can be downloaded
and extracted into a temporary directory. Use command-local wrappers for the builder
and `appstreamcli compose`, with the extracted library on `LD_LIBRARY_PATH`.
This does not install host packages or change the global PATH.

Run `npm run check`, the packaged desktop integration test, and tests of the actual AppImage
and installed Flatpak. Finally run `npm run verify:release` to inspect the ASAR and generate
`SHA256SUMS` and `release.json`. A Windows machine is required for a native Windows smoke test;
the Linux release workflow checks the Windows PE structure and packaged production archive.

Keep the application ID `de.endboss.seatsketch` unchanged so updates preserve the local library.
The production Flatpak allows display/IPC/DRI and file portals, without network, audio or home
access. Temporary test permissions for the Playwright inspector are never added to the manifest.

Publish the binaries and the two metadata files as assets of the GitHub release and on the
download server. Verify SHA-256 remotely before updating the release metadata of the download
portal. Downloads are served separately from the web build, so normal web deploys preserve
them. Published versioned files are immutable. Do not attach or link an installation guide.
The packages are direct downloads, without a publisher signature or a Flathub listing.

`npm run clean` removes intermediate builds and test output while preserving `release/`.
The project's own code is MIT, Copyright PixelCursor; packages contain library and font notices.

## Release rhythm

Small dependency updates are bundled into the next meaningful desktop release. A full desktop
release is prepared when the last published Flatpak release is at least 30 days old and changes
are pending. Security fixes and important changes may ship sooner.

### 0.2.4 validation (2026-11-10)

Lint/type checks, 93 unit tests, 17 browser tests, packaged Electron integration and
the same integration test against the AppImage passed. All three artifacts were
uploaded to the release and the download server; remote SHA-256 checks passed.
Windows was checked for PE/archive structure, not native execution.
Flatpak was built and archive-checked, but an installed launch remains unverified on
the build machine: system bundle installation was denied at ConfigureRemote by polkit.
Launching the build tree directly also failed in Zypak's host-spawn environment.
Do not count those attempts as a successful Flatpak runtime test.

The maintainer accepted this Flatpak status on 2026-11-10; the separate launch check is no
longer tracked as an open task. That is a decision, not evidence of an additional successful
runtime test.
