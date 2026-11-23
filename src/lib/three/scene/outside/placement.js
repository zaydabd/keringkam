// Where the two river taxis sit in the window shot (pass e12). The user found the boats small and
// the river, boats and railing uncanny together, and asked for our own judgement rather than a
// match to R3. The judgement: a boat far out on open water, with nothing in front of it, gives no
// clue to its size, so it reads as a toy. On a real waterfront the nearest boats pass just beyond
// the railing, and the railing (about waist high) in front of it sets the scale. So the near boat
// comes in behind the railing, the far one to about mid-river. Pass e13 lowered the river 1 m (the
// user: a boat that close should sit lower), so the near boat now sits down behind the railing, its
// roof at about the top rail's line. The boats keep their size (boats.js PENAMBANG: 6.2 m, read off
// photos, an estimate; Zaini et al. 2024 give 8-10 passengers on side benches and no length,
// https://tuengr.com/V15/15A4E.pdf).
//
// Measured in the shot (waterbush.js inShot: the place across the opening, f, and the slope of the
// sight line, tan) and checked by a contract that throws. Every threshold is a named allowance, a
// design choice judged in the window shot (ESTIMATED), not a measurement.

import { createContract } from './contract.js';
import { SITE, WINDOW_EYE } from './site.js';
import { inShot } from './waterbush.js';
import { WATERFRONT } from './waterfront.js';
import { PENAMBANG } from './boats.js';

export const BOAT_PLACE = {
  nearMax: 27, // m from the eye: the near boat at most this far, so it reads at its size (was 35.9)
  farRange: [45, 65], // m from the eye: the far boat about mid-river (was 69.9)
  onWater: 0.01, // tan: both hull ends of the near boat this far beyond the street's edge, on water seen through the railing
  atRail: 0.01, // tan: the near boat's roof ridge at most this far above the railing's top (about 9 px), so the boat sits down behind the railing (pass e13; was at least 0.02 above it)
  farOverRail: 0.03, // tan: the far boat's whole hull above the railing's top
  apart: 0.04, // f: the gap across the opening between the two boats (about 40 px)
  pier: 0.04, // f: the far boat keeps this clear of the bridge pier's column on either side
  bank: 10, // m: each boat at least this far from both waterlines
  between: 20, // m: and from the other boat
  turn: 10, // degrees: the two headings differ by at least this, so they do not read as a queue
  open: [0.15, 0.9], // f: both hulls inside the part of the opening the curtains leave clear at the water
};

const EYE = WINDOW_EYE;
const RIDGE = PENAMBANG.roof.low + PENAMBANG.roof.rise; // the roof's ridge above the water

/** The railing's top line seen from the window (the slope of the sight line over it). */
export function railTan() {
  const R = WATERFRONT.railing, K = WATERFRONT.kerb;
  return (SITE.ground + K.rise + R.height - EYE[1]) / (EYE[2] - (SITE.near.waterline + R.inset));
}

/** The street's edge at the water (the kerb's outer top edge): nearer water is hidden under it. */
export function edgeTan() {
  return (SITE.ground + WATERFRONT.kerb.rise - EYE[1]) / (EYE[2] - SITE.near.waterline);
}

/** Where the sight line from the eye through (x, z) meets the far waterline (SITE.farLine), in xz. */
export function farWaterline(x, z) {
  const dx = x - EYE[0], dz = z - EYE[2];
  let best = null;
  const L = SITE.farLine;
  for (let i = 0; i < L.length - 1; i++) {
    const [ax, az] = L[i], [bx, bz] = L[i + 1];
    const ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - EYE[0]) * ez - (az - EYE[2]) * ex) / den; // along the sight line
    const u = ((ax - EYE[0]) * dz - (az - EYE[2]) * dx) / den; // along the segment
    if (t > 0 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, x: EYE[0] + dx * t, z: EYE[2] + dz * t };
  }
  return best;
}

/** One boat in the shot: both hull ends, its roof ridge, its distances. */
export function boatInShot(b) {
  const L = PENAMBANG.length / 2, bow = [Math.cos(b.ry), -Math.sin(b.ry)];
  const ends = [1, -1].map((k) => [b.x + bow[0] * L * k, b.z + bow[1] * L * k]);
  const water = ends.map(([x, z]) => inShot([x, SITE.water, z]));
  const ridge = Math.min(...ends.map(([x, z]) => inShot([x, SITE.water + RIDGE, z]).tan), inShot([b.x, SITE.water + RIDGE, b.z]).tan);
  const far = farWaterline(b.x, b.z);
  return {
    f: [Math.min(...water.map((e) => e.f)), Math.max(...water.map((e) => e.f))],
    low: Math.min(...water.map((e) => e.tan)), // the lower hull end's sight line at the water
    ridge, // the lowest point of the ridge line's ends and middle
    eye: Math.hypot(b.x - EYE[0], b.z - EYE[2]),
    toFar: Math.hypot(far.x - b.x, far.z - b.z),
    toNear: SITE.near.waterline - Math.max(...ends.map((e) => e[1])),
  };
}

/** The placement contract for SITE.boats ([near, far]). Throws on a failed check. */
export function checkBoats(boats = SITE.boats) {
  const P = BOAT_PLACE, c = createContract('boat placement');
  const [near, far] = boats.map(boatInShot);
  const rail = railTan(), pier = inShot([SITE.bridge[2][0], SITE.water, SITE.bridge[2][1]]).f;
  c.max('near boat from the eye (m)', near.eye, P.nearMax);
  c.range('far boat from the eye (m)', far.eye, ...P.farRange);
  c.min('near boat on water seen past the street\'s edge (tan)', near.low - edgeTan(), P.onWater);
  c.max('near boat\'s roof ridge above the railing top (tan)', near.ridge - rail, P.atRail);
  c.min('far boat above the railing top (tan)', far.low - rail, P.farOverRail);
  c.min('gap across the opening between the boats (f)', Math.max(near.f[0] - far.f[1], far.f[0] - near.f[1]), P.apart);
  c.min('far boat clear of the bridge pier\'s column (f)', Math.max(pier - far.f[1], far.f[0] - pier), P.pier);
  for (const [name, v] of [['near', near], ['far', far]]) {
    c.min(`${name} boat from our waterline (m)`, v.toNear, P.bank);
    c.min(`${name} boat from the far waterline (m)`, v.toFar, P.bank);
    c.min(`${name} boat inside the curtains' gap (f, the nearer edge)`, Math.min(v.f[0] - P.open[0], P.open[1] - v.f[1]), 0);
  }
  c.min('between the boats (m)', Math.hypot(boats[0].x - boats[1].x, boats[0].z - boats[1].z), P.between);
  c.min('headings differ (degrees)', (Math.abs(boats[0].ry - boats[1].ry) * 180) / Math.PI, P.turn);
  return { contract: c.assert(), near, far, pier };
}
