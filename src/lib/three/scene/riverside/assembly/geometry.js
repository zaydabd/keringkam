// Geometry helpers for the Assembly building (assembly.js): star outlines, beams, bands, the
// folded roof, the tree columns.

import { sub, cross, norm } from '../../../../utils/vec3.js';
import { ASSEMBLY } from './plan.js';

// --- Small geometry helpers (building frame: y up, front towards +z) --------------------------

export const P = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
export const radiusAt = (r, a) => (typeof r === 'function' ? r(a) : r);

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
export const offset = (p, ...terms) => {
  const o = [...p];
  for (const [v, k] of terms) for (let i = 0; i < 3; i++) o[i] += v[i] * k;
  return o;
};

/**
 * A straight member from a to b, `w` wide and `d` deep, its front facing `out` (roughly).
 * Only the faces that can be seen are written: front and both sides (back too if `back`).
 */
export function beam(writer, slot, a, b, out, w, d, color, back = false) {
  const axis = sub(b, a);
  const side = norm(cross(axis, out));
  const front = norm(cross(side, axis));
  const E = ASSEMBLY.edges;
  if (w >= E.minWidth) {
    // the front corners cut (pass e16b): front, two chamfers, two sides; how much is cut wears a
    // little from joint to joint
    const cut = (p) => Math.min(0.9, E.chamfer * (1 + E.wear * (2 * wearAt(p) - 1)));
    const c = (p, sx, sf) => offset(p, [side, (sx * w) / 2], [front, (sf * d) / 2]);
    const ring = (p) => {
      const k = cut(p);
      const kx = 1 - k, kf = 1 - (k * w) / d; // the cut is the same length along both faces
      return [c(p, -1, -1), c(p, -1, Math.max(-0.9, kf)), c(p, -kx, 1), c(p, kx, 1), c(p, 1, Math.max(-0.9, kf)), c(p, 1, -1)];
    };
    const A = ring(a), B = ring(b);
    for (let i = 0; i < 5; i++) writer.quad(slot, A[i], A[i + 1], B[i + 1], B[i], color);
    if (back) writer.quad(slot, A[5], A[0], B[0], B[5], color);
    return;
  }
  const c = (p, sx, sf) => offset(p, [side, (sx * w) / 2], [front, (sf * d) / 2]);
  writer.quad(slot, c(a, -1, 1), c(a, 1, 1), c(b, 1, 1), c(b, -1, 1), color); // front
  writer.quad(slot, c(a, 1, 1), c(a, 1, -1), c(b, 1, -1), c(b, 1, 1), color); // +side
  writer.quad(slot, c(a, -1, -1), c(a, -1, 1), c(b, -1, 1), c(b, -1, -1), color); // -side
  if (back) writer.quad(slot, c(a, 1, -1), c(a, -1, -1), c(b, -1, -1), c(b, 1, -1), color);
}

/** 0..1, fixed for a point (rounded to 1 cm): where two pieces meet they get the same wear. */
export function wearAt(p) {
  let h = 2166136261;
  for (const v of p) h = Math.imul(h ^ Math.round(v * 100), 16777619);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A band of quads between two circles (r0 at y0, r1 at y1), facing outwards (or inwards). */
export function band(writer, slot, segs, r0, y0, r1, y1, color, inward = false, a0 = 0) {
  for (let i = 0; i < segs; i++) {
    const p = a0 + (i / segs) * Math.PI * 2, q = a0 + ((i + 1) / segs) * Math.PI * 2;
    const [a, b, c, d] = [radiusAt(r0, p), radiusAt(r0, q), radiusAt(r1, q), radiusAt(r1, p)];
    if (inward) writer.quad(slot, P(q, b, y0), P(p, a, y0), P(p, d, y1), P(q, c, y1), color);
    else writer.quad(slot, P(p, a, y0), P(q, b, y0), P(q, c, y1), P(p, d, y1), color);
  }
}

/** A flat ring at height y from r0 (inner) to r1 (outer), facing up (or down). */
export function annulus(writer, slot, segs, r0, r1, y, color, down = false) {
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
export function foldedRoof(writer, c, R, colors, { rings = R.rings, gold = 'gold' } = {}) {
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
export function archArm(pointAt, h, rise, pointed, n = 4) {
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
export function treeColumn(writer, { index, count, ring, brim, y0, y1, spring, reach, shaft, arm, mullion, color }) {
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
export function zigzag(folds, tip, valley) {
  const m = folds * 2;
  return Array.from({ length: m }, (_, i) => P((i / m) * Math.PI * 2, ...(i % 2 === 0 ? tip : valley)));
}

/** Quads between two rings of equal length; faces point away from the axis when `upper` is above `lower`. */
export function loft(writer, slot, lower, upper, colorOf) {
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
