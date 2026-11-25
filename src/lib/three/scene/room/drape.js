// The fabrics' folds (PLAN.fabrics): each cloth starts laid along its path a little above the
// piece it belongs to, falls under gravity onto that piece's solid parts (boxes made from the same
// sizes the furniture is built from: SEAT, PLAN.tables, the window frame in room.js) and is run
// until it is still (cloth.js). Worked out once, at load. No three.js here, so it runs in a Worker
// (drapeWorker.js) or in Node (research/tools/drape-check.mjs).

import { ClothSim } from './cloth.js';
import { PLAN } from './plan.js';
import { SEAT } from './seat.js';

const SPACING = 0.04; // metres between particles
// The mesh is drawn through a grid this many times finer, smoothed along Catmull-Rom curves, so
// the 4 cm grid does not show as facets up close (smoothGrid).
const SPLIT = 2;

/** The piece a fabric lies on: its colliders (in its own frame) and where that frame stands. */
export function pieceOf(on) {
  const [kind, n] = on.split(' ');
  if (kind === 'settee') return { frame: frameOf(PLAN.settee), ...seatSolids(PLAN.settee) };
  if (kind === 'chair') return { frame: frameOf(PLAN.chairs[n]), ...seatSolids(PLAN.chairs[n]) };
  if (kind === 'table') return tablePiece(PLAN.tables[n]);
  if (kind === 'window') return windowPiece(PLAN.backWindows[n]);
  throw new Error(`fabric on unknown piece ${on}`);
}

const frameOf = ({ x, z, ry }) => ({ x, z, ry });

/**
 * A seat's solid parts, after buildSeat (furniture.js): the seat and the leaning back as boxes;
 * the arms, the posts and the arched top of the crest rail as round bars (capsules).
 */
function seatSolids({ w, d, back, settee = false }) {
  const { height: seat, armTop, armJoin, lean, scroll, inset } = SEAT;
  const hx = w / 2 - inset;
  const hz = d / 2 - inset;
  const pz = (y) => -hz - Math.tan(lean) * (y - seat);
  const up = [Math.cos(lean), -Math.sin(lean)]; // the leaning back's up, in (y, z)
  const boxes = [];
  const capsules = [];
  const leaning = (x, y0, y1, sw, sd) => {
    const len = (y1 - y0) / Math.cos(lean);
    const ym = (y0 + y1) / 2;
    boxes.push([[x, ym, pz(ym)], [sw, len, sd], -lean]);
  };
  boxes.push([[0, seat - 0.035, 0], [w, 0.07, d], 0]);
  const z0 = pz(armJoin) + 0.01;
  const z1 = hz + scroll;
  // A fold over a round bar is a chain of straight 4 cm segments, which cut up to 6 mm inside the
  // curve: so every bar the cloth folds over stands CLEAR above the part it stands for.
  const CLEAR = 0.008;
  const armR = 0.032; // the arm is 44 mm wide (SEAT.arm), its top at 0.69
  for (const s of [-1, 1]) {
    capsules.push([[s * hx, 0.69 - armR + CLEAR, z0], [s * hx, 0.69 - armR + CLEAR, z1], armR]);
    capsules.push([[s * hx, 0, hz], [s * hx, armTop, hz], SEAT.frontLeg]);
    capsules.push([[s * hx, seat - 0.06, pz(seat - 0.06)], [s * hx, back, pz(back)], SEAT.backPost[0] / 2]);
  }
  const yCrest = back - SEAT.crest.below;
  leaning(0, seat + 0.08, yCrest, 2 * hx, 0.024); // rails, panel and spindles, as one board
  // The crest rail's arch: 0.07 at the ends up to the peak in the middle. Its top is a chain of
  // round bars of radius r; under them the board, in slices.
  const half = hx + SEAT.crest.overhang;
  const peak = settee ? SEAT.crest.setteePeak : SEAT.crest.peak;
  const r = 0.025;
  const n = 8;
  const top = (x) => 0.07 + (peak - 0.07) * Math.sqrt(Math.max(0, 1 - (x / half) ** 2)) - r + CLEAR;
  const at = (x, h) => [x, yCrest + up[0] * h, pz(yCrest) + up[1] * h];
  for (let k = 0; k < n; k++) {
    const xa = -half + (k * 2 * half) / n;
    const xb = xa + (2 * half) / n;
    capsules.push([at(xa, top(xa)), at(xb, top(xb)), r]);
    const xm = (xa + xb) / 2;
    const h = top(xm);
    boxes.push([at(xm, (h - CLEAR) / 2), [xb - xa + 0.002, h - CLEAR, 0.024 + 2 * SEAT.crest.bevel], -lean]);
  }
  return { boxes, capsules };
}

/** A table (buildTable): the top and the four legs, in a frame at its middle. */
function tablePiece({ x0, x1, z0, z1, h }) {
  const w = x1 - x0;
  const d = z1 - z0;
  // The top as a rounded slab: its four edges as round bars a little proud of the corner (as the
  // seats' fold edges), so the cloth folds over them instead of the 4 cm grid cutting the corner;
  // the box only inside the bars, and at each corner a ball a little larger than the bars. A box
  // out to the edges put a sharp corner outside the bars, and the cloth over it showed the
  // table's corner through (research/tools/drape-poke.mjs).
  const r = 0.0175;
  const ex = w / 2 - r;
  const ez = d / 2 - r;
  const y = h - r;
  const R = r + 0.008;
  const boxes = [[[0, h - 0.0175, 0], [2 * ex, 0.035, 2 * ez], 0]];
  const capsules = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) capsules.push([[sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)], [sx * (w / 2 - 0.05), h, sz * (d / 2 - 0.05)], 0.028]);
  capsules.push([[-ex, y, -ez], [ex, y, -ez], R], [[-ex, y, ez], [ex, y, ez], R], [[-ex, y, -ez], [-ex, y, ez], R], [[ex, y, -ez], [ex, y, ez], R]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) capsules.push([[sx * ex, y, sz * ez], [sx * ex, y, sz * ez], R + 0.004]);
  return { frame: { x: (x0 + x1) / 2, z: (z0 + z1) / 2, ry: 0 }, boxes, capsules };
}

/**
 * A back window (room.js): the lattice rail (a round bar on top of the lower half of its box), the
 * lattice panel, the bottom rail and the jambs.
 */
function windowPiece({ x0, x1 }) {
  const ww = x1 - x0;
  const top = PLAN.window.lattice;
  const capsules = [[[-ww / 2, top + 0.03 + 0.008, -0.02], [ww / 2, top + 0.03 + 0.008, -0.02], 0.04]]; // 8 mm clear of the rail's top (seatSolids)
  const boxes = [
    [[0, top + 0.015, -0.02], [ww, 0.03, 0.07], 0],
    [[0, (0.09 + top) / 2, -0.02], [ww, top - 0.09, 0.012], 0],
    [[0, 0.06, -0.02], [ww, 0.05, 0.06], 0],
  ];
  for (const s of [-1, 1]) boxes.push([[s * (ww / 2 + 0.035), 1.2, -0.01], [0.07, 2.4, 0.09], 0]);
  return { frame: { x: (x0 + x1) / 2, z: PLAN.room.z0, ry: 0 }, boxes, capsules };
}

/** A small seeded random stream (mulberry32 on an FNV-1a hash of the text). */
function random(text) {
  let a = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 0x01000193);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The point at distance s along a polyline of [a, y] points, and the path's unit normal there. */
function along(path, s) {
  for (let k = 0; k < path.length - 1; k++) {
    const [a0, y0] = path[k];
    const [a1, y1] = path[k + 1];
    const len = Math.hypot(a1 - a0, y1 - y0);
    if (s <= len || k === path.length - 2) {
      const t = Math.min(1, s / len);
      return [a0 + (a1 - a0) * t, y0 + (y1 - y0) * t, -(y1 - y0) / len, (a1 - a0) / len];
    }
    s -= len;
  }
}

/**
 * Lays one fabric along its path, drops it and settles it. Returns its grid (cols across its
 * width, rows along its length) in world space, ready for a mesh, and how the settling went.
 */
export function drape(place) {
  const t0 = performance.now();
  // A fabric folded `fold` times over (in half, then in half again) along its length, or
  // `foldAcross` times across its width, is draped as one sheet of its folded size: the layers lie together, and the mesh draws the second layer and the fold.
  const width = place.size[0] / 2 ** (place.foldAcross ?? 0);
  const length = place.size[1] / 2 ** (place.fold ?? 0);
  const cols = Math.round(width / SPACING) + 1;
  const rows = Math.round(length / SPACING) + 1;
  const sim = new ClothSim(width, length, cols, rows); // rest lengths from the flat cloth
  const { frame, boxes, capsules } = pieceOf(place.on);
  for (const [c, size, rx] of boxes) sim.addBox(c, size, rx);
  for (const [a, b, r] of capsules) sim.addCapsule(a, b, r);
  sim.floorY = 0.002;
  // A few soft ripples (up to 1.5 cm), so the folds are not perfectly symmetric.
  const rand = random(`fabric|${place.name}`);
  const waves = Array.from({ length: 3 }, () => [rand() * 6.28, rand() * 6.28, 2 + rand() * 4, 2 + rand() * 4]);
  const across = place.across ?? 0;
  for (let r = 0; r < rows; r++) {
    const [a, y, na, ny] = along(place.path, (r / (rows - 1)) * length);
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1) - 0.5) * width;
      const v = (r / (rows - 1)) * length;
      let lift = 0;
      for (const [p, q, f, g] of waves) lift += 0.005 * Math.sin(p + u * f) * Math.sin(q + v * g);
      const i = (r * cols + c) * 3;
      const pa = a + na * lift;
      const py = y + ny * lift;
      if (place.plane === 'yz') sim.pos.set([u + across, py, pa], i);
      else sim.pos.set([pa, py, u + across], i);
    }
  }
  sim.prev.set(sim.pos);
  sim.broadPhase(0.05);
  sim.collide(-Infinity); // start clear of every solid part
  sim.prev.set(sim.pos);
  const settled = sim.settle({ dt: 1 / 60, iterations: 6, friction: 0.8, grip: 0.004, minSteps: 90, maxSteps: 600 });
  // Which face is out (away from the furniture): the grid normal (along the width x along the
  // length) against the faces the touching particles were last pushed out through, by vote.
  let vote = 0;
  const P = sim.pos;
  for (let r = 1; r < rows - 1; r++)
    for (let c = 1; c < cols - 1; c++) {
      const i = (r * cols + c) * 3;
      const n = [sim.normal[i], sim.normal[i + 1], sim.normal[i + 2]];
      if (!n[0] && !n[1] && !n[2]) continue;
      const a = [0, 1, 2].map((k) => P[i + 3 + k] - P[i - 3 + k]);
      const b = [0, 1, 2].map((k) => P[i + cols * 3 + k] - P[i - cols * 3 + k]);
      const g = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      vote += Math.sign(g[0] * n[0] + g[1] * n[1] + g[2] * n[2]);
    }
  // The grid the mesh is drawn through: smoothed, then every point pushed out of the solid parts
  // as the particles were. A curve between two particles can cut a corner they both clear: the
  // low table's corners showed through its cover by up to 13 mm (research/tools/drape-poke.mjs).
  const fine = smoothGrid(sim.pos, cols, rows, SPLIT);
  const fit = new ClothSim(width, length, fine.cols, fine.rows);
  for (const [c, size, rx] of boxes) fit.addBox(c, size, rx);
  for (const [a, b, r] of capsules) fit.addCapsule(a, b, r);
  fit.floorY = sim.floorY;
  fit.friction = 0; // a push only: no rub along the surface
  fit.pos.set(fine.pos);
  fit.prev.set(fit.pos);
  fit.broadPhase(0.05);
  fit.collide(-Infinity);
  fit.collide(-Infinity); // once more: a push out of one part can end inside the next
  // To the world: turned by ry about y, then moved to the piece's place (as buildSeat's F).
  const cos = Math.cos(frame.ry);
  const sin = Math.sin(frame.ry);
  const position = new Float32Array(fit.count * 3);
  for (let i = 0; i < fit.count; i++) {
    const [x, y, z] = [fit.pos[i * 3], fit.pos[i * 3 + 1], fit.pos[i * 3 + 2]];
    position[i * 3] = frame.x + x * cos + z * sin;
    position[i * 3 + 1] = y;
    position[i * 3 + 2] = frame.z - x * sin + z * cos;
  }
  return { name: place.name, grid: [cols, rows], cols: fine.cols, rows: fine.rows, position, out: vote < 0 ? -1 : 1, ms: performance.now() - t0, steps: settled.steps, fastest: settled.fastest, inside: sim.inside() || fit.inside() };
}

/** Catmull-Rom weights for t in [0, 1]. */
function cr(t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
}

/** A grid of points (x, y, z each) with every cell split in `split` both ways along Catmull-Rom curves. */
export function smoothGrid(position, cols, rows, split) {
  const nc = (cols - 1) * split + 1;
  const nr = (rows - 1) * split + 1;
  const pos = new Float64Array(nc * nr * 3);
  const at = (c, r, a) => position[(Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))) * 3 + a];
  for (let r = 0; r < nr; r++) {
    const r0 = Math.min(rows - 2, Math.floor(r / split));
    const wr = cr(r / split - r0);
    for (let c = 0; c < nc; c++) {
      const c0 = Math.min(cols - 2, Math.floor(c / split));
      const wc = cr(c / split - c0);
      for (let a = 0; a < 3; a++) {
        let v = 0;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) v += wr[i] * wc[j] * at(c0 - 1 + j, r0 - 1 + i, a);
        pos[(r * nc + c) * 3 + a] = v;
      }
    }
  }
  return { pos, cols: nc, rows: nr };
}
