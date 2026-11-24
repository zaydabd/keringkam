// Grass on the far bank (?flora=stylised only): short grass everywhere on the verge, the
// embankment's slope and the meadow, with patches of tall wild grass mixed in (the user's
// request). Clumps are the near bank's grassClump (plants.js), wound to face the window.
// Every number here is a design choice tuned in the window shot, not a measurement. Far away the
// clumps are drawn larger and sparser so they still read at 100-300 m (a stylisation).

import { SITE, mulberry32, fbm } from './site.js';
import { underForecourt } from './forecourt.js';
import { grassClump } from './plants.js';
import { BANK_PAINT } from './banks.js';
import { BUSH_PAINT } from './waterbush.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const scale = (c, k) => c.map((v) => Math.min(1, v * k));

export const FAR_GRASS = {
  reach: 320, // m from the house; beyond it a clump is under a pixel or two
  from: 10.8, // offset inland where the grass starts: just past the worn path
  to: { lawn: 29, meadow: 60 }, // where it stops: a little past the embankment's crest; further on the natural bank
  spacing: { rate: 0.016, min: 0.45, max: 3 }, // m between clumps: distance from the eye times rate
  wide: 25, // blades beyond this many m are drawn wider (distance / wide times, up to 8) so they stay about a pixel wide
  grow: { from: 50, max: 3 }, // clumps beyond `from` m are drawn bigger, up to `max` times
  // Each clump draws its own size, blade count, spread, lean and width from these ranges, so no
  // two look alike (the user's ask: randomise height, width, leaves). [min, + up to].
  short: { height: [0.2, 0.25], blades: [2, 4], spread: [0.08, 0.12], lean: [0.2, 0.25] },
  tall: { height: [0.7, 0.8], blades: [4, 6], spread: [0.1, 0.16], lean: [0.3, 0.35], heads: 0.3 },
  width: [0.8, 0.7], // blade width times this
  patches: { size: 11, lawn: 0.32, meadow: 0.08, scatter: 0.06 }, // tall where the noise (-1..1) is over the threshold; a few lone tall clumps too
};

/** Writes the grass into the 'blade' slot. `bank` is buildFarBank's report. Returns stats. */
export function buildFarGrass(w, bank, { seed = 0 } = {}) {
  const G = FAR_GRASS, F = SITE.far;
  const rand = mulberry32(907 + seed);
  const { stations, place, lawnAt } = bank;
  const C = BANK_PAINT, B = BUSH_PAINT;
  // Short grass a shade off the ground so it reads; tall grass lighter and yellower, so its patches
  // stand out (design choice).
  const shortPaint = { blade: [scale(C.lawn, 0.6), scale(C.lawn, 0.7), scale(C.meadow, 0.65), scale(C.lawn, 1.3)], straw: B.straw, seedHead: B.seedHead };
  const tallPaint = { blade: [scale(C.meadow, 1.3), [0.62, 0.68, 0.3], [0.5, 0.6, 0.24], ...B.blade.slice(0, 2)], straw: B.straw, seedHead: B.seedHead };
  const pick = ([a, b]) => a + rand() * b;
  const stats = { short: 0, tall: 0, triangles: 0 };
  for (let i = 0; i < stations.length - 1; i++) {
    const s = stations[i], n = stations[i + 1];
    const d = Math.hypot(s.x, s.z + 5);
    if (d > G.reach) continue;
    const L = (lawnAt(s) + lawnAt(n)) / 2;
    const to = L > 0.5 ? G.to.lawn : G.to.meadow;
    const len = Math.hypot(n.x - s.x, n.z - s.z);
    for (const [o0, o1] of [[G.from, F.foot], [F.foot, to]]) {
      const mid = Math.hypot(s.x + s.nx * (o0 + o1) / 2, s.z + s.nz * (o0 + o1) / 2 + 5);
      const sp = clamp(mid * G.spacing.rate, G.spacing.min, G.spacing.max);
      const count = Math.round((len * (o1 - o0)) / (sp * sp));
      for (let k = 0; k < count; k++) {
        const t = rand(), o = lerp(o0, o1, rand());
        const xw = lerp(s.x, n.x, t);
        if (underForecourt(xw, o)) continue;
        const p = place(xw, o);
        p[1] += 0.03;
        const dist = Math.hypot(p[0], p[2] + 5);
        const grow = clamp(dist / G.grow.from, 1, G.grow.max);
        const noise = fbm(p[0] / G.patches.size, p[2] / G.patches.size, 977 + seed);
        const tall = noise > (L > 0.5 ? G.patches.lawn : G.patches.meadow) || rand() < G.patches.scatter;
        const T = tall ? G.tall : G.short;
        const height = pick(T.height) * grow;
        const blades = Math.round(pick(T.blades));
        stats.triangles += grassClump(w, p, { blades, height, spread: pick(T.spread) * grow, lean: pick(T.lean), heads: tall ? T.heads : 0, rand, P: tall ? tallPaint : shortPaint, simple: !tall || dist > 90, wide: clamp(dist / G.wide, 1, 8) * pick(G.width) });
        stats[tall ? 'tall' : 'short']++;
      }
    }
  }
  return stats;
}
