// The far river bank (reference R3; our side is the waterfront street since pass e11, see
// waterfront.js). Since pass e11 (the user's choice) the far bank too starts with the Kuching
// Waterfront's paved street and railing at the water (waterfront.js) in place of the bare mud, the
// eroded step and the rough grass; the path, the embankment, the lawn and the land behind stay.
// After .claude/skills/threejs-procedural-geometry: the bank is one cross-section (path, verge,
// embankment) swept along its waterline (site.js), not a pile of boxes; the flat land behind it
// is one triangulated polygon, so no two faces share a plane;
// every band has one flat colour, which the ink pass reads as a part (toon.js); each builder
// measures what it made against a contract.
// Frame: metres, y up, the room's floor at y = 0; offsets are measured inland from the waterline.

import * as THREE from 'three';
import { createContract } from './contract.js';
import { SITE, sampleLine, smooth, rgbTable, fbm } from '../world/site.js';
import { mulberry32 } from '../../../utils/rng.js';
import { OUTSIDE_THEME } from '../themes/index.js';
import { underForecourt } from './forecourt.js';
import { WATERFRONT, FRONT_PAINT, buildRailing, checkFooting, paveQuad } from './waterfront.js';
import { bridgePiers } from './bridge.js';
import { lerp } from '../../../utils/vec3.js';


// Paint, as vertex colours (themes/outside.js).
export const BANK_PAINT = rgbTable(OUTSIDE_THEME.farBank);

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

/**
 * What the sweep must satisfy whatever the numbers: no fold, every face up, no sliver. `slot` is a
 * slot name (faces from index `from`) or a list of [slot, from] pairs.
 */
export function checkSweep(contract, w, slot, rows, stations, from = 0, { minArea: smallest = 0.01, minAdvance = 0.05 } = {}) {
  let fold = Infinity;
  for (let i = 0; i < rows.length - 1; i++) {
    for (let k = 0; k < rows[i].length; k++) {
      const a = rows[i][k], b = rows[i + 1][k], s = stations[i];
      fold = Math.min(fold, (b[0] - a[0]) * s.tx + (b[2] - a[2]) * s.tz);
    }
  }
  contract.min('every column advances along the river (m per station; no fold)', fold, minAdvance);
  let minUp = Infinity, minArea = Infinity;
  for (const [name, start] of Array.isArray(slot) ? slot : [[slot, from]]) {
    const s = w.slot(name);
    for (let t = start; t < s.triangles; t++) {
      const p = s.position, o = t * 9;
      const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
      const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
      minArea = Math.min(minArea, Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2);
      minUp = Math.min(minUp, s.normal[o + 1], s.normal[o + 4], s.normal[o + 7]);
    }
  }
  contract.min('every ground face looks up (normal y)', minUp, 0.05);
  contract.min('smallest ground triangle (m2; no sliver)', minArea, smallest);
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
 * Relief of the far bank's natural ground. Every number is a design choice tuned by eye against
 * R3, not survey data. Heights are added to the flat bands of SITE.far; the mown embankment and
 * its terrace (lawn amount L = 1) get none, so they stay straight, as built ground is.
 */
export const FAR_RELIEF = {
  stations: { rate: 0.03, min: 2.5, max: 40 }, // finer than before, so a bump of 10 m shows near the house
  rough: { height: 0.35, along: 15, inland: 6 }, // ± on the path and verge (m)
  meadow: { height: [0.8, 2, 3], along: 42, inland: 34 }, // rolling ground left of the embankment: ± at its foot, crest and the terrace's distance (m)
  land: { columns: [33, 52, 70, 90], back: [135, 160] }, // extra columns between the crest and F.back; the gridded land behind fades flat by the last
};

/**
 * The far waterfront (pass e11; sizes ESTIMATED, as on our side, see waterfront.js): the railing's
 * reach from the house (beyond it the railing is under a pixel tall in the window shot), and the
 * gap round the bridge's tower pier, which stands at the water. The street's top is SITE.far.roughY.
 */
export const FAR_FRONT = { reach: 330, pierClear: 16, drawn: 0.14 }; // pierClear: round a tower pier's centre (the model's piers are about 26 m long) // drawn: the far posts and top rail are drawn this thick (real about 0.06-0.08 m), about 1 px at 120-150 m (a stylisation, e11 gate)

/**
 * The far bank: the waterfront street at the water (edge face, kerb, paving, railing), a worn
 * path, then on the right the mown embankment the Assembly's grounds end in, with a pale
 * retaining wall on its terrace; on the left a natural bank rolling up to a meadow. Writes slots
 * 'paint' (ground, posts, rails), 'paving' and 'blade' (ticks on the slope, two-sided).
 */
export function buildFarBank(w, { seed = 0, paint = null } = {}) {
  const S = SITE, F = S.far, C = paint ? { ...BANK_PAINT, ...paint } : BANK_PAINT, R = FAR_RELIEF; // paint: overrides (grass.js FAR_GRASS_GROUND)
  const rand = mulberry32(211 + seed);
  const stations = sampleLine(S.farLine, { landOnLeft: false, ...R.stations });
  const lawnAt = (s) => smooth(F.lawnFrom[0], F.lawnFrom[1], s.x); // 0 natural bank, 1 embankment
  const footY = F.roughY + 0.1;
  const slopeLow = lerp(F.foot, F.crest, 0.2);
  const landEnd = R.land.back[R.land.back.length - 1];
  // Rolling ground: ± height at offset o inland, none on the embankment, fading out by landEnd.
  const [ampFoot, ampCrest, ampBack] = R.meadow.height;
  const rollAmp = (o) => {
    if (o <= F.crest) return lerp(ampFoot, ampCrest, Math.max(0, (o - F.foot) / (F.crest - F.foot)));
    if (o <= F.back) return lerp(ampCrest, ampBack, (o - F.crest) / (F.back - F.crest));
    return ampBack * (1 - smooth(F.back, landEnd, o));
  };
  const roll = (st, o, L) => (1 - L) * rollAmp(o) * fbm(st.s / R.meadow.along, o / R.meadow.inland, 401 + seed);
  const rough = (st, o) => R.rough.height * fbm(st.s / R.rough.along, o / R.rough.inland, 411 + seed);
  /**
   * The cross-section at a station (or any point along the line: { x, s }): [offset inland, y] per
   * column, upstream to downstream the same count. The mesh, the plants and groundAt all read it.
   */
  const top = F.roughY; // the street, level: the same datum as the path and the forecourt's foot
  const cross = (st) => {
    const L = lawnAt(st);
    const crestY = lerp(F.meadowY, F.crestY, L);
    const behind = (o) => lerp(crestY, F.backY, (o - F.crest) / (F.back - F.crest)) + roll(st, o, L);
    const fade = 1 - L; // the path and verge at the foot of the embankment stay level where it is built
    return [
      [F.rough, top], // the street's inner edge: the street itself is built below, from the water to here
      [F.path, F.roughY + 0.05 + rough(st, F.path) * (0.4 + 0.6 * fade)],
      [F.foot, footY + roll(st, F.foot, L) * 0.5],
      [slopeLow, lerp(footY, crestY, 0.2) + roll(st, slopeLow, L)],
      [F.crest, crestY + roll(st, F.crest, L)],
      ...R.land.columns.map((o) => [o, behind(o)]),
      [F.wall.offset, behind(F.wall.offset)],
      [F.back, F.backY + roll(st, F.back, L)],
      ...R.land.back.map((o) => [o, F.backY + roll(st, o, L)]),
    ].sort((a, b) => a[0] - b[0]);
  };
  const sections = stations.map(cross);
  const rows = stations.map((st, i) => sections[i].map(([o, y]) => [st.x + st.nx * o, y, st.z + st.nz * o]));
  const columns = sections[0].map(([o]) => o);
  const wallCol = sections[0].findIndex(([o]) => o === F.wall.offset);
  // A band's paint by the offset its quads start at.
  const band = (k, o, L) => {
    if (o < F.path) return C.path;
    if (o < F.foot) return C.verge;
    if (o < slopeLow) return L > 0.5 ? C.lawnFoot : C.meadow;
    if (o < F.crest) return L > 0.5 ? C.lawn : C.meadow;
    return L > 0.5 ? C.terrace : C.meadowFar;
  };
  const stats = { stations: stations.length, columns: columns.length, quads: 0, street: 0, ticks: 0, wall: 0, land: 0, relief: {} };
  sweep(w, 'paint', rows, (i, k) => band(k, columns[k], (lawnAt(stations[i]) + lawnAt(stations[i + 1])) / 2), false, stats);

  const contract = createContract('far bank');
  checkSweep(contract, w, 'paint', rows, stations);
  contract.is('every cross-section has the same columns', sections.every((c) => c.length === columns.length && c.every(([o], k) => k === 0 || o > c[k - 1][0])), true);
  contract.near('the path starts at the street\'s inner edge, level with it (m)', Math.max(...sections.map((c) => Math.abs(c[0][1] - top) + Math.abs(c[0][0] - F.rough))), 0, 1e-9);
  contract.range('embankment slope (degrees)', THREE.MathUtils.radToDeg(Math.atan2(F.crestY - footY, F.crest - F.foot)), 10, 25);
  contract.range('embankment height above the path (m)', F.crestY - footY, 2.5, 5);
  // The built embankment stays straight: its foot, slope and crest have no relief where L = 1.
  const built = stations.map((st, i) => [st, sections[i]]).filter(([st]) => lawnAt(st) === 1);
  const bend = Math.max(0, ...built.map(([, c]) => Math.max(...[F.foot, slopeLow, F.crest].map((o) => {
    const y = c.find(([oo]) => oo === o)[1];
    return Math.abs(y - (o === F.foot ? footY : o === slopeLow ? lerp(footY, F.crestY, 0.2) : F.crestY));
  }))));
  contract.max('embankment straight: relief on its foot, slope and crest (m)', bend, 1e-9);
  const natural = stations.map((st, i) => [st, sections[i]]).filter(([st]) => lawnAt(st) === 0);
  const rolls = natural.map(([st, c]) => c[c.findIndex(([o]) => o === F.crest)][1] - F.meadowY);
  stats.relief.meadow = [Math.min(...rolls), Math.max(...rolls)].map((v) => +v.toFixed(2));
  contract.min('meadow rolls at the crest distance (m, highest minus lowest)', stats.relief.meadow[1] - stats.relief.meadow[0], 1.5);
  contract.near('land behind fades flat at its edge (m)', Math.max(...sections.map((c) => Math.abs(c[c.length - 1][1] - F.backY))), 0, 1e-6);
  const right = built.length, left = natural.length;
  contract.min('stations on the embankment', right, 8);
  contract.min('stations on the natural bank', left, 8);

  // The waterfront street, from the water to the path (waterfront.js; the same pieces as our
  // side): the concrete edge face down into the water, the kerb, the paving.
  const K = WATERFRONT.kerb, kerbY = top + K.rise;
  const at = (st, o, y) => [st.x + st.nx * o, y, st.z + st.nz * o];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    const deep = S.water - WATERFRONT.edgeDepth;
    w.quad('paint', at(a, 0, deep), at(b, 0, deep), at(b, 0, kerbY), at(a, 0, kerbY), FRONT_PAINT.edge); // faces the river
    w.quad('paint', at(a, 0, kerbY), at(b, 0, kerbY), at(b, K.width, kerbY), at(a, K.width, kerbY), FRONT_PAINT.kerb);
    w.quad('paint', at(a, K.width, kerbY), at(b, K.width, kerbY), at(b, K.width, top), at(a, K.width, top), FRONT_PAINT.kerb);
    paveQuad(w, at(a, K.width, top), at(b, K.width, top), at(b, F.rough, top), at(a, F.rough, top));
    stats.street += 8;
  }
  // The railing, plain posts and the top rail (at 120 m and more its lattice, the posts' feet and
  // the bottom rail would be under 2 px), out to
  // FAR_FRONT.reach from the house; none in front of the Assembly's river front (it has a sloped
  // edge and no railing, U2) or round the bridge's tower piers (bridge.js).
  const reach = (s) => Math.hypot(s.x, s.z + 5); // distance from the house
  const piers = bridgePiers();
  const byPier = (p, slack = 0) => piers.some(([x, z]) => Math.hypot(p.x - x, p.z - z) < FAR_FRONT.pierClear + slack);
  const skip = (st) => underForecourt(st.x, F.foot) || byPier(st);
  const near = stations.filter((st) => reach(st) < FAR_FRONT.reach);
  const railing = buildRailing(w, near, { kerbY: () => kerbY, lattice: false, skip, minSize: FAR_FRONT.drawn });
  stats.railing = { posts: railing.posts, bays: railing.bays, gaps: railing.gaps };
  contract.range('far street above the water (m), estimated', top - S.water, 2, 2.8); // 2.5 m (pass e13; was 1.5)
  contract.range('far street width (m), estimated', F.rough - K.width, 5, 10);
  checkFooting(contract, 'far', railing, K.width, kerbY);
  contract.min('far railing bays', railing.bays, 100);
  // the gaps: measured from the emitted posts and the skipped stations, not the skip rule's count
  const inFront = (p) => underForecourt(p.x, F.foot);
  contract.is('far posts in front of the Assembly or at the pier', railing.footing.filter((p) => inFront(p) || byPier(p, -0.5)).length, 0); // posts stand 0.18 m in from their stations: half a metre's slack
  contract.is('far railing gaps with neither cause', railing.skipped.filter((p) => !inFront(p) && !byPier(p)).length, 0);
  contract.min('far railing gap stations in front of the Assembly', railing.skipped.filter(inFront).length, 1);
  if (near.some(byPier)) contract.min('far railing gap stations at a pier', railing.skipped.filter(byPier).length, 1);

  // The land beyond, to where the haze ends: one polygon at the terrace's height.
  const E = S.extent;
  const outer = rows.map((r) => [r[r.length - 1][0], r[r.length - 1][2]]);
  stats.land = fill(w, 'paint', [...outer, [E.x1, E.z1], [E.x1, E.z0], [E.x0, E.z0], [E.x0, outer[0][1] - landEnd]], F.backY, C.terrace);
  contract.is('land beyond: triangles = corners - 2', stats.land, outer.length + 4 - 2);

  // Retaining wall on the terrace (right part only): front, top, back.
  const W = F.wall;
  let prev = null;
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    if (s.x < W.from) continue;
    const base = rows[i][wallCol];
    const at = (o, y) => [s.x + s.nx * o, y, s.z + s.nz * o];
    const cur = [at(W.offset, base[1] - 0.3), at(W.offset, base[1] + W.height), at(W.offset + 0.6, base[1] + W.height), at(W.offset + 0.6, base[1] - 0.3)];
    if (prev) {
      for (let k = 0; k < 3; k++) w.quad('paint', prev[k], cur[k], cur[k + 1], prev[k + 1], C.wall);
      stats.wall += 3;
    } else w.quad('paint', cur[0], cur[1], cur[2], cur[3], C.wall); // end cap
    prev = cur;
  }
  contract.min('wall segments', stats.wall / 3, 4);

  // Where the bank's surface is: piecewise linear across the columns, as the mesh is at a station.
  const profile = (o, c) => {
    if (o >= c[c.length - 1][0]) return F.backY;
    for (let k = c.length - 2; k >= 0; k--) {
      if (o >= c[k][0]) return lerp(c[k][1], c[k + 1][1], (o - c[k][0]) / (c[k + 1][0] - c[k][0]));
    }
    return c[0][1];
  };
  /** A point between stations i and i + 1 (t 0..1), with its own cross-section. */
  const between = (i, t) => {
    const a = stations[i], b = stations[i + 1];
    const st = { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), s: lerp(a.s, b.s, t), nx: lerp(a.nx, b.nx, t), nz: lerp(a.nz, b.nz, t) };
    st.c = cross(st);
    return st;
  };

  // Ticks on the mown slope (the reeds and tufts of the mud and the rough grass went with them, e11).
  let lowestPlant = Infinity;
  for (let i = 0; i < stations.length - 1; i++) {
    const s = stations[i], n = stations[i + 1];
    if (reach(s) > 260) continue;
    const len = Math.hypot(n.x - s.x, n.z - s.z);
    const put = (o0, o1) => {
      const st = between(i, rand()), o = lerp(o0, o1, rand());
      const y = profile(o, st.c);
      lowestPlant = Math.min(lowestPlant, y);
      return [st.x + st.nx * o, y, st.z + st.nz * o];
    };
    const dir = [s.tx, s.tz];
    if (lawnAt(s) === 1) {
      for (let k = 0; k < Math.round(len * 0.35); k++) {
        const p = put(slopeLow, F.crest - 1); // drawn either way, so the dice stay the same outside the river front
        if (!underForecourt(s.x, (p[0] - s.x) * s.nx + (p[2] - s.z) * s.nz)) stats.ticks += tuft(w, p, dir, { height: 0.42, width: 0.8, colour: C.tick, rand, blades: 2 });
      }
    }
  }
  contract.min('every tick roots above the water (m)', lowestPlant - S.water, 0.15);
  const tri = w.triangles();
  contract.range('triangles', (tri.paint ?? 0) + (tri.blade ?? 0) + (tri.paving ?? 0), 4000, 20000); // 11,612 built (e11: the street and railing in place of the mud, reeds and tufts)

  /** Height of the bank at a point: the nearest station, moved along the line to the point. */
  const groundAt = (x, z) => {
    let bi = 0, bd = Infinity, bo = 0, ba = 0;
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      const dx = x - s.x, dz = z - s.z;
      const along = dx * s.tx + dz * s.tz, off = dx * s.nx + dz * s.nz;
      const d = Math.hypot(along, off - Math.min(landEnd, Math.max(0, off)));
      if (d < bd) [bd, bi, bo, ba] = [d, i, off, along];
    }
    // the point's own place along the line, between this station and its neighbour
    const j = ba >= 0 ? bi : bi - 1;
    if (j < 0 || j >= stations.length - 1) return profile(bo, sections[bi]);
    const span = stations[j + 1].s - stations[j].s;
    const t = Math.min(1, Math.max(0, (ba >= 0 ? ba : span + ba) / span));
    return profile(bo, between(j, t).c);
  };
  /** The point `offset` metres inland of the waterline where the waterline's x is `xWater`: [x, y, z]. */
  const place = (xWater, offset) => {
    let i = 0;
    while (i < stations.length - 2 && stations[i + 1].x < xWater) i++;
    const a = stations[i], b = stations[i + 1];
    const st = between(i, Math.min(1, Math.max(0, (xWater - a.x) / (b.x - a.x))));
    return [st.x + st.nx * offset, profile(offset, st.c) - 0.05, st.z + st.nz * offset];
  };
  return { contract: contract.assert(), stats, stations, rows, lawnAt, groundAt, place };
}
