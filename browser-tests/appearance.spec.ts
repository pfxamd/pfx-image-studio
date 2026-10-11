import { expect, test } from '@playwright/test';

test('appearance toggle persists and desktop workspace stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');

  const workspace = page.locator('[data-theme]');
  await expect(workspace).toBeVisible();
  const initial = await workspace.getAttribute('data-theme');
  expect(['dark', 'light']).toContain(initial);

  const next = initial === 'dark' ? 'light' : 'dark';
  await page.getByRole('button', { name: initial === 'dark' ? 'Switch to light mode' : 'Switch to dark mode' }).click();
  await expect(workspace).toHaveAttribute('data-theme', next);
  await expect(page.getByRole('button', { name: next === 'light' ? 'Switch to dark mode' : 'Switch to light mode' })).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-theme]')).toHaveAttribute('data-theme', next);

  const bounds = await page.evaluate(() => ({
    viewportHeight: document.documentElement.clientHeight,
    documentHeight: document.documentElement.scrollHeight,
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(bounds.documentHeight).toBeLessThanOrEqual(bounds.viewportHeight + 1);
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
});


test('operations keep a stable canvas and usable click targets without page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  const initial = await page.locator('section[aria-label="Image preview"]').boundingBox();
  expect(initial).not.toBeNull();
  for (const name of ['Optimize', 'Resize', 'Inspect', 'Convert']) {
    const tab = page.getByRole('button', { name, exact: true });
    const size = await tab.boundingBox();
    expect(size).not.toBeNull();
    expect(size!.height).toBeGreaterThanOrEqual(44);
    await tab.click();
    const stage = await page.locator('section[aria-label="Image preview"]').boundingBox();
    expect(stage?.y).toBe(initial?.y);
    expect(stage?.height).toBe(initial?.height);
    const height = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(height).toBeLessThanOrEqual(1);
  }
  await expect(page.getByRole('region', { name: 'Convert controls' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resize controls' })).toHaveCount(0);
});
