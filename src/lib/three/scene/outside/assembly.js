// The Sarawak State Legislative Assembly building (Dewan Undangan Negeri), seen across the river.
// Built the way .claude/skills/threejs-procedural-architecture asks: settings -> a serialisable
// plan (tiers and module placements, checked) -> registered module builders -> triangles per
// material slot. Nothing here makes triangles while deciding the building.
//
// Sourced: 114 m tall, a nine-pointed-star plan, an umbrella ("payung negara") roof
// (https://en.wikipedia.org/wiki/New_Sarawak_State_Legislative_Assembly_Building).
// Everything else is read off two photos the user supplied (2026-11-11; P1 a front view from the
// river, P2 a raised view; source unknown, not in the repo), measured in pixels and scaled by the
// sourced height. The two photos disagree by a few metres on the upper heights (P1 is taken from
// low down, P2 from above), so heights sit between them. Bottom to top:
//   - an arcade of white "tree" columns whose arms meet in pointed arches and bow outwards to
//     carry the brim, dark red-brown infill with floor bands behind them (0-26 m);
//   - a thin white brim well out past the columns (seen from the river its near edge looks
//     higher than its sides, which can read as a second ring: it is one);
//   - nine gold pyramids on the brim, one per point of the star;
//   - an inverted cone of crossing struts under the roof (27-49 m);
//   - the roof: a folded plate of 18 folds, tips hanging down and out at the eave inside a grey
//     zigzag fascia, sweeping up concave to a ribbed bronze cone and a needle;
//   - small copies of the roof as kiosks on a terrace in front, two larger ones at the sides.

import { createContract } from './contract.js';

export const ASSEMBLY = {
  height: 114, // sourced
  points: 9, // sourced: nine-pointed star; its points carry the pyramids
  // The plan is a nine-pointed star (sourced), points at 0, 40, 80 ... degrees, point 0 facing
  // the river. A scale model (TVS news photo, 9 May 2024) shows it clearly from above: the brim is
  // a deep star, a pyramid on each point with the white tip running out beyond it; the arcade
  // follows the star more gently. Tip and valley radii are estimates.
  podium: { tip: 66, valley: 56, height: 2 },
  // columns on a ring; each arch bows out as it rises, so the arms carry the brim (P2)
  arcade: { tip: 63, valley: 53, inset: 2.5, top: 26, columns: 45, spring: 0.5, reach: 2, floors: 3 }, // 5 columns per point
  cornice: { tip: 76, valley: 56, depth: 1.3 }, // a thin star-shaped brim; the arms flare out to carry its tips (P2, model)
  pyramid: { radius: 47, base: 24, height: 10.5 }, // one on each point of the brim (model; P2: ~26 x 9.5 m)
  drum: { r0: 27, r1: 35, top: 48.6, struts: 36, lean: 1.5 }, // inverted cone of crossing struts
  roof: { folds: 18, valley: 51, rValley: 37, rTip: 45, tipDrop: 3.5, top: 82, neck: 5.5, power: 2, rings: 16, fascia: 2.2 },
  cone: { top: 100, r0: 5.5, r1: 1.0, ribs: 12, bands: [88, 94] }, // the ribbed spire base (P2)
  kiosk: { folds: 8, rValley: 3.4, rTip: 4.4, eave: 3.4, top: 6.2, spire: 7.4, legs: 2.6 },
  kioskRow: { half: 3.4, eave: 3.4, rise: 2.6, fork: 1.6 }, // the front five (P2): about 7 m square
  kiosks: { row: [-22, -11, 0, 11, 22], rowZ: 82, sides: [-72, 72], sideZ: 42, sideScale: 1.7 },
  terrace: { z: 82, halfX: 30, halfZ: 7, height: 0.8 },
  colors: {
    gold: [0.92, 0.63, 0.08], // authored deep: the haze and the room's grade lift it to the photos' yellow gold
    goldShade: [0.66, 0.41, 0.04], // every other roof facet: the ink pass draws the folds
    bronze: [0.78, 0.56, 0.28],
    fascia: [0.66, 0.67, 0.69],
    white: [0.97, 0.94, 0.87],
    soffit: [0.66, 0.62, 0.56],
    infill: [0.27, 0.17, 0.14],
    band: [0.46, 0.3, 0.24],
    dark: [0.2, 0.17, 0.16],
    stone: [0.9, 0.88, 0.82],
  },
};

/** Tiers (bottom to top) and module placements. Pure data: no geometry. */
export function planAssembly(settings = ASSEMBLY) {
  const s = settings;
  const tiers = [
    { name: 'podium', y0: 0, y1: s.podium.height },
    { name: 'arcade', y0: s.podium.height, y1: s.arcade.top },
    { name: 'cornice', y0: s.arcade.top, y1: s.arcade.top + s.cornice.depth },
    { name: 'drum', y0: s.arcade.top + s.cornice.depth, y1: s.drum.top },
    { name: 'roof', y0: s.roof.valley - s.roof.tipDrop, y1: s.roof.top },
    { name: 'cone', y0: s.roof.top, y1: s.cone.top },
    { name: 'needle', y0: s.cone.top, y1: s.height },
  ];
  const placements = [];
  const add = (module, tier, extra = {}) => placements.push({ module, tier, ...extra });
  for (let i = 0; i < s.arcade.columns; i++) add('tree-column', 'arcade', { index: i });
  for (let i = 0; i < s.drum.struts * 2; i++) add('drum-strut', 'drum', { index: i });
  for (let i = 0; i < s.points; i++) add('pyramid', 'cornice', { index: i });
  s.kiosks.row.forEach((x, i) => add('kiosk', 'podium', { index: i, x, z: s.kiosks.rowZ, scale: 1 }));
  s.kiosks.sides.forEach((x, i) => add('kiosk', 'podium', { index: s.kiosks.row.length + i, x, z: s.kiosks.sideZ, scale: s.kiosks.sideScale }));
  for (const [module, tier] of [['podium', 'podium'], ['terrace', 'podium'], ['infill', 'arcade'], ['cornice', 'cornice'], ['drum-core', 'drum'], ['payung', 'roof'], ['cone', 'cone'], ['needle', 'needle']]) add(module, tier);
  // Each surface region has one owner.
  const seen = new Set();
  const duplicates = [];
  for (const p of placements) {
    const key = [p.module, p.tier, p.index ?? ''].join(':');
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }
  return { settings: s, tiers, placements, diagnostics: { duplicateSurfaceOwners: duplicates } };
}

// --- Small geometry helpers (building frame: y up, front towards +z) --------------------------

const P = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
const radiusAt = (r, a) => (typeof r === 'function' ? r(a) : r);

/**
 * The radius of a star outline at angle a: `n` points of radius `tip` at a = 2 pi k / n, valleys of
 * radius `valley` half way between, joined by straight edges.
 */
export function star(n, tip, valley) {
  const step = Math.PI / n;
  return (a) => {
    const t = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const i = Math.floor(t / step);
    const a0 = i * step, a1 = (i + 1) * step;
    const r0 = i % 2 === 0 ? tip : valley, r1 = i % 2 === 0 ? valley : tip;
    // the ray at angle t meets the edge from (a0, r0) to (a1, r1)
    const p0 = [Math.sin(a0) * r0, Math.cos(a0) * r0], p1 = [Math.sin(a1) * r1, Math.cos(a1) * r1];
    const d = [Math.sin(t), Math.cos(t)];
    const e = [p1[0] - p0[0], p1[1] - p0[1]];
    const den = d[0] * e[1] - d[1] * e[0];
    return (p0[0] * e[1] - p0[1] * e[0]) / den;
  };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const offset = (p, ...terms) => {
  const o = [...p];
  for (const [v, k] of terms) for (let i = 0; i < 3; i++) o[i] += v[i] * k;
  return o;
};

/**
 * A straight member from a to b, `w` wide and `d` deep, its front facing `out` (roughly).
 * Only the faces that can be seen are written: front and both sides (back too if `back`).
 */
function beam(writer, slot, a, b, out, w, d, color, back = false) {
  const axis = sub(b, a);
  const side = norm(cross(axis, out));
  const front = norm(cross(side, axis));
  const c = (p, sx, sf) => offset(p, [side, (sx * w) / 2], [front, (sf * d) / 2]);
  writer.quad(slot, c(a, -1, 1), c(a, 1, 1), c(b, 1, 1), c(b, -1, 1), color); // front
  writer.quad(slot, c(a, 1, 1), c(a, 1, -1), c(b, 1, -1), c(b, 1, 1), color); // +side
  writer.quad(slot, c(a, -1, -1), c(a, -1, 1), c(b, -1, 1), c(b, -1, -1), color); // -side
  if (back) writer.quad(slot, c(a, 1, -1), c(a, -1, -1), c(b, -1, -1), c(b, 1, -1), color);
}

/** A band of quads between two circles (r0 at y0, r1 at y1), facing outwards (or inwards). */
function band(writer, slot, segs, r0, y0, r1, y1, color, inward = false, a0 = 0) {
  for (let i = 0; i < segs; i++) {
    const p = a0 + (i / segs) * Math.PI * 2, q = a0 + ((i + 1) / segs) * Math.PI * 2;
    const [a, b, c, d] = [radiusAt(r0, p), radiusAt(r0, q), radiusAt(r1, q), radiusAt(r1, p)];
    if (inward) writer.quad(slot, P(q, b, y0), P(p, a, y0), P(p, d, y1), P(q, c, y1), color);
    else writer.quad(slot, P(p, a, y0), P(q, b, y0), P(q, c, y1), P(p, d, y1), color);
  }
}

/** A flat ring at height y from r0 (inner) to r1 (outer), facing up (or down). */
function annulus(writer, slot, segs, r0, r1, y, color, down = false) {
  for (let i = 0; i < segs; i++) {
    const p = (i / segs) * Math.PI * 2, q = ((i + 1) / segs) * Math.PI * 2;
    const [i0, i1, o0, o1] = [radiusAt(r0, p), radiusAt(r0, q), radiusAt(r1, p), radiusAt(r1, q)];
    if (down) writer.quad(slot, P(p, i0, y), P(q, i1, y), P(q, o1, y), P(p, o0, y), color);
    else writer.quad(slot, P(p, i0, y), P(p, o0, y), P(q, o1, y), P(q, i1, y), color);
  }
}

/**
 * The folded umbrella roof, used for the building and (scaled) for the kiosks. Returns the eave's
 * zigzag (fascia bottom points) for the soffit. `c` centre [x, y, z]; sizes in metres from c.
 */
function payung(writer, c, R, colors, { rings = R.rings, gold = 'gold' } = {}) {
  const m = R.folds * 2;
  const ring = (k) => {
    const f = k / rings;
    const base = (R.rValley - R.neck) * (1 - f) ** R.power + R.neck; // the valleys' profile (fitted to P1)
    const amp = ((R.rTip - R.rValley) / R.rValley) * base * (1 - 0.45 * f); // the folds run up to the spire, in proportion (P2)
    const y = R.valley + (R.top - R.valley) * f;
    const pts = [];
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2;
      const tip = i % 2 === 0;
      const r = tip ? base + amp : base;
      pts.push([c[0] + Math.sin(a) * r, c[1] + y - (tip ? R.tipDrop * (1 - f) ** 3 : 0), c[2] + Math.cos(a) * r]);
    }
    return pts;
  };
  let lower = ring(0);
  const eave = lower;
  for (let k = 1; k <= rings; k++) {
    const upper = ring(k);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      writer.quad(gold, lower[i], lower[j], upper[j], upper[i], i % 2 === 0 ? colors.gold : colors.goldShade);
    }
    lower = upper;
  }
  // the fascia: a grey band hanging under the zigzag edge
  const drop = (p) => [p[0], p[1] - R.fascia, p[2]];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    writer.quad('stone', drop(eave[i]), drop(eave[j]), eave[j], eave[i], colors.fascia);
  }
  return { eave: eave.map(drop), top: lower };
}

/** One arm of an arch: from a column's spring point to the apex, `n` straight pieces. */
function archArm(pointAt, h, rise, pointed, n = 4) {
  const pts = [];
  if (pointed) {
    // a circle centred level with the spring, on the far side of the bay: starts vertical,
    // meets the other arm at a point
    const rho = (h * h + rise * rise) / (2 * h);
    const tMax = Math.acos(1 - h / rho);
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * tMax;
      pts.push(pointAt(rho - rho * Math.cos(t), rho * Math.sin(t)));
    }
  } else {
    // a quarter ellipse: a low, rounded arch
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * (Math.PI / 2);
      pts.push(pointAt(h * (1 - Math.cos(t)), rise * Math.sin(t)));
    }
  }
  return pts;
}

/**
 * A ring of "tree" columns: each a shaft rising to the spring height, then two arms curving into
 * the bays on either side, where they meet the neighbours' arms. A thin mullion stands in the
 * middle of each bay up to the apex.
 */
function treeColumn(writer, { index, count, ring, brim, y0, y1, spring, reach, shaft, arm, mullion, color }) {
  const da = (Math.PI * 2) / count;
  const a = index * da;
  const ys = y0 + (y1 - y0) * spring;
  const rise = y1 - 0.2 - ys;
  const span = reach * da; // how far round each arm reaches, as an angle (photos: two bays)
  const out = (ang) => [Math.sin(ang), 0, Math.cos(ang)];
  beam(writer, 'rib', P(a, ring(a), y0), P(a, ring(a), ys + 0.2), out(a), shaft, shaft * 1.3, color);
  const n = 6;
  for (const dir of [-1, 1]) {
    // a quarter ellipse: leaves the column upright, reaches the brim above the column two bays
    // away. Neighbouring arms cross: the lower crossing is the arch's point (about two thirds of
    // the way up), the upper one sits over the next column (interlaced arches, P1 and P2). As it
    // rises the arm flares out from the column ring to just inside the brim's edge, so under each
    // point of the star the arms reach far out to carry it (P2, model).
    const at = (u) => {
      const ang = a + dir * span * (1 - Math.cos(u));
      const f = Math.sin(u);
      return { ang, p: P(ang, ring(ang) + (brim(ang) - 1.5 - ring(ang)) * f * f, ys + rise * f) };
    };
    for (let k = 0; k < n; k++) {
      const u0 = (k / n) * (Math.PI / 2), u1 = ((k + 1) / n) * (Math.PI / 2);
      beam(writer, 'rib', at(u0).p, at(u1).p, out(at((u0 + u1) / 2).ang), arm, arm * 1.3, color);
    }
  }
  // a thin mullion in the middle of each bay, up to where the arms cross
  const cross = rise * Math.sin(Math.acos(1 - 1 / (2 * reach)));
  const m = a + da / 2;
  if (mullion) beam(writer, 'rib', P(m, ring(m) - 0.6, y0), P(m, ring(m) - 0.6, ys + cross), out(m), mullion, mullion, color);
}

const MODULES = {
  'tree-column'(ctx, p) {
    const { s, C } = ctx;
    const A = s.arcade;
    treeColumn(ctx.writer, { index: p.index, count: A.columns, ring: ctx.shape.ring, brim: ctx.shape.brim, y0: s.podium.height, y1: A.top, spring: A.spring, reach: A.reach, shaft: 1.2, arm: 0.7, mullion: 0.35, color: C.white });
  },
  'drum-strut'(ctx, p) {
    // crossing struts: half lean one way, half the other, so they read as an X lattice
    const { s, C } = ctx;
    const D = s.drum;
    const n = D.struts;
    const i = p.index % n;
    const dir = p.index < n ? 1 : -1;
    const a0 = (i / n) * Math.PI * 2;
    const a1 = a0 + (dir * D.lean * Math.PI * 2) / n;
    const y0 = s.arcade.top + s.cornice.depth;
    const mid = (a0 + a1) / 2;
    beam(ctx.writer, 'rib', P(a0, D.r0, y0), P(a1, D.r1, D.top), [Math.sin(mid), 0.4, Math.cos(mid)], 0.6, 0.7, C.white);
  },
  pyramid(ctx, p) {
    const { s, C, writer } = ctx;
    const Y = s.pyramid;
    const a = (p.index / s.points) * Math.PI * 2; // point 0 faces the river (P1 has one front and centre)
    const y = s.arcade.top + s.cornice.depth;
    const centre = P(a, Y.radius, y);
    const u = [Math.cos(a), 0, -Math.sin(a)]; // along the ring
    const v = [Math.sin(a), 0, Math.cos(a)]; // outwards
    const k = Y.base / 2;
    const corner = (cu, cv) => offset(centre, [u, cu * k], [v, cv * k]);
    const base = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)]; // outer edge first
    const apex = [centre[0], y + Y.height, centre[2]];
    for (let i = 0; i < 4; i++) writer.tri('gold', base[i], base[(i + 1) % 4], apex, i % 2 === 0 ? C.gold : C.goldShade);
  },
  kiosk(ctx, p) {
    const { s, C, writer } = ctx;
    const K = s.kiosk;
    const k = p.scale;
    const light = { ...C, gold: [1.0, 0.8, 0.42], goldShade: [0.88, 0.66, 0.3] };
    if (p.scale > 1) {
      // the two at the sides: small copies of the main roof on four legs, with a spire (P1, P2)
      const y = 0;
      const c = [p.x, y, p.z];
      const R = { folds: K.folds, valley: K.eave * k, rValley: K.rValley * k, rTip: K.rTip * k, tipDrop: 0.5 * k, top: K.top * k, neck: 0.35 * k, power: 1.6, fascia: 0.25 * k };
      payung(writer, c, R, light, { rings: 5 });
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const foot = [c[0] + Math.sin(a) * K.legs * k, y, c[2] + Math.cos(a) * K.legs * k];
        beam(writer, 'rib', foot, [foot[0], y + K.eave * k - 0.3, foot[2]], [Math.sin(a), 0, Math.cos(a)], 0.22 * k, 0.22 * k, C.white, true);
      }
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
        const r = 0.3 * k;
        writer.tri('gold', [c[0] + Math.sin(a0) * r, y + K.top * k - 0.2, c[2] + Math.cos(a0) * r], [c[0] + Math.sin(a1) * r, y + K.top * k - 0.2, c[2] + Math.cos(a1) * r], [c[0], y + K.spire * k, c[2]], C.bronze);
      }
      return;
    }
    // the five in front: a square, slightly concave pyramid roof on a white post that branches
    // into four arms (P2)
    const y = s.terrace.height;
    const Q = s.kioskRow;
    const corner = (i, half, h) => {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      return [p.x + Math.sin(a) * half * Math.SQRT2, y + h, p.z + Math.cos(a) * half * Math.SQRT2];
    };
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const col = i % 2 ? light.goldShade : light.gold;
      // lower skirt (shallow), then the steeper upper part: a concave profile
      writer.quad('gold', corner(i, Q.half, Q.eave), corner(j, Q.half, Q.eave), corner(j, Q.half * 0.5, Q.eave + Q.rise * 0.35), corner(i, Q.half * 0.5, Q.eave + Q.rise * 0.35), col);
      writer.tri('gold', corner(i, Q.half * 0.5, Q.eave + Q.rise * 0.35), corner(j, Q.half * 0.5, Q.eave + Q.rise * 0.35), [p.x, y + Q.eave + Q.rise, p.z], col);
    }
    const fork = [p.x, y + Q.fork, p.z];
    beam(writer, 'rib', [p.x, y, p.z], fork, [0, 0, 1], 0.4, 0.4, C.white, true);
    for (let i = 0; i < 4; i++) beam(writer, 'rib', fork, corner(i, Q.half * 0.75, Q.eave - 0.1), [0, 0, 1], 0.25, 0.25, C.white, true);
  },
  podium({ s, C, writer, shape }) {
    band(writer, 'stone', 90, shape.podium, 0, shape.podium, s.podium.height, C.stone, false, 0);
    annulus(writer, 'stone', 90, shape.infill, shape.podium, s.podium.height, C.stone);
  },
  terrace({ s, C, writer }) {
    const T = s.terrace;
    writer.box('stone', [0, T.height / 2, T.z], [T.halfX, 0, 0], [0, T.height / 2, 0], [0, 0, T.halfZ], C.stone);
  },
  infill({ s, C, writer, shape }) {
    // dark red-brown glass and spandrels with lighter floor bands (P1, P2)
    const A = s.arcade;
    const y0 = s.podium.height;
    const step = (A.top - y0) / A.floors;
    for (let f = 0; f < A.floors; f++) {
      const yb = y0 + f * step;
      band(writer, 'glass', 90, shape.infill, yb, shape.infill, yb + step - 1, C.infill);
      band(writer, 'glass', 90, shape.infill, yb + step - 1, shape.infill, yb + step, C.band);
    }
  },
  cornice({ s, C, writer, shape }) {
    // the star-shaped brim: 90 segments put a vertex on every point and every valley
    const y = s.arcade.top;
    const top = y + s.cornice.depth;
    annulus(writer, 'stone', 90, s.drum.r0 - 3, shape.brim, top, C.white);
    band(writer, 'stone', 90, shape.brim, y, shape.brim, top, C.white);
    annulus(writer, 'stone', 90, shape.infill, shape.brim, y, C.soffit, true);
  },
  'drum-core'({ s, C, writer }) {
    // the glass core inside the strut cone: dark, with floor bands
    const D = s.drum;
    const y0 = s.arcade.top + s.cornice.depth;
    const levels = 4;
    for (let k = 0; k < levels; k++) {
      const f0 = k / levels, f1 = (k + 1) / levels;
      const r = (f) => D.r0 - 3 + (D.r1 - 3 - (D.r0 - 3)) * f;
      const y = (f) => y0 + (D.top - y0) * f;
      band(writer, 'glass', 36, r(f0), y(f0), r(f1 - 0.04), y(f1 - 0.04), C.dark);
      band(writer, 'glass', 36, r(f1 - 0.04), y(f1 - 0.04), r(f1), y(f1), C.band);
    }
  },
  payung({ s, C, writer }) {
    const R = s.roof;
    const { eave } = payung(writer, [0, 0, 0], R, C);
    // soffit: from the fascia's lower edge in to the top of the strut cone
    const m = eave.length;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const a = (i / m) * Math.PI * 2, b = (j / m) * Math.PI * 2;
      writer.quad('stone', eave[j], eave[i], P(a, s.drum.r1, s.drum.top), P(b, s.drum.r1, s.drum.top), C.soffit);
    }
  },
  cone({ s, C, writer }) {
    // the ribbed spire base: alternate light and dark panels read as an open lattice (P2)
    const K = s.cone;
    const y0 = s.roof.top;
    const r = (y) => K.r0 + ((K.r1 - K.r0) * (y - y0)) / (K.top - y0);
    const stops = [y0, ...K.bands, K.top];
    for (let k = 0; k < stops.length - 1; k++) {
      for (let i = 0; i < K.ribs; i++) {
        const a = (i / K.ribs) * Math.PI * 2, b = ((i + 1) / K.ribs) * Math.PI * 2;
        writer.quad('gold', P(a, r(stops[k]), stops[k]), P(b, r(stops[k]), stops[k]), P(b, r(stops[k + 1]), stops[k + 1]), P(a, r(stops[k + 1]), stops[k + 1]), i % 2 ? C.bronze : C.dark);
      }
    }
    for (const y of K.bands) band(writer, 'gold', K.ribs, r(y) + 0.35, y - 0.5, r(y) + 0.35, y + 0.5, C.gold);
  },
  needle({ s, C, writer }) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, b = ((i + 1) / 6) * Math.PI * 2;
      writer.tri('gold', P(a, s.cone.r1 * 0.5, s.cone.top), P(b, s.cone.r1 * 0.5, s.cone.top), [0, s.height, 0], C.bronze);
    }
  },
};

/**
 * Compiles a plan into triangles per slot (gold, rib, glass, stone), in the building's own frame
 * (origin at the centre of its base; the front, towards the river, is +z). Returns a report.
 */
export function compileAssembly(plan, writer) {
  const s = plan.settings;
  const C = s.colors;
  const usage = {};
  const before = writer.triangles();
  const missing = [...new Set(plan.placements.map((p) => p.module))].filter((id) => !MODULES[id]);
  if (missing.length) throw new Error(`assembly: no builder for ${missing.join(', ')}`);
  if (plan.diagnostics.duplicateSurfaceOwners.length) throw new Error(`assembly: duplicate owners ${plan.diagnostics.duplicateSurfaceOwners.join(', ')}`);
  const n9 = s.points;
  const shape = {
    podium: star(n9, s.podium.tip, s.podium.valley),
    ring: star(n9, s.arcade.tip, s.arcade.valley),
    infill: star(n9, s.arcade.tip - s.arcade.inset, s.arcade.valley - s.arcade.inset),
    brim: star(n9, s.cornice.tip, s.cornice.valley),
  };
  const ctx = { s, C, writer, shape };
  for (const p of plan.placements) {
    usage[p.module] = (usage[p.module] ?? 0) + 1;
    MODULES[p.module](ctx, p);
  }

  const after = writer.triangles();
  const triangles = {};
  for (const k of Object.keys(after)) triangles[k] = after[k] - (before[k] ?? 0);
  const R = s.roof;
  const valleyAt = (y) => {
    const f = (y - R.valley) / (R.top - R.valley);
    return (R.rValley - R.neck) * (1 - f) ** R.power + R.neck;
  };
  const contract = createContract('assembly');
  contract.is('height (sourced: 114 m)', plan.tiers.at(-1).y1, 114);
  contract.is('pyramids = points of the star (sourced: 9)', usage.pyramid, 9);
  contract.is('duplicate surface owners', plan.diagnostics.duplicateSurfaceOwners.length, 0);
  // proportions measured on the photos, each with about 10% tolerance
  contract.range('brim / height (P1 0.22, P2 0.28)', s.arcade.top / s.height, 0.19, 0.29);
  contract.range('eave valleys / height (P1 0.47, P2 0.49)', R.valley / s.height, 0.42, 0.51);
  contract.range('gold roof top / height (P1 0.69, P2 0.79)', R.top / s.height, 0.65, 0.8);
  contract.range('eave tip radius / mean brim radius (P1 0.69, P2 0.67)', R.rTip / ((s.cornice.tip + s.cornice.valley) / 2), 0.62, 0.76);
  contract.range('brim star: tip / valley (model, estimated 1.35)', s.cornice.tip / s.cornice.valley, 1.2, 1.5);
  contract.is('columns per point of the star (symmetry)', s.arcade.columns % s.points, 0);
  // every pyramid's base stays on the brim
  let worst = Infinity;
  for (let k = 0; k < s.points; k++) {
    const a = (k / s.points) * Math.PI * 2;
    for (const [cu, cv] of [[-1, 1], [1, 1]]) {
      const x = Math.sin(a) * s.pyramid.radius + (Math.cos(a) * cu + Math.sin(a) * cv) * (s.pyramid.base / 2);
      const z = Math.cos(a) * s.pyramid.radius + (-Math.sin(a) * cu + Math.cos(a) * cv) * (s.pyramid.base / 2);
      worst = Math.min(worst, shape.brim(Math.atan2(x, z)) - Math.hypot(x, z));
    }
  }
  contract.min('pyramid corners inside the brim edge (m)', worst, 0.5);
  contract.near('roof radius 61 m up (P1: 19.7 m)', valleyAt(60.7), 19.7, 2.5);
  contract.near('roof radius 73 m up (P1: 7.4 m)', valleyAt(73), 7.4, 1.5);
  contract.max('triangles', Object.values(triangles).reduce((a, b) => a + b, 0), 14000);
  return { tiers: plan.tiers, moduleUsage: usage, triangles, contract: contract.assert() };
}
