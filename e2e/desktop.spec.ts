import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { _electron, expect, test } from '@playwright/test';

test('Packaged app: sandbox, CSP, areas, file access, exports and restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'seatsketch-desktop-test-'));
  const project = path.join(dir, 'Flächen & Gäste.seatsketch');
  const executablePath = path.resolve(process.env.SEATSKETCH_TEST_EXECUTABLE || '.build/desktop/linux-unpacked/seatsketch-studio');
  const launch = (args: string[] = []) => _electron.launch({
    executablePath,
    args: [`--user-data-dir=${path.join(dir, 'profile')}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...args],
    env: { ...process.env, XDG_CONFIG_HOME: path.join(dir, 'config'), XDG_CACHE_HOME: path.join(dir, 'cache'), VITE_DEV_SERVER_URL: 'https://example.invalid' },
  });
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    app = await launch();
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => {
      const p = (BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean } }).getLastWebPreferences();
      return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration };
    })).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });
    await expect(page.getByTestId('canvas-start')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('desktop-download')).toHaveCount(0);
    expect(page.url()).toBe('app://bundle/index.html');
    expect(await page.evaluate(() => ({ dev: '__seatsketch' in window, node: 'require' in window, native: !!window.seatsketchNative }))
    ).toEqual({ dev: false, node: false, native: true });
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    await page.getByTestId('open-settings').click();
    await page.getByTestId('language-select').selectOption('de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async (...args: unknown[]) => {
        const options = args[args.length - 1] as { title: string };
        if (options.title !== 'Plan öffnen') throw new Error('Native language was not updated');
        return { canceled: true, filePaths: [] };
      };
    });
    expect(await page.evaluate(() => window.seatsketchNative!.openProject())).toBeNull();
    await page.getByTestId('language-select').selectOption('en');
    await page.keyboard.press('Escape');
    await page.getByTestId('project-name').fill('Production check');
    await page.getByTestId('project-name').press('Enter');
    await page.keyboard.press('a');
    const box = (await page.getByTestId('canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('zone-name')).toBeFocused();
    await page.getByTestId('zone-name').fill('Dance floor & stage');
    await page.getByTestId('zone-name').press('Enter');
    await page.getByRole('radio', { name: 'Stage', exact: true }).click();
    await page.screenshot({ path: '.build/screenshots/production.png' });
    // Replace native dialogs deliberately; renderer, preload, IPC and writing stay real.
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, project);
    await page.keyboard.press('Control+s');
    await expect.poll(async () => {
      try { return JSON.parse(await readFile(project, 'utf8')).objects.some((o: { type: string; name?: string }) => o.type === 'zone' && o.name === 'Dance floor & stage'); }
      catch { return false; }
    }).toBe(true);
    expect(await page.evaluate(() => window.seatsketchNative!.openPath('/etc/passwd.seatsketch'))).toBeNull();
    for (const format of ['svg', 'png', 'pdf', 'csv']) {
      const output = path.join(dir, `export.${format}`);
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      }, output);
      await page.getByTestId('open-export').click();
      await page.getByTestId(`format-${format}`).click();
      await page.getByTestId('export-run').click();
      await expect(page.getByTestId('export-dialog')).toHaveCount(0, { timeout: 30_000 });
      const data = await readFile(output);
      if (format === 'svg') expect(data.toString()).toContain('DANCE FLOOR &amp; STAGE');
      if (format === 'png') expect(data.subarray(1, 4).toString()).toBe('PNG');
      if (format === 'pdf') expect(data.subarray(0, 5).toString()).toBe('%PDF-');
      if (format === 'csv') expect(data.toString()).toContain(';');
    }
    const threeOutput = path.join(dir, '3d.png');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, threeOutput);
    await page.getByTestId('open-export').click();
    await page.getByTestId('format-png').click();
    await page.getByTestId('export-3d').click();
    await page.getByRole('radio', { name: 'Normal', exact: true }).click();
    await page.getByTestId('export-run').click();
    await expect(page.getByTestId('export-dialog')).toHaveCount(0, { timeout: 30_000 });
    const three = await readFile(threeOutput);
    expect(three.subarray(1, 4).toString()).toBe('PNG');
    expect(three.readUInt32BE(16)).toBe(800);
    expect(three.length).toBeGreaterThan(10_000);
    expect(errors).toEqual([]);
    await app.close();
    app = await launch([pathToFileURL(project).href]);
    const reopened = await app.firstWindow();
    await expect(reopened.getByTestId('project-name')).toHaveValue('Production check');
    await expect(reopened.getByTestId('project-tabs').getByRole('tab')).toHaveCount(2);
    await expect(reopened.getByTestId('welcome-dialog')).toHaveCount(0);
  } finally {
    await app?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
