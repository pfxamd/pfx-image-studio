import { expect, test } from '@playwright/test';

async function addImages(page: import('@playwright/test').Page, count: number) {
  await page.evaluate(async (total) => {
    const transfer = new DataTransfer();
    for (let i = 0; i < total; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 24;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = i ? '#118ab2' : '#ef476f';
      context.fillRect(0, 0, 32, 24);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG failed')), 'image/png');
      });
      transfer.items.add(new File([blob], 'fixture-' + (i + 1) + '.png', { type: 'image/png' }));
    }
    const dropZone = document.querySelector<HTMLElement>('[data-testid="drop-zone"]');
    if (!dropZone) throw new Error('Drop zone unavailable');
    dropZone.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: transfer,
    }));
  }, count);
}

test('image workspace keeps the real conversion, preview, comparison and downloads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('PFx Image Studio');
  await expect(page.getByText(/^Alpha \d+\.\d+(?:\.\d+)?$/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Image workspace' })).toBeVisible();
  await addImages(page, 1);
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Original: fixture-1.png' })).toBeVisible();
  await page.getByRole('button', { name: /Convert image/ }).click();
  await expect(page.getByRole('button', { name: 'Compare' })).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByRole('slider', { name: 'Compare original and processed images' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Processed: fixture-1.png' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('editing selected image settings preserves other completed image results', async ({ page }) => {
  await page.goto('/');
  await addImages(page, 2);
  await page.getByRole('button', { name: 'Process all' }).click();
  await expect(page.getByRole('button', { name: 'Download ZIP' })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Select image fixture-2.png' }).click();
  await page.getByRole('button', { name: 'Selected', exact: true }).click();
  await page.getByRole('button', { name: 'JPG', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download image' })).toBeDisabled();
  await page.getByRole('button', { name: 'Select image fixture-1.png' }).click();
  await expect(page.getByRole('button', { name: 'Download image' })).toBeEnabled();
});

test('mobile layout has no horizontal overflow before and after upload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your image workspace' })).toBeVisible();
  const measureOverflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await measureOverflow()).toBeLessThanOrEqual(1);
  await addImages(page, 1);
  await expect(page.getByRole('heading', { name: 'Image preview' })).toBeVisible();
  expect(await measureOverflow()).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Convert image' })).toBeVisible();
});
