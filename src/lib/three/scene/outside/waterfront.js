// The Kuching Waterfront below the window (pass e11): a paved street along our side of the river
// with its black cast-iron railing at the water's edge. The user asked for the waterfront's street
// and railing only (no lamps, lights, trees or shelters), on both banks; banks.js uses the railing
// and the paving here for the far bank.
//
// References (none in the repo): the user's five photos of the waterfront (U1-U5, pass e11 in
// research/INTERIOR-NOTES.md) and Wikimedia Commons photos listed in research/CREDITS.md.
//   - the railing (U1, U3, U4): square posts with a flared foot, a moulded cap and a knob; a round
//     top rail and a bottom rail; between them a panel of straight bars and interlocking circles;
//     it stands on a pale concrete kerb at the water's edge;
//   - the street (U1, U3, U4): small dark bricks with broad sand-coloured swirls set into them
//     (paint.js paintPaving), a vertical concrete edge down to the water (Commons "Kuching, Sarawak, Malaysia 03.jpg").
// No source gives the street's width, its height above the water, the railing's height or the
// posts' spacing: every size below is an ESTIMATE judged from the photos (the people in U4 for
// scale), not a measurement.
//
// After .claude/skills/threejs-procedural-geometry: the pieces are swept along a waterline
// (site.js sampleLine) and checked by a contract. Detail follows the size in the window shot (the
// painting-to-scene skill's 2 px rule): the near railing gets its lattice, the far one only posts
// and the top rail. Known compromises: box faces that are never seen (a post's bottom on the kerb)
// are still emitted, and the small vector helpers below are copied per file as in the other
// outside builders.

import { createContract } from './contract.js';
import { SITE, rgbTable } from './site.js';
import { OUTSIDE_THEME } from '../themes/index.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const UP = [0, 1, 0];

export const FRONT_PAINT = rgbTable(OUTSIDE_THEME.waterfront.paint);

/** Sizes (metres; all estimated from the photos, see the header). */
export const WATERFRONT = {
  kerb: { width: 0.4, rise: 0.05 }, // the pale concrete strip at the edge, a little above the paving
  edgeDepth: 0.6, // the concrete edge face reaches this far below the water
  tile: OUTSIDE_THEME.textures.paving.pattern.tile, // the paving texture repeats every this many metres (paint.js paintPaving)
  railing: {
    inset: 0.18, // the posts stand this far in from the edge, on the kerb
    spacing: 1.7, // between posts (U3: about 1.5 times the panel's height)
    height: 1.05, // the top rail's top above the kerb (U4: about an adult's waist)
    post: 0.08, // its side
    foot: [0.15, 0.1], // the flared foot: side, height
    cap: [0.12, 0.05], // the moulded cap under the knob: side, height
    knob: 0.07,
    topRail: 0.055, // its thickness
    bottomRail: [0.1, 0.035], // its height above the kerb, thickness
    panel: [0.17, 0.84], // the lattice between these heights
    bar: 0.022, // the lattice's bars
    ring: 0.17, // the circles' radius (U3: two full circles a bay, half circles on the frame)
    segments: 14, // per circle
  },
};

/** The near street (site.js SITE.near): a straight waterline along x, land towards the house. */
export function nearStations() {
  const N = SITE.near, out = [];
  for (let x = N.x0; x <= N.x1 + 1e-9; x += N.step) out.push({ x, z: N.waterline, tx: 1, tz: 0, nx: 0, nz: 1, s: x - N.x0 });
  return out;
}

/** The circles' offset in front of the lattice bars' plane (m): a named allowance, under 0.02 px from the window. */
const ARC_LIFT = 0.002;

/** A flat bar of `width` from p to q in the plane whose normal is n (double-sided slot). */
function bar(w, slot, p, q, n, width, colour) {
  const across = scale(norm(cross(sub(q, p), n)), width / 2);
  w.quad(slot, add(p, across, -1), add(q, across, -1), add(q, across), add(p, across), colour);
  return 2;
}

/** An arc of a flat ring in the plane (u, v unit axes) round c, radius r, from angle a0 to a1. */
function arc(w, slot, c, u, v, r, a0, a1, width, segments, colour) {
  const n = Math.max(2, Math.round((segments * Math.abs(a1 - a0)) / (2 * Math.PI)));
  const at = (a, rr) => add(add(c, u, Math.cos(a) * rr), v, Math.sin(a) * rr);
  let tris = 0;
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    w.quad(slot, at(t0, r - width / 2), at(t1, r - width / 2), at(t1, r + width / 2), at(t0, r + width / 2), colour);
    tris += 2;
  }
  return tris;
}

/**
 * The railing along `stations` (from sampleLine or nearStations): posts every R.spacing metres of
 * the waterline, R.inset inland, standing at `kerbY(station)`; rails and (with `lattice`) the
 * panel between each pair (without it, plain posts and the top rail: the far bank).
 * `skip(station)` true leaves a gap (the far bank's river front and the bridge's pier). Posts and
 * rails go to 'paint', the lattice to 'blade' (two-sided). Returns { posts, bays, gaps, tris,
 * footing, skipped, coplanar } for the contract (checkFooting): footing is each post's place, base y
 * and the inland offsets of its footprint's edges; skipped, the stations left out.
 */
export function buildRailing(w, stations, { kerbY, lattice = true, skip = () => false, colour = FRONT_PAINT.iron, minSize = 0 }) {
  // minSize: the posts and the top rail are drawn at least this thick (the far bank: so they stay a
  // pixel wide in the window shot and the railing reads as one line, not dashes; a stylisation)
  const R = { ...WATERFRONT.railing, post: Math.max(WATERFRONT.railing.post, minSize), topRail: Math.max(WATERFRONT.railing.topRail, minSize) };
  // posts at even spacing along the line, interpolated between stations
  const posts = [], skipped = [];
  let next = stations[0].s;
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    while (next <= b.s + 1e-9) {
      const t = (next - a.s) / (b.s - a.s || 1);
      const st = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: a.nx + (b.nx - a.nx) * t, nz: a.nz + (b.nz - a.nz) * t, s: next };
      const l = Math.hypot(st.nx, st.nz) || 1;
      st.nx /= l;
      st.nz /= l;
      if (skip(st)) {
        posts.push(null);
        skipped.push(st);
      } else posts.push([st.x + st.nx * R.inset, kerbY(st), st.z + st.nz * R.inset]);
      next += R.spacing;
    }
  }
  let tris = 0, bays = 0, gaps = 0, coplanar = Infinity;
  // what each post stands on: its base y and the inland offsets of its footprint (the foot, or the
  // post itself without one), for checkFooting
  const footHalf = (lattice ? R.foot[0] : R.post) / 2;
  const footing = [];
  const box = (o, hx, hy, hz, ux) => {
    // a box whose x axis runs along ux (horizontal unit), y up
    const uz = [-ux[2], 0, ux[0]];
    w.box('paint', o, scale(ux, hx), [0, hy, 0], scale(uz, hz), colour);
    tris += 12;
  };
  for (let k = 0; k < posts.length; k++) {
    const p = posts[k];
    if (!p) continue;
    const q = posts[k + 1] ?? posts[k - 1];
    const along = q ? norm([q[0] - p[0], 0, q[2] - p[2]]) : [1, 0, 0];
    footing.push({ x: p[0], z: p[2], base: p[1], from: R.inset - footHalf, to: R.inset + footHalf });
    // the foot (0.1 m) and the bottom rail (0.035 m) are under 1 px tall on the far bank: only with the lattice
    if (lattice) box(add(p, UP, R.foot[1] / 2), R.foot[0] / 2, R.foot[1] / 2, R.foot[0] / 2, along);
    box(add(p, UP, R.height / 2), R.post / 2, R.height / 2, R.post / 2, along);
    if (lattice) {
      box(add(p, UP, R.height + R.cap[1] / 2), R.cap[0] / 2, R.cap[1] / 2, R.cap[0] / 2, along);
      box(add(p, UP, R.height + R.cap[1] + R.knob / 2), R.knob / 2, R.knob / 2, R.knob / 2, along);
    }
  }
  for (let k = 0; k < posts.length - 1; k++) {
    const p = posts[k], q = posts[k + 1];
    if (!p || !q) {
      gaps++;
      continue;
    }
    bays++;
    const d = sub(q, p), L = Math.hypot(d[0], d[2]), u = norm([d[0], 0, d[2]]);
    const mid = (h) => add(add(p, d, 0.5), UP, h);
    const half = L / 2 - R.post / 2;
    // the top rail and the bottom rail (boxes; the round top rail is under 2 px from the window)
    const yTop = R.height - R.topRail / 2;
    const slope = d[1] / L; // a little up or down between posts on a sloping kerb
    const railAt = (h, th) => {
      const o = mid(h);
      const uz = [-u[2], 0, u[0]];
      const ax = [u[0] * half, slope * half, u[2] * half];
      w.box('paint', o, ax, [0, th / 2, 0], scale(uz, th / 2), colour);
      tris += 12;
    };
    railAt(yTop, R.topRail);
    if (!lattice) continue;
    railAt(R.bottomRail[0], R.bottomRail[1]);
    // the panel (U3): a frame top and bottom, three uprights, a middle bar, full circles round
    // the first and third uprights' middles, half circles on the frame at the middle upright
    const n = [-u[2], 0, u[0]]; // the panel's plane normal (horizontal, across the railing)
    const P = (x, y) => [p[0] + u[0] * x, p[1] + slope * x + y, p[2] + u[2] * x];
    const [y0, y1] = R.panel, ym = (y0 + y1) / 2;
    const x0 = R.post / 2, x1 = L - R.post / 2;
    tris += bar(w, 'blade', P(x0, y0), P(x1, y0), n, R.bar, colour);
    tris += bar(w, 'blade', P(x0, y1), P(x1, y1), n, R.bar, colour);
    tris += bar(w, 'blade', P(x0, ym), P(x1, ym), n, R.bar, colour);
    for (const f of [0.25, 0.5, 0.75]) tris += bar(w, 'blade', P(L * f, y0), P(L * f, y1), n, R.bar, colour);
    // the circles sit ARC_LIFT in front of the bars' plane, so where they cross no two faces share
    // a plane (the geometry skill's coplanar rule); the separation is measured from the emitted centres
    const v = [0, 1, 0], uu = u;
    const A = (x, y) => add(P(x, y), n, ARC_LIFT);
    const centres = [A(L * 0.25, ym), A(L * 0.75, ym), A(L / 2, y0), A(L / 2, y1)];
    for (const cc of centres) coplanar = Math.min(coplanar, Math.abs(dot(sub(cc, P(x0, y0)), n)));
    for (const cc of centres.slice(0, 2)) tris += arc(w, 'blade', cc, uu, v, R.ring, 0, Math.PI * 2, R.bar, R.segments, colour);
    tris += arc(w, 'blade', centres[2], uu, v, R.ring, 0, Math.PI, R.bar, R.segments, colour);
    tris += arc(w, 'blade', centres[3], uu, v, R.ring, Math.PI, Math.PI * 2, R.bar, R.segments, colour);
  }
  return { posts: posts.filter(Boolean).length, bays, gaps, tris, footing, skipped, coplanar };
}

/**
 * The railing's footing checks (the geometry skill's support rule): every post's whole footprint
 * on the kerb strip (inland offsets 0..kerbWidth) and its base at the kerb's emitted top.
 */
export function checkFooting(c, label, railing, kerbWidth, kerbTop) {
  const off = railing.footing.map((f) => Math.max(0, -f.from, f.to - kerbWidth));
  c.max(`${label} post footprint off the kerb strip (m)`, Math.max(0, ...off), 0);
  c.max(`${label} post base off the kerb top (m)`, Math.max(0, ...railing.footing.map((f) => Math.abs(f.base - kerbTop))), 1e-9);
}

/**
 * The paving's map coordinates: world metres over the texture's tile, so the swirls keep their
 * size whatever the strip's shape.
 */
export const pavingUV = (p) => [p[0] / WATERFRONT.tile, p[2] / WATERFRONT.tile];

/** A paved quad (slot 'paving') a, b, c, d counter-clockwise from above; the map sets its colour. */
export function paveQuad(w, a, b, c, d) {
  w.quad('paving', a, b, c, d, FRONT_PAINT.pavingTint, [pavingUV(a), pavingUV(b), pavingUV(c), pavingUV(d)]);
  return 2;
}

/**
 * Our side of the river (SITE.near): from the water, a concrete edge face, the kerb, the paved
 * street, then grass up to the house. Returns { contract, stats, triangles }.
 */
export function buildNearWaterfront(w) {
  const N = SITE.near, K = WATERFRONT.kerb;
  const top = SITE.ground, zw = N.waterline; // the street is the house's ground: the stilts stand on it
  const kerbTop = top + K.rise, deep = SITE.water - WATERFRONT.edgeDepth;
  const zKerb = zw + K.width, zIn = zw + N.width, zHouse = N.house;
  const tris = { edge: 0, kerb: 0, paving: 0, grass: 0 };
  let edgeLow = Infinity;
  // along x in steps, so the paving's quads stay small enough for the fog and the lighting
  for (let x = N.x0; x < N.x1 - 1e-9; x += N.step) {
    const x1 = Math.min(N.x1, x + N.step);
    // the edge face, facing the river (-z)
    const face = [[x1, deep, zw], [x, deep, zw], [x, kerbTop, zw], [x1, kerbTop, zw]];
    w.quad('paint', ...face, FRONT_PAINT.edge);
    edgeLow = Math.min(edgeLow, ...face.map((p) => p[1]));
    tris.edge += 2;
    // the kerb: its top, and the small step down to the paving
    w.quad('paint', [x, kerbTop, zw], [x, kerbTop, zKerb], [x1, kerbTop, zKerb], [x1, kerbTop, zw], FRONT_PAINT.kerb);
    w.quad('paint', [x, kerbTop, zKerb], [x, top, zKerb], [x1, top, zKerb], [x1, kerbTop, zKerb], FRONT_PAINT.kerb);
    tris.kerb += 4;
    tris.paving += paveQuad(w, [x, top, zKerb], [x, top, zIn], [x1, top, zIn], [x1, top, zKerb]);
    // grass from the street to under the house
    w.quad('paint', [x, top, zIn], [x, top, zHouse], [x1, top, zHouse], [x1, top, zIn], FRONT_PAINT.grass);
    tris.grass += 2;
  }
  const railing = buildRailing(w, nearStations(), { kerbY: () => kerbTop, lattice: true });

  const c = createContract('near waterfront');
  c.range('street above the water (m)', top - SITE.water, 1, 1.6);
  c.min('edge face below the water (m)', SITE.water - edgeLow, 0.3);
  c.range('street width (m), estimated', N.width - K.width, 5, 10);
  checkFooting(c, 'near', railing, K.width, kerbTop);
  c.min('lattice circles off the bars\' plane (m)', railing.coplanar, 0.001);
  c.is('railing gaps (none on our side)', railing.gaps, 0);
  c.min('railing bays', railing.bays, Math.floor((N.x1 - N.x0) / WATERFRONT.railing.spacing) - 1);
  return { contract: c.assert(), stats: { posts: railing.posts, bays: railing.bays }, triangles: { ...tris, railing: railing.tris } };
}
