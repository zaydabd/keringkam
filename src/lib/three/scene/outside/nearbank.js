// Our bank, below the windows (R3), in detail. The user asked for the dirt to look muddy and
// trodden and for the bank to be less flat. Same frame and section as before (site.js SITE.near):
// wet mud at the water, a grass berm, a mud track, a shoulder up to the level grass the house
// stands on. What this file builds:
//   - the ground is a muddy terrain: a fine sweep (about 0.15 m apart where the window looks) with
//     smooth normals, whose heights add hummocks, lumps, hollows, two ruts with squeezed-up lips, a
//     worn way down to the water and a turf lip over the cut bank to the section;
//   - grass keeps to the crests and the upper bank, mud takes the hollows, the ruts, the worn way
//     and the cut bank (zoneOf);
//   - mud and turf get painted detail textures (paint.js paintMud, paintTurf; slots 'mud', 'turf'),
//     and the mud a second, non-tiling map over the stretch the window sees, through its second
//     map channel: footprints, wet mud, water in the ruts (paint.js paintTrample; `trample` below);
//   - clods, stones, driftwood, and puddles in the hollows lie on the mud;
//   - shrubs built from leaf cards around a dark core (light on top, dark under, as R3 paints
//     the bank's bushes), grass clumps of curved blades (leaning out over the water at the edge),
//     and ferns with leaflets.
// Nothing here is measured: densities and sizes are design choices tuned in the window shot.
// Frame: metres, y up, the room's floor at y = 0; offsets are measured inland from the waterline.

import * as THREE from 'three';
import { createContract } from './contract.js';
import { SITE, sampleLine, mulberry32, rgbTable } from './site.js';
import { OUTSIDE_THEME } from '../themes/index.js';
import { checkSweep } from './banks.js';

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const UP = [0, 1, 0];

// The window shot's eye (interior.js SHOTS.window; site.js). Blades and leaves are wound to face it,
// so their two-sided material shades their front, and detail is only placed where it can be seen.
const EYE = [-0.475, 1.5, -4.62];

// Paint, as vertex colours (themes/outside.js).
export const NEAR_PAINT = rgbTable(OUTSIDE_THEME.nearBank);

// Design choices for the detail (not measured).
export const NEAR_DETAIL = {
  // The section's zone edges (SITE.near: lip, berm, mud, edge) wander inland and out by up to this
  // much (m) along the river, and each zone gets this many columns between its edges. A grid
  // column sits on every zone edge, so edges follow the noise instead of snapping to the grid.
  wander: { lip: 0.22, berm: 0.75, track: 0.45, edge: 0.35 },
  // The muddy terrain (buildNearBank). Heights in metres, sizes are the noise's feature sizes.
  terrain: {
    along: 0.15, // finest step along the river (m), where the window looks
    rate: 0.008, // there the step grows by this much per metre from the eye
    outside: [1.5, 0.08], // out of view: at least this (m), else distance times this
    inland: 0.2, // the columns' spacing inland (m)
    hummocks: { height: 0.24, size: 3.4 },
    lumps: { height: 0.08, size: 1.1 },
    hollows: { depth: 0.16, size: 2.3, from: 0.2 }, // noise above `from` is a hollow
    ruts: { depth: 0.1, width: 0.22, lip: 0.035, apart: 1.15 }, // two ruts along the track
    // The worn way from the house to the water: [x of the waterline, offset inland] (design choice).
    path: { depth: 0.07, width: 0.45, points: [[0.9, 9], [0.2, 6.5], [-0.6, 4], [-1.2, 1.8], [-1.6, 0.3]] },
    cut: 0.12, // the turf's lip over the cut bank
    crest: 0.1, // hummocks higher than this keep their grass on the mud
    relief: 0.7, // the terrain adds at most this, up or down (m)
    triangles: [15000, 60000], // the ground's triangles
    wet: 1.6, // the mud is wet this far above the waterline (m)
    rutWater: 0.05, // water stands in the ruts where noise is above this
    prints: { stride: 1.36, flooded: 0.12, landing: 26, crossings: 5 }, // stride (m), share with water in them, prints where people step into a boat, paths across the flat
  },
  tile: { mud: 4, turf: 3 }, // metres per texture tile
  reach: 60, // detail stops this far from the eye (m)
  cone: 0.64, // and outside the opening between the curtains: |dx| / dz (the window shot shows about 0.58)
  far: 25, // beyond this (m) shrubs and grass are drawn simpler
  // Plants and debris per square metre of each zone (offset range inland, metres).
  place: [
    { kind: 'edge', zones: ['berm'], range: [0.2, 0.95], density: 3 },
    { kind: 'grass', zones: ['berm'], range: [0.9, 3.7], density: 1.4 },
    { kind: 'shrub', zones: ['berm'], range: [0.5, 2.8], density: 0.75, xMax: -6 }, // the bank's bushes (R3: left only)
    { kind: 'weed', zones: ['flat', 'track', 'lip'], range: [0.15, 4.6], density: 0.14 },
    { kind: 'clod', zones: ['flat', 'track', 'lip'], range: [0.05, 4.6], density: 0.8 },
    { kind: 'stone', zones: ['flat', 'track', 'lip'], range: [0.1, 4.4], density: 0.3 },
    { kind: 'rim', zones: ['shoulder'], range: [4.2, 5.7], density: 1.3 },
    { kind: 'grass', zones: ['level'], range: [5.0, 13], density: 2.0, fade: [10, 24, 0.15] }, // thinning from the window's foot: [dz full, dz thin, thin factor]
  ],
  puddles: 4,
  sticks: 3,
};

// Value noise in 2D, deterministic.
function hash2(i, j, seed) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(i, j, seed), hash2(i + 1, j, seed), u), lerp(hash2(i, j + 1, seed), hash2(i + 1, j + 1, seed), u), v) * 2 - 1;
}
const fbm = (x, y, seed) => vnoise(x, y, seed) * 0.6 + vnoise(x * 2.1, y * 2.1, seed + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, seed + 2) * 0.1;

/** A triangle wound to face the eye, with its own shading normals (one, or one per corner). */
function facing(w, slot, a, b, c, colour, n) {
  const f = cross(sub(b, a), sub(c, a));
  const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  const ns = Array.isArray(n[0]) ? n : [n, n, n];
  if (dot(f, sub(EYE, m)) >= 0) w.smoothTri(slot, [a, b, c], ns, null, colour);
  else w.smoothTri(slot, [a, c, b], [ns[0], ns[2], ns[1]], null, colour);
}

const ICO = [0, 1].map((d) => {
  const g = new THREE.IcosahedronGeometry(1, d); // already non-indexed
  const p = g.attributes.position;
  const out = [];
  for (let i = 0; i < p.count; i++) out.push([p.getX(i), p.getY(i), p.getZ(i)]);
  g.dispose();
  return out;
});

/**
 * A shrub, as R3 paints the bank's bushes: two to four lumpy lobes in mid green (the toon bands
 * light their tops and shade their undersides), with leaf cards over them that break the outline;
 * light leaves on top, dark ones low down.
 */
function shrub(w, at, { radius, height, rand, P, simple = false }) {
  const cy = at[1] + height * 0.42;
  const phase = [rand() * 6, rand() * 6, rand() * 6];
  const lump = (d) => 1 + 0.16 * Math.sin(d[0] * 4.1 + phase[0]) * Math.sin(d[1] * 3.7 + phase[1]) * Math.sin(d[2] * 4.4 + phase[2]) * 2;
  const shell = (d, s) => {
    const l = lump(d) * s;
    return [at[0] + d[0] * radius * l, Math.max(at[1] - 0.04, cy + d[1] * height * 0.58 * l), at[2] + d[2] * radius * l];
  };
  let n = 0;
  const lobes = 2 + Math.floor(rand() * 3);
  for (let j = 0; j < lobes; j++) {
    const a = rand() * Math.PI * 2, off = j === 0 ? 0 : radius * (0.35 + rand() * 0.3);
    const r = radius * (j === 0 ? 0.8 : 0.5 + rand() * 0.2), h = height * (j === 0 ? 0.48 : 0.3 + rand() * 0.12);
    const c = [at[0] + Math.cos(a) * off, at[1] + h * (j === 0 ? 0.9 : 0.8), at[2] + Math.sin(a) * off];
    const core = ICO[simple ? 0 : 1];
    for (let i = 0; i < core.length; i += 3) {
      const ds = [core[i], core[i + 1], core[i + 2]];
      const p = ds.map((d) => {
        const l = lump(d);
        return [c[0] + d[0] * r * l, Math.max(at[1] - 0.04, c[1] + d[1] * h * l), c[2] + d[2] * r * l];
      });
      w.smoothTri('blade', p, ds.map((d) => norm(add(d, UP, 0.3))), null, P.leafCore);
      n++;
    }
  }
  const leaves = Math.round(Math.min(220, Math.max(60, 300 * radius * radius)) * (simple ? 0.3 : 1));
  for (let j = 0; j < leaves; j++) {
    let d;
    do d = norm([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]);
    while (d[1] < -0.1);
    const p = shell(d, 0.9 + rand() * 0.2);
    const L = (0.08 + rand() * 0.06) * Math.min(1.3, 0.6 + radius);
    const W = L * (0.38 + rand() * 0.15);
    const axis = norm([d[0] * 0.7 + (rand() - 0.5) * 0.9, -0.45 + (rand() - 0.5) * 0.5, d[2] * 0.7 + (rand() - 0.5) * 0.9]);
    const side = norm(cross(axis, d));
    const base = add(p, axis, -L * 0.2), tip = add(p, axis, L * 0.8);
    const s1 = add(add(p, axis, L * 0.25), side, W / 2), s2 = add(add(p, axis, L * 0.25), side, -W / 2);
    const k = d[1] + (rand() - 0.5) * 0.35;
    const colour = k > 0.45 ? P.leafLight : k > 0.05 ? P.leafMid : P.leafDark;
    const sn = norm(add(d, UP, 1.0));
    facing(w, 'blade', base, s1, tip, colour, sn);
    facing(w, 'blade', base, tip, s2, colour, sn);
    n += 2;
  }
  return n;
}

/** A clump of curved grass blades from one root; `out` leans them (over the water at the edge). */
function grassClump(w, at, { blades, height, spread = 0.08, lean = 0.35, out = null, rand, P, simple = false }) {
  const main = P.blade[Math.floor(rand() * P.blade.length)];
  let n = 0;
  for (let b = 0; b < blades; b++) {
    const a = rand() * Math.PI * 2;
    let dir = [Math.cos(a), 0, Math.sin(a)];
    if (out) dir = norm(add(dir, out, 1.4));
    const tilt = lean * (0.3 + 0.9 * rand());
    const h = height * (0.5 + 0.65 * rand());
    const wd = Math.min(0.026, Math.max(0.01, h * 0.055));
    const root = add(at, [Math.cos(a), 0, Math.sin(a)], spread * Math.sqrt(rand()));
    root[1] -= 0.02;
    const pt = (t) => add(add(root, dir, Math.sin(tilt) * h * Math.pow(t, 1.5)), UP, h * t * (1 - 0.3 * tilt * t));
    const side = norm(cross(dir, UP).map((v, i) => v + (i === 1 ? 0 : (rand() - 0.5) * 0.6)));
    const colour = rand() < 0.12 ? P.straw : rand() < 0.3 ? P.blade[Math.floor(rand() * P.blade.length)] : main;
    const sn = norm(add(UP, dir, 0.3));
    if (simple) {
      facing(w, 'blade', add(root, side, -wd / 2), add(root, side, wd / 2), pt(1), colour, sn);
      n++;
      continue;
    }
    const m = pt(0.55), tip = pt(1);
    const a0 = add(root, side, -wd / 2), a1 = add(root, side, wd / 2), b0 = add(m, side, -wd * 0.32), b1 = add(m, side, wd * 0.32);
    facing(w, 'blade', a0, a1, b1, colour, sn);
    facing(w, 'blade', a0, b1, b0, colour, sn);
    facing(w, 'blade', b0, b1, tip, colour, sn);
    n += 3;
  }
  return n;
}

/** A fern: arching fronds, each a stem with paired leaflets shrinking to its tip. */
function fern(w, at, { reach, fronds = 8, rand, P }) {
  let n = 0;
  for (let j = 0; j < fronds; j++) {
    const a = ((j + rand() * 0.7) / fronds) * Math.PI * 2;
    const L = reach * (0.7 + rand() * 0.45);
    const fwd = [Math.cos(a), 0, Math.sin(a)];
    const side = [-fwd[2], 0, fwd[0]];
    const rise = 0.5 + rand() * 0.25;
    const spine = (t) => add(add(at, fwd, L * t), UP, L * (rise * Math.sin(Math.PI * Math.min(1, t * 0.85)) * (1 - 0.35 * t)));
    const colour = rise > 0.62 ? P.fernLight : P.fern;
    const segs = 12;
    for (let k = 0; k < segs; k++) {
      const p0 = spine(k / segs), p1 = spine((k + 1) / segs);
      facing(w, 'blade', add(p0, side, -0.008), add(p0, side, 0.008), p1, colour, UP);
      n++;
      if (k === 0) continue;
      const t = k / segs;
      const lp = L * 0.17 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9));
      const along = norm(sub(p1, p0));
      for (const s of [-1, 1]) {
        const d = norm([side[0] * s + along[0] * 0.35, along[1] * 0.35 - 0.12, side[2] * s + along[2] * 0.35]);
        const tip = add(p0, d, lp);
        const wv = add(along, UP, 0.2);
        const m1 = add(add(p0, d, lp * 0.35), wv, lp * 0.2), m2 = add(add(p0, d, lp * 0.35), wv, -lp * 0.2);
        facing(w, 'blade', p0, m1, tip, colour, norm(add(UP, d, 0.2)));
        facing(w, 'blade', p0, tip, m2, colour, norm(add(UP, d, 0.2)));
        n += 2;
      }
    }
  }
  return n;
}

/** A clod or stone: a squashed, turned icosahedron sunk a third into the ground (faceted). */
function lump(w, at, { r, squash, rand, colour }) {
  const yaw = rand() * Math.PI * 2, c = Math.cos(yaw), s = Math.sin(yaw);
  const sx = r * (0.8 + rand() * 0.5), sz = r * (0.7 + rand() * 0.4), sy = r * squash;
  const P = ICO[0].map(([x, y, z]) => {
    const k = 1 + (rand() - 0.5) * 0.3;
    const X = x * sx * k, Z = z * sz * k;
    return [at[0] + X * c + Z * s, at[1] + y * sy * k + sy * 0.35, at[2] - X * s + Z * c];
  });
  for (let i = 0; i < P.length; i += 3) w.tri('paint', P[i], P[i + 1], P[i + 2], colour);
  return P.length / 3;
}

/** A piece of driftwood: a bent five-sided pole lying on the mud. */
function stick(w, at, { length, radius, yaw, rand, colour }) {
  const dir = [Math.cos(yaw), 0, Math.sin(yaw)], side = [-dir[2], 0, dir[0]];
  const bend = (rand() - 0.5) * 0.3;
  const ring = (t) => {
    const c = add(add(at, dir, (t - 0.5) * length), side, bend * length * (t - 0.5) * (t - 0.5) * 4);
    const rr = radius * (1 - 0.35 * t);
    return [0, 1, 2, 3, 4, 5].map((k) => {
      const a = (k / 5) * Math.PI * 2;
      return add(add(c, side, Math.cos(a) * rr), UP, Math.sin(a) * rr + rr * 0.6);
    });
  };
  let n = 0;
  const rings = [0, 0.5, 1].map(ring);
  for (let i = 0; i < 2; i++) {
    for (let k = 0; k < 5; k++) {
      const a = rings[i][k], b = rings[i][k + 1], cc = rings[i + 1][k + 1], d = rings[i + 1][k];
      const m = [(a[0] + cc[0]) / 2, (a[1] + cc[1]) / 2, (a[2] + cc[2]) / 2];
      const out = sub(m, add(add(at, dir, ((i + 0.5) / 2 - 0.5) * length), UP, radius * 0.6));
      const f = cross(sub(b, a), sub(cc, a));
      if (dot(f, out) >= 0) w.quad('paint', a, b, cc, d, colour);
      else w.quad('paint', a, d, cc, b, colour);
      n += 2;
    }
  }
  return n;
}

/**
 * Builds the near bank. Writes slots 'mud' and 'turf' (textured ground; their second map channel
 * places the trodden-mud map, `trample` below), 'paint' (clods, stones, wood, puddles) and 'blade'
 * (shrubs, grass, ferns; two-sided). Returns, besides the contract and stats, `trample`: what the
 * painter needs to draw footprints, ruts and wet mud over the stretch the window sees
 * (paint.js paintTrample).
 */
export function buildNearBank(w, { seed = 0 } = {}) {
  const S = SITE, N = S.near, P = NEAR_PAINT, D = NEAR_DETAIL, T = D.terrain;
  const rand = mulberry32(307 + seed);
  const smoothstep = THREE.MathUtils.smoothstep;
  // Detail only where the window can see it: in front of the eye, within reach.
  const seen = (p) => {
    const dz = EYE[2] - p[2];
    return dz > 2 && dz < D.reach && Math.abs(p[0] - EYE[0]) < dz * D.cone;
  };
  const inland = (q, o) => [q.x + q.nx * o, 0, q.z + q.nz * o];
  const inView = (q) => [0, 3, 6, N.level].some((o) => seen(inland(q, o)));
  // Stations: fine where the window looks, coarse elsewhere.
  const stations = sampleLine(S.nearLine, {
    landOnLeft: true,
    fine: 0.05,
    step: (q) => {
      const d = Math.hypot(q.x - EYE[0], q.z - EYE[2]);
      return inView(q) ? Math.max(T.along, d * T.rate) : Math.min(40, Math.max(T.outside[0], d * T.outside[1]));
    },
  });
  /** The waterline at distance s along it: position and inland normal, between stations. */
  const stationAt = (s) => {
    let lo = 0, hi = stations.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (stations[mid].s <= s) lo = mid;
      else hi = mid;
    }
    const a = stations[lo], b = stations[hi], t = Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s || 1)));
    const nx = lerp(a.nx, b.nx, t), nz = lerp(a.nz, b.nz, t), l = Math.hypot(nx, nz) || 1;
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), nx: nx / l, nz: nz / l, s };
  };
  /** Distance along the waterline where its x is `x` (the line runs towards +x). */
  const sOfX = (x) => {
    let i = 0;
    while (i < stations.length - 2 && stations[i + 1].x < x) i++;
    const a = stations[i], b = stations[i + 1];
    return lerp(a.s, b.s, Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x))));
  };

  // Zone edges at a distance s along the waterline: SITE.near's, wandering by noise.
  const edgesAt = (s) => {
    const e = (k, f) => fbm(s * f, k * 7.3, 11 + seed);
    const lip = Math.max(0.15, N.lip + D.wander.lip * e(1, 0.9));
    const berm = Math.max(lip + 1.2, N.berm + D.wander.berm * e(3, 0.45));
    const track = Math.max(berm + 0.5, N.mud + D.wander.track * e(4, 0.6));
    const edge = Math.max(track + 0.7, N.edge + D.wander.edge * e(5, 0.6));
    return { lip, berm, track, edge };
  };
  // The section's height at offset o, between its key points (SITE.near), for those edges.
  const baseY = (E, o) => {
    const KEY = [[-4, S.water - 1], [0, S.water], [E.lip, S.water + 0.35], [E.berm, N.bermY], [E.track, S.water + 0.6], [E.edge, S.ground - 0.15], [N.level, S.ground]];
    for (let k = 0; k < KEY.length - 1; k++) if (o <= KEY[k + 1][0]) return lerp(KEY[k][1], KEY[k + 1][1], (o - KEY[k][0]) / (KEY[k + 1][0] - KEY[k][0]));
    return S.ground;
  };
  // Grass on the berm: the bank on the left, ending raggedly, and an uneven patch on the tip of the flat.
  const grassAt = (x, o) => {
    if (x + 1.6 * fbm(x * 0.35, o * 0.5, 31 + seed) < N.bermTo) return true;
    const cx = (N.tip[0] + N.tip[1]) / 2, rx = (N.tip[1] - N.tip[0]) / 2;
    return Math.hypot((x - cx) / (rx * 0.6), (o - 1.1) / 0.8) < 1 + 0.5 * fbm(x * 1.1, o * 1.1, 37 + seed);
  };
  const zoneAt = (s, x, o) => {
    const E = edgesAt(s);
    if (o < 0) return 'under';
    if (o < E.lip) return 'lip';
    if (o < E.berm) return grassAt(x, o) ? 'berm' : 'flat';
    if (o < E.track) return 'track';
    if (o < E.edge) return 'shoulder';
    return 'level';
  };

  // The worn way from the house down to the water, in (s, o).
  const path = T.path.points.map(([x, o]) => [sOfX(x), o]);
  const toPath = (s, o) => {
    let best = Infinity;
    for (let k = 0; k < path.length - 1; k++) {
      const [s0, o0] = path[k], [s1, o1] = path[k + 1];
      const ds = s1 - s0, dO = o1 - o0, t = Math.min(1, Math.max(0, ((s - s0) * ds + (o - o0) * dO) / (ds * ds + dO * dO)));
      best = Math.min(best, Math.hypot(s - s0 - ds * t, o - o0 - dO * t));
    }
    return best;
  };
  // The terrain over the section: what is added to baseY, and the parts of it the zones and the
  // painted marks need. Nothing is added at the waterline or where the level ground starts.
  const relief = (s, x, z, o, E) => {
    const fade = Math.min(1, Math.max(0, o / E.lip)) * (1 - smoothstep(o, N.level - 1.8, N.level));
    const a = fade * (1 - smoothstep(Math.hypot(x - EYE[0], z - EYE[2]), D.reach - 10, D.reach + 10));
    const hum = T.hummocks.height * fbm(x / T.hummocks.size, z / T.hummocks.size, 41 + seed);
    const lumpy = T.lumps.height * fbm(x / T.lumps.size, z / T.lumps.size, 21 + seed) + 0.02 * vnoise(x * 3.5, z * 3.5, 23 + seed);
    const hollow = smoothstep(fbm(x / T.hollows.size + 7.1, z / T.hollows.size, 47 + seed), T.hollows.from, T.hollows.from + 0.35);
    const mid = (E.berm + E.track) / 2;
    let ruts = 0, rut = 0;
    for (const side of [-0.5, 0.5]) {
      const u = (o - mid - side * T.ruts.apart) / T.ruts.width;
      const g = Math.exp(-u * u * 2);
      ruts += -T.ruts.depth * g + T.ruts.lip * Math.exp(-((Math.abs(u) - 1.5) ** 2) * 3);
      rut = Math.max(rut, g);
    }
    const onPath = Math.exp(-((toPath(s, o) / T.path.width) ** 2));
    const cut = T.cut * Math.exp(-(((o - E.edge - 0.15) / 0.18) ** 2)); // the turf's lip over the cut bank
    const dy = a * (hum + lumpy - T.hollows.depth * hollow + ruts - T.path.depth * onPath + cut);
    return { a, hum: a * hum, hollow: a * hollow, rut: a * rut, onPath, dy };
  };
  // A zone from the section's zone and the terrain: grass keeps to the crests and the upper bank,
  // the mud takes the hollows, the ruts, the worn way and the cut bank's face.
  const zoneOf = (s, x, o, R) => {
    const z0 = zoneAt(s, x, o);
    if (z0 === 'under' || z0 === 'lip') return z0;
    if (R.onPath > 0.45 + 0.25 * vnoise(s * 2.3, o * 2.3, 53 + seed)) return 'track';
    if (z0 === 'flat' || z0 === 'track') return R.hum > T.crest && R.rut < 0.2 ? 'berm' : z0;
    if (z0 === 'shoulder') return R.hum > T.crest * 0.5 ? 'shoulder' : 'cut';
    if (R.hollow > 0.65) return 'flat';
    return z0;
  };
  /** Ground height for offset o where the base is `base`: never pushed below the water. */
  const heightOf = (base, R, o) => (o <= 0 ? base : base + Math.max(R.dy, -(base - S.water) * 0.7));
  const MUD = new Set(['under', 'lip', 'flat', 'track', 'cut']);
  const look = { under: P.mudUnder, lip: P.mudFlat, flat: P.mudFlat, track: P.mudFlat, cut: P.mudFlat, berm: P.berm, shoulder: P.shoulder, level: P.level };

  // The grid: under water, the waterline, then evenly spaced columns to the level ground.
  const nIn = Math.round(N.level / T.inland);
  const columns = [-4, 0, ...Array.from({ length: nIn }, (_, j) => ((j + 1) * N.level) / nIn)];
  const last = columns.length - 1;
  const edges = stations.map((st) => edgesAt(st.s));
  const rows = stations.map((st, i) =>
    columns.map((o) => {
      const x = st.x + st.nx * o, z = st.z + st.nz * o;
      return [x, heightOf(baseY(edges[i], o), relief(st.s, x, z, o, edges[i]), o), z];
    }),
  );
  // Smooth normals over the grid.
  const nrm = rows.map((r, i) =>
    r.map((p, k) => {
      const a = rows[Math.min(rows.length - 1, i + 1)][k], b = rows[Math.max(0, i - 1)][k];
      const c = r[Math.min(last, k + 1)], d = r[Math.max(0, k - 1)];
      const n = norm(cross(sub(c, d), sub(a, b)));
      return n[1] < 0 ? n.map((v) => -v) : n;
    }),
  );
  // The trodden-mud map covers the stretch the window sees, in (s, o).
  const viewed = stations.filter(inView);
  const map = { s: [viewed[0].s - 1, viewed[viewed.length - 1].s + 1], o: [-0.6, N.level] };
  const uv1Of = (s, o) => [(s - map.s[0]) / (map.s[1] - map.s[0]), (o - map.o[0]) / (map.o[1] - map.o[0])];
  const uvOf = (p, slot) => [p[0] / D.tile[slot], p[2] / D.tile[slot]];
  const stats = { stations: stations.length, inView: viewed.length, columns: columns.length, quads: 0, seenQuads: 0, land: 0, shrubs: 0, clumps: 0, ferns: 0, clods: 0, stones: 0, sticks: 0, puddles: 0, prints: 0, zones: {}, triangles: {} };
  const from = { mud: w.slot('mud').triangles, turf: w.slot('turf').triangles, paint: w.slot('paint').triangles, blade: w.slot('blade').triangles };
  for (let i = 0; i < rows.length - 1; i++) {
    const s = (stations[i].s + stations[i + 1].s) / 2, E = edgesAt(s);
    for (let k = 0; k < last; k++) {
      const o = (columns[k] + columns[k + 1]) / 2;
      const c = lerp3(lerp3(rows[i][k], rows[i][k + 1], 0.5), lerp3(rows[i + 1][k], rows[i + 1][k + 1], 0.5), 0.5);
      const zone = zoneOf(s, c[0], o, relief(s, c[0], c[2], o, E));
      const slot = MUD.has(zone) ? 'mud' : 'turf';
      stats.zones[zone] = (stats.zones[zone] ?? 0) + 1;
      if (seen(c)) stats.seenQuads++;
      const A = [i, k], B = [i + 1, k], C = [i + 1, k + 1], Dd = [i, k + 1];
      const q = [A, Dd, C, B]; // land on the left of the waterline's direction: this winding faces up
      const p = q.map(([a, b]) => rows[a][b]), n = q.map(([a, b]) => nrm[a][b]), uv = p.map((v) => uvOf(v, slot));
      const u1 = q.map(([a, b]) => uv1Of(stations[a].s, columns[b]));
      w.smoothTri(slot, [p[0], p[1], p[2]], [n[0], n[1], n[2]], [uv[0], uv[1], uv[2]], look[zone], [u1[0], u1[1], u1[2]]);
      w.smoothTri(slot, [p[0], p[2], p[3]], [n[0], n[2], n[3]], [uv[0], uv[2], uv[3]], look[zone], [u1[0], u1[2], u1[3]]);
      stats.quads++;
    }
  }

  const contract = createContract('near bank');
  checkSweep(contract, w, [['mud', from.mud], ['turf', from.turf]], rows, stations, 0, { minArea: 0.004, minAdvance: 0.02 }); // fine steps: the inner columns of a bend advance less
  contract.near('waterline at the water level', Math.max(...rows.map((r) => Math.abs(r[1][1] - S.water))), 0, 1e-6);
  contract.is('columns per section', rows[0].length, columns.length);
  contract.range('shoulder slope (degrees), steepest', THREE.MathUtils.radToDeg(Math.atan2(S.ground - 0.15 - (S.water + 0.6), Math.min(...edges.map((E) => E.edge - E.track)))), 15, 42);
  contract.min('zone edges in order (m), closest', Math.min(...edges.map((E) => Math.min(E.lip, E.berm - E.lip, E.track - E.berm, E.edge - E.track, N.level - E.edge))), 0.15);
  contract.range('level grass above the water (m)', S.ground - S.water, 1, 2);
  const reliefs = rows.flatMap((r, i) => r.map((p, k) => p[1] - baseY(edges[i], columns[k])));
  contract.max('ground relief, highest (m)', Math.max(...reliefs), T.relief);
  contract.max('ground relief, deepest (m)', -Math.min(...reliefs), T.relief);
  contract.min('ground relief, highest, is not flat (m)', Math.max(...reliefs), 0.2);
  contract.min('ground above the water, inland of the waterline (m)', Math.min(...rows.flatMap((r) => r.slice(2).map((p) => p[1]))) - S.water, 0);
  let widest = 0;
  for (let i = 0; i < stations.length - 1; i++) if (inView(stations[i]) && inView(stations[i + 1]) && EYE[2] - stations[i].z < 30) widest = Math.max(widest, stations[i + 1].s - stations[i].s);
  contract.max('step along the river within 30 m of the window (m)', widest, 0.3);
  contract.min('ground quads where the window looks (share)', stats.seenQuads / stats.quads, 0.5);

  // The level ground behind, to where the haze ends (the house stands on it): turf, mapped like the sweep.
  const E = S.extent;
  const inner = rows.map((r) => [r[last][0], r[last][2]]);
  const contour = [...inner, [inner[inner.length - 1][0], E.z1], [E.x0, E.z1], [E.x0, inner[0][1] - 90]].map(([x, z]) => new THREE.Vector2(x, z));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const pa = [contour[a].x, S.ground, contour[a].y], pb = [contour[b].x, S.ground, contour[b].y], pc = [contour[c].x, S.ground, contour[c].y];
    const up = (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]) > 0;
    const [q, r] = up ? [pb, pc] : [pc, pb];
    w.tri('turf', pa, q, r, P.level, uvOf(pa, 'turf'), uvOf(q, 'turf'), uvOf(r, 'turf'));
    stats.land++;
  }
  contract.is('land behind: triangles = corners - 2', stats.land, contour.length - 2);

  const colAt = (i, o) => {
    const st = stations[i], r = rows[i];
    if (o >= columns[last]) return [st.x + st.nx * o, S.ground, st.z + st.nz * o];
    let k = 0;
    while (k < last - 1 && columns[k + 1] < o) k++;
    return lerp3(r[k], r[k + 1], Math.min(1, Math.max(0, (o - columns[k]) / (columns[k + 1] - columns[k]))));
  };
  const surface = (i, t, o) => lerp3(colAt(i, o), colAt(i + 1, o), t);
  /** The ground's height under a point (x, z) near the window, from the grid. */
  const groundAt = (x, z) => {
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      const len = (b.x - a.x) * a.tx + (b.z - a.z) * a.tz;
      const along = (x - a.x) * a.tx + (z - a.z) * a.tz;
      if (along < 0 || along > len) continue;
      const o = (x - a.x) * a.nx + (z - a.z) * a.nz;
      if (o < 0 || o > N.level + 0.5) continue;
      return surface(i, along / len, o)[1];
    }
    return S.ground;
  };
  const toWater = (i) => [-stations[i].nx, 0, -stations[i].nz];
  let lowest = Infinity;
  const kinds = {
    edge: (p, i) => (stats.clumps++, grassClump(w, p, { blades: 9 + Math.floor(rand() * 6), height: 0.3 + rand() * 0.35, lean: 0.55, out: toWater(i), rand, P })),
    grass: (p) => {
      stats.clumps++;
      const far = EYE[2] - p[2] > D.far;
      return grassClump(w, p, { blades: far ? 7 : 10 + Math.floor(rand() * 6), height: 0.16 + rand() * 0.22, rand, P, simple: far });
    },
    rim: (p, i) => (stats.clumps++, grassClump(w, p, { blades: 7 + Math.floor(rand() * 5), height: 0.14 + rand() * 0.2, lean: 0.45, out: toWater(i), rand, P })),
    weed: (p) => (stats.clumps++, grassClump(w, p, { blades: 4 + Math.floor(rand() * 4), height: 0.1 + rand() * 0.15, rand, P })),
    shrub: (p) => {
      stats.shrubs++;
      const radius = 0.4 + rand() * 0.55;
      return shrub(w, p, { radius, height: radius * (1.1 + rand() * 0.5), rand, P, simple: EYE[2] - p[2] > D.far });
    },
    clod: (p) => (stats.clods++, lump(w, p, { r: 0.04 + rand() * rand() * 0.12, squash: 0.45, rand, colour: rand() < 0.7 ? P.clod : P.clodLight })),
    stone: (p) => (stats.stones++, lump(w, p, { r: 0.03 + rand() * 0.07, squash: 0.6, rand, colour: rand() < 0.6 ? P.stone : P.stoneLight })),
  };
  const counts = { paint: 0, blade: 0 };
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    if (!seen([(a.x + b.x) / 2 + a.nx * 4, 0, (a.z + b.z) / 2 + a.nz * 4])) continue;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (const rule of D.place) {
      const tries = len * (rule.range[1] - rule.range[0]) * rule.density;
      const count = Math.floor(tries) + (rand() < tries % 1 ? 1 : 0);
      for (let j = 0; j < count; j++) {
        const t = rand(), o = lerp(rule.range[0], rule.range[1], rand());
        const p = surface(i, t, o);
        const s = lerp(a.s, b.s, t);
        if (!rule.zones.includes(zoneOf(s, p[0], o, relief(s, p[0], p[2], o, edgesAt(s))))) continue;
        if (!seen(p) || p[0] > (rule.xMax ?? Infinity)) continue;
        if (rule.fade && rand() > lerp(1, rule.fade[2], smoothstep(EYE[2] - p[2], rule.fade[0], rule.fade[1]))) continue;
        lowest = Math.min(lowest, p[1]);
        const made = kinds[rule.kind](p, i);
        counts[rule.kind === 'clod' || rule.kind === 'stone' ? 'paint' : 'blade'] += made;
        stats.triangles[rule.kind] = (stats.triangles[rule.kind] ?? 0) + made;
      }
    }
  }
  // Ferns on the grass below the window (positions: SITE.near.ferns).
  for (const [x, z, reach] of N.ferns) {
    stats.ferns++;
    counts.blade += fern(w, [x, groundAt(x, z) - 0.04, z], { reach, rand, P });
  }
  // Driftwood on the mud near the water, and puddles in its hollows, in view.
  const mudSpots = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const st = stations[i], E = edgesAt(st.s);
    for (let o = 0.4; o < E.edge; o += 0.4) {
      const p = surface(i, 0.5, o);
      if (!seen(p) || EYE[2] - p[2] > 30) continue;
      const R = relief(st.s, p[0], p[2], o, E);
      if (MUD.has(zoneOf(st.s, p[0], o, R))) mudSpots.push([i, o, p, R.hollow]);
    }
  }
  const pick = (list) => list.splice(Math.floor(rand() * list.length), 1)[0];
  for (let k = 0; k < D.sticks && mudSpots.length; k++) {
    const [i, , p] = pick(mudSpots);
    const st = stations[i];
    counts.paint += stick(w, p, { length: 0.8 + rand() * 1.4, radius: 0.035 + rand() * 0.04, yaw: Math.atan2(st.tz, st.tx) + (rand() - 0.5) * 1.2, rand, colour: rand() < 0.5 ? P.wood : P.woodPale });
    stats.sticks++;
  }
  const hollows = mudSpots.filter((m) => m[3] > 0.5);
  for (let k = 0; k < D.puddles && hollows.length; k++) {
    const [i, o] = pick(hollows);
    const st = stations[i];
    const rx = 0.35 + rand() * 0.6, rz = 0.18 + rand() * 0.25, yaw = Math.atan2(st.tz, st.tx);
    const ring = [];
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * Math.PI * 2, wob = 1 + (rand() - 0.5) * 0.3;
      const u = Math.cos(a) * rx * wob, v = Math.sin(a) * rz * wob;
      ring.push(surface(i, 0.5, o + v).map((c, d) => c + (d === 0 ? u * Math.cos(yaw) : d === 2 ? u * Math.sin(yaw) : 0)));
    }
    const y = Math.min(...ring.map((p) => p[1])) + 0.012; // flat water at its lowest rim: the ground drowns it where higher
    const c = [ring.reduce((s, p) => s + p[0], 0) / 12, y, ring.reduce((s, p) => s + p[2], 0) / 12];
    for (let j = 0; j < 12; j++) {
      const p = [ring[j][0], y, ring[j][2]], q = [ring[(j + 1) % 12][0], y, ring[(j + 1) % 12][2]];
      if (cross(sub(p, c), sub(q, c))[1] > 0) w.tri('paint', c, p, q, P.puddle);
      else w.tri('paint', c, q, p, P.puddle);
    }
    counts.paint += 12;
    stats.puddles++;
  }

  // Footprints, for the painted map: people walk the worn way to the water and back, mill about
  // where they step into a boat, and walk the track; a few cut across the flat to the water.
  const prints = [];
  const walk = (pts, { stride = T.prints.stride, side = 0.1, kind = 'boot' } = {}) => {
    let carry = rand() * stride * 0.5, foot = rand() < 0.5 ? 1 : -1;
    for (let k = 0; k < pts.length - 1; k++) {
      const [s0, o0] = pts[k], [s1, o1] = pts[k + 1];
      const len = Math.hypot(s1 - s0, o1 - o0);
      if (len < 1e-6) continue;
      const ds = (s1 - s0) / len, dO = (o1 - o0) / len, heading = Math.atan2(dO, ds);
      let t = carry;
      for (; t < len; t += stride / 2) {
        const jitter = (rand() - 0.5) * 0.05;
        prints.push({ s: s0 + ds * t - dO * (foot * side + jitter), o: o0 + dO * t + ds * (foot * side + jitter), a: heading + foot * 0.12 + (rand() - 0.5) * 0.3, foot, kind, size: 0.92 + rand() * 0.18, water: rand() < T.prints.flooded });
        foot = -foot;
      }
      carry = t - len;
    }
  };
  const reversed = [...path].reverse();
  walk(path, { kind: 'boot' });
  walk(reversed.map(([s, o]) => [s + 0.22, o]), { kind: 'bare', side: 0.08 });
  walk(reversed.map(([s, o]) => [s - 0.25, o + 0.1]), { kind: 'boot' });
  const [sEnd, oEnd] = path[path.length - 1];
  for (let k = 0; k < T.prints.landing; k++) {
    const a = (rand() - 0.5) * Math.PI * 1.6 - Math.PI / 2 + (rand() < 0.5 ? Math.PI : 0);
    prints.push({ s: sEnd + (rand() - 0.5) * 2.4, o: oEnd + rand() * 1.6, a, foot: rand() < 0.5 ? 1 : -1, kind: rand() < 0.3 ? 'bare' : 'boot', size: 0.92 + rand() * 0.18, water: rand() < T.prints.flooded * 2 });
  }
  const along = (offset) => {
    const pts = [];
    for (let s = map.s[0] + 2; s < map.s[1] - 2; s += 1) {
      const E = edgesAt(s);
      pts.push([s, (E.berm + E.track) / 2 + offset + 0.18 * Math.sin(s * 0.45 + offset * 9)]);
    }
    return pts;
  };
  walk(along(-0.3));
  walk(along(0.35).reverse(), { kind: 'bare', side: 0.08 });
  for (let k = 0; k < T.prints.crossings; k++) {
    const s0 = lerp(map.s[0] + 4, map.s[1] - 4, rand()), E = edgesAt(s0), turn = (rand() - 0.5) * 4;
    walk([[s0, (E.berm + E.track) / 2], [s0 + turn * 0.5, E.berm * 0.6], [s0 + turn, 0.25]]);
  }
  const kept = prints.filter((f) => {
    if (f.s < map.s[0] + 0.3 || f.s > map.s[1] - 0.3 || f.o < 0.08 || f.o > N.level - 0.3) return false;
    const q = stationAt(f.s), x = q.x + q.nx * f.o, z = q.z + q.nz * f.o;
    return MUD.has(zoneOf(f.s, x, f.o, relief(f.s, x, z, f.o, edgesAt(f.s))));
  });
  stats.prints = kept.length;
  contract.min('footprints on the mud in view', kept.length, 120);

  const ground = w.slot('mud').triangles - from.mud + w.slot('turf').triangles - from.turf;
  contract.min('every plant and stone stands above the water (m)', lowest - S.water, 0);
  contract.min('shrubs in view', stats.shrubs, 12);
  contract.min('grass clumps in view', stats.clumps, 300);
  contract.is('ferns', stats.ferns, N.ferns.length);
  contract.range('ground triangles', ground, T.triangles[0], T.triangles[1]);
  contract.range('plant triangles', w.slot('blade').triangles - from.blade, 10000, 30000);
  stats.triangles.ground = ground;

  // What the painter needs: the map's extent, the ground at any (s, o), and the footprints.
  const trample = {
    s: map.s,
    o: map.o,
    /** The ground at (s, o): mud or grass, how wet, ruts, standing water, the worn way. */
    sample(s, o) {
      const q = stationAt(s), x = q.x + q.nx * o, z = q.z + q.nz * o, E = edgesAt(s);
      const R = relief(s, x, z, o, E);
      const zone = o < 0 ? 'under' : zoneOf(s, x, o, R);
      const edge = E.lip + 0.25 * vnoise(s * 1.7, 3.1, 57 + seed);
      const wet = Math.max(1 - smoothstep(o, edge, edge + T.wet), 0.8 * R.hollow, 0.7 * R.rut);
      const water = R.rut > 0.7 && fbm(s * 0.5, 1.3, 61 + seed) > T.rutWater ? 1 : 0;
      return { mud: MUD.has(zone), zone, wet: Math.min(1, wet), water, rut: R.rut, path: R.onPath };
    },
    prints: kept,
    drag: { from: [sEnd - 0.3, 0], to: [sEnd + 0.6, 2.2], width: 0.55 }, // a hull dragged up from the water
  };
  return { contract: contract.assert(), stats, stations, rows, trample };
}
