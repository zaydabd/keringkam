// Plant builders for the view outside: grass clumps and ferns, wound to face the window shot's
// eye. Moved unchanged from the near bank (removed in pass e5; git history keeps its shrubs,
// rosettes, clods and sticks); the fern gained `fronds`, `out` and `rise`. Used by the bush at the
// water (waterbush.js). Sizes are design choices tuned in the window shot, not measured.

import { WINDOW_EYE } from './site.js';
import { LEAF_ATLAS, leafStrip } from './leaves.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const UP = [0, 1, 0];

// The window shot's eye (site.js). Blades and leaves are wound to face it, so their two-sided
// material shades their front.
const EYE = WINDOW_EYE;

// What the plants are made of (design choices, tuned in the window shot).
export const PLANTS = {
  tussock: { segments: [3, 2], near: 14, arch: [0.15, 0.5], heads: 0.12 }, // segments per blade within `near` m of the eye, and beyond; arch: how far a blade's tip bends down, of its height
  fern: { fronds: 9, segments: 9, roll: 0.45, width: 0.36 }, // roll: each frond's leaflets turn towards the eye by up to this (radians); width: the strip's half-width, of the frond's length
  hue: [0.16, 0.1, 0.16], // each plant's colour is scaled by 1 ± half of these (r, g, b)
};

export const tinted = (c, k) => [c[0] * k[0], c[1] * k[1], c[2] * k[2]];
export const hueOf = (rand, h = PLANTS.hue) => h.map((v) => 1 + (rand() - 0.5) * v);

/** A triangle wound to face the eye, with its own shading normals (one, or one per corner). */
export function facing(w, slot, a, b, c, colour, n) {
  const f = cross(sub(b, a), sub(c, a));
  const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  const ns = Array.isArray(n[0]) ? n : [n, n, n];
  if (dot(f, sub(EYE, m)) >= 0) w.smoothTri(slot, [a, b, c], ns, null, colour);
  else w.smoothTri(slot, [a, c, b], [ns[0], ns[2], ns[1]], null, colour);
}

/**
 * A clump of grass from one root: blades that rise and arch over (each a curve from its root, up
 * and out, its tip bent down by `arch` of its height), leaning out along `out` when given (over the
 * mud or the water). `heads` is the share of blades that are seed stalks: thin, straighter, taller,
 * with a seed head at the top.
 */
export function grassClump(w, at, { blades, height, spread = 0.08, lean = 0.35, arch = PLANTS.tussock.arch, out = null, heads = 0, rand, P, simple = false }) {
  const main = P.blade[Math.floor(rand() * P.blade.length)];
  const Tq = PLANTS.tussock;
  const segs = simple ? 1 : Tq.segments[EYE[2] - at[2] > Tq.near ? 1 : 0];
  let n = 0;
  for (let b = 0; b < blades; b++) {
    const a = rand() * Math.PI * 2;
    let dir = [Math.cos(a), 0, Math.sin(a)];
    if (out) dir = norm(add(dir, out, 1.4));
    const stalk = !simple && rand() < heads;
    const tilt = lean * (0.3 + 0.9 * rand()) * (stalk ? 0.4 : 1);
    const h = height * (0.5 + 0.65 * rand()) * (stalk ? 1.35 : 1);
    const bend = stalk ? 0.06 : arch[0] + rand() * arch[1];
    const wd = Math.min(0.026, Math.max(0.01, h * 0.055)) * (stalk ? 0.45 : 1);
    const root = add(at, [Math.cos(a), 0, Math.sin(a)], spread * Math.sqrt(rand()));
    root[1] -= 0.02;
    // A quadratic curve: root, a control point straight up, the tip out and bent down.
    const ctrl = add(add(root, UP, h), dir, h * Math.sin(tilt) * 0.35);
    const tip = add(add(root, UP, h * (1 - 0.9 * bend)), dir, h * (Math.sin(tilt) + 0.9 * bend));
    const pt = (t) => [0, 1, 2].map((i) => (1 - t) * (1 - t) * root[i] + 2 * (1 - t) * t * ctrl[i] + t * t * tip[i]);
    const side = norm(cross(dir, UP).map((v, i) => v + (i === 1 ? 0 : (rand() - 0.5) * 0.6)));
    const colour = stalk ? P.straw : rand() < 0.1 ? P.straw : rand() < 0.3 ? P.blade[Math.floor(rand() * P.blade.length)] : main;
    const sn = norm(add(UP, dir, 0.3));
    let p0 = pt(0), w0 = wd;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs, p1 = pt(t), w1 = wd * (1 - t) * (stalk ? 1 : 0.9) + (stalk ? wd * 0.6 * t : 0);
      if (w1 < 1e-4) facing(w, 'blade', add(p0, side, -w0 / 2), add(p0, side, w0 / 2), p1, colour, sn), n++;
      else facing(w, 'blade', add(p0, side, -w0 / 2), add(p0, side, w0 / 2), add(p1, side, w1 / 2), colour, sn), facing(w, 'blade', add(p0, side, -w0 / 2), add(p1, side, w1 / 2), add(p1, side, -w1 / 2), colour, sn), (n += 2);
      p0 = p1;
      w0 = w1;
    }
    if (stalk) {
      // The seed head: a narrow spindle along the stalk's end, facing the eye.
      const along = norm(sub(tip, pt(0.85)));
      const L = 0.04 + rand() * 0.05, half = 0.008 + rand() * 0.006;
      const top = add(tip, along, L), mid = add(tip, along, L * 0.4);
      facing(w, 'blade', tip, add(mid, side, half), top, P.seedHead, sn);
      facing(w, 'blade', tip, top, add(mid, side, -half), P.seedHead, sn);
      n += 2;
    }
  }
  return n;
}

/**
 * A fern: arching fronds, each a bent strip of the leaf atlas's frond (paired leaflets of rounded
 * lobes, longest a third of the way up), its leaflets turned a little towards the eye. `out`
 * (a unit vector) makes most fronds reach one way; `rise` is how far they arch up [from, + up to].
 */
export function fern(w, at, { reach, rand, P, fronds = PLANTS.fern.fronds, out = null, rise: riseAt = [0.5, 0.25] }) {
  const Q = PLANTS.fern;
  const hue = hueOf(rand, PLANTS.hue);
  let n = 0;
  for (let j = 0; j < fronds; j++) {
    const a = ((j + rand() * 0.7) / fronds) * Math.PI * 2;
    const L = reach * (0.7 + rand() * 0.45);
    let fwd = [Math.cos(a), 0, Math.sin(a)];
    if (out) fwd = norm(add(fwd, out, 1.2)); // most fronds reach out one way (over the water)
    const flat = [-fwd[2], 0, fwd[0]];
    const rise = riseAt[0] + rand() * riseAt[1];
    const at0 = add(at, fwd, 0.04);
    const spineAt = (t) => add(add(at0, fwd, L * t), UP, L * (rise * Math.sin(Math.PI * Math.min(1, t * 0.85)) * (1 - 0.35 * t)));
    const spine = [], sides = [], half = [], normals = [];
    const toEye = norm(sub(EYE, at));
    for (let k = 0; k <= Q.segments; k++) {
      const t = k / Q.segments, p = spineAt(t);
      const along = norm(sub(spineAt(Math.min(1, t + 0.02)), spineAt(Math.max(0, t - 0.02))));
      let up = norm(cross(flat, along)); // the frond's face
      if (up[1] < 0) up = up.map((v) => -v);
      const side = norm(add(flat, up, Math.tan(-Q.roll * dot(toEye, flat)))); // turns the face (about the spine) towards the eye
      spine.push(p);
      sides.push(side);
      half.push(L * Q.width);
      normals.push(norm(add(up, UP, 0.6)));
    }
    n += leafStrip(w, spine, sides, half, { cell: LEAF_ATLAS.cell.frond, normals, colour: tinted(rise > 0.62 ? P.fernLight : P.fern, hue), eye: EYE });
  }
  return n;
}
