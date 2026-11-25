// A trimmed bougainvillea hedge on its own, for the preview (#/vegetation?plant=bougainvilleaHedge),
// to try its look before it goes round the house (the user, 2026-11-25: "rebuild the bush
// isolated just to see how it looks").
//
// Layered like the trees in ../tree.js: the hedge is built from overlapping leaf lumps, in rows
// laid like bricks over a box with rounded edges. Each lump shades as one ball with the trees'
// plain light (no wrap), so it has a light top, a mid middle and a dark underside, and the lump
// above throws its dark underside over the light top of the one below. Flowers are tucked into
// the lumps and shade with them.
//
// All sizes are guesses, tuned by eye. Same cards, atlas and colours as the garden hedge.

import * as THREE from 'three';
import { mulberry32, range } from '../../../utils/rng.js';
import { valueFbm } from '../../../utils/noise.js';
import { writeCards } from './bougainvillea.js';

export const HEDGE = {
  size: [3, 0.84, 1.1], // w, d, h (m): a piece of the hedge under the windows
  round: 0.14, // edge radius of the trimmed box
  lump: 0.26, // lump radius
  step: 0.3, // lump spacing over the surface
  inset: 0.3, // how far a lump's centre sits inside the cut, as a share of its radius
  grow: 0.12, // how far lumps grow out past the cut, in patches
  growScale: 1.6, // patch noise per metre
  card: 0.13, // spray card size
  bract: 0.75, // flower card size, as a share of a leaf card
  density: 2.2, // how many times a lump's surface is covered by cards
  pink: 0.4, // flower share (the user: 60 green, 40 pink)
  crown: 0.25, // as the trees: mostly the lump's own round, a little of the hedge's
  wrap: 0, // as the trees: plain N.L
};

/** Lump centres over a rounded box standing on y = 0, rows offset like bricks. */
export function hedgeLumps([w, d, h], seed, H = HEDGE) {
  const rand = mulberry32(seed);
  const hw = w / 2;
  const hd = d / 2;
  const r = Math.min(H.round, hd, h / 2);
  const out = [];
  const q = new THREE.Vector3();
  const add = (x, y, z) => {
    q.set(THREE.MathUtils.clamp(x, -hw + r, hw - r), THREE.MathUtils.clamp(y, r, h - r), THREE.MathUtils.clamp(z, -hd + r, hd - r));
    const n = new THREE.Vector3(x, y, z).sub(q);
    if (n.lengthSq() < 1e-8) return;
    n.normalize();
    const lr = H.lump * range(rand, 0.7, 1.25);
    const patch = THREE.MathUtils.smoothstep(valueFbm((x + z) * H.growScale, y * H.growScale, seed, 3), 0.3, 0.85);
    const centre = q.clone().addScaledVector(n, r + H.grow * patch - lr * H.inset * range(rand, 0.8, 1.2));
    out.push({ centre, normal: n, r: lr, b: H.pink * (0.85 + 0.2 * THREE.MathUtils.smoothstep(y / h, 0.2, 1)) });
  };
  const steps = (len) => Math.max(1, Math.round(len / H.step));
  const jit = () => (rand() - 0.5) * H.step * 0.6;
  const nx = steps(w);
  const ny = steps(h);
  const nz = steps(d);
  const y0 = H.lump * 0.5;
  for (let j = 0; j <= ny; j++) {
    const y = y0 + (j / ny) * (h - y0);
    const off = j % 2 ? 0.5 : 0; // brick rows: each lump sits over the gap between two below
    for (let i = 0; i <= nx; i++) {
      const x = -hw + ((i + off) / nx) * w;
      if (x > hw) continue;
      add(x + jit(), y + jit(), -hd); // front and back
      add(x + jit(), y + jit(), hd);
    }
    for (let k = 0; k <= nz; k++) {
      const z = -hd + ((k + off) / nz) * d;
      if (z > hd) continue;
      add(-hw, y + jit(), z + jit()); // the two ends
      add(hw, y + jit(), z + jit());
    }
  }
  for (let i = 0; i <= nx; i++) {
    for (let k = 1; k < nz; k++) add(-hw + ((i + (k % 2) * 0.5) / nx) * w + jit(), h, -hd + (k / nz) * d + jit()); // top
  }
  return out;
}

/** The hedge's leaves and flowers on the given lumps (any space). */
export function createHedgeFoliage(seed, lumps, H = HEDGE, keep) {
  return writeCards(mulberry32(seed * 7919 + 53), lumps, {
    radius: H.lump,
    count: (r) => Math.max(16, Math.round((H.density * 4 * Math.PI * r * r) / (H.card * H.card))),
    leafCard: H.card,
    bractCard: H.card * H.bract,
    cells: [2, 3],
    bractBias: 1.4,
    tuck: true,
    crown: H.crown,
    wrap: H.wrap,
    keep,
  });
}

function create({ seed = 1 } = {}) {
  const lumps = hedgeLumps(HEDGE.size, 101 + seed);
  const cards = createHedgeFoliage(seed, lumps);
  const group = new THREE.Group();
  group.name = 'bougainvillea hedge';
  group.add(cards.mesh);
  const bounds = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
  return {
    group,
    stats: {
      seed,
      lumps: lumps.length,
      leaves: cards.leaves,
      bracts: cards.bracts,
      pink: +(cards.bracts / (cards.leaves + cards.bracts)).toFixed(2),
      triangles: { leaves: cards.tris, total: cards.tris },
      bounds,
    },
    dispose: () => cards.dispose(),
  };
}

export const plant = {
  id: 'bougainvilleaHedge',
  label: 'Bougainvillea hedge (trimmed)',
  create,
  target: [0, 0.55, 0],
  distance: 4.2,
};
