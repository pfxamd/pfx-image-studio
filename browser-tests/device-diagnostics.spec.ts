import { expect, test } from '@playwright/test';

test('device diagnostic uses actual workers and exports a truthful local report', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/diagnostics/');
  await expect(page.getByRole('heading', {name:'Image processing diagnostic'})).toBeVisible();
  await expect(page.locator('#version')).toContainText('Alpha 0.2.8');
  await page.getByRole('button', {name:'Run diagnostic'}).click();
  await expect(page.locator('#badge')).toHaveText('Completed', {timeout:110_000});
  await expect(page.locator('#counter')).toHaveText('13/13');
  const json = await page.locator('#report').innerText();
  const report = JSON.parse(json);
  expect(report.result).toBe('passed');
  expect(report.release).toBe('0.2.8');
  expect(report.cases).toHaveLength(4);
  expect(report.cases.map((entry: {repetitions:number}) => entry.repetitions))
    .toEqual([1, 1, 1, 10]);
  expect(report.cases[0].source).toBe('1280x800');
  expect(report.cases[0].target).toBe('1280x800');
  expect(report.cases[1].target).toBe('800x500');
  expect(report.cases[2].target).toBe('1200x800');
  expect(report.cases[3].target).toBe('480x320');
  expect(report.memory.warning).toContain('not total device memory');
  for (const result of report.cases) {
    expect(result.totalMs).toBeGreaterThan(0);
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(result.outputFormat).toBe('webp');
  }
  expect(report.totalElapsedMs).toBeGreaterThan(0);
  await expect(page.getByRole('button', {name:'Copy report'})).toBeEnabled();
  await expect(page.getByRole('button', {name:'Save report'})).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name:'Save report'}).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('pfx-studio-device-diagnostic.json');
  const reportBytes = await (await import('node:fs/promises')).readFile(await saved.path(), 'utf8');
  expect(JSON.parse(reportBytes).result).toBe('passed');
  expect(errors).toEqual([]);
});

test('stop preserves truthful cancelled state instead of reporting fake success', async ({page}) => {
  await page.goto('/diagnostics/');
  await page.getByRole('button', {name:'Run diagnostic'}).click();
  await page.getByRole('button', {name:'Stop'}).click();
  await expect(page.locator('#badge')).toHaveText('Stopped', {timeout:30_000});
  await expect(page.getByRole('button', {name:'Run diagnostic'})).toBeEnabled();
  await expect(page.getByRole('button', {name:'Copy report'})).toBeDisabled();
});
