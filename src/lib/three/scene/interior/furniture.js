// The settee, armchairs and tables (PLAN.settee, chairs, tables), and the check that their
// footprints do not overlap. Materials: wood, carve, top.

import * as THREE from 'three';
import { PLAN } from './plan.js';
import { V, Q, ONE, M, roundedBoxWithGrainUVs, indexed } from './builder.js';
import { SEAT } from './seat.js';

export { SEAT };

/** A sanded furniture part: a box with edges rounded by up to 6 mm (a quarter of its thinnest side). */
const part = (w, h, d) => roundedBoxWithGrainUVs(w, h, d, Math.min(0.006, Math.min(w, h, d) / 4));

/** A turned leg, as a lathe: radius r, height h, standing on y = 0. UVs in metres. */
function turnedLeg(r, h) {
  const profile = [[0, 0], [0.55, 0], [0.8, 0.03], [0.55, 0.08], [0.55, 0.36], [1, 0.44], [0.62, 0.52], [0.5, 0.62], [0.5, 0.8], [0.8, 0.86], [0.8, 1], [0, 1]];
  const g = new THREE.LatheGeometry(profile.map(([a, k]) => new THREE.Vector2(a * r, k * h)), 8);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getY(i), uv.getX(i) * Math.PI * 2 * r);
  return g;
}

/** UVs in metres with the grain along the part's longest local axis (for extrusions). */
function grainUVs(g, along, across) {
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, along(pos, i), across(pos, i));
  return g;
}

/**
 * The crest rail: a board with an arched top (the settee's is a wider, flatter camel back), lying
 * in the x-y plane on y = 0, front face towards +z, with a carved fan (a half sunburst of raised
 * rays) in the middle of its front face.
 */
function crestRail(width, ends, peak, settee) {
  const h = width / 2;
  const s = new THREE.Shape();
  s.moveTo(-h, 0);
  s.lineTo(h, 0);
  s.lineTo(h, ends);
  if (settee) s.bezierCurveTo(h * 0.55, ends - 0.015, h * 0.32, peak, 0, peak);
  else s.bezierCurveTo(h * 0.5, ends, h * 0.35, peak, 0, peak);
  if (settee) s.bezierCurveTo(-h * 0.32, peak, -h * 0.55, ends - 0.015, -h, ends);
  else s.bezierCurveTo(-h * 0.35, peak, -h * 0.5, ends, -h, ends);
  s.closePath();
  const t = 0.024;
  const bevel = SEAT.crest.bevel;
  const board = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 12 });
  board.translate(0, 0, -t / 2);
  // The fan: rays between 15° and 165°, from a small boss to radius r, raised 5 mm.
  const r = settee ? 0.075 : 0.055;
  const cy = 0.012;
  const parts = [indexed(grainUVs(board, (p, i) => p.getX(i), (p, i) => p.getY(i)))];
  const rays = 9;
  for (let k = 0; k < rays; k++) {
    const a0 = THREE.MathUtils.degToRad(15 + (150 * (k + 0.12)) / rays);
    const a1 = THREE.MathUtils.degToRad(15 + (150 * (k + 0.88)) / rays);
    const ray = new THREE.Shape();
    ray.moveTo(Math.cos((a0 + a1) / 2) * r * 0.25, cy + Math.sin((a0 + a1) / 2) * r * 0.25);
    ray.lineTo(Math.cos(a0) * r, cy + Math.sin(a0) * r);
    ray.lineTo(Math.cos(a1) * r, cy + Math.sin(a1) * r);
    ray.closePath();
    const g = new THREE.ExtrudeGeometry(ray, { depth: 0.005, bevelEnabled: false });
    g.translate(0, 0, t / 2 + bevel - 0.001);
    parts.push(indexed(grainUVs(g, (p, i) => p.getX(i), (p, i) => p.getY(i))));
  }
  const boss = new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.008, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
  boss.translate(0, cy, t / 2 + bevel);
  parts.push(boss);
  return parts;
}

/**
 * A curved arm (after C1): from the back post it dips a little, runs forward and ends in a scroll
 * that curls down onto the turned front post. A rounded section swept along the curve.
 */
function curvedArm(points) {
  const curve = new THREE.CatmullRomCurve3(points.map(([y, z]) => V(0, y, z)));
  const section = new THREE.Shape();
  const [hw, hh, c] = SEAT.arm; // half-thickness (along the curve's normal), half-width, corner cut
  section.moveTo(-hw + c, -hh);
  section.lineTo(hw - c, -hh);
  section.lineTo(hw, -hh + c);
  section.lineTo(hw, hh - c);
  section.lineTo(hw - c, hh);
  section.lineTo(-hw + c, hh);
  section.lineTo(-hw, hh - c);
  section.lineTo(-hw, -hh + c);
  section.closePath();
  const g = new THREE.ExtrudeGeometry(section, { steps: 18, extrudePath: curve, bevelEnabled: false });
  return indexed(grainUVs(g, (p, i) => p.getZ(i) - p.getY(i), (p, i) => p.getX(i)));
}

/**
 * An armchair or settee in the local frame (front towards +z), placed at (x, z) turned by ry,
 * after C1 (research/INTERIOR-NOTES.md): turned front legs that run up into the arm posts, square
 * back legs raked back below the seat and leaning back above it, a slatted seat on four rails,
 * curved scroll arms, and a back of a lower rail, a pierced panel, a row of short spindles and an
 * arched crest rail with a carved fan. Sizes estimated from the photo.
 */
export function buildSeat(b, { x, z, ry, w, d, back, settee = false }) {
  const F = new THREE.Matrix4().compose(V(x, 0, z), Q(0, ry, 0), ONE);
  const put = (key, g, m) => b.place(key, g, m.premultiply(F));
  const box = (w2, h, d2, lx, ly, lz, rx = 0) => put('wood', part(w2, h, d2), M(lx, ly, lz, rx));
  /** A square member of section (sw, sd) from a to c (local [y, z] at side x). */
  const member = (sx, [ya, za], [yc, zc], sw, sd) => {
    const len = Math.hypot(yc - ya, zc - za);
    const tilt = Math.atan2(zc - za, yc - ya); // from vertical, towards +z
    put('wood', part(sw, len, sd), M(sx, (ya + yc) / 2, (za + zc) / 2, tilt));
  };
  const { height: seat, armTop, armJoin: yJoin, lean, scroll } = SEAT;
  const hx = w / 2 - SEAT.inset;
  const hz = d / 2 - SEAT.inset;
  const pz = (y) => -hz - Math.tan(lean) * (y - seat); // the back posts' z at height y
  // Legs: turned at the front (up into the arm posts), square and raked at the back.
  for (const s of [-1, 1]) {
    put('wood', turnedLeg(SEAT.frontLeg, armTop), M(s * hx, 0, hz));
    member(s * hx, [0, -hz - SEAT.backLeg[2]], [seat - 0.03, -hz], SEAT.backLeg[0], SEAT.backLeg[1]);
    member(s * hx, [seat - 0.06, pz(seat - 0.06)], [back, pz(back)], ...SEAT.backPost);
  }
  // Seat: four rails, and slats on top (front to back on a chair, along the settee).
  box(w - 0.06, 0.07, 0.024, 0, seat - 0.055, hz);
  box(w - 0.06, 0.07, 0.024, 0, seat - 0.055, -hz);
  for (const s of [-1, 1]) box(0.024, 0.07, d - 0.06, s * hx, seat - 0.055, 0);
  const gap = 0.008;
  if (settee) {
    const n = 5;
    const sw = (d - (n - 1) * gap) / n;
    for (let k = 0; k < n; k++) box(w - 0.02, 0.02, sw, 0, seat - 0.01, -d / 2 + sw / 2 + k * (sw + gap));
  } else {
    const n = 6;
    const sw = (w - 0.02 - (n - 1) * gap) / n;
    for (let k = 0; k < n; k++) box(sw, 0.02, d, -w / 2 + 0.01 + sw / 2 + k * (sw + gap), seat - 0.01, 0);
  }
  // Arms: from the back post, dipping, out over the front post and curling down onto it.
  for (const s of [-1, 1]) {
    const arm = curvedArm([[yJoin, pz(yJoin) + 0.01], [0.675, -hz + 0.13], [0.66, hz - 0.1], [0.67, hz], [0.66, hz + scroll], [armTop + 0.012, hz + 0.012]]);
    put('wood', arm, M(s * hx, 0, 0));
  }
  // Back, from the seat up: lower rail, pierced panel, middle rail, spindles, crest rail.
  const span = 2 * hx - SEAT.backPost[0];
  const rail = (y, h) => box(span, h, 0.022, 0, y, pz(y), -lean);
  const yCrest = back - SEAT.crest.below; // bottom of the crest rail
  const yMid = yCrest - (settee ? 0.11 : 0.12);
  rail(seat + 0.1, 0.04);
  rail(yMid, 0.03);
  const y0 = seat + 0.12;
  const y1 = yMid - 0.015;
  const pw = span - 0.01;
  const panel = new THREE.PlaneGeometry(pw, y1 - y0);
  const uv = panel.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * pw, uv.getY(i) * (y1 - y0));
  b.place('carve', panel, M(0, (y0 + y1) / 2, pz((y0 + y1) / 2), -lean).premultiply(F), 0.04, false);
  const n = Math.round(span / 0.05);
  const ys = yMid + 0.015;
  const hs = yCrest - ys;
  for (let k = 1; k < n; k++) {
    const sx = -span / 2 + (span * k) / n;
    put('wood', turnedLeg(0.0095, hs), M(sx, ys, pz(ys + hs / 2) + Math.tan(lean) * (hs / 2), -lean));
  }
  const peak = settee ? SEAT.crest.setteePeak : SEAT.crest.peak;
  for (const g of crestRail(2 * (hx + SEAT.crest.overhang), 0.07, peak, settee)) put('wood', g, M(0, yCrest, pz(yCrest), -lean));
}

/**
 * How far a seat reaches from its centre, in its own frame (front = +z), from the SEAT sizes:
 * to each side (the crest rail, or a leg), behind (the leaning crest at the top of the back, or a
 * raked foot) and in front (the arm scroll).
 */
export function seatReach({ w, d, back, settee = false }) {
  const hx = w / 2 - SEAT.inset;
  const hz = d / 2 - SEAT.inset;
  const { lean, height: seat, crest, backPost, backLeg, arm, scroll } = SEAT;
  return {
    side: hx + Math.max(crest.overhang + crest.bevel, SEAT.frontLeg, arm[0], backPost[0] / 2),
    behind: Math.max(hz + Math.tan(lean) * (back - crest.below + (settee ? crest.setteePeak : crest.peak) - seat) + backPost[1] / 2, hz + backLeg[2] + backLeg[1] / 2),
    front: hz + scroll + Math.max(arm[0], arm[1]),
  };
}

/**
 * Where each piece's legs meet the floor, in world [x, z]: a seat's turned front legs and raked
 * back feet (as buildSeat places them), a table's four legs (as buildTable). For the contact
 * shadows under each foot (surfaces.js).
 */
export function seatFeet({ x, z, ry, w, d }) {
  const hx = w / 2 - SEAT.inset;
  const hz = d / 2 - SEAT.inset;
  const [c, s] = [Math.cos(ry), Math.sin(ry)];
  return [[hz, 1], [hz, -1], [-hz - SEAT.backLeg[2], 1], [-hz - SEAT.backLeg[2], -1]].map(([lz, side]) => {
    const lx = side * hx;
    return [x + lx * c + lz * s, z - lx * s + lz * c];
  });
}

export function tableFeet({ x0, x1, z0, z1 }) {
  return [x0 + 0.05, x1 - 0.05].flatMap((x) => [[x, z0 + 0.05], [x, z1 - 0.05]]);
}

/**
 * Floor footprints (x0, x1, z0, z1 in metres) of the seats (seatReach) and tables (their PLAN
 * box), turned by any angle: a seat's footprint is the box around its turned corners. Returns the
 * pairs that overlap, with the overlap in metres.
 */
export function furnitureOverlaps(plan = PLAN) {
  const seat = (p) => {
    const { x, z, ry } = p;
    const { side, behind, front } = seatReach(p);
    const c = Math.cos(ry), s = Math.sin(ry);
    const corners = [[-side, -behind], [side, -behind], [-side, front], [side, front]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
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
  b.place('top', part(w, 0.035, d), M(cx, h - 0.0175, cz));
  b.place('wood', part(w - 0.08, 0.07, 0.025), M(cx, h - 0.07, z1 - 0.05));
  b.place('wood', part(w - 0.08, 0.07, 0.025), M(cx, h - 0.07, z0 + 0.05));
  b.place('wood', part(0.025, 0.07, d - 0.1), M(x0 + 0.05, h - 0.07, cz));
  b.place('wood', part(0.025, 0.07, d - 0.1), M(x1 - 0.05, h - 0.07, cz));
  for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [z0 + 0.05, z1 - 0.05]) b.place('wood', turnedLeg(0.028, h - 0.035), M(x, 0, z));
  if (stretcher) {
    for (const x of [x0 + 0.05, x1 - 0.05]) b.place('wood', part(0.03, 0.03, d - 0.1), M(x, 0.1, cz));
    b.place('wood', part(w - 0.1, 0.03, 0.03), M(cx, 0.1, cz));
  }
}
