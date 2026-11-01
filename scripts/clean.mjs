import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
for (const dir of ['.build', '.flatpak-builder', 'dist', 'dist-electron', 'test-results', 'playwright-report']) {
  rmSync(dir, { recursive: true, force: true });
}
console.log('Build and test leftovers removed. Finished files in release/ are kept.');
