import { resolveRelease } from './pfx-release.mjs';
const release = resolveRelease();
console.log('Automatic application release verified:', release.label, release.commit);
