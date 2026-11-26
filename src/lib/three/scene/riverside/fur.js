// The far bank's grass as fur (?flora=stylised only), the user's ask: "it is supposed to cover the
// entire thing.. like fully like fur". One InstancedMesh of broad blades combed one way like brush
// marks (FAR_FUR.stroke, the look the user picked on the test patch, grassPatch.js variant C),
// packed so close that neighbours overlap and no ground shows between them. Cells further from
// the eye stand further apart and their blades are drawn bigger by the same factor, so the cover
// looks about equally dense at any distance (a stylisation). Blades run from a dark root to a
// light tip in the rain tree's leaf greens, lighter in broad swaths. `tuftGeometry` (three
// crossed triangles) was the bank's earlier look; the test patch keeps it for comparison.
// Every number here is a design choice tuned by eye, not a measurement.

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
  spacing: { rate: 0.003, min: 0.12, max: 1.5 }, // m between cells: distance from the eye times rate (finer far off: the user asked for the far grass "a bit more detailed like the near")
  height: { from: 60, max: 3 }, // blades drawn taller beyond `from` m, up to `max` times
  blade: { width: 0.34, lean: 0.35 }, // tuftGeometry: per unit of footprint; lean outward per unit of height
  short: OUTSIDE_THEME.fur.short, // colours: themes/outside.js
  tall: OUTSIDE_THEME.fur.tall,
  root: 0.38, // vertex colour at a blade's root (times the tuft's green): the dark under-fur
  clear: { centre: [SITE.assembly.x, SITE.assembly.z], radius: 46 }, // none under the Assembly building
  // The look the user chose on the test patch (vegetation/plants/grassPatch.js, variant C, 26 Nov
  // 2026): broad blades combed one way like brush marks, with light tips. Sizes in m at `spacing`
  // m between cells; the bank scales them with its own spacing. `comb`: how far a blade lies over;
  // `combSpread`: rad of scatter round the combing direction; `tip`: tip brightness; `perCell`:
  // blades per cell. `flow`/`light`: m per unit of the noise that turns the combing and lays the
  // light swaths, as a multiple of the cell spacing at that distance (so they keep their look far off),
  // with `flowMin`/`lightMin` in m near the eye.
  // The user (26 Nov 2026): "the grass looks like it is always pushed by the wind". So the blades
  // stand up more (`comb` 0.9 to 0.32) and lean any way (`combSpread` 0.35 to pi), not all one way.
  stroke: { spacing: 0.16, height: [0.28, 0.42], width: 0.16, comb: 0.32, combSpread: Math.PI, tip: 1.35, seg: 3, perCell: 2, flow: 25, flowMin: 4, light: 14, lightMin: 2.2 },
};

/** One tuft in unit space: three blades round the origin, 1 m tall, leaning outward. */
export function tuftGeometry() {
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
 * One blade in unit space: a tapered strip of `seg` sections, root at the origin, 1 m tall,
 * curving over towards +x by `bend` m. Dark root to light tip (fur.js `root` to `tipLight`).
 */
export function bladeGeometry({ seg = 4, width = 1, bend = 0.35, tipLight = 1 } = {}) {
  const pos = [], col = [], nor = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const x = bend * t * t; // curved over: the lean grows towards the tip
    const w = (width / 2) * (1 - t * 0.92);
    const c = FAR_FUR.root + (tipLight - FAR_FUR.root) * Math.pow(t, 0.8);
    pos.push(x, t, -w, x, t, w);
    col.push(c, c, c, c, c, c);
    // Lit as ground cover, as the tufts: normals mostly up, so the mass shades like a lawn.
    nor.push(0.25, 1, 0, 0.25, 1, 0);
    if (i < seg) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.normalizeNormals();
  return g;
}

// latticeFbm is about -0.5..0.5 (5th to 95th percentile); this maps it to about 0..1.
const noise01 = (x, z, s) => clamp(0.5 + fbm(x, z, s), 0, 1);

/**
 * Places the blades. `bank` is buildFarBank's report; `material` the outdoor toon material
 * (vertex colours on; the tuft's green comes in as instanceColor). Returns { mesh, stats }.
 */
export function buildFarFur(bank, { seed = 0, material, density = 1 }) {
  const F = FAR_FUR;
  const rand = mulberry32(1531 + seed);
  const { stations, place } = bank;
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
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let k = 0; k < F.bands.length - 1; k++) {
      const o0 = F.bands[k], o1 = F.bands[k + 1];
      const mx = (a.x + b.x) / 2 + a.nx * (o0 + o1) / 2, mz = (a.z + b.z) / 2 + a.nz * (o0 + o1) / 2;
      const mid = Math.hypot(mx - ex, mz - ez);
      if (mid > F.reach + 40) continue;
      const sp = clamp(mid * F.spacing.rate, F.spacing.min, F.spacing.max) / Math.sqrt(density);
      // A jittered grid: `perCell` blades per cell, so the cover has no clumps and no holes.
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
          // Brush strokes (FAR_FUR.stroke): combed by a slow noise, lighter in broad swaths.
          const S = F.stroke;
          const cell = clamp(dist * F.spacing.rate, F.spacing.min, F.spacing.max); // smooth with distance, unlike sp (per band)
          const flowSize = Math.max(S.flowMin, cell * S.flow), lightSize = Math.max(S.lightMin, cell * S.light);
          const flow = (noise01(p[0] / flowSize, p[2] / flowSize, 523 + seed) - 0.5) * 1.6;
          const n = noise01(p[0] / lightSize, p[2] / lightSize, 529 + seed);
          const isTall = n > 0.45; // the light swaths (counted as `tall` in the stats)
          const c = short[Math.floor(rand() * short.length)].clone().lerp(tall[1], Math.max(0, n - 0.45) * 1.2);
          const grow = clamp(dist / F.height.from, 1, F.height.max);
          const foot = sp / S.spacing; // the test patch's blade, scaled to this cell
          for (let k = 0; k < S.perCell; k++) {
            const ox = (rand() - 0.5) * sp, oz = (rand() - 0.5) * sp;
            q.setFromAxisAngle(up, flow + (rand() * 2 - 1) * S.combSpread);
            const h = (S.height[0] + (S.height[1] - S.height[0]) * rand()) * grow;
            m.compose(v.set(p[0] + ox, p[1] + 0.02, p[2] + oz), q, s.set(foot, h, foot));
            matrices.push(m.clone());
            colours.push(c.clone().multiplyScalar(0.92 + 0.14 * rand()));
          }
          stats.tufts++;
          if (isTall) stats.tall++;
        }
      }
    }
  }
  const S = F.stroke;
  const geometry = bladeGeometry({ seg: S.seg, width: S.width, bend: S.comb, tipLight: S.tip });
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((mat, j) => mesh.setMatrixAt(j, mat));
  colours.forEach((c, j) => mesh.setColorAt(j, c));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false; // spread over the whole bank: always partly in view
  mesh.name = 'farFur';
  stats.blades = matrices.length;
  stats.triangles = matrices.length * S.seg * 2;
  return { mesh, stats };
}
