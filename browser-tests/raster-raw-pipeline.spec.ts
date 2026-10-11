import { test, expect } from '@playwright/test';

test('raw RGBA resize feeds Image3 codecs without creating PNG intermediate', async ({ page }) => {
  await page.goto('/');
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 40;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ed2323'; ctx.fillRect(0, 0, 32, 40);
    ctx.fillStyle = 'rgba(1, 210, 25, .4)'; ctx.fillRect(32, 0, 32, 40);
    return canvas.toDataURL('image/png');
  });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'sample.png', mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64'),
  });
  await page.getByRole('checkbox', { name: 'Resize image' }).check();
  await page.getByRole('spinbutton', { name: 'Maximum width in pixels' }).fill('32');

  // All final outputs are still handled by Image3's original codecs.
  for (const [format, button] of [['webp', 'WEBP'], ['png', 'PNG'], ['jpeg', 'JPG']] as const) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.getByRole('button', { name: /Convert image/ }).click();
    const inspector = page.getByRole('complementary', { name: 'Processing settings' });
    await expect(inspector.getByText('32 × 20')).toBeVisible({ timeout: 60_000 });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download image' }).click();
    const output = await download;
    expect(output.suggestedFilename()).toBe('sample.' + (format === 'jpeg' ? 'jpg' : format));

    const bytes = await (await import('node:fs/promises')).readFile(await output.path());
    if (format === 'png') expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    if (format === 'jpeg') expect(bytes.subarray(0, 2)).toEqual(Buffer.from([255,216]));
    if (format === 'webp') expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  }

  // Revert resize and verify the exact previous Image3 source dimensions.
  await page.getByRole('checkbox', { name: 'Resize image' }).uncheck();
  await page.getByRole('button', { name: /Convert image/ }).click();
  const details = page.getByRole('complementary', { name: 'Processing settings' });
  await expect(details.getByText('64 × 40', { exact: true })).toHaveCount(2);
});
