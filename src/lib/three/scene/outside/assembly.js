// The Sarawak State Legislative Assembly building (Dewan Undangan Negeri), seen across the river.
// Built the way .claude/skills/threejs-procedural-architecture asks: settings -> a serialisable
// plan (tiers and module placements, checked) -> registered module builders -> triangles per
// material slot. Nothing here makes triangles while deciding the building.
//
// Sourced: 114 m tall, a nine-pointed-star plan, an umbrella ("payung negara") roof
// (https://en.wikipedia.org/wiki/New_Sarawak_State_Legislative_Assembly_Building).
// Shapes and sizes are measured on 15 screenshots (24 degrees apart) of the user's photogrammetry
// model "Dewan Undangan Negeri (DUN) Sarawak" by dpmedia on Sketchfab
// (https://sketchfab.com/3d-models/dewan-undangan-negeri-dun-sarawak-80cf19aaf40a4f4895862a80395e6e47),
// shown through a 1 degree lens (nearly orthographic) and scaled by the sourced height: 9.15 px per
// metre. Every size below except the height and the star is such a measurement, i.e. an estimate,
// not survey data. Bottom to top:
//   - an arcade of white "tree" columns whose arms flare out to carry the brim (0-28.4 m);
//   - a thick star-shaped brim (28.4-32.6 m) with a raised edge, its points about 70 m out;
//   - nine gold pyramids on it, one per point of the star, about 24 m square, 41.5 m high;
//   - a deep dark bowl, the roof's underside, from the brim (r 29.5 m) out to the eave (r 47 m);
//   - a grey zigzag rim at the eave (52.5-58.5 m) and the gold folded roof, 18 folds, rising
//     concave to a gold neck (89.5-96.8 m), a dark ribbed cone (96.8-109 m) and a needle;
//   - kiosks on a terrace in front and at the sides (placed after the painting, not the model).
// Colours follow the painting (R3): gold roof, cream columns, dark underside.

import { createContract } from './contract.js';
import { OUTSIDE_THEME } from '../themes/outside.js';

export const ASSEMBLY = {
  height: 114, // sourced
  points: 9, // sourced: nine-pointed star; its points carry the pyramids
  // The plan is a nine-pointed star (sourced), points at 0, 40, 80 ... degrees, point 0 facing
  // the river. Radii are estimates from the model's silhouettes.
  podium: { tip: 60, valley: 51, height: 2 },
  arcade: { tip: 58, valley: 49, inset: 2.5, top: 28.4, columns: 45, spring: 0.5, reach: 2, floors: 3 }, // 5 columns per point
  brim: { tip: 70, valley: 53, inner: 27, top: 32.6, lip: 0.8 }, // slab from arcade.top to top, a lip on its edge
  pyramid: { radius: 42.5, base: 24, apex: 41.5 }, // square, edges along and across the radius
  // the bowl under the roof: its outline at the fold tips, (radius, height), bottom to top
  bowl: { profile: [[29.5, 32.6], [29.5, 34.5], [33.6, 37.8], [37.9, 41.2], [42.3, 45.6], [46, 50]], valleyRatio: [0.95, 0.87] },
  roof: {
    folds: 18,
    tip: [42.5, 56], // where a fold's tip meets the rim: radius, height
    valley: [36.5, 58.5], // where a fold's valley meets it (the tips hang down and out)
    top: 89.5, // where the folds meet the neck
    neck: 6.3, // radius there
    rim: 4.5, // how far the grey rim reaches out past the gold
    fascia: 3.5, // its height
    rings: 16,
  },
  neck: { top: 96.8, r1: 5.0, bands: [[89.5, 0.4], [96.3, 0.4]] }, // gold, ribbed; light bands
  cone: { top: 109, r0: 4.4, r1: 0.7, ribs: 16 }, // dark, ribbed
  needle: { r: 0.5 },
  kiosk: { folds: 8, rValley: 3.4, rTip: 4.4, eave: 3.4, top: 6.2, spire: 7.4, legs: 2.6 },
  kioskRow: { half: 3.4, eave: 3.4, rise: 2.6, fork: 1.6 }, // the front five: about 7 m square
  kiosks: { row: [-22, -11, 0, 11, 22], rowZ: 82, sides: [-72, 72], sideZ: 42, sideScale: 1.7 },
  terrace: { z: 82, halfX: 30, halfZ: 7, height: 0.8 },
  colors: OUTSIDE_THEME.assembly, // linear vertex colours (themes/outside.js)
};

/** Tiers (bottom to top) and module placements. Pure data: no geometry. */
export function planAssembly(settings = ASSEMBLY) {
  const s = settings;
  const R = s.roof;
  const tiers = [
    { name: 'podium', y0: 0, y1: s.podium.height },
    { name: 'arcade', y0: s.podium.height, y1: s.arcade.top },
    { name: 'brim', y0: s.arcade.top, y1: s.brim.top + s.brim.lip },
    { name: 'bowl', y0: s.brim.top, y1: R.tip[1] - R.fascia },
    { name: 'roof', y0: R.tip[1] - R.fascia, y1: R.top },
    { name: 'neck', y0: R.top, y1: s.neck.top },
    { name: 'cone', y0: s.neck.top, y1: s.cone.top },
    { name: 'needle', y0: s.cone.top, y1: s.height },
  ];
  const placements = [];
  const add = (module, tier, extra = {}) => placements.push({ module, tier, ...extra });
  for (let i = 0; i < s.arcade.columns; i++) add('tree-column', 'arcade', { index: i });
  for (let i = 0; i < s.points; i++) add('pyramid', 'brim', { index: i });
  s.kiosks.row.forEach((x, i) => add('kiosk', 'podium', { index: i, x, z: s.kiosks.rowZ, scale: 1 }));
  s.kiosks.sides.forEach((x, i) => add('kiosk', 'podium', { index: s.kiosks.row.length + i, x, z: s.kiosks.sideZ, scale: s.kiosks.sideScale }));
  for (const [module, tier] of [['podium', 'podium'], ['terrace', 'podium'], ['infill', 'arcade'], ['brim', 'brim'], ['bowl', 'bowl'], ['payung', 'roof'], ['neck', 'neck'], ['cone', 'cone'], ['needle', 'needle']]) add(module, tier);
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
 * A small folded umbrella roof, for the kiosks. Returns the eave's
 * zigzag (fascia bottom points) for the soffit. `c` centre [x, y, z]; sizes in metres from c.
 */
function foldedRoof(writer, c, R, colors, { rings = R.rings, gold = 'gold' } = {}) {
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
    writer.quad('stone', drop(eave[i]), drop(eave[j]), eave[j], eave[i], colors.rim);
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

/** A ring of 2 * folds points: tips (even) at [radius, height] `tip`, valleys (odd) at `valley`. */
function zigzag(folds, tip, valley) {
  const m = folds * 2;
  return Array.from({ length: m }, (_, i) => P((i / m) * Math.PI * 2, ...(i % 2 === 0 ? tip : valley)));
}

/** Quads between two rings of equal length; faces point away from the axis when `upper` is above `lower`. */
function loft(writer, slot, lower, upper, colorOf) {
  const m = lower.length;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    writer.quad(slot, lower[i], lower[j], upper[j], upper[i], colorOf(i));
  }
}

/** The main roof's outline at the fold tips: radius at height y (concave, fitted to the model). */
export function roofTipRadius(R, y) {
  const f = Math.min(1, Math.max(0, (R.top - y) / (R.top - R.tip[1])));
  return R.neck + (R.tip[0] - R.neck) * f * f;
}

const MODULES = {
  'tree-column'(ctx, p) {
    const { s, C } = ctx;
    const A = s.arcade;
    treeColumn(ctx.writer, { index: p.index, count: A.columns, ring: ctx.shape.ring, brim: ctx.shape.brim, y0: s.podium.height, y1: A.top, spring: A.spring, reach: A.reach, shaft: 1.2, arm: 0.7, mullion: 0.35, color: C.white });
    // Under each point of the star the column flares like a trumpet out to the brim's point
    // (model: a solid sweep from about half height, widening as it rises).
    const per = A.columns / s.points;
    if (p.index % per !== 0) return;
    const a = (p.index / A.columns) * Math.PI * 2;
    const r0 = ctx.shape.ring(a), r1 = s.brim.tip - 2.5;
    const y0 = s.podium.height + (A.top - s.podium.height) * 0.4;
    const n = 6;
    const at = (u) => P(a, r0 + (r1 - r0) * (1 - Math.cos(u)), y0 + (A.top - y0) * Math.sin(u));
    for (let k = 0; k < n; k++) {
      const u0 = (k / n) * (Math.PI / 2), u1 = ((k + 1) / n) * (Math.PI / 2);
      beam(ctx.writer, 'rib', at(u0), at(u1), [Math.sin(a), 0, Math.cos(a)], 1.4 + 3.2 * ((k + 0.5) / n) ** 2, 1.6, C.white);
    }
  },
  pyramid(ctx, p) {
    const { s, C, writer } = ctx;
    const Y = s.pyramid;
    const a = (p.index / s.points) * Math.PI * 2; // point 0 faces the river; each sits under a roof tip
    const y = s.brim.top;
    const centre = P(a, Y.radius, y);
    const u = [Math.cos(a), 0, -Math.sin(a)]; // along the ring
    const v = [Math.sin(a), 0, Math.cos(a)]; // outwards
    const k = Y.base / 2;
    const corner = (cu, cv) => offset(centre, [u, cu * k], [v, cv * k]);
    const base = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)]; // outer edge first
    const apex = [centre[0], Y.apex, centre[2]];
    for (let i = 0; i < 4; i++) writer.tri('gold', base[i], base[(i + 1) % 4], apex, i % 2 === 0 ? C.gold : C.goldShade);
  },
  kiosk(ctx, p) {
    const { s, C, writer } = ctx;
    const K = s.kiosk;
    const k = p.scale;
    const light = { ...C, ...OUTSIDE_THEME.kiosk }; // a lighter gold than the main roof
    if (p.scale > 1) {
      // the two at the sides: small copies of the main roof on four legs, with a spire (P1, P2)
      const y = 0;
      const c = [p.x, y, p.z];
      const R = { folds: K.folds, valley: K.eave * k, rValley: K.rValley * k, rTip: K.rTip * k, tipDrop: 0.5 * k, top: K.top * k, neck: 0.35 * k, power: 1.6, fascia: 0.25 * k };
      foldedRoof(writer, c, R, light, { rings: 5 });
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
    // dark red-brown glass and spandrels with lighter floor bands (painting, user photos)
    const A = s.arcade;
    const y0 = s.podium.height;
    const step = (A.top - y0) / A.floors;
    for (let f = 0; f < A.floors; f++) {
      const yb = y0 + f * step;
      band(writer, 'glass', 90, shape.infill, yb, shape.infill, yb + step - 1, C.infill);
      band(writer, 'glass', 90, shape.infill, yb + step - 1, shape.infill, yb + step, C.floor);
    }
  },
  brim({ s, C, writer, shape }) {
    // the star-shaped slab (90 segments put a vertex on every point and every valley), with a
    // low lip round its edge
    const B = s.brim;
    const y0 = s.arcade.top;
    const lipIn = (a) => shape.brim(a) - 0.7;
    annulus(writer, 'stone', 90, B.inner, lipIn, B.top, C.brim);
    band(writer, 'stone', 90, shape.brim, y0, shape.brim, B.top + B.lip, C.brimEdge);
    band(writer, 'stone', 90, lipIn, B.top, lipIn, B.top + B.lip, C.rim, true);
    annulus(writer, 'stone', 90, lipIn, shape.brim, B.top + B.lip, C.brim);
    annulus(writer, 'stone', 90, shape.infill, shape.brim, y0, C.soffit, true);
  },
  bowl({ s, C, writer }) {
    // the roof's underside: a deep dark bowl from the brim out to the rim's lower edge. Its folds
    // follow the roof's, fading towards the bottom.
    const R = s.roof;
    const W = s.bowl;
    const n = W.profile.length;
    const rings = W.profile.map(([r, y], k) => {
      const f = k / n; // 0 at the bottom
      const ratio = W.valleyRatio[0] + (W.valleyRatio[1] - W.valleyRatio[0]) * f;
      return zigzag(R.folds, [r, y], [r * ratio, y + (R.valley[1] - R.tip[1]) * f]);
    });
    rings.push(ctxRim(R).fasciaBottom);
    for (let k = 0; k < rings.length - 1; k++) loft(writer, 'stone', rings[k], rings[k + 1], (i) => (i % 2 ? C.bowlShade : C.bowl));
  },
  payung({ s, C, writer }) {
    const R = s.roof;
    const rim = ctxRim(R);
    // the grey rim: a ledge round the gold, then the fascia hanging from its outer edge
    loft(writer, 'stone', rim.fasciaBottom, rim.outer, (i) => (i % 2 ? C.rimShade : C.rim));
    loft(writer, 'stone', rim.outer, rim.inner, () => C.rim);
    // the gold folds: tips follow the measured outline, valleys sit inside them, both narrowing to
    // the neck
    const rings = [];
    for (let k = 0; k <= R.rings; k++) {
      const f = k / R.rings;
      const yt = R.tip[1] + (R.top - R.tip[1]) * f;
      const yv = R.valley[1] + (R.top - R.valley[1]) * f;
      const rt = roofTipRadius(R, yt);
      const ratio = R.valley[0] / R.tip[0] + (0.95 - R.valley[0] / R.tip[0]) * f;
      rings.push(zigzag(R.folds, [rt, yt], [rt * ratio, yv]));
    }
    for (let k = 0; k < R.rings; k++) loft(writer, 'gold', rings[k], rings[k + 1], (i) => (i % 2 ? C.goldShade : C.gold));
  },
  neck({ s, C, writer }) {
    // the folds carry on up a short gold neck, between two light bands
    const R = s.roof, N = s.neck;
    const lower = zigzag(R.folds, [R.neck, R.top], [R.neck * 0.95, R.top]);
    const upper = zigzag(R.folds, [N.r1, N.top], [N.r1 * 0.95, N.top]);
    loft(writer, 'gold', lower, upper, (i) => (i % 2 ? C.goldShade : C.gold));
    for (const [y, h] of N.bands) {
      const r = R.neck + ((N.r1 - R.neck) * (y - R.top)) / (N.top - R.top) + 0.3;
      band(writer, 'stone', R.folds * 2, r, y - h, r, y + h + 0.3, C.band);
    }
  },
  cone({ s, C, writer }) {
    // the dark ribbed cone above the gold
    const K = s.cone;
    const y0 = s.neck.top;
    const m = K.ribs * 2;
    const ring = (r, y) => Array.from({ length: m }, (_, i) => P((i / m) * Math.PI * 2, i % 2 ? r * 0.9 : r, y));
    loft(writer, 'stone', ring(K.r0, y0), ring(K.r1, K.top), (i) => (i % 2 ? C.coneShade : C.cone));
  },
  needle({ s, C, writer }) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, b = ((i + 1) / 6) * Math.PI * 2;
      writer.tri('stone', P(a, s.needle.r, s.cone.top), P(b, s.needle.r, s.cone.top), [0, s.height, 0], C.cone);
    }
  },
};

/** The rim's three zigzags: inner (where the gold starts), outer, and the fascia's lower edge. */
function ctxRim(R) {
  const out = (rh) => [rh[0] + R.rim, rh[1]];
  const down = (rh) => [rh[0] + R.rim, rh[1] - R.fascia];
  return {
    inner: zigzag(R.folds, R.tip, R.valley),
    outer: zigzag(R.folds, out(R.tip), out(R.valley)),
    fasciaBottom: zigzag(R.folds, down(R.tip), down(R.valley)),
  };
}

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
    brim: star(n9, s.brim.tip, s.brim.valley),
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
  const H = s.height;
  const contract = createContract('assembly');
  contract.is('height (sourced: 114 m)', plan.tiers.at(-1).y1, 114);
  contract.is('pyramids = points of the star (sourced: 9)', usage.pyramid, 9);
  contract.is('duplicate surface owners', plan.diagnostics.duplicateSurfaceOwners.length, 0);
  contract.is('roof folds = 2 x points (model: a pyramid under every second tip)', R.folds, 2 * s.points);
  // proportions measured on the Sketchfab model (estimates), each with a few % tolerance
  contract.range('arcade top / height (model 0.249)', s.arcade.top / H, 0.23, 0.27);
  contract.range('brim top / height (model 0.286)', s.brim.top / H, 0.27, 0.3);
  contract.range('pyramid apex / height (model 0.36)', s.pyramid.apex / H, 0.34, 0.38);
  contract.range('rim bottom at a tip / height (model 0.46)', (R.tip[1] - R.fascia) / H, 0.44, 0.48);
  contract.range('gold folds meet the neck / height (model 0.785)', R.top / H, 0.76, 0.81);
  contract.range('dark cone base / height (model 0.85)', s.neck.top / H, 0.83, 0.87);
  contract.range('rim radius / brim point radius (model 0.67)', (R.tip[0] + R.rim) / s.brim.tip, 0.63, 0.71);
  contract.range('brim star: point / valley (model 1.3)', s.brim.tip / s.brim.valley, 1.15, 1.4);
  contract.near('roof outline radius 70 m up (model 18.1 m)', roofTipRadius(R, 70), 18.1, 1.5);
  contract.near('roof outline radius 80 m up (model 9.5 m)', roofTipRadius(R, 80), 9.5, 1.2);
  contract.near('bowl bottom radius (model 29 m)', s.bowl.profile[0][0], 29, 1.5);
  // every pyramid's base stays on the brim, and inside the bowl's foot it would cut the bowl
  let worst = Infinity;
  for (let k = 0; k < s.points; k++) {
    const a = (k / s.points) * Math.PI * 2;
    for (const [cu, cv] of [[-1, 1], [1, 1]]) {
      const x = Math.sin(a) * s.pyramid.radius + (Math.cos(a) * cu + Math.sin(a) * cv) * (s.pyramid.base / 2);
      const z = Math.cos(a) * s.pyramid.radius + (-Math.sin(a) * cu + Math.cos(a) * cv) * (s.pyramid.base / 2);
      worst = Math.min(worst, shape.brim(Math.atan2(x, z)) - 0.7 - Math.hypot(x, z));
    }
  }
  contract.min('pyramid corners inside the brim lip (m)', worst, 0.5);
  contract.min('pyramid inner edge outside the bowl foot (m)', s.pyramid.radius - s.pyramid.base / 2 - s.bowl.profile[0][0], 0);
  contract.max('triangles', Object.values(triangles).reduce((a, b) => a + b, 0), 14000);
  return { tiers: plan.tiers, moduleUsage: usage, triangles, contract: contract.assert() };
}
