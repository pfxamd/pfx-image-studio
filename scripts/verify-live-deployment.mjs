/**
 * Verify that public GitHub Pages serves this exact commit, not just that
 * the build and GitHub Pages upload steps succeeded.
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const site = new URL(process.env.PFX_LIVE_URL || 'https://pfxamd.github.io/pfx-image-studio/');
const expectedCommit = (process.env.GITHUB_SHA ||
  execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'})).trim();
const releaseText = await readFile('app/release.ts', 'utf8');
const expectedVersion = releaseText.match(/export const studioVersion = '([^']+)'/)?.[1];
if (!expectedVersion || !/^[a-f0-9]{40}$/.test(expectedCommit)) {
  throw new Error('Invalid expected release identity');
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchFresh(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(url.pathname + ': HTTP ' + response.status);
  return response;
}

let verified;
let lastError;
for (let attempt = 1; attempt <= 30; attempt++) {
  try {
    const attestationUrl = new URL('release.json', site);
    attestationUrl.searchParams.set('verify', expectedCommit);
    const manifest = await (await fetchFresh(attestationUrl)).json();
    if (manifest.product !== 'PFx Image Studio' ||
        manifest.version !== expectedVersion || manifest.commit !== expectedCommit) {
      throw new Error('Stale or mismatched Pages release: ' +
        JSON.stringify({ observed: manifest.version, commit: manifest.commit,
          expectedVersion, expectedCommit }));
    }

    const index = await (await fetchFresh(new URL('?verify=' + expectedCommit, site))).text();
    if (!index.includes('<div id="root"></div>')) throw new Error('Published HTML root missing');
    const assets = [...index.matchAll(/(?:src|href)=["']([^"']+\/assets\/[^"']+\.(?:js|css))["']/g)]
      .map(match => match[1]);
    if (!assets.some(asset => asset.endsWith('.js'))) {
      throw new Error('Published application JS entry missing');
    }
    for (const asset of assets) {
      const url = new URL(asset, site);
      url.searchParams.set('verify', expectedCommit);
      const response = await fetchFresh(url);
      const body = await response.text();
      if (body.length < 100) throw new Error('Suspiciously small published asset: ' + asset);
    }
    const diagnosticsUrl = new URL('diagnostics/', site);
    diagnosticsUrl.searchParams.set('verify', expectedCommit);
    const diagnosticsHtml = await (await fetchFresh(diagnosticsUrl)).text();
    if (!diagnosticsHtml.includes('id="start"') ||
        !diagnosticsHtml.includes('Image processing diagnostic') ||
        !diagnosticsHtml.includes('/assets/')) {
      throw new Error('Diagnostic page or its compiled entry assets are missing');
    }
    verified = { version: manifest.version, commit: manifest.commit,
      assets: assets.length, diagnostics: true, page: site.href };
    break;
  } catch (error) {
    lastError = error;
    console.log('Pages verification attempt', attempt, 'of 30:', String(error));
    if (attempt !== 30) await wait(5000);
  }
}
if (!verified) throw new Error('Could not attest live release: ' + String(lastError));
console.log('PUBLIC_DEPLOYMENT_VERIFIED', JSON.stringify(verified));
