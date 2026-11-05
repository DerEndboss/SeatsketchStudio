import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('flatpak', ['--version']);
run('flatpak-builder', ['--version']);
run('fakeroot', ['--version']);
const builderVersion = spawnSync('flatpak-builder', ['--version'], { encoding: 'utf8' }).stdout?.match(/(\d+)\.(\d+)\.(\d+)/);
if (!builderVersion || Number(builderVersion[1]) < 1 || (Number(builderVersion[1]) === 1 && Number(builderVersion[2]) < 4)) {
  throw new Error('flatpak-builder >= 1.4 required (AppStream metadata).');
}
const compose = spawnSync('appstreamcli', ['compose', '--help'], { stdio: 'ignore' });
if (compose.status !== 0) throw new Error('AppStream Compose is missing. Please install appstream-compose.');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('flatpak/de.endboss.seatsketch.json', 'utf8'));
for (const [id, branch] of [
  [manifest.runtime, manifest['runtime-version']],
  [manifest.sdk, manifest['runtime-version']],
  [manifest.base, manifest['base-version']],
]) run('flatpak', ['info', `${id}//${branch}`]);

run('npm', ['run', 'build']);
run('npm', ['run', 'electron:compile']);
run('node_modules/.bin/electron-builder', ['--linux', 'dir', '--publish', 'never', '-c.directories.output=.build/desktop']);
mkdirSync('release', { recursive: true });
// System-installed BaseApps contain root-owned symlinks. fakeroot lets OSTree
// preserve their metadata without a root build or a user installation.
run('fakeroot', ['flatpak-builder', '--force-clean', '--disable-rofiles-fuse', '--state-dir=.build/flatpak-state', '--repo=.build/flatpak-repo', '.build/flatpak', 'flatpak/de.endboss.seatsketch.json']);
const arch = process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'aarch64' : process.arch;
run('flatpak', ['build-bundle', '--runtime-repo=https://flathub.org/repo/flathub.flatpakrepo', '.build/flatpak-repo', `release/Seatsketch-Studio-${pkg.version}-${arch}.flatpak`, manifest['app-id'], manifest.branch]);
