// The settee, armchairs and tables (PLAN.settee, chairs, tables), and the check that their
// footprints do not overlap. Materials: wood, carve, top.

import * as THREE from 'three';
import { PLAN } from './plan.js';
import { V, Q, ONE, M, boxWithGrainUVs } from './builder.js';

/** A turned leg, as a lathe: radius r, height h, standing on y = 0. UVs in metres. */
function turnedLeg(r, h) {
  const profile = [[0, 0], [0.55, 0], [0.8, 0.03], [0.55, 0.08], [0.55, 0.36], [1, 0.44], [0.62, 0.52], [0.5, 0.62], [0.5, 0.8], [0.8, 0.86], [0.8, 1], [0, 1]];
  const g = new THREE.LatheGeometry(profile.map(([a, k]) => new THREE.Vector2(a * r, k * h)), 8);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getY(i), uv.getX(i) * Math.PI * 2 * r);
  return g;
}

/**
 * An armchair or settee in the local frame (front towards +z), placed at (x, z) turned by ry:
 * turned legs, seat, aprons, arms on turned posts, and a back of slats between two rails.
 */
export function buildSeat(b, { x, z, ry, w, d, back }) {
  const F = new THREE.Matrix4().compose(V(x, 0, z), Q(0, ry, 0), ONE);
  const box = (w2, h, d2, lx, ly, lz, rx = 0, rz = 0) => b.place('wood', boxWithGrainUVs(w2, h, d2), M(lx, ly, lz, rx, 0, rz).premultiply(F));
  const leg = (lx, lz, h, r = 0.025) => b.place('wood', turnedLeg(r, h), M(lx, 0, lz).premultiply(F));
  const seat = 0.44;
  const arm = 0.66;
  const hx = w / 2 - 0.03;
  const hz = d / 2 - 0.03;
  leg(-hx, hz, arm);
  leg(hx, hz, arm);
  box(0.045, back, 0.045, -hx, back / 2, -hz, 0.08);
  box(0.045, back, 0.045, hx, back / 2, -hz, 0.08);
  box(w, 0.035, d, 0, seat, 0);
  box(w - 0.06, 0.07, 0.025, 0, seat - 0.05, hz);
  for (const s of [-1, 1]) {
    box(0.025, 0.07, d - 0.06, s * hx, seat - 0.05, 0);
    box(0.07, 0.03, d + 0.06, s * (hx + 0.005), arm, 0.02); // arm
    box(0.02, 0.022, d - 0.08, s * hx, 0.13, 0); // side stretcher
    for (let k = 0; k < 3; k++) box(0.018, arm - seat - 0.03, 0.018, s * hx, (seat + arm) / 2, -hz + 0.12 + k * 0.13); // arm spindles
  }
  box(w - 0.06, 0.02, 0.022, 0, 0.13, hz);
  // Back: top rail, lower rail, and a carved panel (armchair) or slats and a carved band (settee).
  const lean = 0.08;
  const yz = (y) => -hz - Math.sin(lean) * (y - seat) * 0.5;
  box(w + 0.04, 0.085, 0.03, 0, back - 0.05, yz(back - 0.05), lean);
  box(w - 0.06, 0.05, 0.025, 0, seat + 0.1, yz(seat + 0.1), lean);
  const yA = seat + 0.125;
  const yB = back - 0.09;
  const carve = (y0, y1) => {
    const pw = w - 0.1;
    const g = new THREE.PlaneGeometry(pw, y1 - y0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * pw, uv.getY(i) * (y1 - y0));
    b.place('carve', g, M(0, (y0 + y1) / 2, yz((y0 + y1) / 2), lean).premultiply(F), 0.04, false);
  };
  if (w > 1) {
    // Settee: slats below, a carved band under the top rail, split by two posts.
    const yC = back - 0.3;
    const n = Math.round(w / 0.09);
    for (let k = 1; k < n; k++) box(0.035, yC - yA, 0.016, -hx + ((2 * hx) / n) * k, (yA + yC) / 2, yz((yA + yC) / 2), lean);
    box(w - 0.06, 0.04, 0.025, 0, yC + 0.02, yz(yC), lean);
    carve(yC + 0.04, yB - 0.02);
    for (const px of [-w / 6, w / 6]) box(0.05, yB - yC, 0.026, px, (yB + yC) / 2, yz((yB + yC) / 2), lean);
  } else {
    // Armchair: one carved panel framed by two stiles.
    carve(yA, yB);
    for (const px of [-w / 2 + 0.12, w / 2 - 0.12]) box(0.04, yB - yA, 0.024, px, (yA + yB) / 2, yz((yA + yB) / 2), lean);
  }
}

/**
 * Floor footprints (x0, x1, z0, z1 in metres) of the seats and tables, from the same sizes the
 * builders use: a seat's arms reach 0.31 m to each side and from 0.285 m behind to 0.325 m in front
 * of its centre (buildSeat). Returns the pairs that overlap, with the overlap in metres.
 */
export function furnitureOverlaps(plan = PLAN) {
  const seat = ({ x, z, ry, w }) => {
    const half = w / 2 + 0.04; // hx + arm half-width
    const c = Math.round(Math.cos(ry)), s = Math.round(Math.sin(ry)); // seats are turned by 0 or ±90°
    const corners = [[-half, -0.285], [half, -0.285], [-half, 0.325], [half, 0.325]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
    const xs = corners.map((p) => p[0]), zs = corners.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  };
  const items = [['settee', seat(plan.settee)], ...plan.chairs.map((c, i) => [`chair ${i}`, seat(c)]), ...plan.tables.map((t, i) => [`table ${i}`, t])];
  const out = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const [na, a] = items[i], [nb, b] = items[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox > 0 && oz > 0) out.push(`${na} / ${nb}: ${ox.toFixed(3)} x ${oz.toFixed(3)} m`);
    }
  return out;
}

export function buildTable(b, { x0, x1, z0, z1, h, stretcher }) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  b.box('top', w, 0.035, d, cx, h - 0.0175, cz);
  b.box('wood', w - 0.08, 0.07, 0.025, cx, h - 0.07, z1 - 0.05);
  b.box('wood', w - 0.08, 0.07, 0.025, cx, h - 0.07, z0 + 0.05);
  b.box('wood', 0.025, 0.07, d - 0.1, x0 + 0.05, h - 0.07, cz);
  b.box('wood', 0.025, 0.07, d - 0.1, x1 - 0.05, h - 0.07, cz);
  for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [z0 + 0.05, z1 - 0.05]) b.place('wood', turnedLeg(0.028, h - 0.035), M(x, 0, z));
  if (stretcher) {
    for (const x of [x0 + 0.05, x1 - 0.05]) b.box('wood', 0.03, 0.03, d - 0.1, x, 0.1, cz);
    b.box('wood', w - 0.1, 0.03, 0.03, cx, 0.1, cz);
  }
}
