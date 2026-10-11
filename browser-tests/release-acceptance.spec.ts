import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('10 raster images downscale, convert and download without broken queue state', async ({page}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const fixtures = await page.evaluate(() => {
    const files: string[] = [];
    for (let n = 0; n < 10; n++) {
      const canvas = document.createElement('canvas');
      canvas.width = 960; canvas.height = 640;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      const gradient = ctx.createLinearGradient(0, 0, 960, 640);
      gradient.addColorStop(0, 'rgb(30, 80, 130)');
      gradient.addColorStop(1, 'rgb(218, 145, 67)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 960, 640);
      ctx.fillStyle = '#f4e9c4';
      for (let i = 0; i < 24; i++) {
        ctx.fillRect(3 + i * 40 + n, 30, 2, 560);
      }
      files.push(canvas.toDataURL('image/png'));
    }
    return files;
  });
  await page.locator('input[type="file"]').first().setInputFiles(
    fixtures.map((data, i) => ({
      name: 'acceptance-' + i + '.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data.split(',')[1]!, 'base64')
    }))
  );
  const rail = page.getByRole('complementary', {name:'Image files'});
  await expect(rail.locator('[role="listitem"]')).toHaveCount(10);
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  await page.getByRole('spinbutton', {name:'Maximum width in pixels'}).fill('480');
  const start = Date.now();
  await page.getByRole('button', {name:'Process all'}).click();
  await expect(rail.locator('[role="listitem"]').filter({hasText:'Done'}))
    .toHaveCount(10, {timeout:100_000});
  await expect(rail.locator('[role="listitem"]').filter({hasText:'Failed'}))
    .toHaveCount(0);
  await expect(page.getByText('480 × 320 px', {exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:'Download ZIP'})).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', {name:'Download ZIP'}).click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50,0x4b,0x03,0x04]));
  expect(bytes.byteLength).toBeGreaterThan(100);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({
    workload:'10-image-raster-acceptance',
    browser:page.context().browser()?.browserType().name(),
    durationMs:Date.now()-start,
    images:10,
    dimensions:'480x320',
    zipBytes:bytes.byteLength
  }));
});
