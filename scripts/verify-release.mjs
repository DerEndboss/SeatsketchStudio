import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const archive = '.build/desktop/linux-unpacked/resources/app.asar';
const entries = asar.listPackage(archive);
const forbidden = entries.filter((file) => /(^|\/)(src|e2e|scripts|node_modules|test-results|\.build)(\/|$)|\.(map|test\.[jt]sx?)$/.test(file));
if (forbidden.length) throw new Error(`Development files in the package: ${forbidden.join(', ')}`);
const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString());
if (packed.version !== pkg.version) throw new Error('Package version does not match.');
if (packed.license !== 'MIT' || !asar.extractFile(archive, 'LICENSE').toString().includes('2026 PixelCursor')) throw new Error('MIT license missing.');
const html = asar.extractFile(archive, 'dist/index.html').toString();
if (!html.includes("script-src 'self'") || html.includes('unsafe-eval')) throw new Error('Production CSP missing.');
const scripts = entries.filter((file) => file.startsWith('/dist/') && file.endsWith('.js'));
for (const file of scripts) {
  if (/__seatsketch|sourceMappingURL=/.test(asar.extractFile(archive, file.slice(1)).toString())) throw new Error(`Debug leftover in the package: ${file}`);
}
const notices = asar.extractFile(archive, 'dist/THIRD_PARTY_NOTICES.txt').toString();
if (!notices.includes('react@') || !notices.includes('three@') || !notices.includes('SIL OPEN FONT LICENSE')) throw new Error('License notices missing.');
const arch = process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'aarch64' : process.arch;
const candidates = [
  { id: 'windows', platform: 'Windows', format: 'Portable · 64-bit', filename: `Seatsketch-Studio-${pkg.version}-portable.exe` },
  { id: 'linux', platform: 'Linux', format: 'AppImage · 64-bit', filename: `Seatsketch-Studio-${pkg.version}-${arch}.AppImage` },
  { id: 'flatpak', platform: 'Linux', format: 'Flatpak · 64-bit', filename: `Seatsketch-Studio-${pkg.version}-${arch}.flatpak` },
];
const files = candidates.filter((file) => existsSync(path.join('release', file.filename))).map((file) => {
  const data = readFileSync(path.join('release', file.filename));
  if (data.length < 1_000_000) throw new Error(`Incomplete package: ${file.filename}`);
  if (file.id === 'windows' && (data.subarray(0, 2).toString() !== 'MZ' || data.subarray(data.readUInt32LE(0x3c), data.readUInt32LE(0x3c) + 4).toString() !== 'PE\0\0')) throw new Error('Windows package is not a PE file.');
  if (file.id === 'linux' && data.subarray(0, 4).toString() !== '\x7fELF') throw new Error('AppImage is not an ELF file.');
  return { ...file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
});
if (!files.some((file) => file.id === 'flatpak')) throw new Error('Flatpak missing.');
writeFileSync('release/SHA256SUMS', files.map((file) => `${file.sha256}  ${file.filename}\n`).join(''));
writeFileSync('release/release.json', JSON.stringify({ version: pkg.version, files }, null, 2) + '\n');
copyFileSync('docs/DISTRIBUTION.md', 'release/README.md');
console.log(`Release ${pkg.version}: archive, production CSP, no debug bridge and license notices checked. SHA256SUMS created.`);
