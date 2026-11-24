// Grass over the whole far bank (?flora=stylised only), the user's ask: the bank covered, dark
// green like the trees' leaves, short grass with patches of tall grass. Two parts:
//  - FAR_GRASS_GROUND: the bank's ground paint, swapped to dark greens (banks.js `paint`), so the
//    ground between clumps reads as grass at any distance;
//  - buildFarGrass: clumps (plants.js grassClump, wound to face the window) from the street's
//    inner edge to the back of the land, each with its own size, blade count, spread, lean, width.
// Colours follow the rain tree's leaf ramp (#223b1f, #4c7a33). Every number here is a design
// choice tuned in the window shot, not a measurement. Far away the clumps are drawn larger and
// sparser so they still read at 100-400 m (a stylisation).

import { SITE, mulberry32, fbm, rgb } from './site.js';
import { underForecourt } from './forecourt.js';
import { grassClump } from './plants.js';
import { BUSH_PAINT } from './waterbush.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// The bank's ground as grass: the worn path grassed over too (the whole bank covered).
export const FAR_GRASS_GROUND = {
  path: rgb('#3b5a2a'),
  verge: rgb('#3a5929'),
  lawnFoot: rgb('#3d5e2b'),
  lawn: rgb('#3f612c'),
  terrace: rgb('#3a5a2a'),
  meadow: rgb('#365427'),
  meadowFar: rgb('#334f26'),
};

export const FAR_GRASS = {
  reach: 450, // m from the house; beyond it the ground's paint carries the grass
  bands: [SITE.far.rough, SITE.far.foot, SITE.far.crest, 60, SITE.far.back, 160], // offsets inland (m): the street's inner edge to the land's end
  spacing: { rate: 0.018, min: 0.45, max: 7 }, // m between clumps: distance from the eye times rate
  wide: 25, // blades beyond this many m are drawn wider (distance / wide times, up to 8) so they stay about a pixel wide
  grow: { from: 50, max: 3 }, // clumps beyond `from` m are drawn bigger, up to `max` times
  // Each clump draws its own size, blade count, spread, lean and width: [min, + up to].
  short: { height: [0.2, 0.25], blades: [3, 3], spread: [0.1, 0.12], lean: [0.2, 0.25] },
  tall: { height: [0.7, 0.8], blades: [4, 6], spread: [0.1, 0.16], lean: [0.3, 0.35], heads: 0.15 },
  width: [0.9, 0.7], // blade width times this
  patches: { size: 11, lawn: 0.3, meadow: 0.05, scatter: 0.06 }, // tall where the noise (-1..1) is over the threshold; a few lone tall clumps too
  clear: { centre: [SITE.assembly.x, SITE.assembly.z], radius: 46 }, // none under the Assembly building
};

/** Writes the grass into the 'blade' slot. `bank` is buildFarBank's report. Returns stats. */
export function buildFarGrass(w, bank, { seed = 0 } = {}) {
  const G = FAR_GRASS;
  const rand = mulberry32(907 + seed);
  const { stations, place, lawnAt } = bank;
  // Dark greens like the trees' leaves, lighter ones for lit blades, a little straw for seed heads.
  const shortPaint = { blade: ['#223b1f', '#2c4a24', '#355a28', '#4c7a33'].map(rgb), straw: BUSH_PAINT.straw, seedHead: BUSH_PAINT.seedHead };
  const tallPaint = { blade: ['#2a4621', '#3b6229', '#4c7a33', '#5d8a3a'].map(rgb), straw: BUSH_PAINT.straw, seedHead: BUSH_PAINT.seedHead };
  const pick = ([a, b]) => a + rand() * b;
  const stats = { short: 0, tall: 0, triangles: 0 };
  for (let i = 0; i < stations.length - 1; i++) {
    const s = stations[i], n = stations[i + 1];
    if (Math.hypot(s.x, s.z + 5) > G.reach) continue;
    const L = (lawnAt(s) + lawnAt(n)) / 2;
    const len = Math.hypot(n.x - s.x, n.z - s.z);
    for (let b = 0; b < G.bands.length - 1; b++) {
      const o0 = G.bands[b], o1 = G.bands[b + 1];
      const mid = Math.hypot(s.x + s.nx * (o0 + o1) / 2, s.z + s.nz * (o0 + o1) / 2 + 5);
      if (mid > G.reach + 60) continue;
      const sp = clamp(mid * G.spacing.rate, G.spacing.min, G.spacing.max);
      const count = Math.round((len * (o1 - o0)) / (sp * sp));
      for (let k = 0; k < count; k++) {
        const t = rand(), o = lerp(o0, o1, rand());
        const xw = lerp(s.x, n.x, t);
        if (underForecourt(xw, o)) continue;
        const p = place(xw, o);
        const dist = Math.hypot(p[0], p[2] + 5);
        if (dist > G.reach || Math.hypot(p[0] - G.clear.centre[0], p[2] - G.clear.centre[1]) < G.clear.radius) continue;
        p[1] += 0.03;
        const grow = clamp(dist / G.grow.from, 1, G.grow.max);
        const noise = fbm(p[0] / G.patches.size, p[2] / G.patches.size, 977 + seed);
        const tall = noise > (L > 0.5 ? G.patches.lawn : G.patches.meadow) || rand() < G.patches.scatter;
        const T = tall ? G.tall : G.short;
        stats.triangles += grassClump(w, p, {
          blades: Math.round(pick(T.blades)),
          height: pick(T.height) * grow,
          spread: pick(T.spread) * grow,
          lean: pick(T.lean),
          heads: tall ? T.heads : 0,
          rand,
          P: tall ? tallPaint : shortPaint,
          simple: !tall || dist > 90,
          wide: clamp(dist / G.wide, 1, 8) * pick(G.width),
        });
        stats[tall ? 'tall' : 'short']++;
      }
    }
  }
  return stats;
}
