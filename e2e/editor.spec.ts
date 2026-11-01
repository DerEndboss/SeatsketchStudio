import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface State {
  editor: { getState: () => { doc: { objects: Array<{ type: string; guestId?: string; name?: string; kind?: string; width?: number; height?: number }>; guests: unknown[]; settings: { showDimensions: boolean; showGrid: boolean; chair: { width: number; depth: number } } } } };
  ui: { getState: () => { viewport: { x: number; y: number }; exportFormat?: string } };
  plans: { getState: () => { plans: Array<{ id: string; name: string }>; activeId: string | null } };
  keymap: { getState: () => { overrides: Record<string, string[]> } };
}

async function state<T>(page: Page, read: (state: State) => T): Promise<T> {
  return (await page.evaluate((source) => {
    const run = new Function(`return (${source})`)() as (state: State) => T;
    return run((window as unknown as { __seatsketch: State }).__seatsketch);
  }, read.toString())) as T;
}

async function counts(page: Page) {
  return state(page, ({ editor }) => {
    const doc = editor.getState().doc;
    return {
      tables: doc.objects.filter((o) => o.type === 'table').length,
      chairs: doc.objects.filter((o) => o.type === 'chair').length,
      seated: doc.objects.filter((o) => o.type === 'chair' && o.guestId).length,
      guests: doc.guests.length,
    };
  });
}

async function createPlan(page: Page, template = 'conference', name?: string) {
  await page.getByTestId('sidebar-templates').click();
  await page.getByTestId(`template-${template}`).click();
  if (name) {
    await page.getByTestId('project-name').fill(name);
    await page.getByTestId('project-name').press('Enter');
  }
  await expect(page.getByTestId('template-library')).toHaveCount(0);
  await expect(page.getByTestId('stats')).toBeVisible();
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', (error) => errors.get(page)?.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('canvas-start')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('Direct English editor on a German system, with optional persistent themes', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('project-tabs').getByRole('tab')).toHaveCount(1);
  await expect(page.getByTestId('project-name')).toHaveValue('Untitled plan');
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/theme-espresso/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveClass(/theme-beige/);
  await page.getByRole('radio', { name: 'Espresso dark' }).click();
  await expect(page.locator('html')).toHaveClass(/theme-espresso/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/theme-espresso/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('desktop-download')).toBeVisible();
});

test('Settings language switches immediately and survives reload without changing plan data', async ({ page }) => {
  await page.getByTestId('project-name').fill('Keep my plan name');
  await page.getByTestId('project-name').press('Enter');
  await page.getByTestId('open-settings').click();
  const language = page.getByTestId('language-select');
  await expect(language).toHaveValue('en');
  for (const lang of ['es', 'zh', 'hi', 'de']) {
    await language.selectOption(lang);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-start')).toContainText('Platz für dein nächstes Zusammensein.');
  await page.getByTestId('sidebar-templates').click();
  await expect(page.getByTestId('template-library')).toContainText('Ein kleiner Vorsprung');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByTestId('project-name')).toHaveValue('Keep my plan name');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('language-select')).toHaveValue('de');
  await page.getByTestId('language-select').selectOption('en');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-start')).toContainText('A little space for your next gathering.');
});

test('Templates are optional and never replace a non-empty project', async ({ page }) => {
  await createPlan(page, 'conference', 'Keep this plan');
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('template-restaurant').click();
  await expect(page.getByTestId('project-tabs').getByRole('tab')).toHaveCount(2);
  await page.keyboard.press('Control+Tab');
  await expect(page.getByTestId('project-name')).toHaveValue('Keep this plan');
  expect((await counts(page)).tables).toBeGreaterThan(0);
});

test('Drawing immediately and deleting the last plan keep a usable editor', async ({ page }) => {
  await page.keyboard.press('a');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(box.x + 180, box.y + 150);
  await expect(page.getByTestId('zone-name')).toBeVisible();
  await page.getByTestId('zone-name').press('Enter');
  const close = page.locator('[data-testid^="close-plan-"]').first();
  await close.click();
  await page.getByRole('button', { name: 'Delete for good', exact: true }).click();
  await expect(page.getByTestId('canvas-start')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('canvas-start')).toBeVisible();
  await expect(page.getByTestId('project-tabs').getByRole('tab')).toHaveCount(1);
});

test('Web download sits at the bottom left and leads to the ExportHub page', async ({ page }) => {
  await createPlan(page, 'blank');
  const link = page.getByTestId('desktop-download');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://exporthub.pixel-cursor.com/download/seatsketch');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const box = (await link.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeLessThan(20);
  expect(box.y).toBeGreaterThan(viewport.height - 70);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('Tabs survive a reload; deleting needs a confirmation', async ({ page }) => {
  await createPlan(page, 'conference', 'Meeting A');
  await page.getByTestId('new-plan-tab').click();
  await createPlan(page, 'blank', 'Empty');
  await expect(page.getByRole('tab')).toHaveCount(4);
  await page.waitForTimeout(650);
  await page.reload();
  await expect(page.getByTestId('welcome-dialog')).toHaveCount(0);
  await expect(page.getByTestId('project-name')).toHaveValue('Empty');
  await expect(page.getByTestId('project-tabs').getByRole('tab')).toHaveCount(2);
  await page.keyboard.press('Control+Tab');
  await expect(page.getByTestId('project-name')).toHaveValue('Meeting A');
  await page.getByRole('button', { name: 'Delete plan: Empty', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await state(page, ({ plans }) => plans.getState().plans.length)).toBe(2);
  await page.getByRole('button', { name: 'Delete plan: Empty', exact: true }).click();
  await page.getByRole('button', { name: 'Delete for good', exact: true }).click();
  await expect(page.getByTestId('project-tabs').getByRole('tab')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('project-tabs').getByRole('tab')).toHaveCount(1);
});

test('Blank plan, place a table and type text without a global delete', async ({ page }) => {
  await createPlan(page, 'blank', 'My plan');
  expect(await counts(page)).toEqual({ tables: 0, chairs: 0, seated: 0, guests: 0 });
  await page.keyboard.press('t');
  await page.getByTestId('preset-rect').click();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(box.x + 130, box.y + 110);
  await expect(page.getByTestId('inspector-table')).toBeVisible();
  expect((await counts(page)).tables).toBe(1);
  await page.getByTestId('table-name').fill('Buffet');
  await page.getByTestId('table-name').press('Delete');
  expect((await counts(page)).tables).toBe(1);
  await page.getByTestId('add-chairs').click();
  expect((await counts(page)).chairs).toBeGreaterThan(0);
  await page.getByTestId('table-name').press('Enter');
  await page.keyboard.press('Delete');
  expect((await counts(page)).tables).toBe(0);
});

test('Distribute chairs and undo completely', async ({ page }) => {
  await createPlan(page, 'restaurant');
  expect((await counts(page)).chairs).toBe(32);
  await page.getByTestId('open-distribute').click();
  await page.getByTestId('distribute-total').fill('30');
  await page.getByTestId('distribute-total').press('Enter');
  await page.getByTestId('distribute-max').fill('6');
  await page.getByTestId('distribute-max').press('Enter');
  await expect(page.getByTestId('distribute-summary')).toContainText('30 of 30');
  await page.getByTestId('distribute-apply').click();
  expect((await counts(page)).chairs).toBe(30);
  await page.keyboard.press('Control+z');
  expect((await counts(page)).chairs).toBe(32);
});

test('Name areas, change kind and size, undo/redo and save permanently', async ({ page }) => {
  await createPlan(page, 'blank', 'Flächenplan');
  await page.keyboard.press('a');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId('inspector-zone')).toBeVisible();
  await expect(page.getByTestId('zone-name')).toBeFocused();
  await page.getByTestId('zone-name').fill('Dance floor & stage');
  await page.getByTestId('zone-name').press('Enter');
  await page.getByRole('radio', { name: 'Stage', exact: true }).click();
  await page.getByTestId('zone-width').fill('4,5');
  await page.getByTestId('zone-width').press('Enter');
  await page.getByTestId('zone-length').fill('3');
  await page.getByTestId('zone-length').press('Enter');
  const zone = () => state(page, ({ editor }) => editor.getState().doc.objects.find((o) => o.type === 'zone'));
  expect(await zone()).toMatchObject({ name: 'Dance floor & stage', kind: 'stage', width: 4.5, height: 3 });
  await page.keyboard.press('Control+z');
  expect(await zone()).toMatchObject({ height: 2 });
  await page.keyboard.press('Control+Shift+z');
  expect(await zone()).toMatchObject({ height: 3 });
  await page.keyboard.press('Escape');
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByTestId('zone-name')).toBeFocused();
  await page.getByTestId('zone-name').press('Enter');
  await page.getByRole('radio', { name: 'No-go', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Object.values(localStorage).some((v) => v.includes('Dance floor & stage') && v.includes('blocked')))).toBe(true);
  await page.reload();
  await expect(page.getByTestId('welcome-dialog')).toHaveCount(0);
  expect(await zone()).toMatchObject({ name: 'Dance floor & stage', kind: 'blocked', width: 4.5, height: 3 });
  await page.evaluate(() => { delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker; });
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const data = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(data.objects.find((o: { type: string }) => o.type === 'zone')).toMatchObject({ name: 'Dance floor & stage', kind: 'blocked', width: 4.5, height: 3 });
});

test('Locally restored file changes stay marked as unsaved', async ({ page }) => {
  await createPlan(page, 'blank', 'Gespeichert');
  await page.evaluate(() => { delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker; });
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  await download;
  await expect(page).toHaveTitle('Gespeichert – Seatsketch Studio');
  await page.getByTestId('project-name').fill('Lokal bearbeitet');
  await page.getByTestId('project-name').press('Enter');
  await expect(page).toHaveTitle('• Lokal bearbeitet – Seatsketch Studio');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('seatsketch:library')!).plans[0].dirty)).toBe(true);
  await page.reload();
  await expect(page.getByTestId('project-name')).toHaveValue('Lokal bearbeitet');
  await expect(page).toHaveTitle('• Lokal bearbeitet – Seatsketch Studio');
});

test('Paste guests and seat them automatically', async ({ page }) => {
  await createPlan(page);
  await page.getByTestId('tab-guests').click();
  await page.getByTestId('guest-paste').fill('Ida Vogel\nKarl Sommer\nLuise Winter');
  await page.getByTestId('guest-add').click();
  expect((await counts(page)).guests).toBe(3);
  await page.getByTestId('guest-fill').click();
  expect((await counts(page)).seated).toBe(3);
});

test('Dimension readout, Ctrl pan and individual chair size', async ({ page }) => {
  await createPlan(page);
  await page.getByTestId('toggle-dimensions').click();
  expect(await state(page, ({ editor }) => editor.getState().doc.settings.showDimensions)).toBe(false);
  const before = await state(page, ({ ui }) => ui.getState().viewport);
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.keyboard.down('Control');
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 340, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  const after = await state(page, ({ ui }) => ui.getState().viewport);
  expect(after.x).toBeGreaterThan(before.x + 60);
  expect(after.y).toBeGreaterThan(before.y + 30);
  await page.getByTestId('chair-preset-padded').click();
  expect(await state(page, ({ editor }) => editor.getState().doc.settings.chair)).toEqual({ width: 0.5, depth: 0.52 });
  await page.getByRole('radio', { name: 'Centimetres', exact: true }).click();
  await page.getByTestId('chair-width').fill('55');
  await page.getByTestId('chair-width').press('Enter');
  expect(await state(page, ({ editor }) => editor.getState().doc.settings.chair.width)).toBe(0.55);
});

test('Record hotkeys, resolve a conflict, disable and reset', async ({ page }) => {
  await createPlan(page);
  await page.getByTestId('open-settings').click();
  await page.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  const row = page.getByText('Grid on/off', { exact: true }).locator('..');
  await row.locator('[data-key-capture]').first().click();
  await page.keyboard.press('Control+Shift+M');
  expect(await state(page, ({ keymap }) => keymap.getState().overrides.toggleGrid)).toEqual(['Mod+Shift+M']);
  expect(await state(page, ({ keymap }) => keymap.getState().overrides.toggleDims)).toBeUndefined();
  await row.getByRole('button', { name: 'Disable shortcut', exact: true }).click();
  expect(await state(page, ({ keymap }) => keymap.getState().overrides.toggleGrid)).toEqual([]);
  await row.getByRole('button', { name: 'Enable shortcut', exact: true }).click();
  expect(await state(page, ({ keymap }) => keymap.getState().overrides.toggleGrid)).toBeUndefined();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.keyboard.press('Shift+g');
  expect(await state(page, ({ editor }) => editor.getState().doc.settings.showGrid)).toBe(false);
});

test('F11 toggles borderless fullscreen', async ({ page }) => {
  await createPlan(page);
  await page.keyboard.press('F11');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.keyboard.press('F11');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test('Saving produces a valid .seatsketch file', async ({ page }) => {
  await createPlan(page, 'blank', 'My plan');
  await page.evaluate(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const file = await download;
  expect(file.suggestedFilename()).toBe('My plan.seatsketch');
  const data = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(data.schema).toBe('seatsketch-studio');
  expect(data.version).toBe(1);
  expect(data.objects).toHaveLength(1);
});

test('PNG export with logo and a real 3D view', async ({ page }) => {
  test.setTimeout(60_000);
  await createPlan(page, 'wedding');
  await page.evaluate(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.getByTestId('open-export').click();
  await page.getByTestId('format-png').click();
  await page.getByTestId('export-3d').click();
  await page.getByRole('radio', { name: 'Normal', exact: true }).click();
  const download = page.waitForEvent('download', { timeout: 45_000 });
  await page.getByTestId('export-run').click();
  const file = await download;
  const data = readFileSync((await file.path())!);
  expect(file.suggestedFilename()).toBe('Wedding & party.png');
  expect(data.subarray(1, 4).toString()).toBe('PNG');
  expect(data.readUInt32BE(16)).toBe(800);
  expect(data.readUInt32BE(20)).toBeGreaterThan(550);
  expect(data.length).toBeGreaterThan(50_000);
});

test('PDF contains floor plan, 3D page and alphabetical guest list', async ({ page }) => {
  test.setTimeout(60_000);
  await createPlan(page);
  await page.getByTestId('tab-guests').click();
  await page.getByTestId('guest-paste').fill('Zoe Beispiel\nAdam Muster');
  await page.getByTestId('guest-add').click();
  await page.evaluate(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.getByTestId('open-export').click();
  await page.getByTestId('export-3d').click();
  await page.getByTestId('export-guest-list').click();
  const download = page.waitForEvent('download', { timeout: 45_000 });
  await page.getByTestId('export-run').click();
  const file = await download;
  const data = readFileSync((await file.path())!);
  expect(file.suggestedFilename()).toBe('Meeting room.pdf');
  expect(data.subarray(0, 5).toString()).toBe('%PDF-');
  expect(data.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(3);
  expect(data.length).toBeGreaterThan(50_000);
});
