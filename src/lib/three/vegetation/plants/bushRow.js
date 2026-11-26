// A test spot: a mixed row of bushes round two trees, to judge the mix before it goes in the
// scene (the user: "mix the three bushes besides the first one in a row and see how it looks
// like around trees"). The three: the trimmed bougainvillea hedge, the oak bush and the birch bush.
// Preview: #/vegetation?plant=bushRow
// Layout, sizes and the order of the mix are design choices for the test.

import * as THREE from 'three';
import { mulberry32, range } from '../../../utils/rng.js';
import { createTree } from '../tree.js';
import { HEDGE, hedgeLumps, createHedgeFoliage } from './bougainvilleaHedge.js';
import { valueFbm } from '../../../utils/noise.js';
import { plant as kuchingTree } from './kuchingTree.js';
import { OUTSIDE_THEME } from '../../scene/themes/index.js';

const ROW = {
  trees: [[-7, -2.5], [7, -2.5]], // x, z (m)
  from: -15, to: 15, z: 0, // the planting runs along x
  // Not one straight line (the user: "try behind and in front too"): the line drifts forwards
  // and back by up to `drift` m over `driftScale` m, and `second` of the places get a second bush
  // `layer` m in front (smaller) or behind (bigger). Design choices.
  drift: 1.3, driftScale: 6, second: 0.5, layer: [1.2, 1.9],
  // Repeating order (the user: "dont use the hedge so much"): one short hedge piece in seven.
  order: ['oakBush', 'birchBush', 'oakBush', 'hedge', 'birchBush', 'oakBush', 'birchBush'],
  width: { oakBush: 1.6, birchBush: 1.8 }, // the hedge's comes from its own size
  // The user: "make the hedge less uniform". Pieces of random size, more grown out past the cut
  // (bigger, slower patches), rounder edges, and a top that rises and dips along its length
  // (`wave`, m, over `waveScale` m). Design choices.
  hedge: { w: [1.6, 2.4], d: [0.8, 1.1], h: [0.8, 1.25], round: 0.32, grow: 0.3, growScale: 0.8, wave: 0.28, waveScale: 1.1 },
  ring: 2.6, // m from each trunk: three bushes wrap round the back of each tree
};

/** A loose, uneven piece of the trimmed bougainvillea hedge. Returns { group, stats, dispose, width }. */
function looseHedge(seed) {
  const L = ROW.hedge;
  const rand = mulberry32(seed * 977 + 5);
  const size = [range(rand, ...L.w), range(rand, ...L.d), range(rand, ...L.h)];
  const H = { ...HEDGE, round: L.round, grow: L.grow, growScale: L.growScale };
  const lumps = hedgeLumps(size, 101 + seed, H);
  // The top rises and dips: each lump moves up or down by a noise along the hedge, more so higher up.
  for (const l of lumps) {
    const up = THREE.MathUtils.smoothstep(l.centre.y / size[2], 0.3, 1);
    l.centre.y += (valueFbm(l.centre.x / L.waveScale, l.centre.z / L.waveScale, seed, 3) - 0.5) * 2 * L.wave * up;
  }
  const cards = createHedgeFoliage(seed, lumps, H);
  const group = new THREE.Group();
  group.add(cards.mesh);
  return { group, width: size[0], stats: { leaves: cards.leaves, triangles: { total: cards.tris } }, dispose: () => cards.dispose() };
}

function make(kind, seed) {
  if (kind === 'hedge') return looseHedge(seed);
  return createTree({ seed, kind });
}

export function createBushRow({ seed = 1 } = {}) {
  const rand = mulberry32(907 + seed);
  const group = new THREE.Group();
  const parts = [];
  const add = (obj, x, z, yaw = 0, s = 1) => {
    obj.group.position.set(x, 0, z);
    obj.group.rotation.y = yaw;
    obj.group.scale.setScalar(s);
    group.add(obj.group);
    parts.push(obj);
  };
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(24, 64).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(OUTSIDE_THEME.fur.ground.lawn) }),
  );
  group.add(ground);

  ROW.trees.forEach(([x, z], i) => {
    add(kuchingTree.create({ seed: seed + i, lod: 'near' }), x, z);
    // Three bushes round the back and sides of the trunk.
    [-2.5, -Math.PI / 2, -0.65].forEach((a, k) => {
      const kind = ['oakBush', 'birchBush', 'oakBush'][(k + i) % 3];
      add(make(kind, seed * 31 + i * 7 + k), x + Math.cos(a) * ROW.ring, z + Math.sin(a) * ROW.ring, rand() * 6.3, range(rand, 0.85, 1.15));
    });
  });

  const bushes = ['oakBush', 'birchBush'];
  let x = ROW.from, n = 0;
  while (x < ROW.to) {
    const kind = ROW.order[n % ROW.order.length];
    const obj = make(kind, seed * 13 + n);
    const w = obj.width ?? ROW.width[kind];
    const z = ROW.z + (valueFbm(x / ROW.driftScale, 3.7, seed + 11, 2) - 0.5) * 2 * ROW.drift + range(rand, -0.3, 0.3);
    const yaw = kind === 'hedge' ? range(rand, -0.3, 0.3) : rand() * 6.3; // the hedge runs roughly along
    add(obj, x + w / 2, z, yaw, kind === 'hedge' ? 1 : range(rand, 0.85, 1.15));
    if (rand() < ROW.second) {
      // A second bush in front (smaller) or behind (bigger), off to one side of the first.
      const front = rand() < 0.5;
      const dz = range(rand, ...ROW.layer) * (front ? 1 : -1);
      const kind2 = bushes[Math.floor(rand() * 2)];
      add(make(kind2, seed * 17 + n), x + w * range(rand, 0.1, 0.9), z + dz, rand() * 6.3, front ? range(rand, 0.65, 0.85) : range(rand, 1.05, 1.3));
    }
    x += w * range(rand, 0.75, 1.05); // overlap or small gaps, so it reads as one loose planting
    n++;
  }

  const triangles = parts.reduce((t, p) => t + (p.stats.triangles?.total ?? 0), 0);
  const leaves = parts.reduce((t, p) => t + (p.stats.leaves ?? 0), 0);
  return {
    group,
    stats: { leaves, triangles: { total: triangles }, bounds: [ROW.to - ROW.from, 6, 8] },
    dispose: () => {
      parts.forEach((p) => p.dispose());
      ground.geometry.dispose();
      ground.material.dispose();
    },
  };
}

export const plant = {
  id: 'bushRow',
  label: 'Bush mix round trees (test)',
  create: ({ seed = 1 } = {}) => createBushRow({ seed }),
  target: [0, 2.5, -1],
  distance: 30,
  background: '#b9d2e2',
};
