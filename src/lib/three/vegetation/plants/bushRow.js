// A test spot: a mixed row of bushes round two trees, to judge the mix before it goes in the
// scene (the user: "mix the three bushes besides the first one in a row and see how it looks
// like around trees"). The three: the trimmed bougainvillea hedge, the oak bush and the birch bush.
// Preview: #/vegetation?plant=bushRow
// Layout, sizes and the order of the mix are design choices for the test.

import * as THREE from 'three';
import { mulberry32, range } from '../../../utils/rng.js';
import { createTree } from '../tree.js';
import { plant as hedge } from './bougainvilleaHedge.js';
import { plant as kuchingTree } from './kuchingTree.js';
import { OUTSIDE_THEME } from '../../scene/themes/index.js';

const ROW = {
  trees: [[-7, -2.5], [7, -2.5]], // x, z (m)
  from: -15, to: 15, z: 0, // the row along x
  // Repeating order; a hedge piece is 3 m long, a bush about 1.7 m.
  order: ['oakBush', 'birchBush', 'hedge', 'oakBush', 'hedge', 'birchBush'],
  width: { hedge: 3, oakBush: 1.6, birchBush: 1.8 },
  ring: 2.6, // m from each trunk: three bushes wrap round the back of each tree
};

function make(kind, seed) {
  if (kind === 'hedge') return hedge.create({ seed });
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

  let x = ROW.from, n = 0;
  while (x < ROW.to) {
    const kind = ROW.order[n % ROW.order.length];
    const w = ROW.width[kind];
    const yaw = kind === 'hedge' ? 0 : rand() * 6.3; // the hedge runs along the row
    add(make(kind, seed * 13 + n), x + w / 2, ROW.z + range(rand, -0.15, 0.15), yaw, kind === 'hedge' ? 1 : range(rand, 0.85, 1.15));
    x += w * 0.92; // a little overlap, so the row reads as one planting
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
