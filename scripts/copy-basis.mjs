// Copies three.js's Basis transcoder into public/basis/ so KTX2Loader can load it.
// The files must keep their exact names, which is why they live in public/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'node_modules/three/examples/jsm/libs/basis');
const to = path.join(root, 'public/basis');

fs.mkdirSync(to, { recursive: true });
for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  fs.copyFileSync(path.join(from, file), path.join(to, file));
}
