// Stage exactly the published files into _site/. There is no bundling or transpiling.
import { cp, mkdir, rm } from 'node:fs/promises';
import { PUBLISHED, root } from './serve.mjs';
import { join } from 'node:path';

const out = join(root, '_site');
await rm(out, { recursive: true, force: true });
await mkdir(out);
for (const entry of PUBLISHED) await cp(join(root, entry), join(out, entry), { recursive: true });
console.log(`Staged ${PUBLISHED.join(', ')} in _site/`);
