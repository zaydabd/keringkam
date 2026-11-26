// A loose, uneven piece of the trimmed bougainvillea hedge (bougainvilleaHedge.js), the user's
// asks on the bush test spot: "dont use the hedge so much. make the hedge less uniform". Each seed
// gives a piece of its own size, more grown out past the cut (bigger, slower patches), with rounder
// edges and a top that rises and dips along its length. Used by the bush test spot (bushRow.js) and
// the far bank's bush clumps (riverside/bushes.js). Every number is a design choice.
// Preview: #/vegetation?plant=looseHedge

import * as THREE from 'three';
import { mulberry32, range } from '../../../utils/rng.js';
import { valueFbm } from '../../../utils/noise.js';
import { HEDGE, hedgeLumps, createHedgeFoliage } from './bougainvilleaHedge.js';

export const LOOSE_HEDGE = {
  w: [1.6, 2.4], d: [0.8, 1.1], h: [0.8, 1.25], // m: the piece's size range
  round: 0.32, grow: 0.3, growScale: 0.8, // in place of HEDGE's (0.14, 0.12, 1.6)
  wave: 0.28, waveScale: 1.1, // m up or down along the top, over this many m
};

/** Returns { group, stats, dispose, width }. */
export function createLooseHedge({ seed = 1 } = {}) {
  const L = LOOSE_HEDGE;
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
  group.name = 'loose hedge';
  group.add(cards.mesh);
  return {
    group,
    width: size[0],
    stats: { seed, leaves: cards.leaves, triangles: { total: cards.tris }, bounds: size.map((v) => +v.toFixed(2)) },
    dispose: () => cards.dispose(),
  };
}

export const plant = {
  id: 'looseHedge',
  label: 'Bougainvillea hedge (loose)',
  create: createLooseHedge,
  switchAt: Infinity, // one level of detail
  target: [0, 0.5, 0],
  distance: 4.5,
};
