// Bush clumps round the far bank's trees (the user, 26 Nov 2026: "try adding some bushes based on
// what we have learned to the far bank"). Learned on the bush test spot (vegetation/plants/
// bushRow.js, variant natural; its header gives the sources):
//   - clumps of one kind round a big parent, smaller young ones at the edge, gaps between clumps;
//   - most where there is light, round the edge of a tree's crown, few by the trunk;
//   - stepping down from the trees towards the open: bigger bushes inland, smaller ones nearer the water;
//   - now and then a bush of another kind inside a clump.
// The kinds are the user's mix: oak bush, birch bush and, less often, the loose bougainvillea
// hedge (looseHedge.js). Layout entries only; vegetation/stylised.js grows them. Every number
// is a design choice.

import { mulberry32 } from '../../../utils/rng.js';
import { underForecourt } from './forecourt.js';
import { FAR_FUR } from './fur.js';
import { WINDOW_EYE } from '../world/site.js';

export const FAR_BUSHES = {
  x: [-236, 72], // waterline x the clumps may start in (the shore row's reach)
  offset: [10.9, 36], // m inland: just past the far path (SITE.far.path 10.5), up the slope
  // The open side is the water's: most clumps take in front of the shore row (offset 14, crowns
  // about 7 m), where the sun reaches under the crowns' edge, fewer behind it in their shade.
  // The shore row's crowns hang out over the path, so the sunny strip is narrow: between the path
  // (SITE.far.path 10.5) and the trunks. `share` of the tries are there, offset [offset[0], to],
  // and take whatever the crowns (they are at the crowns' edge by construction).
  front: { to: 12.6, share: 0.75, behind: 0.5 },
  tries: 1400, // clump centres tried (most are rejected)
  apart: 9, // m at least between clump centres: the gaps
  crown: { trunk: 0.25, drip: 0.6, out: 1.1 }, // as a share of the nearest tree's crown width: shade, crown edge, beyond
  light: { trunk: 0.05, drip: 1, out: 0.35, none: 0.05 }, // how likely a clump is to take there (none: no tree near)
  kinds: [['oak bush', 0.48, 2.4], ['birch bush', 0.42, 2.8], ['loose hedge', 0.1, 1.5]], // [kind, share, height m]: a shrub layer is about 1-3.5 m tall (resilience.org, see bushRow.js); smaller ones read as specks from the window
  members: [2, 5],
  spread: [1.4, 3.0], // m from the parent to the young ones
  parent: [1.1, 1.35], young: [0.55, 0.95], // scale on the kind's height
  inland: 0.25, // up to this much bigger at the inland end of the band
  stray: 0.12, // share of young ones of another kind
  gap: 0.9, // m between bush centres, times their mean scale
  trunkClear: 1.6, // m from any trunk
  stairs: 9, // m round each side stair's foot kept to the stair planting
  bridgeClear: 9, // m round the bridge's far ramp foot
  // Only where the window and the seat can see (as the grass fur, fur.js FAR_FUR): the draw stays small.
  reach: FAR_FUR.reach, bearing: FAR_FUR.bearing,
};

function pick(rand, kinds) {
  let r = rand();
  for (const k of kinds) if ((r -= k[1]) <= 0) return k;
  return kinds[0];
}

/**
 * Bush entries round the trees in `entries` (their `at` and crown `width`). `place(xWater,
 * offset)` comes from the far bank (banks.js); `forecourt` is its waterline x range; `bridgeFoot`
 * [x, z]; `underBridge(at, radius, height)` (bridgePlace.js) keeps bushes out from under the
 * bridge's far landing. Group names map to plants in vegetation/stylised.js. Own random stream.
 */
export function farBankBushes(entries, { place, forecourt: [f0, f1], bridgeFoot = null, underBridge = () => false, B = FAR_BUSHES }) {
  const rand = mulberry32(5303);
  const trees = entries.filter((e) => e.kind === 'tree').map((e) => ({ x: e.at[0], z: e.at[2], w: e.width }));
  const stairs = [place(f0, 14), place(f1, 14)];
  const near = (p, q, r) => Math.hypot(p[0] - q[0], p[2] - q[2]) < r;
  const lightAt = (p) => {
    let best = null, bd = Infinity;
    for (const t of trees) {
      const d = Math.hypot(p[0] - t.x, p[2] - t.z) / t.w; // in crown widths
      if (d < bd) (bd = d), (best = t);
    }
    if (!best || bd > B.crown.out * 2) return B.light.none;
    if (bd < B.crown.trunk) return B.light.trunk;
    if (bd < B.crown.drip) return B.light.trunk + (B.light.drip - B.light.trunk) * ((bd - B.crown.trunk) / (B.crown.drip - B.crown.trunk));
    return B.light.drip + (B.light.out - B.light.drip) * Math.min(1, (bd - B.crown.drip) / (B.crown.out - B.crown.drip));
  };
  const [ex, , ez] = WINDOW_EYE;
  const seen = (p) => Math.hypot(p[0] - ex, p[2] - ez) < B.reach && Math.abs((Math.atan2(p[0] - ex, -(p[2] - ez)) * 180) / Math.PI) <= B.bearing;
  const allowed = (x, o, p) => seen(p) && !underForecourt(x, o)
    && !stairs.some((s) => near(p, s, B.stairs))
    && !(bridgeFoot && Math.hypot(p[0] - bridgeFoot[0], p[2] - bridgeFoot[1]) < B.bridgeClear)
    && trees.every((t) => Math.hypot(p[0] - t.x, p[2] - t.z) > B.trunkClear);

  const centres = [];
  for (let i = 0; i < B.tries; i++) {
    const inFront = rand() < B.front.share;
    const x = B.x[0] + rand() * (B.x[1] - B.x[0]), o = inFront ? B.offset[0] + rand() * (B.front.to - B.offset[0]) : B.front.to + rand() * (B.offset[1] - B.front.to);
    const p = place(x, o);
    if (!allowed(x, o, p) || centres.some((c) => near(p, c.p, B.apart))) continue;
    if (rand() > (inFront ? 1 : lightAt(p) * B.front.behind)) continue;
    centres.push({ x, o, p });
  }

  const out = [], placed = [];
  for (const c of centres) {
    const kind = pick(rand, B.kinds);
    const inland = 1 + B.inland * (c.o - B.offset[0]) / (B.offset[1] - B.offset[0]);
    const count = B.members[0] + Math.floor(rand() * (B.members[1] - B.members[0] + 1));
    for (let k = 0; k < count; k++) {
      // The parent at the centre; the young ones round it, smaller the further out. The ring is
      // laid out in bank coordinates (along the waterline, inland) so it follows the slope.
      const a = rand() * Math.PI * 2, r = k === 0 ? 0 : B.spread[0] + rand() * (B.spread[1] - B.spread[0]);
      const x = c.x + Math.cos(a) * r, o = c.o + Math.sin(a) * r;
      const p = place(x, o);
      const edge = r / B.spread[1];
      const s = (k === 0 ? B.parent[0] + rand() * (B.parent[1] - B.parent[0]) : B.young[1] - (B.young[1] - B.young[0]) * edge * (0.7 + 0.3 * rand())) * inland;
      const own = k > 0 && rand() < B.stray ? pick(rand, B.kinds.filter(([n]) => n !== 'loose hedge')) : kind;
      const height = own[2] * s;
      if (!allowed(x, o, p) || underBridge([p[0], p[2]], height * 0.6, height) || placed.some((q) => near(p, q.p, B.gap * (s + q.s) / 2))) continue;
      out.push({ group: `proposed: bush clump (${own[0]})`, kind: 'bush', at: p, height, width: height * 1.2, squash: 0.85 + rand() * 0.3, yaw: rand() * Math.PI * 2 });
      placed.push({ p, s });
    }
  }
  return out;
}
