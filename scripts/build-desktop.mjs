import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const target = process.argv[2] ?? 'all';
if (!['all', 'linux', 'win'].includes(target)) throw new Error('Target: all, linux or win');
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('npm', ['run', 'build']);
run('npm', ['run', 'electron:compile']);
const args = [];
if (target !== 'win') args.push('--linux', 'AppImage');
if (target !== 'linux') args.push('--win', 'portable');
run('node_modules/.bin/electron-builder', [...args, '--publish', 'never', '-c.directories.output=.build/packages']);
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const arch = process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'arm64' : process.arch;
mkdirSync('release', { recursive: true });
if (target !== 'win') {
  const file = `Seatsketch-Studio-${version}-${arch}.AppImage`;
  copyFileSync(`.build/packages/${file}`, `release/${file}`);
}
if (target !== 'linux') {
  const file = `Seatsketch-Studio-${version}-portable.exe`;
  copyFileSync(`.build/packages/${file}`, `release/${file}`);
}
