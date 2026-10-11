/**
 * Produce a public release attestation in the deployed artifact.
 * This intentionally reports the commit that was built, not a claimed live
 * status. The live verification job independently fetches the actual URL.
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const release = await readFile('app/release.ts', 'utf8');
const match = release.match(/export const studioVersion = '([^']+)'/);
if (!match || !/^\d+\.\d+\.\d+$/.test(match[1])) {
  throw new Error('Invalid release version in app/release.ts');
}
const commit = (process.env.GITHUB_SHA ||
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid source commit SHA');
await access('site-dist/index.html');
const attestation = {
  schemaVersion: 1,
  product: 'PFx Image Studio',
  channel: 'Alpha',
  version: match[1],
  commit,
  builtAt: new Date().toISOString()
};
await writeFile('site-dist/release.json', JSON.stringify(attestation, null, 2) + '\n');
console.log('Attestation packaged:', attestation.version, attestation.commit);
