import { expect, test } from '@playwright/test';

test('Raster Core identifies a selected source while Image3 conversion remains available', async ({ page }) => {
  await page.goto('/');

  // Generate a real valid transparent PNG using the browser's own PNG encoder.
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 3;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.fillRect(0, 0, 2, 3);
    return canvas.toDataURL('image/png');
  });
  const file = {
    name: 'raster-check.png',
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64'),
  };
  await page.locator('input[type="file"]').first().setInputFiles(file);

  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.getByText('DIMENSIONS')).toBeVisible();
  await expect(page.getByText('4 × 3', { exact: true })).toBeVisible();
  await expect(page.getByText('TRANSPARENCY')).toBeVisible();
  await expect(page.getByText('Yes', { exact: true })).toBeVisible();
  await expect(page.getByText('ICC PROFILE')).toBeVisible();

  // The existing worker codec path is unchanged by metadata inspection.
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await page.getByRole('button', { name: /Convert image/ }).click();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled({ timeout: 60_000 });
});
