import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const RED_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAKElEQVR42mO85uj9n4GGgImBxmDUglELRi0YtWDUglELRi0YtYA6AACAhQKR2QCfugAAAABJRU5ErkJggg==', 'base64');
const BLUE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAKElEQVR42mNULtv3n4GGgImBxmDUglELRi0YtWDUglELRi0YtYA6AAAbbQKGsg+UegAAAABJRU5ErkJggg==', 'base64');

async function createArtwork(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas missing');
    const gradient = ctx.createLinearGradient(0, 0, 400, 300);
    gradient.addColorStop(0, '#d64c55');
    gradient.addColorStop(.5, '#9a55aa');
    gradient.addColorStop(1, '#186d98');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = 'rgba(255,240,190,.85)';
    ctx.beginPath(); ctx.arc(276, 82, 48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#244c67';
    ctx.beginPath(); ctx.moveTo(0, 300); ctx.lineTo(156, 105); ctx.lineTo(302, 300); ctx.fill();
    ctx.fillStyle = '#4caa8d';
    ctx.beginPath(); ctx.moveTo(142, 300); ctx.lineTo(292, 156); ctx.lineTo(400, 300); ctx.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(base64, 'base64');
}

async function addFiles(page: Page, files: { name: string; buffer: Buffer }[]) {
  await page.getByLabel('Choose images to add').setInputFiles(files.map(({ name, buffer }) =>
    ({ name, mimeType: 'image/png', buffer })));
}

test('single-file upload, format conversion, comparison, image export and visual states', async ({ page, browserName }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await addFiles(page, [{ name: 'test-artwork.png', buffer: await createArtwork(page) }]);
  await expect(page.getByRole('img', { name: 'Original: test-artwork.png' })).toBeVisible();
  const title = page.getByRole('heading', { name: 'Preview' });
  await expect(title).toBeVisible();
  expect(await title.evaluate((heading) => heading.scrollWidth <= heading.clientWidth)).toBeTruthy();

  for (const [format, extension] of [['WEBP', '.webp'], ['PNG', '.png'], ['JPG', '.jpg']] as const) {
    await page.getByRole('button', { name: format, exact: true }).click();
    await page.getByRole('button', { name: 'Convert image' }).click();
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    const slider = page.getByRole('slider', { name: 'Compare original and processed images' });
    await expect(slider).toBeVisible();
    await slider.focus();
    await slider.press('Home');
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('1');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename().toLowerCase().endsWith(extension)).toBeTruthy();
    const bytes = await readFile(await download.path());
    expect(bytes.byteLength).toBeGreaterThan(30);
  }

  await page.getByRole('button', { name: 'Processed', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Processed: test-artwork.png' })).toBeVisible();
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Original: test-artwork.png' })).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('125%');
  await page.getByRole('button', { name: 'Reset zoom' }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('100%');

  // Screenshot logs are decoded for manual visual review of the real Firefox UI.
  if (browserName === 'firefox') {
    const current = await page.locator('[data-theme]').getAttribute('data-theme');
    if (current === 'light') await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('[data-theme]')).toHaveAttribute('data-theme', 'dark');
    console.log('PFX_VISUAL_DARK:' + (await page.screenshot({ type: 'jpeg', quality: 48, animations: 'disabled' })).toString('base64'));
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('[data-theme]')).toHaveAttribute('data-theme', 'light');
    console.log('PFX_VISUAL_LIGHT:' + (await page.screenshot({ type: 'jpeg', quality: 48, animations: 'disabled' })).toString('base64'));
  }
  expect(errors).toEqual([]);
});

test('batch processing, adding via preview drop, per-file selection and ZIP export', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await addFiles(page, [{ name: 'red.png', buffer: RED_PNG }]);
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'blue.png', { type: 'image/png' }));
    const stage = document.querySelector<HTMLElement>('section[aria-label="Image preview"]');
    if (!stage) throw new Error('Preview stage not found');
    stage.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    stage.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, BLUE_PNG.toString('base64'));

  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Select image blue.png' }).click();
  await expect(page.getByRole('img', { name: 'Original: blue.png' })).toBeVisible();
  await page.getByRole('button', { name: 'Selected', exact: true }).click();
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  await page.getByRole('button', { name: 'Select image red.png' }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Process all' }).click();
  await expect(page.getByRole('button', { name: 'Download ZIP' })).toBeEnabled({ timeout: 90_000 });
  await expect(page.getByText('2 ready to export')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pfx-image-studio-images.zip');
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.length).toBeGreaterThan(200);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(0);
  expect(errors).toEqual([]);
});
