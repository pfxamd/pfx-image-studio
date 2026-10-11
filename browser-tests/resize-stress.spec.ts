import { test, expect, type Page } from '@playwright/test';

async function setImages(page: Page, count: number, width: number, height: number) {
  const urls = await page.evaluate(({ count, width, height }) => {
    const items: string[] = [];
    for (let n = 0; n < count; n++) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#204db4');
      gradient.addColorStop(1, '#d98a46');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#f3c812';
      for (let x = n + 2; x < width; x += 17) ctx.fillRect(x, 0, 2, height);
      items.push(canvas.toDataURL('image/png'));
    }
    return items;
  }, { count, width, height });
  await page.locator('input[type="file"]').first().setInputFiles(urls.map((url, i) => ({
    name: 'workload-' + i + '.png',
    mimeType: 'image/png',
    buffer: Buffer.from(url.split(',')[1]!, 'base64')
  })));
}

test('serialized raster resizing completes a 3-image batch without UI stall', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await setImages(page, 3, 1400, 920);
  await page.getByRole('checkbox', { name: 'Resize image' }).check();
  await page.getByRole('spinbutton', { name: 'Maximum width in pixels' }).fill('700');
  const started = Date.now();
  await page.getByRole('button', { name: 'Convert all remaining' }).click();
  // Controls are on the main UI thread; this check exposes synchronous hangs.
  await expect(page.getByRole('button', { name: 'Cancel all' })).toBeVisible();
  const rail = page.getByRole('complementary', { name: 'Image files' });
  await expect(rail.locator('[role="listitem"]').filter({ hasText: 'Done' })).toHaveCount(3, {
    timeout: 120_000
  });
  await expect(page.getByRole('button', { name: 'Download ZIP' })).toBeEnabled();
  const inspector = page.getByRole('complementary', { name: 'Processing settings' });
  await expect(inspector.getByText('700 × 460', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  console.log('Synthetic 3-image batch duration ms: ' + (Date.now() - started));
});

test('cancel queued or running resize jobs, then retry successfully', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await setImages(page, 3, 1800, 1200);
  await page.getByRole('checkbox', { name: 'Resize image' }).check();
  await page.getByRole('spinbutton', { name: 'Maximum width in pixels' }).fill('800');
  await page.getByRole('button', { name: 'Convert all remaining' }).click();
  await expect(page.getByRole('button', { name: 'Cancel all' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel all' }).click();
  const rail = page.getByRole('complementary', { name: 'Image files' });
  await expect(rail.locator('[role="listitem"]').filter({ hasText: 'Cancelled' })).not.toHaveCount(0, {
    timeout: 30_000
  });
  await expect(page.getByRole('button', { name: 'Convert all remaining' })).toBeVisible({
    timeout: 30_000
  });
  // Cancellation must leave the app usable, without leaked queue reservations.
  await page.getByRole('button', { name: 'Convert all remaining' }).click();
  await expect(rail.locator('[role="listitem"]').filter({ hasText: 'Done' })).toHaveCount(3, {
    timeout: 120_000
  });
  expect(errors).toEqual([]);
});
