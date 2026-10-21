/**
 * Chromium smoke of the actually deployed app: selected-image inspection,
 * opt-in Raster Core resize, Image3 WebP encode, and real download bytes.
 */
import assert from 'node:assert/strict';
import { resolveRelease } from './pfx-release.mjs';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const site = process.env.PFX_LIVE_URL || 'https://pfxamd.github.io/pfx-image-studio/';
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const response = await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(response?.status(), 200);
  const version = resolveRelease().version;
  assert.ok((await page.locator('header').first().innerText()).includes(version),
    'Rendered page version does not match release');

  const dataURL = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 112;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No browser canvas');
    ctx.fillStyle = '#4a78aa'; ctx.fillRect(0, 0, 160, 112);
    ctx.fillStyle = '#d68a45'; ctx.fillRect(30, 20, 100, 60);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(40, 10, 2, 90);
    return canvas.toDataURL('image/png');
  });
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'public-smoke.png', mimeType: 'image/png',
    buffer: Buffer.from(dataURL.split(',')[1], 'base64')
  });
  await page.getByRole('button', {name:'Resize',exact:true}).click();
  await page.getByRole('spinbutton', {name:'Maximum width in pixels'}).fill('80');
  await page.getByRole('button', {name:'Resize image'}).click();
  await page.getByText('80 × 56 px', {exact:true}).waitFor({state:'visible',timeout:45000});
  const resized = page.waitForEvent('download');
  await page.getByRole('button', {name:'Download',exact:true}).click();
  const resizedFile = await resized;
  const resizedBytes = await readFile(await resizedFile.path());
  assert.equal(resizedBytes.subarray(1,4).toString(), 'PNG',
    'Resize should preserve the original PNG format');

  await page.getByRole('button', {name:'Convert',exact:true}).click();
  await page.getByRole('button', {name:'Convert image'}).click();
  await page.getByRole('button', {name:'Download',exact:true}).waitFor({state:'attached',timeout:45000});
  await page.getByRole('button', {name:'Download',exact:true}).waitFor({state:'visible',timeout:45000});
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Download');
    return button && !button.disabled;
  }, {timeout:45000});
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name:'Download',exact:true}).click();
  const file = await download;
  const bytes = await readFile(await file.path());
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP',
    'Converter did not produce valid WebP output');
  assert.deepEqual(errors, []);
  console.log('PUBLIC_BROWSER_CONVERSION_VERIFIED', JSON.stringify({
    page:site,version,dimensions:'80x56',format:'webp',bytes:bytes.length
  }));
  const diagnosticUrl = new URL('diagnostics/', site).href;
  await page.goto(diagnosticUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByRole('heading', { name: 'Image processing diagnostic' })
    .waitFor({ state: 'visible', timeout: 15000 });
  assert.ok((await page.locator('#version').innerText()).includes(version));
  await page.getByRole('button', { name: 'Run diagnostic' }).click();
  await page.getByText('Completed', { exact: true })
    .waitFor({ state: 'visible', timeout: 90000 });
  const report = JSON.parse(await page.locator('#report').innerText());
  assert.equal(report.result, 'passed');
  assert.equal(report.release, version);
  assert.equal(report.schemaVersion, 3);
  assert.equal(report.cases.length, 6);
  assert.deepEqual(report.cases.map(entry => entry.repetitions), [1,5,5,5,5,10]);
  assert.ok(report.startup.firstConversionMs > 0);
  assert.ok(report.startup.warmedConversionMedianMs > 0);
  assert.ok(report.fixturePreparation.elapsedMs > 0);
  assert.ok(report.cases[0].stageMediansMs.codecDecodeMs > 0);
  assert.ok(report.cases[2].stageMediansMs.resampleMs > 0);
  assert.ok(report.cases[2].stageMediansMs.codecEncodeMs > 0);
  assert.deepEqual(errors, []);
  console.log('PUBLIC_DEVICE_DIAGNOSTICS_VERIFIED', JSON.stringify({
    page:diagnosticUrl, release:version, samples:31, elapsedMs:report.totalElapsedMs
  }));
} finally {
  await browser?.close();
}
