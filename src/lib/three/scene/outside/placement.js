// Where the two river taxis sit in the window shot (pass e12). The painting (R3) decides the
// layout: the far boat high in the water, just below the far bank and left of the bridge's pier;
// the near boat lower, to its right, with open water below it. The photos decide the boats' size
// (boats.js PENAMBANG), which stays real. After the painting-to-scene skill: measured in the shot
// (waterbush.js inShot: the place across the opening, f, and the sight line's slope, tan), and
// checked by a contract that throws.
//
// Every threshold is a named allowance, an ESTIMATE judged in the window shot, not a measurement.
// R3's numbers are read off the painting by eye (pixel positions, not exact).

import { createContract } from './contract.js';
import { SITE, WINDOW_EYE } from './site.js';
import { inShot } from './waterbush.js';
import { WATERFRONT } from './waterfront.js';
import { PENAMBANG } from './boats.js';

export const BOAT_PLACE = {
  band: { far: 0.15, near: 0.65, tol: 0.1 }, // each boat's waterline down the water band, far bank 0 to railing 1 (R3: about 0.14 and 0.66)
  overRail: 0.045, // tan: both hull ends at least this high above the railing's top (about 40 px in the 1240 px shot)
  apart: 0.04, // f: the gap across the opening between the two boats (about 40 px)
  pier: 0.04, // f: the far boat keeps this clear of the bridge pier's column on either side
  bank: 15, // m: each boat at least this far from both waterlines
  between: 20, // m: and from the other boat
  turn: 10, // degrees: the two headings differ by at least this, so they do not read as a queue
  open: [0.15, 0.9], // f: both hulls inside the part of the opening the curtains leave clear at the water
};

const EYE = WINDOW_EYE;

/** The railing's top line seen from the window (the slope of the sight line over it). */
export function railTan() {
  const R = WATERFRONT.railing, K = WATERFRONT.kerb;
  return (SITE.ground + K.rise + R.height - EYE[1]) / (EYE[2] - (SITE.near.waterline + R.inset));
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

/** One boat in the shot: both hull ends, its centre, its place down the water band. */
export function boatInShot(b) {
  const L = PENAMBANG.length / 2, bow = [Math.cos(b.ry), -Math.sin(b.ry)];
  const ends = [1, -1].map((k) => inShot([b.x + bow[0] * L * k, SITE.water, b.z + bow[1] * L * k]));
  const far = farWaterline(b.x, b.z);
  const farTan = inShot([far.x, SITE.water, far.z]).tan, rail = railTan();
  const centre = inShot([b.x, SITE.water, b.z]);
  return {
    f: [Math.min(...ends.map((e) => e.f)), Math.max(...ends.map((e) => e.f))],
    low: Math.min(...ends.map((e) => e.tan)), // the lower hull end's sight line
    band: (farTan - centre.tan) / (farTan - rail),
    toFar: Math.hypot(far.x - b.x, far.z - b.z),
    toNear: b.z > SITE.near.waterline ? 0 : SITE.near.waterline - b.z,
  };
}

/** The placement contract for SITE.boats ([near, far]). Throws on a failed check. */
export function checkBoats(boats = SITE.boats) {
  const P = BOAT_PLACE, c = createContract('boat placement');
  const [near, far] = boats.map(boatInShot);
  const rail = railTan(), pier = inShot([SITE.bridge[2][0], SITE.water, SITE.bridge[2][1]]).f;
  c.near('far boat down the water band (0 far bank, 1 railing)', far.band, P.band.far, P.band.tol);
  c.near('near boat down the water band', near.band, P.band.near, P.band.tol);
  c.min('near boat above the railing top (tan)', near.low - rail, P.overRail);
  c.min('far boat above the railing top (tan)', far.low - rail, P.overRail);
  c.min('gap across the opening between the boats (f)', Math.max(near.f[0] - far.f[1], far.f[0] - near.f[1]), P.apart);
  c.min('far boat clear of the bridge pier\'s column (f)', Math.max(pier - far.f[1], far.f[0] - pier), P.pier);
  for (const [name, v] of [['near', near], ['far', far]]) {
    c.min(`${name} boat from our waterline (m)`, v.toNear, P.bank);
    c.min(`${name} boat from the far waterline (m)`, v.toFar, P.bank);
  }
  for (const [name, v] of [['near', near], ['far', far]]) c.min(`${name} boat inside the curtains' gap (f, the nearer edge)`, Math.min(v.f[0] - P.open[0], P.open[1] - v.f[1]), 0);
  c.min('between the boats (m)', Math.hypot(boats[0].x - boats[1].x, boats[0].z - boats[1].z), P.between);
  c.min('headings differ (degrees)', (Math.abs(boats[0].ry - boats[1].ry) * 180) / Math.PI, P.turn);
  return { contract: c.assert(), near, far, pier };
}
