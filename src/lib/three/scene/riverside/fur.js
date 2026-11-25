// The far bank's grass as fur (?flora=stylised only), the user's ask: "it is supposed to cover the
// entire thing.. like fully like fur". One InstancedMesh of small tufts (three crossed blades, one
// triangle each), packed so close that neighbours overlap and no ground shows between them.
// Tufts further from the eye stand further apart and are drawn bigger by the same factor, so they
// look about equally dense at any distance (a stylisation). Blades run from a dark root to a
// lighter tip in the rain tree's leaf greens (#223b1f to #4c7a33), so the gaps read as deep fur.
// Every number here is a design choice tuned in the window shot, not a measurement.

import * as THREE from 'three';
import { SITE, WINDOW_EYE, fbm, rgb } from '../world/site.js';
import { mulberry32 } from '../../../utils/rng.js';
import { underForecourt } from './forecourt.js';
import { OUTSIDE_THEME } from '../themes/index.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const FAR_FUR = {
  bands: [SITE.far.rough, 11, SITE.far.foot, 20, SITE.far.crest, 40, 60, 85, SITE.far.back, 135, 160], // offsets inland (m); spacing is set per band
  reach: 460, // m from the window's eye
  bearing: 72, // degrees either side of straight out (-z): what the window and the seat can see
  spacing: { rate: 0.0042, min: 0.12, max: 2.2 }, // m between tufts: distance from the eye times rate
  footprint: 1.5, // a tuft's blades spread over this many spacings, so neighbours overlap
  height: { base: 0.3, from: 60, max: 4 }, // m; drawn taller beyond `from` m, up to `max` times
  blade: { width: 0.34, lean: 0.35 }, // per unit of footprint; lean outward per unit of height
  patches: { size: 13, lawn: 0.28, meadow: 0.05 }, // taller, lighter grass where the noise is over the threshold
  short: OUTSIDE_THEME.fur.short, // colours: themes/outside.js
  tall: OUTSIDE_THEME.fur.tall,
  root: 0.38, // vertex colour at a blade's root (times the tuft's green): the dark under-fur
  clear: { centre: [SITE.assembly.x, SITE.assembly.z], radius: 46 }, // none under the Assembly building
};

/** One tuft in unit space: three blades round the origin, 1 m tall, leaning outward. */
function tuftGeometry() {
  const F = FAR_FUR;
  const pos = [], col = [], nor = [];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + 0.4;
    const out = [Math.cos(a), Math.sin(a)];
    const side = [-out[1], out[0]];
    const r = 0.22; // root off the centre
    const root = [out[0] * r, out[1] * r];
    const w = F.blade.width / 2;
    pos.push(root[0] - side[0] * w, 0, root[1] - side[1] * w);
    pos.push(root[0] + side[0] * w, 0, root[1] + side[1] * w);
    pos.push(root[0] + out[0] * F.blade.lean, 1, root[1] + out[1] * F.blade.lean);
    col.push(F.root, F.root, F.root, F.root, F.root, F.root, 1, 1, 1);
    // Lit as ground cover: normals mostly up, so the fur shades like the lawn it replaces.
    for (let k = 0; k < 3; k++) nor.push(out[0] * 0.3, 1, out[1] * 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.normalizeNormals();
  return g;
}

/**
 * Places the tufts. `bank` is buildFarBank's report; `material` the outdoor toon material
 * (vertex colours on; the tuft's green comes in as instanceColor). Returns { mesh, stats }.
 */
export function buildFarFur(bank, { seed = 0, material, density = 1 }) {
  const F = FAR_FUR;
  const rand = mulberry32(1531 + seed);
  const { stations, place, lawnAt } = bank;
  const [ex, , ez] = WINDOW_EYE;
  const short = F.short.map((h) => new THREE.Color(...rgb(h)));
  const tall = F.tall.map((h) => new THREE.Color(...rgb(h)));
  const matrices = [], colours = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
  const visible = (x, z) => Math.abs((Math.atan2(x - ex, -(z - ez)) * 180) / Math.PI) <= F.bearing;
  const stats = { tufts: 0, tall: 0 };
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    if (Math.hypot(a.x - ex, a.z - ez) > F.reach + 160) continue;
    const L = (lawnAt(a) + lawnAt(b)) / 2;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let k = 0; k < F.bands.length - 1; k++) {
      const o0 = F.bands[k], o1 = F.bands[k + 1];
      const mx = (a.x + b.x) / 2 + a.nx * (o0 + o1) / 2, mz = (a.z + b.z) / 2 + a.nz * (o0 + o1) / 2;
      const mid = Math.hypot(mx - ex, mz - ez);
      if (mid > F.reach + 40) continue;
      const sp = clamp(mid * F.spacing.rate, F.spacing.min, F.spacing.max) / Math.sqrt(density);
      // A jittered grid: one tuft per cell, so the cover has no clumps and no holes.
      const nu = Math.max(1, Math.round(len / sp)), nv = Math.max(1, Math.round((o1 - o0) / sp));
      for (let u = 0; u < nu; u++) {
        for (let w = 0; w < nv; w++) {
          const xw = a.x + (b.x - a.x) * ((u + rand()) / nu);
          const o = o0 + (o1 - o0) * ((w + rand()) / nv);
          if (underForecourt(xw, o)) continue;
          const p = place(xw, o);
          const dist = Math.hypot(p[0] - ex, p[2] - ez);
          if (dist > F.reach || !visible(p[0], p[2])) continue;
          if (Math.hypot(p[0] - F.clear.centre[0], p[2] - F.clear.centre[1]) < F.clear.radius) continue;
          const noise = fbm(p[0] / F.patches.size, p[2] / F.patches.size, 977 + seed);
          const isTall = noise > (L > 0.5 ? F.patches.lawn : F.patches.meadow);
          const grow = clamp(dist / F.height.from, 1, F.height.max);
          const h = F.height.base * grow * (0.7 + 0.7 * rand()) * (isTall ? 2.2 : 1);
          const foot = sp * F.footprint * (0.8 + 0.4 * rand());
          q.setFromAxisAngle(up, rand() * Math.PI * 2);
          m.compose(v.set(p[0], p[1] + 0.02, p[2]), q, s.set(foot, h, foot));
          matrices.push(m.clone());
          const c = (isTall ? tall : short)[Math.floor(rand() * (isTall ? tall : short).length)].clone();
          c.multiplyScalar(0.9 + 0.2 * rand());
          colours.push(c);
          stats.tufts++;
          if (isTall) stats.tall++;
        }
      }
    }
  }
  const geometry = tuftGeometry();
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((mat, j) => mesh.setMatrixAt(j, mat));
  colours.forEach((c, j) => mesh.setColorAt(j, c));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false; // spread over the whole bank: always partly in view
  mesh.name = 'farFur';
  stats.triangles = matrices.length * 3;
  return { mesh, stats };
}
