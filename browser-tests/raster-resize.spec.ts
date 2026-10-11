import { expect, test, type Page } from '@playwright/test';

async function loadImage(page: Page, name: string, width: number, height: number, alpha = false) {
  const url = await page.evaluate(({ width, height, alpha }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = alpha ? 'rgba(220, 20, 70, .5)' : '#568bc4';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ef9e43';
    ctx.fillRect(2, 2, 1, height - 4);
    return canvas.toDataURL('image/png');
  }, { width, height, alpha });
  await page.locator('input[type="file"]').first().setInputFiles({
    name, mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1]!, 'base64'),
  });
}

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Processing settings' });

test('disabled-by-default resize leaves original dimensions unchanged', async ({ page }) => {
  await page.goto('/');
  await loadImage(page, 'original.png', 60, 40);
  await expect(page.getByRole('checkbox', { name: 'Resize image' })).not.toBeChecked();
  await page.getByRole('button', { name: /Convert image/ }).click();
  await expect(inspector(page).getByText('60 × 40', { exact: true })).toHaveCount(2);
  await expect(inspector(page).getByText('Processed', { exact: true })).toBeVisible();
});

test('opt-in Raster Core downscales before the unchanged Image3 WebP encoder', async ({ page }) => {
  await page.goto('/');
  await loadImage(page, 'large.png', 60, 40, true);
  await page.getByRole('checkbox', { name: 'Resize image' }).check();
  await page.getByRole('spinbutton', { name: 'Maximum width in pixels' }).fill('24');
  await page.getByRole('button', { name: /Convert image/ }).click();
  await expect(inspector(page).getByText('24 × 16', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(inspector(page).getByText('60 × 40', { exact: true })).toBeVisible();
  await expect(page.getByText('WEBP output ready')).toBeVisible();

  // Toggle off and reprocess. Frozen converter must still output original size.
  await page.getByRole('checkbox', { name: 'Resize image' }).uncheck();
  await page.getByRole('button', { name: /Convert image/ }).click();
  await expect(inspector(page).getByText('60 × 40', { exact: true })).toHaveCount(2);
});

test('oversized target never enlarges an image', async ({ page }) => {
  await page.goto('/');
  await loadImage(page, 'small.png', 30, 18);
  await page.getByRole('checkbox', { name: 'Resize image' }).check();
  await page.getByRole('spinbutton', { name: 'Maximum width in pixels' }).fill('100');
  await page.getByRole('button', { name: /Convert image/ }).click();
  await expect(inspector(page).getByText('30 × 18', { exact: true })).toHaveCount(2);
});

test('invalid max width gives an actionable error, never silent fallback', async ({ page }) => {
  await page.goto('/');
  await loadImage(page, 'bad-width.png', 30, 18);
  await page.getByRole('checkbox', { name: 'Resize image' }).check();
  await page.getByRole('spinbutton', { name: 'Maximum width in pixels' }).fill('0');
  await page.getByRole('button', { name: /Convert image/ }).click();
  await expect(page.getByRole('alert')).toContainText('Maximum width must be an integer');
  await expect(page.getByRole('button', { name: /Retry image/ })).toBeVisible();
});
