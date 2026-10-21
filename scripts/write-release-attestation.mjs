/**
 * Produce a public release attestation in the deployed artifact.
 * This intentionally reports the commit that was built, not a claimed live
 * status. The live verification job independently fetches the actual URL.
 */
import { writeFile, access } from 'node:fs/promises';
import { resolveRelease } from './pfx-release.mjs';

const release = resolveRelease();
const commit = release.commit;
await access('site-dist/index.html');
const attestation = {
  schemaVersion: 1,
  product: 'PFx Image Studio',
  channel: 'Alpha',
  version: release.version,
  commit,
  builtAt: release.sourceDate
};
await writeFile('site-dist/release.json', JSON.stringify(attestation, null, 2) + '\n');
console.log('Attestation packaged:', attestation.version, attestation.commit);
