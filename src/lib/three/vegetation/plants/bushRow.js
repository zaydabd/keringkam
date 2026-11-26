// A test spot: a mixed row of bushes round two trees, to judge the mix before it goes in the
// scene (the user: "mix the three bushes besides the first one in a row and see how it looks
// like around trees"). The three: the trimmed bougainvillea hedge, the oak bush and the birch bush.
// Preview: #/vegetation?plant=bushRow (variant=natural, the default) or &variant=row.
// Layout, sizes and the order of the mix are design choices for the test.
//
// variant=natural follows how shrubs grow (the user: "find how bushes grow"), read 26 Nov 2026:
//   - They grow in clumps with gaps between, not evenly spaced: a parent shrub spreads by
//     suckers and drops seed close by, so one kind gathers round a big old plant, with younger,
//     smaller ones at the clump's edge. (Restoration work copies this "natural clumpiness":
//     blogs.oregonstate.edu/siskwoods/?p=44.)
//   - Most grow where there is light: at a wood's edge and round the edge of a tree's crown (the
//     drip line), few in the deep shade right by the trunk (the forest-edge layers: resilience.org,
//     "The seven layers of a forest garden", 2022; shrub layer about 1-3.5 m tall).
//   - From trees to open ground the planting steps down: trees, tall shrubs, small shrubs, grass.

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

// variant=natural (see the header). Weights and sizes are design choices.
const NATURAL = {
  band: { x: [-15, 15], z: [-6, 2.5] }, // where clumps may start (m); the open ground is +z
  clumps: 14, // clump centres tried for (some are rejected)
  apart: 3.2, // m at least between clump centres: the gaps
  crown: { trunk: 2.2, drip: 5.5 }, // m from a trunk: deep shade inside `trunk`, the crown's edge at `drip`
  light: { trunk: 0.12, drip: 1, open: 0.6 }, // how likely a clump is to take, by place
  kinds: [['oakBush', 0.45], ['birchBush', 0.4], ['hedge', 0.15]], // hedge: the loose bougainvillea
  members: [2, 6], // bushes per clump
  spread: [0.9, 1.9], // m from the clump's parent to the others
  parent: [1.1, 1.35], // the parent's scale; the young ones get smaller towards the edge
  young: [0.55, 0.95],
  back: 0.25, // up to this much bigger at the back of the band (the step down towards open ground)
  gap: 0.75, // m at least between bush centres (times their scale)
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

function pick(rand, table) {
  let r = rand();
  for (const [k, w] of table) if ((r -= w) <= 0) return k;
  return table[0][0];
}

/** variant=natural: clumps of one kind round a parent, mostly in light at the crowns' edges. */
function placeNatural(rand, seed, add) {
  const N = NATURAL;
  const lightAt = (x, z) => {
    const d = Math.min(...ROW.trees.map(([tx, tz]) => Math.hypot(x - tx, z - tz)));
    if (d < N.crown.trunk) return N.light.trunk;
    if (d < N.crown.drip) return N.light.trunk + (N.light.drip - N.light.trunk) * ((d - N.crown.trunk) / (N.crown.drip - N.crown.trunk));
    return N.light.drip + (N.light.open - N.light.drip) * Math.min(1, (d - N.crown.drip) / 4);
  };
  const centres = [];
  for (let tries = 0; centres.length < N.clumps && tries < 400; tries++) {
    const x = range(rand, ...N.band.x), z = range(rand, ...N.band.z);
    if (centres.some((c) => Math.hypot(c.x - x, c.z - z) < N.apart)) continue;
    if (rand() > lightAt(x, z)) continue;
    centres.push({ x, z });
  }
  const placed = [];
  const free = (x, z, s) => placed.every((p) => Math.hypot(p.x - x, p.z - z) > N.gap * (s + p.s) / 2 * 1.4)
    && ROW.trees.every(([tx, tz]) => Math.hypot(x - tx, z - tz) > 1.2);
  centres.forEach((c, i) => {
    const kind = pick(rand, N.kinds);
    const back = 1 + N.back * (N.band.z[1] - c.z) / (N.band.z[1] - N.band.z[0]);
    const count = Math.round(range(rand, N.members[0], N.members[1] + 0.49));
    for (let k = 0; k < count; k++) {
      // The parent at the centre; the young ones round it, smaller the further out.
      const a = rand() * Math.PI * 2, r = k === 0 ? 0 : range(rand, ...N.spread);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const edge = r / N.spread[1];
      const s = (k === 0 ? range(rand, ...N.parent) : N.young[1] - (N.young[1] - N.young[0]) * edge * range(rand, 0.7, 1)) * back;
      if (!free(x, z, s)) continue;
      // A clump now and then holds a bush of another kind (a seed blown in).
      const kk = k > 0 && rand() < 0.12 ? pick(rand, N.kinds.filter(([n]) => n !== 'hedge')) : kind;
      const obj = make(kk, seed * 41 + i * 9 + k);
      add(obj, x, z, rand() * 6.3, kk === 'hedge' ? Math.min(1, s) : s);
      placed.push({ x, z, s });
    }
  });
}

/** variant=row: the earlier loose row, with three bushes round the back of each tree. */
function placeRow(rand, seed, add) {
  // Three bushes round the back and sides of each trunk.
  ROW.trees.forEach(([tx, tz], i) => [-2.5, -Math.PI / 2, -0.65].forEach((a, k) => {
    const kind = ['oakBush', 'birchBush', 'oakBush'][(k + i) % 3];
    add(make(kind, seed * 31 + i * 7 + k), tx + Math.cos(a) * ROW.ring, tz + Math.sin(a) * ROW.ring, rand() * 6.3, range(rand, 0.85, 1.15));
  }));

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

}

export function createBushRow({ seed = 1, variant = 'natural' } = {}) {
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

  ROW.trees.forEach(([x, z], i) => add(kuchingTree.create({ seed: seed + i, lod: 'near' }), x, z));
  if (variant === 'natural') placeNatural(rand, seed, add);
  else placeRow(rand, seed, add);

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
  create: ({ seed = 1, variant } = {}) => createBushRow({ seed, variant }),
  target: [0, 2.5, -1],
  distance: 30,
  background: '#b9d2e2',
};
