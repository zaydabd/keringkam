// The house seen from outside (branch house-exterior): the room (PLAN.room) standing on the
// ground on a low concrete plinth (no stilts: the user's choice), clad in painted weatherboards,
// under a hipped zinc roof, with a door, a small landing and steps down to the ground. The ground
// round the house is a terrace just below the floor; a grass bank drops from it to the waterfront
// street's level (SITE.ground), below the window shot's frame. Built around the room, never inside it, so the interior
// views stay as they were.
//
// References (supplied by the user, not in the repo; their licences are unknown):
//   E1, a two-storey timber house: ochre-painted walls, white window frames and trim, a red zinc
//       hipped roof with white fascia, stairs up the front.
//   E4, a small timber house on posts on a river bank: bare posts with diagonal braces, plank
//       walls, a corrugated zinc roof.
// Massing after E4 (one small room) but on the ground; finishes after E1. Every size below is an ESTIMATE
// unless its comment says otherwise. Materials: clad, zinc, trim, post, concrete, ground, earth
// (interior.js), and the room's frame for the door leaf.

import * as THREE from 'three';
import { PLAN } from '../world/plan.js';
import { V, dice, indexed } from './builder.js';
import { SITE } from '../world/site.js';
import { HOUSE } from '../world/house.js';

const STREET = SITE.ground; // the waterfront street and its grass (-1.85)
const R = PLAN.room;
const W = PLAN.window;

/** The windows of each wall as [a0, a1, y0, y1] along the wall, with the frames around them. */
function openings() {
  const back = PLAN.backWindows.map((w) => [w.x0 - 0.07, w.x1 + 0.07, -0.01, W.y1 + 0.1]);
  const s = PLAN.sideWindow;
  const side = [[s.z0 - 0.07, s.z1 + 0.07, s.y0 - 0.02, W.y1 + 0.1]];
  const d = HOUSE.door;
  const front = [[d.x - d.w / 2 - 0.07, d.x + d.w / 2 + 0.07, -0.01, d.h + 0.08]];
  return { back, side, front, left: [] };
}

/**
 * One wall of horizontal weatherboards. `along(a, y)` maps a position along the wall and a height
 * to the world; `ry` turns a board to lie along the wall; `tilt` is the lap's sign for that face.
 */
function weatherboards(b, from, to, holes, job, place) {
  const C = HOUSE.clad;
  let row = 0;
  for (let y = C.bottom; y < HOUSE.frieze - 0.01; y += C.board, row++) {
    const y1 = Math.min(y + C.board, HOUSE.frieze);
    // Cut the row at every opening it crosses.
    const cuts = holes.filter((o) => o[2] < y1 - 0.01 && o[3] > y + 0.01).sort((p, q) => p[0] - q[0]);
    let a = from;
    for (const o of [...cuts, [to, to]]) {
      if (o[0] - a > 0.02) place(a, o[0], (y + y1) / 2, y1 - y + 0.02, dice(job, row, a.toFixed(2))());
      a = Math.max(a, o[1]);
    }
  }
}

/** A flat convex polygon (world points, counter-clockwise seen from `up`) made solid `t` thick. */
function slab(points, t) {
  const n = new THREE.Vector3().subVectors(points[1], points[0]).cross(new THREE.Vector3().subVectors(points[2], points[0])).normalize();
  const top = points.map((p) => p.clone().addScaledVector(n, t));
  const pos = [];
  const tri = (a, c, d) => pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  for (let i = 1; i < points.length - 1; i++) {
    tri(top[0], top[i], top[i + 1]);
    tri(points[0], points[i + 1], points[i]);
  }
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    tri(points[i], points[j], top[j]);
    tri(points[i], top[j], top[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // UVs in metres on the sheet's plane.
  const u = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const uv = [];
  for (let i = 0; i < pos.length; i += 3) {
    const p = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]);
    uv.push(p.dot(u), p.dot(v));
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return indexed(g);
}

export function buildExterior(b) {
  const { x0, x1, z0, z1 } = R;
  const o = HOUSE.out;
  const X0 = x0 - o, X1 = x1 + o, Z0 = z0 - o, Z1 = z1 + o; // the cladding's outer faces
  const holes = openings();
  const t = 0.02; // board thickness
  const C = HOUSE.clad;

  // --- Walls: weatherboards, tilted so each board's foot stands proud of the one below ----------
  const lap = C.lap;
  weatherboards(b, X0, X1, holes.back, 'house/clad/back', (a0, a1, y, h, r) => b.box('clad', a1 - a0, h, t, (a0 + a1) / 2, y, Z0 + t / 2 - 0.012, -lap, 0, 0, 0.12 + r * 0.04));
  weatherboards(b, X0, X1, holes.front, 'house/clad/front', (a0, a1, y, h, r) => b.box('clad', a1 - a0, h, t, (a0 + a1) / 2, y, Z1 - t / 2 + 0.012, lap, 0, 0, 0.12 + r * 0.04));
  weatherboards(b, Z0, Z1, holes.side, 'house/clad/right', (a0, a1, y, h, r) => b.box('clad', t, h, a1 - a0, X1 - t / 2 + 0.012, y, (a0 + a1) / 2, 0, 0, -lap, 0.12 + r * 0.04));
  weatherboards(b, Z0, Z1, holes.left, 'house/clad/left', (a0, a1, y, h, r) => b.box('clad', t, h, a1 - a0, X0 + t / 2 - 0.012, y, (a0 + a1) / 2, 0, 0, lap, 0.12 + r * 0.04));
  // Behind the boards: a dark lining, in strips round the openings, so no gap shows daylight.
  liningStrips(b, holes, { X0, X1, Z0, Z1 });

  // Corner boards, a skirting board along the bottom of the cladding, the frieze and its rails.
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) b.box('trim', 0.14, HOUSE.plate - C.bottom + 0.02, 0.14, x + Math.sign(x - (X0 + X1) / 2) * -0.04, (HOUSE.plate + C.bottom) / 2, z + Math.sign(z - (Z0 + Z1) / 2) * -0.04, 0, 0, 0, 0.05);
  frieze(b, X0, X1, Z0, Z1);
  for (const [w, d, x, z] of [[X1 - X0, 0.05, (X0 + X1) / 2, Z0 - 0.01], [X1 - X0, 0.05, (X0 + X1) / 2, Z1 + 0.01], [0.05, Z1 - Z0, X0 - 0.01, (Z0 + Z1) / 2], [0.05, Z1 - Z0, X1 + 0.01, (Z0 + Z1) / 2]]) {
    b.box('trim', w, 0.12, d, x, C.bottom + 0.05, z, 0, 0, 0, 0.04); // skirting
    b.box('trim', w, 0.07, d, x, HOUSE.frieze, z, 0, 0, 0, 0.04); // frieze rail
  }

  // --- Window and door surrounds, outside: white architraves, sills, reveal linings -------------
  const surround = (along, a0, a1, y0, y1, place) => {
    const w = a1 - a0;
    place(a0 - 0.05, (y0 + y1) / 2, 0.1, y1 - y0 + 0.1, 0.035); // jambs
    place(a1 + 0.05, (y0 + y1) / 2, 0.1, y1 - y0 + 0.1, 0.035);
    place((a0 + a1) / 2, y1 + 0.07, w + 0.3, 0.14, 0.045); // head, with a small drip cap above
    place((a0 + a1) / 2, y1 + 0.155, w + 0.38, 0.04, 0.075);
    if (y0 > 0.05) place((a0 + a1) / 2, y0 - 0.03, w + 0.26, 0.06, 0.07); // sill
  };
  for (const [a0, a1, y0, y1] of holes.back) {
    surround('x', a0, a1, Math.max(y0, 0), y1, (a, y, w, h, d) => b.box('trim', w, h, d, a, y, Z0 - d / 2 + 0.01, 0, 0, 0, 0.03));
    reveal(b, 'x', a0, a1, y0, y1, z0 - 0.025, Z0);
  }
  for (const [a0, a1, y0, y1] of holes.side) {
    surround('z', a0, a1, y0, y1, (a, y, w, h, d) => b.box('trim', d, h, w, X1 + d / 2 - 0.01, y, a, 0, 0, 0, 0.03));
    reveal(b, 'z', a0, a1, y0, y1, x1 + 0.025, X1);
  }
  // The door: a white surround, a planked leaf (closed), a step-sill.
  const D = HOUSE.door;
  const [da0, da1, , dy1] = holes.front[0];
  surround('x', da0, da1, 0, dy1, (a, y, w, h, d) => b.box('trim', w, h, d, a, y, Z1 + d / 2 - 0.01, 0, 0, 0, 0.03));
  reveal(b, 'x', da0, da1, -0.01, dy1, z1 + 0.025, Z1);
  for (let k = 0, x = D.x - D.w / 2; k < 6; k++, x += D.w / 6) b.box('frame', D.w / 6 - 0.004, D.h, 0.04, x + D.w / 12, D.h / 2, z1 + 0.06, 0, 0, 0, 0.2);
  for (const y of [0.3, D.h / 2, D.h - 0.3]) b.box('frame', D.w - 0.06, 0.12, 0.025, D.x, y, z1 + 0.09, 0, 0, 0, 0.1); // ledges
  b.box('trim', D.w + 0.2, 0.04, 0.12, D.x, -0.02, Z1 + 0.02, 0, 0, 0, 0.03);

  // --- The plinth: a concrete base wall from the ground up under the cladding -------------------
  const GH = HOUSE.ground.y;
  const pt = HOUSE.plinth;
  const ph = C.bottom + 0.03 - GH;
  const py = GH + ph / 2 - 0.02;
  b.box('concrete', X1 - X0 + 0.04, ph, pt, (X0 + X1) / 2, py, Z0 + pt / 2 - 0.02, 0, 0, 0, 0.04);
  b.box('concrete', X1 - X0 + 0.04, ph, pt, (X0 + X1) / 2, py, Z1 - pt / 2 + 0.02, 0, 0, 0, 0.04);
  b.box('concrete', pt, ph, Z1 - Z0 - 2 * pt + 0.04, X0 + pt / 2 - 0.02, py, (Z0 + Z1) / 2, 0, 0, 0, 0.04);
  b.box('concrete', pt, ph, Z1 - Z0 - 2 * pt + 0.04, X1 - pt / 2 + 0.02, py, (Z0 + Z1) / 2, 0, 0, 0, 0.04);
  // Air vents in the plinth (small dark grilles), as houses on the ground keep the floor dry.
  for (let x = X0 + 0.9; x < X1 - 0.5; x += 1.5) for (const z of [Z0 - 0.025, Z1 + 0.025]) b.box('post', 0.24, 0.1, 0.02, x, py, z, 0, 0, 0, 0);
  for (let z = Z0 + 0.9; z < Z1 - 0.5; z += 1.5) for (const x of [X0 - 0.025, X1 + 0.025]) b.box('post', 0.02, 0.1, 0.24, x, py, z, 0, 0, 0, 0);

  // --- The roof: a hipped roof of corrugated zinc sheets, with white fascia boards ---------------
  roof(b, X0, X1, Z0, Z1);

  // --- Landing and stairs at the door --------------------------------------------------------------
  stairs(b, Z1);

  // --- Ground: the terrace round the house, and the grass bank down to the street ------------------
  const Gd = HOUSE.ground;
  const deep = SITE.water - 0.2; // solid down below the river, so no edge shows a gap
  b.box('ground', Gd.x1 - Gd.x0, GH - deep, Gd.z1 - Gd.z0, (Gd.x0 + Gd.x1) / 2, (GH + deep) / 2, (Gd.z0 + Gd.z1) / 2, 0, 0, 0, 0);
  b.add('ground', slab([V(Gd.x0, GH, Gd.z0), V(Gd.x1, GH, Gd.z0), V(Gd.x1, STREET, Gd.bankFoot), V(Gd.x0, STREET, Gd.bankFoot)], 0.05), 0, false);
  // Under the bank: solid down below the river too (beyond the street's ends it stands in the water).
  b.box('ground', Gd.x1 - Gd.x0, STREET - deep, Gd.z0 - Gd.bankFoot, (Gd.x0 + Gd.x1) / 2, (STREET + deep) / 2, (Gd.z0 + Gd.bankFoot) / 2, 0, 0, 0, 0);
  // A strip of bare earth along the plinth's foot, where rain off the eaves keeps the grass away.
  const e = 0.5;
  for (const [w, d, x, z] of [[X1 - X0 + 2 * e, e, (X0 + X1) / 2, Z0 - e / 2], [X1 - X0 + 2 * e, e, (X0 + X1) / 2, Z1 + e / 2], [e, Z1 - Z0, X0 - e / 2, (Z0 + Z1) / 2], [e, Z1 - Z0, X1 + e / 2, (Z0 + Z1) / 2]])
    b.box('earth', w, 0.02, d, x, GH + 0.004, z, 0, 0, 0, 0);
}

/** The dark lining behind the cladding, as strips around each wall's openings (no daylight through gaps). */
function liningStrips(b, holes, { X0, X1, Z0, Z1 }) {
  const y0 = HOUSE.clad.bottom, y1 = HOUSE.plate;
  const strips = (from, to, list, place) => {
    let a = from;
    for (const o of [...list].sort((p, q) => p[0] - q[0])) {
      if (o[0] > a) place(a, o[0], y0, y1);
      if (o[2] > y0) place(o[0], o[1], y0, o[2]); // below the opening
      place(o[0], o[1], o[3], y1); // above it
      a = o[1];
    }
    if (to > a) place(a, to, y0, y1);
  };
  strips(X0, X1, holes.back, (a0, a1, b0, b1) => b.box('post', a1 - a0, b1 - b0, 0.02, (a0 + a1) / 2, (b0 + b1) / 2, R.z0 - 0.05, 0, 0, 0, 0));
  strips(X0, X1, holes.front, (a0, a1, b0, b1) => b.box('post', a1 - a0, b1 - b0, 0.02, (a0 + a1) / 2, (b0 + b1) / 2, R.z1 + 0.05, 0, 0, 0, 0));
  strips(Z0, Z1, holes.side, (a0, a1, b0, b1) => b.box('post', 0.02, b1 - b0, a1 - a0, R.x1 + 0.05, (b0 + b1) / 2, (a0 + a1) / 2, 0, 0, 0, 0));
  strips(Z0, Z1, [], (a0, a1, b0, b1) => b.box('post', 0.02, b1 - b0, a1 - a0, R.x0 - 0.05, (b0 + b1) / 2, (a0 + a1) / 2, 0, 0, 0, 0));
}

/** White boards lining an opening's sides and head, from the inner wall (`inner`) to the cladding (`outer`). */
function reveal(b, axis, a0, a1, y0, y1, inner, outer) {
  const d = Math.abs(outer - inner);
  const c = (inner + outer) / 2;
  const put = (a, y, w, h) => (axis === 'x' ? b.box('trim', w, h, d, a, y, c, 0, 0, 0, 0.03) : b.box('trim', d, h, w, c, y, a, 0, 0, 0, 0.03));
  put(a0 + 0.01, (y0 + y1) / 2, 0.02, y1 - y0);
  put(a1 - 0.01, (y0 + y1) / 2, 0.02, y1 - y0);
  put((a0 + a1) / 2, y1 - 0.01, a1 - a0, 0.02);
}

/** The vented frieze between the wall top rail and the roof plate: white boards with slots. */
function frieze(b, X0, X1, Z0, Z1) {
  const y0 = HOUSE.frieze + 0.035, y1 = HOUSE.plate;
  const h = y1 - y0;
  const run = (from, to, place) => {
    for (let a = from; a < to - 0.05; a += 0.16) place(a + 0.05, 0.1); // slats, with 6 cm vents between them
  };
  run(X0, X1, (a, w) => {
    b.box('trim', w, h, 0.02, a, (y0 + y1) / 2, Z0 + 0.01, 0, 0, 0, 0.03);
    b.box('trim', w, h, 0.02, a, (y0 + y1) / 2, Z1 - 0.01, 0, 0, 0, 0.03);
  });
  run(Z0, Z1, (a, w) => {
    b.box('trim', 0.02, h, w, X0 + 0.01, (y0 + y1) / 2, a, 0, 0, 0, 0.03);
    b.box('trim', 0.02, h, w, X1 - 0.01, (y0 + y1) / 2, a, 0, 0, 0, 0.03);
  });
  b.box('trim', X1 - X0 + 0.06, 0.06, Z1 - Z0 + 0.06, (X0 + X1) / 2, y1 + 0.03, (Z0 + Z1) / 2, 0, 0, 0, 0.02); // the plate
}

/** The hipped roof: four sheets of zinc with ribs down the slope, hip and ridge cappings, fascia. */
function roof(b, X0, X1, Z0, Z1) {
  const Rf = HOUSE.roof;
  const tan = Math.tan(THREE.MathUtils.degToRad(Rf.pitch));
  const o = Rf.overhang;
  const ex0 = X0 - o, ex1 = X1 + o, ez0 = Z0 - o, ez1 = Z1 + o; // the eaves
  const E = HOUSE.plate + 0.06 - o * tan; // the sheets' underside at the eaves
  const A = (ex1 - ex0) / 2; // the ridge runs along z (the long way)
  const cx = (ex0 + ex1) / 2;
  const top = E + A * tan;
  const r0 = V(cx, top, ez0 + A), r1 = V(cx, top, ez1 - A);
  const c = { a: V(ex0, E, ez0), b: V(ex1, E, ez0), c: V(ex1, E, ez1), d: V(ex0, E, ez1) };
  const t = Rf.sheet;
  // Counter-clockwise seen from above, so each slab grows upwards.
  b.add('zinc', slab([c.d, c.a, r0, r1].reverse(), t), 0.06, false);
  b.add('zinc', slab([c.b, c.c, r1, r0].reverse(), t), 0.06, false);
  b.add('zinc', slab([c.a, c.b, r0].reverse(), t), 0.06, false);
  b.add('zinc', slab([c.c, c.d, r1].reverse(), t), 0.06, false);
  // Ribs: each runs from the eave up the slope until it meets the ridge or a hip.
  const lift = t + 0.012;
  const n = (dx, dz) => V(-dx * Math.sin(Math.atan(tan)), Math.cos(Math.atan(tan)), -dz * Math.sin(Math.atan(tan))); // the sheet's normal on a slope rising in (dx, dz)
  const rib = (a, d, nrm) => b.beam('zinc', a.clone().addScaledVector(nrm, lift), d.clone().addScaledVector(nrm, lift), 0.035, 0.022, 0.02);
  for (let z = ez0 + Rf.rib / 2; z < ez1; z += Rf.rib) {
    const run = Math.min(A, z - ez0, ez1 - z);
    rib(V(ex0, E, z), V(ex0 + run, E + run * tan, z), n(1, 0));
    rib(V(ex1, E, z), V(ex1 - run, E + run * tan, z), n(-1, 0));
  }
  for (let x = ex0 + Rf.rib / 2; x < ex1; x += Rf.rib) {
    const run = Math.min(x - ex0, ex1 - x);
    rib(V(x, E, ez0), V(x, E + run * tan, ez0 + run), n(0, 1));
    rib(V(x, E, ez1), V(x, E + run * tan, ez1 - run), n(0, -1));
  }
  // Cappings over the ridge and the four hips.
  const cap = (p, q) => b.beam('zinc', p.clone().add(V(0, t + 0.03, 0)), q.clone().add(V(0, t + 0.03, 0)), 0.2, 0.05, 0.02);
  cap(r0, r1);
  for (const [p, q] of [[c.a, r0], [c.b, r0], [c.c, r1], [c.d, r1]]) cap(p, q);
  // Fascia boards under the eaves' edge, and a soffit lining from the fascia back to the wall.
  for (const [w, d, x, z] of [[ex1 - ex0, 0.025, cx, ez0], [ex1 - ex0, 0.025, cx, ez1], [0.025, ez1 - ez0, ex0, (ez0 + ez1) / 2], [0.025, ez1 - ez0, ex1, (ez0 + ez1) / 2]]) b.box('trim', w, 0.2, d, x, E - 0.06, z, 0, 0, 0, 0.03);
  const sy = E - 0.15;
  b.box('trim', ex1 - ex0, 0.015, o, cx, sy, ez0 + o / 2, 0, 0, 0, 0.03);
  b.box('trim', ex1 - ex0, 0.015, o, cx, sy, ez1 - o / 2, 0, 0, 0, 0.03);
  b.box('trim', o, 0.015, ez1 - ez0 - 2 * o, ex0 + o / 2, sy, (ez0 + ez1) / 2, 0, 0, 0, 0.03);
  b.box('trim', o, 0.015, ez1 - ez0 - 2 * o, ex1 - o / 2, sy, (ez0 + ez1) / 2, 0, 0, 0, 0.03);
  // The soffit hangs below the sheets: close the gap between it and the frieze with a board.
  for (const [w, d, x, z] of [[X1 - X0, 0.02, (X0 + X1) / 2, Z0 - 0.01], [X1 - X0, 0.02, (X0 + X1) / 2, Z1 + 0.01], [0.02, Z1 - Z0, X0 - 0.01, (Z0 + Z1) / 2], [0.02, Z1 - Z0, X1 + 0.01, (Z0 + Z1) / 2]])
    if (HOUSE.plate - sy > 0) b.box('trim', w, Math.max(0.02, HOUSE.plate + 0.06 - sy), d, x, (HOUSE.plate + 0.06 + sy) / 2, z, 0, 0, 0, 0.03);
}

/** The landing outside the door and the steps down to the terrace, in concrete. */
function stairs(b, Z1) {
  const D = HOUSE.door;
  const L = HOUSE.landing;
  const S = HOUSE.stairs;
  const GH = HOUSE.ground.y;
  const lz0 = Z1 - 0.02, lz1 = Z1 + L.depth;
  b.box('concrete', L.width, -GH - 0.03, lz1 - lz0, D.x, (GH - 0.03) / 2, (lz0 + lz1) / 2, 0, 0, 0, 0.05);
  b.box('floor', L.width, 0.03, lz1 - lz0, D.x, -0.015, (lz0 + lz1) / 2, 0, 0, 0, 0.1); // a timber deck on it, level with the floor
  const risers = Math.round(-GH / S.rise);
  const rise = -GH / risers;
  for (let k = 1; k < risers; k++) {
    const top = -k * rise;
    const z = lz1 + (k - 0.5) * S.going;
    b.box('concrete', S.width + 0.2, top - GH, S.going, D.x, (top + GH) / 2, z, 0, 0, 0, 0.05);
  }
}
