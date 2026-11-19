// The bush at the water below the window (pass e5). The user removed our bank: the river runs to
// the house, and one bush close to the window covers the lower left of the view and stands
// straight in the water (reference R4, the user's image; not in the repo). Built after the
// painterly references in research/CREDITS.md (pass e5):
//   - a row of overlapping blobs gives the mass; each has a dark lumpy core (blade slot) so the
//     water and the sky do not show through;
//   - wash leaf cards (leaves.js cell wash) cover the blobs' union, large inside and small at the
//     edge, their tips pointing out, and a few float loose just outside it to break the outline
//     (Maznev, 80.lv);
//   - each card's shading normal comes from the blobby shell, not the card, so the light falls
//     over the bush as one soft mass;
//   - its colour runs along a ramp from a warm yellow-green on top to a cool blue-green in the
//     shade: a depth term and smooth noise (pass e5b: blocky noise gave flat, toon-like patches),
//     plus a hue jitter per card;
//   - red flowers (cell flower) over its upper half, facing out; a fern clump reaching over the
//     water at its right end and a smaller one at the left; grass tufts and a few bare stems
//     where it meets the water.
// Its place comes from the window shot's sight lines (site.js WINDOW_EYE; the window opening in
// interior/plan.js): BUSH.profile is R4's top edge, read off the painting, and the contract checks
// the built bush against it. Sizes are design choices tuned in that shot, not measured.

import * as THREE from 'three';
import { createContract } from './contract.js';
import { SITE, WINDOW_EYE, mulberry32, rgbTable } from './site.js';
import { OUTSIDE_THEME } from '../themes/index.js';
import { LEAF_ATLAS, leafCard } from './leaves.js';
import { fern, grassClump, facing, hueOf, tinted } from './plants.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const UP = [0, 1, 0];
const EYE = WINDOW_EYE;

export const BUSH_PAINT = rgbTable(OUTSIDE_THEME.waterBush);

/**
 * The window shot, as the window's opening sees it (interior/plan.js: the wall at z = -5.5, the
 * opening from x -1.0 to 0.05, the lattice rail's top at y 1.16, the opening's top at 2.25): `f`
 * across the opening from its left edge (0) to its right (1), and the slope of the sight line,
 * `tan` (rise over the distance along -z). Visible when f is in 0..1 and tan above the sill.
 */
export const OPENING = { wall: -5.5, x0: -1.0, x1: 0.05, sill: 1.16, top: 2.25 };
export function inShot(p) {
  const dz = EYE[2] - p[2];
  const xw = EYE[0] + ((p[0] - EYE[0]) * (EYE[2] - OPENING.wall)) / dz;
  return { f: (xw - OPENING.x0) / (OPENING.x1 - OPENING.x0), tan: (p[1] - EYE[1]) / dz, dz };
}
const SILL_TAN = (OPENING.sill - EYE[1]) / (EYE[2] - OPENING.wall);
const TOP_TAN = (OPENING.top - EYE[1]) / (EYE[2] - OPENING.wall);

/** The far waterline's slope straight ahead of the eye (site.js farLine, where it crosses x = eye's x). */
function farWaterTan() {
  const L = SITE.farLine;
  for (let i = 0; i < L.length - 1; i++) {
    const [x0, z0] = L[i], [x1, z1] = L[i + 1];
    if ((x0 - EYE[0]) * (x1 - EYE[0]) <= 0) {
      const z = lerp(z0, z1, (EYE[0] - x0) / (x1 - x0));
      return (SITE.water - EYE[1]) / (EYE[2] - z);
    }
  }
  throw new Error('waterbush: the far waterline does not cross the view');
}

/**
 * The bush (design choices). `profile`: R4's top edge as [f, band], band the height from the sill
 * (0) to the far waterline (1), read off the painting (px, not real sizes). `blobs`: [f, distance
 * from the eye along -z (m), half-width, half-height, half-depth]; each blob is placed in its
 * column and raised until its top meets the profile. Cards, flowers and stems are counts and
 * sizes in metres.
 */
export const BUSH = {
  profile: [[0, 1.0], [0.12, 0.73], [0.2, 0.64], [0.33, 0.37], [0.42, 0.46], [0.53, 0]],
  tolerance: 0.05, // of the opening's height: the contract on the top edge
  blobs: [
    [-0.16, 15.0, 2.4, 2.4, 2.2],
    [-0.02, 14.4, 2.0, 2.2, 1.9],
    [0.08, 13.9, 1.7, 1.8, 1.7],
    [0.17, 13.6, 1.6, 1.6, 1.6],
    [0.25, 13.3, 1.5, 1.4, 1.5],
    [0.32, 13.0, 1.3, 1.1, 1.3],
    [0.39, 12.8, 1.0, 0.8, 1.1],
  ],
  sink: 0.3, // nothing goes deeper than this below the water
  settle: 0.45, // the blobs sit this much (m) lower than their touching sight line: the leaf cards stand out of them
  lumps: 0.22, // the shell's outline is pushed in and out by up to this (m), smooth noise of scale `block`
  block: 0.9,
  cards: { perSquareMetre: 5, length: [0.6, 0.95], edge: 0.6, loose: 0.08, float: 0.15 }, // edge: card size at the shell's outline, of the inner; loose: share that float up to `float` m outside
  shade: { depth: 0.7, noise: 0.65, block: 0.6, jitter: [0.1, 0.08, 0.1] }, // the colour ramp's terms; jitter per card (r, g, b)
  flowers: { count: 20, size: 0.32, upper: 0.45, out: 0.06 }, // upper: only above this height in the blob (of its half-height, from its centre)
  ferns: [
    { f: 0.44, dz: 11, reach: 1.8, fronds: 13, out: [0, 0, 1], rise: [1.0, 0.2], width: 0.22 }, // the upright clump at the right end, in front of the bush (R4); placed by a sweep over 8 seeds against the profile
    { f: 0.02, dz: 12.6, reach: 1.4, fronds: 7, out: [0.3, 0, 0.95], rise: [0.35, 0.2], width: 0.26 }, // a smaller one at the left, in front
  ],
  tufts: { count: 9, height: [0.45, 0.35], blades: 9 },
  stems: { count: 6, length: [1.2, 0.8], radius: 0.025 },
};

/** Blocky value noise in 0..1: one value per cube of `size` m (Maznev's "blocky noise"). */
function blocky(p, size, seed) {
  const i = Math.floor(p[0] / size), j = Math.floor(p[1] / size), k = Math.floor(p[2] / size);
  let h = (i * 374761393 + j * 668265263 + k * 1274126177 + seed * 951274213) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1 (trilinear between the blocky values): soft colour drifts, no patches. */
function smooth(p, size, seed) {
  const q = [p[0] / size, p[1] / size, p[2] / size], i = q.map(Math.floor), f = q.map((v, k) => v - i[k]);
  const s = f.map((v) => v * v * (3 - 2 * v));
  let out = 0;
  for (let c = 0; c < 8; c++) {
    const d = [c & 1, (c >> 1) & 1, (c >> 2) & 1];
    const wgt = d.reduce((m, b, k) => m * (b ? s[k] : 1 - s[k]), 1);
    out += wgt * blocky([(i[0] + d[0]) * size, (i[1] + d[1]) * size, (i[2] + d[2]) * size], size, seed);
  }
  return out;
}

/** The blobs in the world, each raised so its top meets the profile in its column. */
function placeBlobs(profileTan) {
  return BUSH.blobs.map(([f, dz, rx, ry, rz]) => {
    const xw = lerp(OPENING.x0, OPENING.x1, f);
    const z = EYE[2] - dz;
    const x = EYE[0] + ((xw - EYE[0]) * dz) / (EYE[2] - OPENING.wall);
    // the silhouette's top is about where the sight line grazes the blob, a little in front of
    // its top: raise the centre so the grazing line has the profile's slope
    const t = profileTan(Math.max(0, f));
    // the sight line y = eye + t dz touches the ellipse (half-height ry, half-depth rz) from above
    const y = EYE[1] + t * dz - Math.hypot(ry, rz * t) - BUSH.settle;
    return { c: [x, y, z], r: [rx, ry, rz] };
  });
}

/**
 * Builds the bush into `w`: 'blade' (cores, stems, grass), 'leaf' (cards, flowers, fronds).
 * Returns { contract, stats, triangles }.
 */
export function buildWaterBush(w, { seed = 0 } = {}) {
  const rand = mulberry32(83 + seed);
  const P = BUSH_PAINT;
  const water = SITE.water, floor = water - BUSH.sink;
  const farTan = farWaterTan();
  const profileTan = (f) => {
    const L = BUSH.profile;
    if (f <= L[0][0]) return SILL_TAN + (farTan - SILL_TAN) * L[0][1];
    for (let i = 0; i < L.length - 1; i++) {
      if (f <= L[i + 1][0]) return SILL_TAN + (farTan - SILL_TAN) * lerp(L[i][1], L[i + 1][1], (f - L[i][0]) / (L[i + 1][0] - L[i][0]));
    }
    return SILL_TAN;
  };
  const blobs = placeBlobs(profileTan);
  // The blobby field: above 1 inside. Its gradient gives the shell's normals.
  const field = (p) => {
    let s = 0;
    for (const { c, r } of blobs) {
      const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
      s += Math.exp(-3 * (dot(q, q) - 1));
    }
    return s;
  };
  const shellNormal = (p) => {
    const e = 0.05;
    return norm([0, 1, 2].map((i) => {
      const a = [...p], b = [...p];
      a[i] += e;
      b[i] -= e;
      return field(b) - field(a);
    }));
  };
  // A point on the shell along the ray from a blob's centre: bisection on the field.
  const onShell = (c, dir, rMax) => {
    let lo = 0, hi = rMax * 1.6;
    for (let k = 0; k < 22; k++) {
      const m = (lo + hi) / 2;
      if (field(add(c, dir, m)) > 1) lo = m;
      else hi = m;
    }
    return add(c, dir, lo);
  };
  const ramp = (s) => {
    const R = P.ramp, x = Math.min(0.999, Math.max(0, s)) * (R.length - 1), i = Math.floor(x);
    return lerp3(R[i], R[i + 1], x - i);
  };
  const tris = { core: 0, cards: 0, flowers: 0, ferns: 0, tufts: 0, stems: 0 };
  const stats = { cards: 0, loose: 0, maxFloat: 0, flowers: 0, belowWater: 0 };
  const leafTips = []; // every card corner, for the contract

  // --- Cores: a lumpy icosahedron per blob, a little inside the shell, cut off below the floor --
  const ico = new THREE.IcosahedronGeometry(1, 2);
  const ip = ico.attributes.position;
  const unit = [];
  for (let i = 0; i < ip.count; i++) unit.push([ip.getX(i), ip.getY(i), ip.getZ(i)]);
  ico.dispose();
  for (const { c, r } of blobs) {
    const at = (u) => {
      const k = 0.82 + 0.12 * blocky(add(c, scale(u, 2)), 0.7, seed);
      const p = [c[0] + u[0] * r[0] * k, c[1] + u[1] * r[1] * k, c[2] + u[2] * r[2] * k];
      p[1] = Math.max(floor, p[1]);
      return p;
    };
    for (let i = 0; i < unit.length; i += 3) {
      const a = at(unit[i]), b = at(unit[i + 1]), d = at(unit[i + 2]);
      if (Math.max(a[1], b[1], d[1]) <= floor + 1e-6) continue;
      const n = [unit[i], unit[i + 1], unit[i + 2]].map((u) => norm([u[0] / r[0], u[1] / r[1], u[2] / r[2]]));
      w.smoothTri('blade', [a, b, d], n, null, P.core);
      tris.core++;
    }
  }

  // --- Leaf cards over the union of the blobs ---------------------------------------------------
  const C = BUSH.cards;
  const shellPoints = [];
  for (const [bi, { c, r }] of blobs.entries()) {
    const area = (4 * Math.PI * (r[0] * r[1] + r[1] * r[2] + r[0] * r[2])) / 3; // an ellipsoid's area, roughly
    const count = Math.round(area * C.perSquareMetre);
    for (let k = 0; k < count; k++) {
      // an even spread over the sphere (Fibonacci), then out along it to the shell
      const t = (k + 0.5) / count, phi = Math.acos(1 - 2 * t), th = k * 2.39996323 + bi;
      const u = [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
      const dir = norm([u[0] * r[0], u[1] * r[1], u[2] * r[2]]);
      let p = onShell(c, dir, Math.max(...r));
      // only the shell of the union: a point deep inside another blob is covered
      if (blobs.some((o, oi) => oi !== bi && (() => {
        const q = [(p[0] - o.c[0]) / o.r[0], (p[1] - o.c[1]) / o.r[1], (p[2] - o.c[2]) / o.r[2]];
        return dot(q, q) < 0.8;
      })())) continue;
      if (p[1] < water - 0.05) continue; // under the water: never seen
      const n = shellNormal(p);
      p = add(p, n, BUSH.lumps * (2 * smooth(p, BUSH.block, seed + 1) - 1));
      shellPoints.push({ p, n, blob: bi });
    }
  }
  for (const { p, n, blob } of shellPoints) {
    const { c, r } = blobs[blob];
    const h = (p[1] - c[1]) / r[1]; // -1 under .. 1 on top
    const toEye = norm(sub(EYE, p));
    const rim = 1 - Math.abs(dot(n, toEye)); // 1 at the outline seen from the window
    const loose = rand() < C.loose;
    const float = loose ? C.float * (0.3 + 0.7 * rand()) : 0;
    const len = lerp(C.length[0], C.length[1], rand()) * lerp(1, C.edge, rim) * (loose ? 0.7 : 1);
    // its base a little inside the shell, its tip out and a little up; turned to face the eye
    const base = add(p, n, float - len * 0.45);
    let up = norm(add(add(n, UP, 0.35), [(rand() - 0.5) * 0.6, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.6]));
    let side = cross(up, toEye);
    if (Math.hypot(...side) < 0.1) side = cross(up, [1, 0, 0]);
    side = norm(side);
    if (rand() < 0.5) side = scale(side, -1); // mirrored: the one painted cell reads as two
    // colour: dark inside and underneath, drifting with smooth noise, then a jitter per card
    const depth = 0.5 * (1 - h) * (1 - 0.4 * rim);
    // two scales of smooth noise: broad drifts of warm and cool, and smaller pools of shade
    const drift = 0.65 * smooth(p, BUSH.shade.block * 2.5, seed + 2) + 0.35 * smooth(p, BUSH.shade.block, seed + 3);
    const s = BUSH.shade.depth * depth + BUSH.shade.noise * drift ** 1.4 + (float ? -0.12 : 0);
    const colour = tinted(ramp(s), hueOf(rand, BUSH.shade.jitter));
    // the shell's normal at each corner: base left, base right, tip right, tip left
    const width = len * 0.95;
    const corners = [add(base, side, -width / 2), add(base, side, width / 2), add(add(base, up, len), side, width / 2), add(add(base, up, len), side, -width / 2)];
    if (Math.min(...corners.map((q) => q[1])) < floor) continue; // nothing deeper than the floor
    const normals = corners.map((q) => shellNormal(q));
    tris.cards += leafCard(w, base, up, side, { length: len, width, cell: LEAF_ATLAS.cell.wash, normal: normals, colour, eye: EYE });
    stats.cards++;
    if (loose) stats.loose++, (stats.maxFloat = Math.max(stats.maxFloat, float));
    for (const q of corners) {
      leafTips.push(q);
      if (q[1] < water) stats.belowWater = Math.max(stats.belowWater, water - q[1]);
    }
  }

  // --- Flowers: over the upper half, on the side the window sees, facing out --------------------
  const F = BUSH.flowers;
  const candidates = shellPoints.filter(({ p, n, blob }) => (p[1] - blobs[blob].c[1]) / blobs[blob].r[1] > F.upper && dot(n, norm(sub(EYE, p))) > 0.35);
  for (let k = 0; k < F.count && candidates.length; k++) {
    const { p, n } = candidates.splice(Math.floor(rand() * candidates.length), 1)[0];
    const size = F.size * (0.8 + 0.4 * rand());
    const centre = add(p, n, F.out);
    const face = norm(add(n, norm(sub(EYE, centre)), 1.2)); // mostly towards the window
    let side = norm(cross(UP, face));
    if (Math.hypot(...side) < 0.1) side = [1, 0, 0];
    const up = norm(cross(face, side));
    tris.flowers += leafCard(w, add(centre, up, -size / 2), up, side, { length: size, width: size, cell: LEAF_ATLAS.cell.flower, normal: face, colour: lerp3(P.flowerDeep, P.flower, rand()), eye: EYE });
    stats.flowers++;
  }

  // --- Ferns, from just above the water at the bush's front --------------------------------------
  const fernPaint = { fern: P.fern, fernLight: P.fernLight };
  const fernTops = [];
  for (const Q of BUSH.ferns) {
    const xw = lerp(OPENING.x0, OPENING.x1, Q.f);
    const at = [EYE[0] + ((xw - EYE[0]) * Q.dz) / (EYE[2] - OPENING.wall), water + 0.1, EYE[2] - Q.dz];
    const before = w.slot('leaf').position.length;
    tris.ferns += fern(w, at, { reach: Q.reach, rand, P: fernPaint, fronds: Q.fronds, out: norm(Q.out), rise: Q.rise, width: Q.width });
    const pos = w.slot('leaf').position;
    for (let i = before; i < pos.length; i += 3) fernTops.push([pos[i], pos[i + 1], pos[i + 2]]);
  }

  // --- Where it meets the water: grass tufts along its front, and bare stems dipping in ---------
  const front = shellPoints.filter(({ p, n }) => p[1] < water + 0.6 && dot(n, norm(sub(EYE, p))) > 0.2);
  const T = BUSH.tufts;
  const grassPaint = { blade: P.blade, straw: P.straw, seedHead: P.seedHead };
  for (let k = 0; k < T.count && front.length; k++) {
    const { p, n } = front[Math.floor(rand() * front.length)];
    const at = [p[0] + n[0] * 0.15, water, p[2] + n[2] * 0.15];
    tris.tufts += grassClump(w, at, { blades: T.blades, height: T.height[0] + rand() * T.height[1], spread: 0.12, lean: 0.5, out: norm([n[0], 0, n[2]]), heads: 0.1, rand, P: grassPaint });
  }
  const S = BUSH.stems;
  const stemRoots = [], stemTips = [];
  for (let k = 0; k < S.count && front.length; k++) {
    const { p, n } = front[Math.floor(rand() * front.length)];
    const root = add(p, n, -0.3); // inside the shell
    const out = norm([n[0], 0, n[2]]);
    const L = S.length[0] + rand() * S.length[1];
    // an arc out over the water and down into it
    const tip = [root[0] + out[0] * L * 0.8, water - 0.12, root[2] + out[2] * L * 0.8];
    const ctrl = add(add(root, out, L * 0.6), UP, 0.25);
    const pt = (t) => [0, 1, 2].map((i) => (1 - t) * (1 - t) * root[i] + 2 * (1 - t) * t * ctrl[i] + t * t * tip[i]);
    const side = norm(cross(out, UP));
    const segs = 5;
    for (let j = 0; j < segs; j++) {
      const t0 = j / segs, t1 = (j + 1) / segs, a = pt(t0), b = pt(t1);
      const w0 = S.radius * (1 - 0.7 * t0), w1 = S.radius * (1 - 0.7 * t1);
      facing(w, 'blade', add(a, side, -w0), add(a, side, w0), add(b, side, w1), P.stem, UP);
      facing(w, 'blade', add(a, side, -w0), add(b, side, w1), add(b, side, -w1), P.stem, UP);
      tris.stems += 2;
    }
    stemRoots.push(root);
    stemTips.push(tip);
  }

  // --- Contract -----------------------------------------------------------------------------------
  const c = createContract('water bush');
  const height = TOP_TAN - SILL_TAN;
  const visible = [...leafTips, ...fernTops].map(inShot).filter((v) => v.tan > SILL_TAN && v.f >= 0 && v.f <= 1);
  // the top edge, column by column, against R4's profile
  let worst = 0, worstAt = 0;
  stats.profile = []; // [f, the bush's top minus R4's, of the opening's height]
  for (let f = 0.03; f <= 0.5; f += 0.03) {
    const col = visible.filter((v) => Math.abs(v.f - f) < 0.015);
    const top = col.length ? Math.max(...col.map((v) => v.tan)) : SILL_TAN;
    const off = (top - profileTan(f)) / height;
    stats.profile.push([+f.toFixed(2), +off.toFixed(3)]);
    if (Math.abs(off) > worst) (worst = Math.abs(off)), (worstAt = f);
  }
  c.max(`top edge off R4's profile, of the opening's height (worst at f ${worstAt.toFixed(2)})`, worst, BUSH.tolerance);
  // the near boat stays in view: nothing of the bush rises to its waterline in its column
  const boat = SITE.boats[0];
  const boatAt = inShot([boat.x, water, boat.z]);
  const atBoat = visible.filter((v) => Math.abs(v.f - boatAt.f) < 0.04);
  c.max('bush top below the near boat\'s waterline (tan)', atBoat.length ? Math.max(...atBoat.map((v) => v.tan)) : SILL_TAN, boatAt.tan);
  // the lower right of the frame is open water
  c.max('right edge of the bush in the opening (f)', Math.max(...visible.map((v) => v.f)), 0.62);
  c.max('deepest leaf below the water (m)', stats.belowWater, BUSH.sink);
  c.max('loose cards float at most (m)', stats.maxFloat, BUSH.cards.float);
  c.min('stems rooted inside the bush (all)', stemRoots.filter((r) => field(r) > 1).length, stemRoots.length);
  c.min('stems that dip into the water (all)', stemTips.filter((t) => t[1] < water).length, stemTips.length);
  c.range('leaf cards', stats.cards, 500, 1200); // 724-730 built (seeds 0-7)
  c.range('flowers', stats.flowers, 8, 30);
  c.range('triangles, leaves (cards, flowers, ferns)', tris.cards + tris.flowers + tris.ferns, 1200, 3600); // 1,848-1,860 built (seeds 0-7)
  c.range('triangles, cores, grass and stems', tris.core + tris.tufts + tris.stems, 1000, 3000); // 1,576-1,612 built (seeds 0-7)
  return { contract: c.assert(), stats: { ...stats, blobs: blobs.map((b) => b.c.map((v) => +v.toFixed(2))) }, triangles: tris };
}
