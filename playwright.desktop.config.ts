import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'desktop.spec.ts',
  outputDir: '.build/test-results/desktop',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
});
