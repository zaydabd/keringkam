// The fabrics in the room (PLAN.fabrics): the project's own fabric photos, each settled onto its
// piece by the cloth simulation (drape.js) when the page loads, in Workers, one per fabric, so it
// does not hold up the room. Then a mesh per fabric: its grid smoothed to twice as many points,
// UVs cropped to the photo's opaque area (manifest.json `crop`), so the ink outline follows the
// cloth and no transparent margin shows.

import * as THREE from 'three';
import { PLAN } from '../world/plan.js';
import { drape } from './drape.js';
import { fabricIndex } from '../world/fabrics.js';

/** The manifest index of a fabric photo by name. */
export { fabricIndex }; // (world/fabrics.js) for the fabric loader

/**
 * Settles every fabric. Resolves with the results in PLAN order. Each runs in its own Worker
 * (at most one per core but one); where Workers are not available it runs here, one after another.
 */
export function drapeAll(places = PLAN.fabrics) {
  const workers = Math.max(1, Math.min(places.length, (navigator.hardwareConcurrency || 2) - 1));
  let make;
  try {
    make = () => new Worker(new URL('./drapeWorker.js', import.meta.url), { type: 'module' });
  } catch {
    make = null;
  }
  if (!make || typeof Worker === 'undefined') return Promise.resolve(places.map(drape));
  const results = new Array(places.length);
  let next = 0;
  const run = () =>
    new Promise((resolve, reject) => {
      const w = make();
      const take = () => {
        if (next >= places.length) {
          w.terminate();
          return resolve();
        }
        const k = next++;
        w.onmessage = ({ data }) => {
          results[k] = data;
          take();
        };
        w.onerror = (e) => {
          w.terminate();
          reject(e);
        };
        w.postMessage(places[k]);
      };
      take();
    });
  return Promise.all(Array.from({ length: workers }, run))
    .then(() => results)
    .catch(() => places.map(drape)); // a Worker failed (e.g. blocked): work them out here
}

/**
 * The mesh of a settled cloth, through its smoothed grid (drape.js: the 4 cm simulation grid
 * split along Catmull-Rom curves and kept clear of the furniture). UVs run over the photo's
 * crop box: across the cloth along u, down its length along v (from the top edge, or from the
 * bottom if flipped).
 *
 * A folded fabric (`fold` times in half) shows the first part of its photo on top; under it, a
 * second layer (FOLD_GAP towards the furniture, on the grid's `out` side) carries the next part
 * back, and a half-round strip at the far end is the fold. Further layers are hidden, not drawn.
 * `foldAcross` folds across the width the same way (one or the other, not both).
 */
const FOLD_GAP = 0.005;
export function fabricGeometry({ cols, rows, position, out = 1 }, crop, { flip = false, fold = 0, foldAcross = 0 } = {}) {
  const nc0 = cols;
  const nr0 = rows;
  const S = position;
  // Folded across, the same code runs on the grid turned a quarter: its columns become rows (which
  // also turns the grid's normal over) and the photo's u and v swap.
  const across = foldAcross > 0;
  const nc = across ? nr0 : nc0;
  const nr = across ? nc0 : nr0;
  if (across) out = -out;
  const folds = across ? foldAcross : fold;
  const part = 1 / 2 ** folds; // the share of the photo on each layer
  const pos = [];
  const uv = [];
  const index = [];
  // One band of rows: each row is nc points (point(c) -> [x, y, z]) at photo length t.
  function band(list) {
    const base = pos.length / 3;
    for (const [point, t] of list)
      for (let c = 0; c < nc; c++) {
        pos.push(...point(c));
        const a = c / (nc - 1);
        const u = across ? t : a;
        const v = across ? a : t;
        uv.push(crop.u0 + (crop.u1 - crop.u0) * u, flip ? crop.v0 + (crop.v1 - crop.v0) * v : crop.v1 - (crop.v1 - crop.v0) * v);
      }
    for (let r = 0; r < list.length - 1; r++)
      for (let c = 0; c < nc - 1; c++) {
        const a = base + r * nc + c;
        index.push(a, a + nc, a + 1, a + 1, a + nc, a + nc + 1);
      }
  }
  const p = (c, r) => {
    const k = (across ? c * nc0 + r : r * nc0 + c) * 3;
    return [S[k], S[k + 1], S[k + 2]];
  };
  const rowsOf = (fn) => Array.from({ length: nr }, (_, r) => fn(r));
  band(rowsOf((r) => [(c) => p(c, r), (r / (nr - 1)) * part]));
  if (folds) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const normal = (c, r) => {
      const a = sub(p(Math.min(nc - 1, c + 1), r), p(Math.max(0, c - 1), r));
      const b = sub(p(c, Math.min(nr - 1, r + 1)), p(c, Math.max(0, r - 1)));
      return unit([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]).map((x) => x * out);
    };
    const under = (c, r) => p(c, r).map((x, k) => x - normal(c, r)[k] * FOLD_GAP);
    band(rowsOf((r) => [(c) => under(c, r), 2 * part - (r / (nr - 1)) * part]));
    // The fold: a half round from the top layer's far edge, out past the end, to the under layer's.
    const end = nr - 1;
    const steps = 6;
    band(Array.from({ length: steps + 1 }, (_, k) => [(c) => {
      const n = normal(c, end);
      const t = unit(sub(p(c, end), p(c, end - 1)));
      const q = p(c, end);
      const h = FOLD_GAP / 2;
      const th = (k / steps) * Math.PI;
      return [0, 1, 2].map((i) => q[i] - n[i] * h + (n[i] * Math.cos(th) + t[i] * Math.sin(th)) * h);
    }, part]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * The ink pass tells parts apart by their vertex colour (toon.js), so each fabric gets its own,
 * close to white so it barely tints the photo.
 */
export function partColour(g, k) {
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  const shade = 0.955 + 0.008 * k;
  for (let i = 0; i < n; i++) colors.set([shade, shade - 0.004, shade - 0.008], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
