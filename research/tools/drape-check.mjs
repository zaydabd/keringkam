// Settles every fabric (interior/drape.js) in Node and checks it: no particle inside a box or
// under the floor, the fastest particle moving under 1 mm a step, its top within 6 cm of where it
// was laid (so it did not slide off), and the time each one took.
// Run: node research/tools/drape-check.mjs [--obj out-dir] (writes each cloth as .obj to look at)
import fs from 'node:fs';
import { PLAN } from '../../src/lib/three/scene/interior/plan.js';
import { drape } from '../../src/lib/three/scene/interior/drape.js';

const out = process.argv.includes('--obj') ? process.argv[process.argv.indexOf('--obj') + 1] : null;
let ok = true;
let total = 0;
for (const place of PLAN.fabrics) {
  const r = drape(place);
  total += r.ms;
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < r.position.length; i += 3) { lo = Math.min(lo, r.position[i]); hi = Math.max(hi, r.position[i]); }
  // It stayed on its piece: its top is within 6 cm of where it was laid (a cloth that slid off
  // ends far lower).
  const laid = Math.max(...place.path.map((p) => p[1]));
  const pass = !r.inside && r.fastest < 0.001 && r.position.every(Number.isFinite) && hi > laid - 0.06;
  ok &&= pass;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${place.name.padEnd(12)} ${r.grid.join('x')} ${r.steps} steps ${r.ms.toFixed(0)} ms, fastest ${(r.fastest * 1000).toFixed(2)} mm/step, inside ${r.inside}, y ${lo.toFixed(3)}..${hi.toFixed(3)}`);
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    let s = '';
    for (let i = 0; i < r.position.length; i += 3) s += `v ${r.position[i]} ${r.position[i + 1]} ${r.position[i + 2]}\n`;
    for (let y = 0; y < r.rows - 1; y++) for (let x = 0; x < r.cols - 1; x++) { const a = y * r.cols + x + 1; s += `f ${a} ${a + r.cols} ${a + 1}\nf ${a + 1} ${a + r.cols} ${a + r.cols + 1}\n`; }
    fs.writeFileSync(`${out}/${place.name}.obj`, s);
  }
}
console.log(`total ${total.toFixed(0)} ms`);
process.exit(ok ? 0 : 1);
