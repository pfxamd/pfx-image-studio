import { expect, test, type Page } from '@playwright/test';

async function loadImage(page: Page, name: string, width: number, height: number, alpha = false) {
  const url = await page.evaluate(({ width, height, alpha }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = alpha ? 'rgba(220, 20, 70, .5)' : '#568bc4';
    ctx.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png');
  }, { width, height, alpha });
  await page.locator('input[type="file"]').first().setInputFiles({
    name, mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1]!, 'base64'),
  });
}

test('conversion does not unexpectedly resize the image', async ({ page }) => {
  await page.goto('/');
  await loadImage(page, 'original.png', 60, 40);
  await page.getByRole('button', { name: 'Convert image' }).click();
  await expect(page.getByText('60 × 40 px', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
});

test('resize is an independent operation and preserves original format', async ({ page }) => {
  await page.goto('/');
  await loadImage(page, 'large.png', 60, 40, true);
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Maximum width in pixels' }).fill('24');
  await page.getByRole('button', { name: 'Resize image' }).click();
  await expect(page.getByText('24 × 16 px', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('PNG output ready')).toBeVisible();
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Convert image' }).click();
  await expect(page.getByText('60 × 40 px', { exact: true })).toBeVisible({ timeout: 60_000 });
});

test('resize never upscales an image', async ({ page }) => {
  await page.goto('/');
  await loadImage(page, 'small.png', 30, 18);
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Maximum width in pixels' }).fill('100');
  await page.getByRole('button', { name: 'Resize image' }).click();
  await expect(page.getByText('30 × 18 px', { exact: true })).toBeVisible({ timeout: 60_000 });
});

test('invalid width produces an actionable error', async ({ page }) => {
  await page.goto('/');
  await loadImage(page, 'bad-width.png', 30, 18);
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Maximum width in pixels' }).fill('0');
  await page.getByRole('button', { name: 'Resize image' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Processing failed' })).toBeVisible();
});
