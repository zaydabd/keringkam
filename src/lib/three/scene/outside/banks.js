// The river banks (reference R3). After .claude/skills/threejs-procedural-geometry: each bank is
// one cross-section (mud, grass, path, embankment) swept along its waterline (site.js), not a pile
// of boxes; the flat land behind it is one triangulated polygon, so no two faces share a plane;
// every band has one flat colour, which the ink pass reads as a part (toon.js); each builder
// measures what it made against a contract.
// Frame: metres, y up, the room's floor at y = 0; offsets are measured inland from the waterline.

import * as THREE from 'three';
import { createContract } from './contract.js';
import { SITE, sampleLine, smooth, mulberry32, rgb } from './site.js';

const lerp = (a, b, t) => a + (b - a) * t;

// Paint, as vertex colours. Tuned in the window shot against colours sampled from R3 (the scene's
// grade takes about a third of the colour out again, so these are stronger than the painting's).
export const BANK_PAINT = {
  mud: rgb('#70522e'),
  mudDark: rgb('#6e5234'),
  mudWet: rgb('#80603a'),
  mudDry: rgb('#c0a783'),
  mudFlat: rgb('#b39468'), // the bare flat at the bend of our bank
  berm: rgb('#839e46'),
  bermEdge: rgb('#587630'),
  rough: rgb('#74903a'),
  path: rgb('#a8905a'),
  verge: rgb('#7c9434'),
  lawnFoot: rgb('#839a36'),
  lawn: rgb('#9aa62f'),
  terrace: rgb('#93a03a'),
  meadow: rgb('#6b822d'),
  meadowFar: rgb('#74883a'),
  wall: rgb('#efe7d1'),
  reed: rgb('#4e6a2c'),
  tuft: rgb('#5c7630'),
  tick: rgb('#7c9030'),
  grass: rgb('#758c42'),
  grassEdge: rgb('#62803a'),
  fern: rgb('#4a7430'),
  fernLight: rgb('#6a9438'),
};

/** Sweeps bands between columns of points. rows[i][k] is station i, column k; colour(i, k) per quad. */
function sweep(w, slot, rows, colour, landOnLeft, stats) {
  for (let i = 0; i < rows.length - 1; i++) {
    for (let k = 0; k < rows[i].length - 1; k++) {
      const a = rows[i][k], b = rows[i + 1][k], c = rows[i + 1][k + 1], d = rows[i][k + 1];
      const col = colour(i, k);
      if (landOnLeft) w.quad(slot, a, d, c, b, col);
      else w.quad(slot, a, b, c, d, col);
      stats.quads++;
    }
  }
}

/** Fills a flat polygon (points [x, z]) at height y, facing up. */
function fill(w, slot, contour, y, colour) {
  const pts = contour.map(([x, z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(pts, []);
  for (const [i, j, k] of faces) {
    const a = [pts[i].x, y, pts[i].y], b = [pts[j].x, y, pts[j].y], c = [pts[k].x, y, pts[k].y];
    const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0;
    if (up) w.tri(slot, a, b, c, colour);
    else w.tri(slot, a, c, b, colour);
  }
  return faces.length;
}

/** What the sweep must satisfy whatever the numbers: no fold, every face up, no sliver. */
function checkSweep(contract, w, slot, rows, stations, from = 0) {
  let fold = Infinity;
  for (let i = 0; i < rows.length - 1; i++) {
    for (let k = 0; k < rows[i].length; k++) {
      const a = rows[i][k], b = rows[i + 1][k], s = stations[i];
      fold = Math.min(fold, (b[0] - a[0]) * s.tx + (b[2] - a[2]) * s.tz);
    }
  }
  contract.min('every column advances along the river (m per station; no fold)', fold, 0.05);
  const s = w.slot(slot);
  let minUp = Infinity, minArea = Infinity;
  for (let t = from; t < s.triangles; t++) {
    const p = s.position, o = t * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    minArea = Math.min(minArea, Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2);
    minUp = Math.min(minUp, s.normal[o + 1]);
  }
  contract.min('every ground face looks up (normal y)', minUp, 0.05);
  contract.min('smallest ground triangle (m2; no sliver)', minArea, 0.01);
}

/** A saw-tooth of upright blades along a line of points: reeds, grass at the water's edge. */
function fringe(w, points, { height, width, colour, rand, lean = 0.25, gap = 0 }) {
  let n = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const count = Math.max(1, Math.round(len / width));
    for (let j = 0; j < count; j++) {
      if (rand() < gap) continue; // a ragged edge has gaps
      const t0 = j / count, t1 = (j + 1) / count, tm = (j + 0.2 + rand() * 0.6) / count;
      const h = height[0] + rand() * (height[1] - height[0]);
      const P = (t, up, side) => [lerp(a[0], b[0], t) + side * (b[0] - a[0]) / len, lerp(a[1], b[1], t) + up, lerp(a[2], b[2], t) + side * (b[2] - a[2]) / len];
      w.tri('blade', P(t0, -0.05, 0), P(t1, -0.05, 0), P(tm, h, (rand() - 0.5) * 2 * lean * h), colour);
      n++;
    }
  }
  return n;
}

/** A tuft: a few blades fanned from one root. */
function tuft(w, at, dir, { height, width, colour, rand, blades = 3 }) {
  for (let j = 0; j < blades; j++) {
    const f = (j + 0.5) / blades - 0.5; // -0.5 .. 0.5 across the fan
    const h = height * (0.7 + rand() * 0.5) * (1 - Math.abs(f) * 0.5);
    const c = at[0] + dir[0] * f * width, d = at[2] + dir[1] * f * width;
    const half = (width / blades) * 0.7;
    w.tri('blade', [c - dir[0] * half, at[1] - 0.03, d - dir[1] * half], [c + dir[0] * half, at[1] - 0.03, d + dir[1] * half], [c + dir[0] * f * h * 1.1, at[1] + h, d + dir[1] * f * h * 1.1], colour);
  }
  return blades;
}

/**
 * The far bank: mud at the water, rough grass, a worn path, then on the right the mown embankment
 * the Assembly's grounds end in, with a pale retaining wall on its terrace; on the left a natural
 * bank rising to a meadow. Writes slots 'paint' (ground) and 'blade' (reeds and tufts, two-sided).
 */
export function buildFarBank(w, { seed = 0 } = {}) {
  const S = SITE, F = S.far, C = BANK_PAINT;
  const rand = mulberry32(211 + seed);
  const stations = sampleLine(S.farLine, { landOnLeft: false, rate: 0.045, min: 3, max: 45 });
  const lawnAt = (s) => smooth(F.lawnFrom[0], F.lawnFrom[1], s.x); // 0 natural bank, 1 embankment
  const footY = F.roughY + 0.1;
  const slopeLow = lerp(F.foot, F.crest, 0.2);
  // Columns: [offset inland, height for lawn amount L]
  const columns = [
    [-4, () => S.water - 1.2],
    [0, () => S.water],
    [F.mud, () => S.water + 0.45],
    [F.rough, () => F.roughY],
    [F.path, () => F.roughY + 0.05],
    [F.foot, () => footY],
    [slopeLow, (L) => lerp(footY, lerp(F.meadowY, F.crestY, L), 0.2)],
    [F.crest, (L) => lerp(F.meadowY, F.crestY, L)],
    [F.wall.offset, (L) => lerp(lerp(F.meadowY, F.crestY, L), F.backY, (F.wall.offset - F.crest) / (F.back - F.crest))],
    [F.back, () => F.backY],
  ];
  const rows = stations.map((s) => {
    const L = lawnAt(s);
    return columns.map(([o, y]) => [s.x + s.nx * o, y(L), s.z + s.nz * o]);
  });
  const bands = [
    () => C.mudDark, // under water
    () => C.mud,
    () => C.rough,
    () => C.path,
    () => C.verge,
    (L) => (L > 0.5 ? C.lawnFoot : C.meadow),
    (L) => (L > 0.5 ? C.lawn : C.meadow),
    (L) => (L > 0.5 ? C.terrace : C.meadowFar),
    (L) => (L > 0.5 ? C.terrace : C.meadowFar),
  ];
  const stats = { stations: stations.length, quads: 0, reeds: 0, tufts: 0, ticks: 0, wall: 0, land: 0 };
  sweep(w, 'paint', rows, (i, k) => bands[k]((lawnAt(stations[i]) + lawnAt(stations[i + 1])) / 2), false, stats);

  const contract = createContract('far bank');
  checkSweep(contract, w, 'paint', rows, stations);
  contract.near('waterline at the water level', Math.max(...rows.map((r) => Math.abs(r[1][1] - S.water))), 0, 1e-6);
  contract.range('embankment slope (degrees)', THREE.MathUtils.radToDeg(Math.atan2(F.crestY - footY, F.crest - F.foot)), 10, 25);
  contract.range('embankment height above the path (m)', F.crestY - footY, 2.5, 5);
  const right = stations.filter((s) => lawnAt(s) === 1).length, left = stations.filter((s) => lawnAt(s) === 0).length;
  contract.min('stations on the embankment', right, 8);
  contract.min('stations on the natural bank', left, 8);

  // The land behind, to where the haze ends: one polygon at the terrace's height.
  const E = S.extent;
  const outer = rows.map((r) => [r[r.length - 1][0], r[r.length - 1][2]]);
  stats.land = fill(w, 'paint', [...outer, [E.x1, E.z1], [E.x1, E.z0], [E.x0, E.z0], [E.x0, outer[0][1] - 110]], F.backY, C.terrace);
  contract.is('land behind: triangles = corners - 2', stats.land, outer.length + 4 - 2);

  // Retaining wall on the terrace (right part only): front, top, back.
  const W = F.wall;
  let prev = null;
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    if (s.x < W.from) continue;
    const base = rows[i][8];
    const at = (o, y) => [s.x + s.nx * o, y, s.z + s.nz * o];
    const cur = [at(W.offset, base[1] - 0.3), at(W.offset, base[1] + W.height), at(W.offset + 0.6, base[1] + W.height), at(W.offset + 0.6, base[1] - 0.3)];
    if (prev) {
      for (let k = 0; k < 3; k++) w.quad('paint', prev[k], cur[k], cur[k + 1], prev[k + 1], C.wall);
      stats.wall += 3;
    } else w.quad('paint', cur[0], cur[1], cur[2], cur[3], C.wall); // end cap
    prev = cur;
  }
  contract.min('wall segments', stats.wall / 3, 4);

  // Reeds along the top of the mud; tufts in the rough grass; ticks on the mown slope.
  const reach = (s) => Math.hypot(s.x, s.z + 5); // distance from the house
  const reedLine = [];
  for (let i = 0; i < stations.length; i++) if (reach(stations[i]) < 330) reedLine.push([rows[i][2][0], rows[i][2][1], rows[i][2][2]]);
  stats.reeds = fringe(w, reedLine, { height: [0.55, 1.25], width: 0.75, colour: C.reed, rand });
  for (let i = 0; i < stations.length - 1; i++) {
    const s = stations[i], n = stations[i + 1];
    if (reach(s) > 260) continue;
    const len = Math.hypot(n.x - s.x, n.z - s.z);
    const place = (o0, o1, y0, y1) => {
      const t = rand(), u = rand(), o = lerp(o0, o1, u);
      return [lerp(s.x, n.x, t) + lerp(s.nx, n.nx, t) * o, lerp(y0, y1, u), lerp(s.z, n.z, t) + lerp(s.nz, n.nz, t) * o];
    };
    const dir = [s.tx, s.tz];
    for (let k = 0; k < Math.round(len * 0.9); k++) stats.tufts += tuft(w, place(F.mud + 0.8, F.rough - 0.5, S.water + 0.45, F.roughY), dir, { height: 0.75, width: 1.1, colour: C.tuft, rand });
    const L = lawnAt(s);
    if (L === 1) for (let k = 0; k < Math.round(len * 0.35); k++) stats.ticks += tuft(w, place(slopeLow, F.crest - 1, lerp(footY, F.crestY, 0.2), F.crestY - 0.28), dir, { height: 0.42, width: 0.8, colour: C.tick, rand, blades: 2 });
  }
  const tri = w.triangles();
  contract.range('triangles', (tri.paint ?? 0) + (tri.blade ?? 0), 1500, 9000);
  // Where the bank's surface is, for what stands on it (trees.js).
  const profile = (o, L) => {
    if (o >= F.back) return F.backY;
    for (let k = columns.length - 2; k >= 0; k--) {
      if (o >= columns[k][0]) return lerp(columns[k][1](L), columns[k + 1][1](L), (o - columns[k][0]) / (columns[k + 1][0] - columns[k][0]));
    }
    return columns[0][1](L);
  };
  /** Height of the bank at a point, from the nearest station's cross-section. */
  const groundAt = (x, z) => {
    let best = stations[0], bd = Infinity, bo = 0;
    for (const s of stations) {
      const dx = x - s.x, dz = z - s.z;
      const along = dx * s.tx + dz * s.tz, off = dx * s.nx + dz * s.nz;
      const d = Math.hypot(along, off - Math.min(F.back, Math.max(0, off)));
      if (d < bd) [bd, best, bo] = [d, s, off];
    }
    return profile(bo, lawnAt(best));
  };
  /** The point `offset` metres inland of the waterline where the waterline's x is `xWater`: [x, y, z]. */
  const place = (xWater, offset) => {
    let i = 0;
    while (i < stations.length - 2 && stations[i + 1].x < xWater) i++;
    const a = stations[i], b = stations[i + 1];
    const t = Math.min(1, Math.max(0, (xWater - a.x) / (b.x - a.x)));
    const nx = lerp(a.nx, b.nx, t), nz = lerp(a.nz, b.nz, t);
    return [lerp(a.x, b.x, t) + nx * offset, profile(offset, lerp(lawnAt(a), lawnAt(b), t)) - 0.05, lerp(a.z, b.z, t) + nz * offset];
  };
  return { contract: contract.assert(), stats, stations, rows, lawnAt, groundAt, place };
}

/** One fern: fronds that rise from one root and arch over (two greens, so the ink pass parts them). */
function fern(w, at, { reach = 1.2, fronds = 9, colours, rand }) {
  let n = 0;
  for (let j = 0; j < fronds; j++) {
    const a = ((j + rand() * 0.6) / fronds) * Math.PI * 2;
    const L = reach * (0.75 + rand() * 0.4);
    const dx = Math.cos(a), dz = Math.sin(a);
    const spine = [[0, 0], [0.4, 0.58], [0.78, 0.66], [1, 0.42]].map(([out, up]) => [at[0] + dx * out * L, at[1] + up * L, at[2] + dz * out * L]);
    const half = [0.05, 0.11, 0.08, 0];
    const side = (k, s) => [spine[k][0] - dz * half[k] * s, spine[k][1], spine[k][2] + dx * half[k] * s];
    const col = colours[j % colours.length];
    for (let k = 0; k < 2; k++) w.quad('blade', side(k, -1), side(k, 1), side(k + 1, 1), side(k + 1, -1), col);
    w.tri('blade', side(2, -1), side(2, 1), spine[3], col);
    n += 5;
  }
  return n;
}

/**
 * Our bank, below the windows (R3): a low grass berm with a ragged edge at the water, a bare mud
 * track behind it that opens to the water at the bend, a patch of grass and tufts on the tip of
 * that mud flat, then a short shoulder up to the level grass the house stands on, and a fern.
 * Writes slots 'paint' and 'blade'.
 */
export function buildNearBank(w, { seed = 0 } = {}) {
  const S = SITE, N = S.near, C = BANK_PAINT;
  const rand = mulberry32(307 + seed);
  const stations = sampleLine(S.nearLine, { landOnLeft: true, rate: 0.045, min: 0.8, max: 40 });
  const grassAt = (x) => x < N.bermTo || (x > N.tip[0] && x < N.tip[1]); // grass at the water, or mud
  const mudY = S.water + 0.6, edgeY = S.ground - 0.15;
  const rows = stations.map((s) => {
    const at = (o, y) => [s.x + s.nx * o, y, s.z + s.nz * o];
    return [at(-4, S.water - 1), at(0, S.water), at(N.lip, S.water + 0.35), at(N.berm, N.bermY), at(N.mud, mudY), at(N.edge, edgeY), at(N.level, S.ground)];
  });
  const mid = (i) => (stations[i].x + stations[i + 1].x) / 2;
  const bands = [() => C.mudDark, () => C.mudWet, (g) => (g ? C.berm : C.mudFlat), () => C.mudDry, () => C.grassEdge, () => C.grass];
  const stats = { stations: stations.length, quads: 0, fringe: 0, tufts: 0, fern: 0, land: 0 };
  const from = w.slot('paint').triangles, bladesFrom = w.slot('blade').triangles;
  sweep(w, 'paint', rows, (i, k) => bands[k](grassAt(mid(i))), true, stats);

  const contract = createContract('near bank');
  checkSweep(contract, w, 'paint', rows, stations, from);
  contract.near('waterline at the water level', Math.max(...rows.map((r) => Math.abs(r[1][1] - S.water))), 0, 1e-6);
  contract.range('shoulder slope (degrees)', THREE.MathUtils.radToDeg(Math.atan2(edgeY - mudY, N.edge - N.mud)), 15, 40);
  contract.range('level grass above the water (m)', S.ground - S.water, 1, 2);

  // The level ground, to where the haze ends (the house stands on it).
  const E = S.extent;
  const inner = rows.map((r) => [r[6][0], r[6][2]]);
  stats.land = fill(w, 'paint', [...inner, [inner[inner.length - 1][0], E.z1], [E.x0, E.z1], [E.x0, inner[0][1] - 90]], S.ground, C.grass);
  contract.is('land behind: triangles = corners - 2', stats.land, inner.length + 3 - 2);

  // Ragged edges: the berm against the water, the level grass against the mud. Tufts where the
  // berm ends and on the tip; a few on the level grass.
  const reach = (s) => Math.hypot(s.x, s.z + 5);
  const runs = (keep, k) => {
    const out = [[]];
    for (let i = 0; i < stations.length; i++) {
      if (keep(stations[i])) out[out.length - 1].push(rows[i][k]);
      else if (out[out.length - 1].length) out.push([]);
    }
    return out.filter((r) => r.length > 1);
  };
  for (const run of runs((s) => reach(s) < 110 && grassAt(s.x), 2)) stats.fringe += fringe(w, run, { height: [0.12, 0.6], width: 0.3, colour: C.bermEdge, rand, lean: 0.6, gap: 0.3 });
  for (const run of runs((s) => reach(s) < 60, 5)) stats.fringe += fringe(w, run, { height: [0.04, 0.2], width: 0.13, colour: C.grassEdge, rand, lean: 0.8, gap: 0.35 });
  for (let i = 0; i < stations.length - 1; i++) {
    const s = stations[i], n = stations[i + 1];
    if (reach(s) > 70) continue;
    const len = Math.hypot(n.x - s.x, n.z - s.z);
    const place = (o0, o1, y) => {
      const t = rand(), o = lerp(o0, o1, rand());
      return [lerp(s.x, n.x, t) + s.nx * o, y, lerp(s.z, n.z, t) + s.nz * o];
    };
    const dir = [s.tx, s.tz];
    for (let k = 0; k < Math.round(len * 1.1 + rand()); k++) stats.tufts += tuft(w, place(N.edge + 0.8, N.level + 6, S.ground), dir, { height: 0.14, width: 0.35, colour: C.tick, rand, blades: 2 });
    const end = s.x > N.bermTo - 1.5 && s.x < N.bermTo + 0.3, tip = s.x > N.tip[0] && s.x < N.tip[1];
    if ((end || tip) && rand() < 0.7) stats.tufts += tuft(w, place(N.lip, N.berm * 0.8, S.water + 0.5), dir, { height: 0.3 + rand() * 0.35, width: 0.6, colour: C.tuft, rand, blades: 3 });
  }
  stats.fern = fern(w, [N.fern[0], S.ground - 0.05, N.fern[1]], { reach: 1.05, colours: [C.fern, C.fernLight], rand });
  contract.min('fern fronds', stats.fern / 5, 7);
  contract.range('near bank triangles', w.slot('paint').triangles - from + w.slot('blade').triangles - bladesFrom, 800, 7000);
  return { contract: contract.assert(), stats, stations, rows };
}
