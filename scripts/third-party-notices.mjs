import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const roots = ['@fontsource-variable/inter', 'react', 'react-dom', 'react-konva', 'konva', 'three', 'zustand', 'lucide-react', 'jspdf', 'svg2pdf.js'];
const packages = new Map();
function collect(name, from) {
  let dir = from;
  let location;
  while (true) {
    const candidate = path.join(dir, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) { location = candidate; break; }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
  const pkg = JSON.parse(readFileSync(path.join(location, 'package.json'), 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (packages.has(key)) return;
  const licenses = readdirSync(location).filter((file) => /^(licen[sc]e|copying|ofl)([.\-_]|$)/i.test(file));
  if (!licenses.length) throw new Error(`License text missing: ${key}`);
  packages.set(key, [key, `License: ${pkg.license ?? 'see below'}`, ...licenses.map((file) => readFileSync(path.join(location, file), 'utf8').trim())].join('\n\n'));
  for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) collect(dependency, location);
}
for (const name of roots) collect(name, root);
writeFileSync(path.join(root, 'dist', 'THIRD_PARTY_NOTICES.txt'),
  'Seatsketch Studio — third-party software notices\n\n' + [...packages.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, notice]) => notice).join('\n\n' + '='.repeat(72) + '\n\n') + '\n');
console.log(`Created license notices for ${packages.size} libraries.`);
