// A test patch of far-bank grass, to choose a look before it goes on the bank (the user: "create
// the grass in an isolated area first. make a few variations and then we will choose").
// Preview: #/vegetation?plant=grassPatch&variant=fur|clumps|strokes|meadow&d=9&el=12
//
// Guides read first (26 Nov 2026):
//   - Eric Wohllaib, "Procedural Grass in Ghost of Tsushima", GDC 2022: blades grouped into
//     clumps by noise, each clump sharing height, colour and lean. (clumps)
//   - Codrops, "How to make the fluffiest grass with three.js" (2025): many small blades, dark
//     root to light tip as fake occlusion, so the mass reads soft. (fur, meadow)
//   - Ghibli-style painterly grass breakdowns (80.lv, Creative Bloq): few, broad, combed strokes
//     in one direction with strong light tips, like brush marks. (strokes)
//   - .claude/skills/threejs-procedural-vegetation (stylized meadow grass): colour clumps plus
//     larger macro patches. (meadow)
// Colours come from the far bank's theme (themes/outside.js fur). Every size and count here is a
// design choice for the test, not a measurement.

import * as THREE from 'three';
import { mulberry32, range } from '../../../utils/rng.js';
import { latticeFbm } from '../../../utils/noise.js';
import { tuftGeometry, bladeGeometry, FAR_FUR } from '../../scene/riverside/fur.js';
import { toonGradient } from '../../scene/toon.js';
import { INTERIOR_THEME, OUTSIDE_THEME } from '../../scene/themes/index.js';

const PATCH = { size: 14, ground: OUTSIDE_THEME.fur.ground.lawn };
const SHORT = OUTSIDE_THEME.fur.short;
const TALL = OUTSIDE_THEME.fur.tall;

export const GRASS_VARIANTS = {
  // A: today's far-bank fur (fur.js): three crossed triangles per tuft, packed edge to edge.
  fur: { spacing: 0.12, height: 0.3 },
  // B: clumps (Ghost of Tsushima): curved blades, each clump with its own height, tint and lean.
  clumps: { spacing: 0.08, clump: 0.5, height: [0.14, 0.42], width: 0.05, bend: 0.22 },
  // C: brush strokes (Ghibli-like): broad blades combed one way, light tips. The user's pick
  // (26 Nov 2026), so its numbers live in fur.js (FAR_FUR.stroke) and the far bank uses them.
  strokes: { ...FAR_FUR.stroke, flow: 4, light: 2.2 },
  // D: meadow: short fur plus tall, lighter patches and a few small flowers.
  meadow: { spacing: 0.1, height: 0.25, tallHeight: [0.6, 1.0], patch: 2.6, tallShare: 0.4, flowers: 0.012 },
};

const col = (hex) => new THREE.Color(hex);
// latticeFbm is about -0.5..0.5 (5th to 95th percentile); this maps it to about 0..1.
const noise01 = (x, z, s) => Math.min(1, Math.max(0, 0.5 + latticeFbm(x, z, s)));

/** A small flower: one flat 5-point star, light up. */
function flowerGeometry() {
  const g = new THREE.CircleGeometry(1, 5);
  g.rotateX(-Math.PI / 2);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3));
  return g;
}

/** Jittered grid over the patch's disc: calls fn(x, z) once per cell. */
function scatter(rand, spacing, fn) {
  const R = PATCH.size / 2;
  for (let x = -R; x < R; x += spacing) {
    for (let z = -R; z < R; z += spacing) {
      const px = x + rand() * spacing, pz = z + rand() * spacing;
      if (px * px + pz * pz < R * R) fn(px, pz);
    }
  }
}

/** One InstancedMesh from a list of { m, c }. */
function instanced(geometry, material, list, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, list.length);
  list.forEach(({ m, c }, i) => {
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = name;
  return mesh;
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const place = (x, z, yaw, w, h) => new THREE.Matrix4().compose(_v.set(x, 0.01, z), _q.setFromAxisAngle(UP, yaw), _s.set(w, h, w));

function furItems(rand, V) {
  const short = SHORT.map(col);
  const items = [];
  scatter(rand, V.spacing, (x, z) => {
    const foot = V.spacing * 1.5 * range(rand, 0.8, 1.2);
    const c = short[Math.floor(rand() * short.length)].clone().multiplyScalar(range(rand, 0.9, 1.1));
    items.push({ m: place(x, z, rand() * 6.3, foot, V.height * range(rand, 0.7, 1.4)), c });
  });
  return [{ geometry: tuftGeometry(), items, name: 'grass' }];
}

function clumpItems(rand, V, seed) {
  // Clumps: a jittered grid of centres; each blade belongs to the nearest one (a Voronoi cell).
  const greens = [...SHORT, ...TALL].map(col);
  const R = PATCH.size / 2 + V.clump;
  const centres = [];
  for (let x = -R; x < R; x += V.clump) {
    for (let z = -R; z < R; z += V.clump) {
      const cx = x + rand() * V.clump, cz = z + rand() * V.clump;
      const big = noise01(cx / 3, cz / 3, 311 + seed); // larger swells of height and tint
      centres.push({
        x: cx, z: cz,
        h: V.height[0] + (V.height[1] - V.height[0]) * Math.min(1, Math.max(0, big * 0.9 + rand() * 0.35)),
        c: greens[Math.floor(rand() * greens.length)].clone().lerp(col(TALL[0]), big * 0.4),
      });
    }
  }
  const nearest = (x, z) => {
    let best = centres[0], d = Infinity;
    for (const k of centres) {
      const dd = (k.x - x) ** 2 + (k.z - z) ** 2;
      if (dd < d) (d = dd), (best = k);
    }
    return best;
  };
  const items = [];
  scatter(rand, V.spacing, (x, z) => {
    const k = nearest(x, z);
    // Blades lean out from their clump's centre, so each clump reads as one rounded tuft.
    const yaw = -Math.atan2(z - k.z, x - k.x) + range(rand, -0.5, 0.5);
    const c = k.c.clone().multiplyScalar(range(rand, 0.9, 1.08));
    items.push({ m: place(x, z, yaw, V.width / 0.05 * range(rand, 0.8, 1.2), k.h * range(rand, 0.75, 1.15)), c });
  });
  return [{ geometry: bladeGeometry({ width: 0.05, bend: V.bend, tipLight: 1.1 }), items, name: 'grass' }];
}

function strokeItems(rand, V, seed) {
  const greens = SHORT.map(col);
  const light = col(TALL[1]);
  const items = [];
  scatter(rand, V.spacing, (x, z) => {
    // All combed one way (+x, turned by a slow noise), like brush marks in one hand.
    const flow = (noise01(x / V.flow, z / V.flow, 523 + seed) - 0.5) * 1.6;
    const yaw = flow + range(rand, -V.combSpread, V.combSpread);
    const n = noise01(x / V.light, z / V.light, 529 + seed);
    const c = greens[Math.floor(rand() * greens.length)].clone().lerp(light, Math.max(0, n - 0.45) * 1.2);
    for (let k = 0; k < 2; k++) {
      const ox = range(rand, -0.5, 0.5) * V.spacing, oz = range(rand, -0.5, 0.5) * V.spacing;
      items.push({ m: place(x + ox, z + oz, yaw, 1, range(rand, V.height[0], V.height[1])), c: c.clone().multiplyScalar(range(rand, 0.92, 1.06)) });
    }
  });
  return [{ geometry: bladeGeometry({ seg: V.seg, width: V.width, bend: V.comb, tipLight: V.tip }), items, name: 'grass' }];
}

function meadowItems(rand, V, seed) {
  const short = SHORT.map(col), tall = TALL.map(col);
  const flowerCols = ['#f4efd8', '#f2d65c', '#e9a7c4'].map(col);
  const under = [], tallBlades = [], flowers = [];
  scatter(rand, V.spacing, (x, z) => {
    const foot = V.spacing * 1.5 * range(rand, 0.8, 1.2);
    under.push({ m: place(x, z, rand() * 6.3, foot, V.height * range(rand, 0.7, 1.3)), c: short[Math.floor(rand() * short.length)].clone().multiplyScalar(range(rand, 0.9, 1.1)) });
    const p = noise01(x / V.patch, z / V.patch, 733 + seed);
    if (p > 1 - V.tallShare && rand() < 0.75) {
      const h = range(rand, ...V.tallHeight) * (0.6 + (p - (1 - V.tallShare)) * 1.5);
      tallBlades.push({ m: place(x, z, rand() * 6.3, 1, h), c: tall[Math.floor(rand() * tall.length)].clone().multiplyScalar(range(rand, 0.9, 1.1)) });
    }
    if (rand() < V.flowers) {
      const r = range(rand, 0.03, 0.05);
      const m = new THREE.Matrix4().compose(_v.set(x, V.height * 1.1, z), _q.setFromAxisAngle(UP, rand() * 6.3), _s.set(r, 1, r));
      flowers.push({ m, c: flowerCols[Math.floor(rand() * flowerCols.length)] });
    }
  });
  return [
    { geometry: tuftGeometry(), items: under, name: 'grass' },
    { geometry: bladeGeometry({ width: 0.035, bend: 0.25, tipLight: 1.15 }), items: tallBlades, name: 'grassTall' },
    { geometry: flowerGeometry(), items: flowers, name: 'flowers' },
  ];
}

const BUILD = { fur: furItems, clumps: clumpItems, strokes: strokeItems, meadow: meadowItems };

export function createGrassPatch({ seed = 1, variant = 'fur' } = {}) {
  const name = BUILD[variant] ? variant : 'fur';
  const rand = mulberry32(4211 + seed);
  const gradientMap = toonGradient(INTERIOR_THEME.shading.bands, { smooth: INTERIOR_THEME.shading.smooth });
  const material = new THREE.MeshToonMaterial({ gradientMap, vertexColors: true, side: THREE.DoubleSide });
  const groundMat = new THREE.MeshToonMaterial({ gradientMap, color: col(PATCH.ground).multiplyScalar(0.55) });
  const group = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(PATCH.size / 2 + 1.5, 64).rotateX(-Math.PI / 2), groundMat);
  group.add(ground);
  const parts = BUILD[name](rand, GRASS_VARIANTS[name], seed);
  let triangles = 0, blades = 0;
  for (const p of parts) {
    if (!p.items.length) continue;
    group.add(instanced(p.geometry, material, p.items, p.name));
    const t = p.geometry.index ? p.geometry.index.count / 3 : p.geometry.attributes.position.count / 3;
    triangles += t * p.items.length;
    blades += p.items.length;
  }
  const disposables = [material, groundMat, gradientMap, ground.geometry, ...parts.map((p) => p.geometry)];
  return {
    group,
    stats: { variant: name, leaves: blades, triangles: { total: triangles }, bounds: [PATCH.size, PATCH.size] },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

export const plant = {
  id: 'grassPatch',
  label: 'Grass test patch',
  create: ({ seed = 1, variant } = {}) => createGrassPatch({ seed, variant }),
  target: [0, 0.2, 0],
  distance: 9,
  background: '#b9d2e2',
};
