// The Darul Hana Bridge: an S-curved footbridge hung from two leaning towers.
// After .claude/skills/threejs-procedural-geometry: a semantic contract first (dimensions, what
// supports what), one modelling operation per form, one named part per piece, a topology audit of
// every part before the parts are merged, then checks that measure the result.
//
// Sourced: an S-shaped cable-stayed footbridge with a steel truss deck and leaning steel towers,
// about 335 m long (Wikipedia gives 276 m), two towers of 45 to 50 m.
//   https://en.wikipedia.org/wiki/Darul_Hana_Bridge
//   https://ktas.com.my/?p=531
//   https://constructionplusasia.com/my/?p=11208
// Estimated from R3 (the painting; not surveyed): everything else. The tower's shape (a main mast
// with a back leg on a pier, a second mast that stands beside the deck, two struts under a
// widened deck), the deck's line and depth, the lean, the cable count.
// The scene's river follows the painting and is far narrower than the real one, so the bridge is
// built at `scale` of the sourced size; the contract checks against the scaled figures.
//
// Frames: metres; y up; the path runs south to north by arc length s; `left` is left of travel.
// A tower's own frame: u = the horizontal direction its masts lean, heights from the water.

import * as THREE from 'three';
import { createContract, auditSolid } from './contract.js';
import { rgb } from './site.js';

export const BRIDGE = {
  real: { length: 335, tower: [45, 50] }, // metres, from the sources
  scale: 0.6,
  deck: {
    width: 2.2, // between the two trusses (the walkway)
    slab: 0.3,
    bay: 2.4, // one truss bay: the deck's stations are the bay nodes
    side: 1.25, // height of the side trusses over the walkway
    haunch: 1.35, // added to that at a tower
    haunchSpan: 26, // metres over which the haunch fades toward mid-span...
    haunchApproach: 9, // ...and toward the landing
    chord: [0.16, 0.2], // top chord, width and height
    web: 0.07, // radius of a truss diagonal
    platform: 2.6, // the walkway widens by this at a tower, on the side away from the masts
    platformSpan: 5.5,
    clearance: 6, // least height of the soffit over the water between the towers
  },
  level: { tower: 6.7, crown: 9.9 }, // walkway above the water at the towers and at mid-span
  pier: { half: [5.35, 2.3], step: [4.4, 1.9], bed: 2.5, plinth: 1.0, top: 2.6, chamfer: 0.15 }, // half sizes along u and across; heights from the water
  mast: {
    main: { foot: 3.25, lean: 21.8, radius: [0.68, 0.42] }, // foot = place on the pier along u; lean in degrees from upright
    back: { foot: -1.85, radius: [0.4, 0.3], join: 1.4 }, // the back leg meets the main mast this far below its head
    side: { lean: 26, top: 27.7, radius: [0.52, 0.38], reach: 1.0 }, // stands on a shoe this far outside the deck's edge
    embed: 0.6, // a mast's foot goes this far into the pier (a declared penetration)
    sides: 8,
  },
  strut: { radius: [0.55, 0.45], across: 1.0, embed: 0.15, sides: 6 },
  cable: { radius: 0.09 }, // a paint control: thicker than a real stay, so it reads at 120 m
  column: { radius: [0.36, 0.28], below: 1.2, sides: 6 },
  allow: { join: 0.02, seat: 0.05 }, // metres: how far a joint may miss its datum; a landing its ground
  triangles: [3500, 7500],
  colors: {
    mast: rgb('#efe8d6'),
    truss: rgb('#cfc7a8'),
    slab: rgb('#b9b294'),
    pier: rgb('#c2ad88'),
    cable: rgb('#6f6a62'),
  },
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const arr = (v) => [v.x, v.y, v.z];

/** A named part: triangles kept apart until the part has passed its audit. */
function createPart(name) {
  const tris = [];
  return {
    name,
    tris,
    tri(a, b, c, color, n) {
      tris.push({ a, b, c, color, n });
    },
    quad(a, b, c, d, color, n) {
      tris.push({ a, b, c, color, n: n && [n[0], n[1], n[2]] }, { a, b: c, c: d, color, n: n && [n[0], n[2], n[3]] });
    },
  };
}

/** Closes a stack of rings (arrays of points, the same count, the same turn) into one solid. */
function loft(part, rings, color, normals) {
  const n = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) {
    const p = rings[i], q = rings[i + 1];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      const nn = normals && [normals[i][k], normals[i][k1], normals[i + 1][k1], normals[i + 1][k]];
      part.quad(p[k], p[k1], q[k1], q[k], color, nn);
    }
  }
  const first = rings[0], last = rings[rings.length - 1];
  for (let k = 1; k < n - 1; k++) {
    part.tri(first[0], first[k + 1], first[k], color);
    part.tri(last[0], last[k], last[k + 1], color);
  }
}

/**
 * A round member from p0 to p1: rings at `stops` [[t, radius], ...] along it. Smooth radial
 * normals on its sides, flat caps.
 */
function member(part, p0, p1, stops, sides, color) {
  const axis = p1.clone().sub(p0);
  const a = axis.clone().normalize();
  const e1 = a.clone().cross(Math.abs(a.y) > 0.95 ? V(1, 0, 0) : V(0, 1, 0)).normalize();
  const e2 = a.clone().cross(e1);
  const rings = [], normals = [];
  for (const [t, r] of stops) {
    const c = p0.clone().addScaledVector(axis, t);
    const ring = [], nr = [];
    for (let k = 0; k < sides; k++) {
      const th = (k / sides) * Math.PI * 2;
      const d = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th));
      ring.push(arr(c.clone().addScaledVector(d, r)));
      nr.push(arr(d));
    }
    rings.push(ring);
    normals.push(nr);
  }
  loft(part, rings, color, sides > 4 ? normals : null);
}

/** Least distance between two segments (p1-q1, p2-q2). */
function segmentDistance(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  const c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  s = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
}

/**
 * `site` is SITE.bridge: the path [x, z] south to north, the two towers, the columns.
 * `water` is the river level, `groundSouth` the level of our bank, `groundNorth(x, z)` the far
 * bank's surface. Triangles go to the writer's 'steel' slot. Returns the report with the contract.
 */
export function buildBridge(writer, { site, water, groundSouth, groundNorth }, settings = BRIDGE) {
  const B = settings;
  const C = B.colors;
  const D = B.deck;
  const parts = [];
  const part = (name) => {
    const p = createPart(name);
    parts.push(p);
    return p;
  };

  // --- The path and its stations (the bay nodes) ------------------------------------------------
  const flat = new THREE.CatmullRomCurve3(site.path.map(([x, z]) => V(x, 0, z)), false, 'centripetal');
  flat.arcLengthDivisions = 2400;
  const length = flat.getLength();
  const bays = Math.round(length / D.bay);
  const sOf = (x, z) => {
    // arc position of the path's point nearest [x, z]
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 3000; i++) {
      const p = flat.getPointAt(i / 3000);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) [bd, best] = [d, (i / 3000) * length];
    }
    return best;
  };
  const towers = site.towers.map((t) => ({ ...t, s: sOf(t.pier[0], t.pier[1]) }));
  const [south, north] = towers;
  const end = flat.getPointAt(1);
  const groundEnd = groundNorth(end.x, end.z);
  // Walkway level: on the ground at the landings, level at the towers, a crown at mid-span.
  const keys = [[0, groundSouth], [south.s, water + B.level.tower], [(south.s + north.s) / 2, water + B.level.crown], [north.s, water + B.level.tower], [length, groundEnd]];
  const walkY = (s) => {
    let i = 0;
    while (i < keys.length - 2 && s > keys[i + 1][0]) i++;
    const t = THREE.MathUtils.clamp((s - keys[i][0]) / (keys[i + 1][0] - keys[i][0]), 0, 1);
    return keys[i][1] + (keys[i + 1][1] - keys[i][1]) * t * t * (3 - 2 * t);
  };
  const bell = (d, span) => Math.exp(-((d / span) ** 2));
  const haunch = (s) => Math.max(...towers.map((t) => {
    const d = s - t.s;
    const toSpan = (t === south) === d > 0; // on the side of the other tower
    return bell(d, toSpan ? D.haunchSpan : D.haunchApproach);
  }));
  const sideH = (s) => D.side + D.haunch * haunch(s);
  // half widths: the walkway bulges at a tower, on the side away from its masts
  const halfW = (s, side) => D.width / 2 + towers.reduce((a, t) => a + (t.side === -side ? D.platform * bell(s - t.s, D.platformSpan) : 0), 0);
  const frame = (s) => {
    const u = THREE.MathUtils.clamp(s / length, 0, 1);
    const p = flat.getPointAt(u);
    const tan = flat.getTangentAt(u).setY(0).normalize();
    const left = V(tan.z, 0, -tan.x);
    p.y = walkY(s);
    return { s, p, tan, left, hl: halfW(s, 1), hr: halfW(s, -1), side: sideH(s) };
  };
  const stations = [];
  for (let i = 0; i <= bays; i++) stations.push(frame((length * i) / bays));
  const edge = (f, side, inset = 0, dy = 0) => f.p.clone().addScaledVector(f.left, side * ((side > 0 ? f.hl : f.hr) - inset)).setY(f.p.y + dy);
  const node = (i, side) => edge(stations[i], side, D.chord[0] / 2, stations[i].side - D.chord[1] / 2); // top chord centre

  // --- 1. Walkway slab: one sweep of a rectangle ------------------------------------------------
  loft(part('slab'), stations.map((f) => [arr(edge(f, 1)), arr(edge(f, -1)), arr(edge(f, -1, 0, -D.slab)), arr(edge(f, 1, 0, -D.slab))]), C.slab);

  // --- 2. Side trusses: a top chord (a sweep) and Warren diagonals between the bay nodes --------
  for (const side of [1, -1]) {
    const name = side > 0 ? 'left' : 'right';
    const [cw, ch] = D.chord;
    loft(part(`chord ${name}`), stations.map((f) => {
      const o = edge(f, side, cw / 2, f.side - ch / 2);
      const c = (a, b) => arr(o.clone().addScaledVector(f.left, (a * cw) / 2).setY(o.y + (b * ch) / 2));
      return [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
    }), C.truss);
    const web = part(`web ${name}`);
    for (let i = 0; i < bays; i++) {
      const up = i % 2 === 0;
      const foot = edge(stations[up ? i : i + 1], side, cw / 2, -0.08); // 0.08 into the slab
      member(web, foot, node(up ? i + 1 : i, side), [[0, D.web], [1, D.web]], 3, C.truss);
    }
  }

  // --- 3. Towers --------------------------------------------------------------------------------
  const P = B.pier, M = B.mast;
  const rad = THREE.MathUtils.degToRad;
  const cables = [];
  const masts = [];
  const towerReports = [];
  const measured = { footOff: 0, footEmbed: [], strutOff: 0, strutSeat: [], shoe: [], headOff: 0, anchorOff: 0 };
  towers.forEach((T, n) => {
    const name = n === 0 ? 'south' : 'north';
    const u = V(T.lean[0], 0, T.lean[1]).normalize();
    const f0 = frame(T.s);
    const o = V(T.pier[0], 0, T.pier[1]);
    const v = f0.p.clone().sub(o).setY(0); // from the pier toward the deck
    v.addScaledVector(u, -v.dot(u)).normalize();
    const at = (a, h, b = 0) => o.clone().addScaledVector(u, a).addScaledVector(v, b).setY(water + h);
    const base = T.onLand ? groundSouth - water - 1.2 : -P.bed;
    // pier: a plinth and a block on it, one loft, chamfered tops
    const rect = (h, [hu, hv]) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => arr(at(a * hu, h, b * hv)));
    const c = P.chamfer;
    loft(part(`${name} pier`), [
      rect(base, P.half), rect(P.plinth - c, P.half), rect(P.plinth, [P.half[0] - c, P.half[1] - c]),
      rect(P.plinth, P.step), rect(P.top - c, P.step), rect(P.top, [P.step[0] - c, P.step[1] - c]),
    ], C.pier);
    const inPier = (p, r) => Math.max(Math.abs(p.clone().sub(o).dot(u)) + r - (P.step[0] - c), Math.abs(p.clone().sub(o).dot(v)) + r - (P.step[1] - c)); // <= 0: on the pier's top

    // main mast: from inside the pier to its head, leaning along u
    const mastStops = (r0, r1) => [[0, r0], [0.985, r1], [1, r1 * 0.6]]; // the last ring bevels the head
    const dirMain = u.clone().multiplyScalar(Math.sin(rad(M.main.lean))).setY(Math.cos(rad(M.main.lean)));
    const headH = (B.real.tower[0] + B.real.tower[1]) / 2 * B.scale * (T.tall ?? 1);
    const mainFootTop = at(M.main.foot, P.top);
    const mainFoot = mainFootTop.clone().addScaledVector(dirMain, -M.embed / dirMain.y);
    const mainHead = mainFootTop.clone().addScaledVector(dirMain, (headH - P.top) / dirMain.y);
    member(part(`${name} mast`), mainFoot, mainHead, mastStops(...M.main.radius), M.sides, C.mast);
    masts.push({ name: `${name} mast`, tower: n, a: mainFoot, b: mainHead, r: M.main.radius[0] });
    measured.footOff = Math.max(measured.footOff, inPier(mainFootTop, M.main.radius[0]));
    measured.footEmbed.push(mainFootTop.y - mainFoot.y);

    // back leg: from the pier to a joint on the main mast's axis
    const joint = mainHead.clone().addScaledVector(dirMain, -M.back.join);
    const backFootTop = at(M.back.foot, P.top);
    const dirBack = joint.clone().sub(backFootTop).normalize();
    const backFoot = backFootTop.clone().addScaledVector(dirBack, -M.embed / dirBack.y);
    member(part(`${name} back leg`), backFoot, joint, [[0, M.back.radius[0]], [1, M.back.radius[1]]], M.sides, C.mast);
    masts.push({ name: `${name} back leg`, tower: n, a: backFoot, b: joint, r: M.back.radius[0] });
    measured.footOff = Math.max(measured.footOff, inPier(backFootTop, M.back.radius[0]));
    measured.footEmbed.push(backFootTop.y - backFoot.y);

    // side mast: on a shoe outside the deck's edge, the same lean direction
    const fs = stations[Math.round(((T.s + T.sideMast) / length) * bays)];
    const shoeIn = edge(fs, T.side, 0.3, -D.slab / 2);
    const sideFoot = edge(fs, T.side, -M.side.reach, -D.slab / 2);
    const dirSide = u.clone().multiplyScalar(Math.sin(rad(M.side.lean))).setY(Math.cos(rad(M.side.lean)));
    const sideHead = sideFoot.clone().addScaledVector(dirSide, (water + M.side.top - sideFoot.y) / dirSide.y);
    member(part(`${name} side mast`), sideFoot.clone().addScaledVector(dirSide, -0.5), sideHead, mastStops(...M.side.radius), M.sides, C.mast);
    member(part(`${name} shoe`), shoeIn, sideFoot.clone().addScaledVector(fs.left, T.side * 0.2), [[0, 0.3], [1, 0.42]], 6, C.truss);
    masts.push({ name: `${name} side mast`, tower: n, a: sideFoot, b: sideHead, r: M.side.radius[0] });
    measured.shoe.push(sideFoot.clone().sub(fs.p).setY(0).length() - (T.side > 0 ? fs.hl : fs.hr));

    // struts: from the pier's top to the walkway's soffit
    T.struts.forEach(([footU, headS], k) => {
      const fh = frame(T.s + headS);
      const head = fh.p.clone().setY(fh.p.y - D.slab + B.strut.embed);
      const footTop = at(footU, P.top, B.strut.across);
      const dir = head.clone().sub(footTop).normalize();
      member(part(`${name} strut ${k + 1}`), footTop.clone().addScaledVector(dir, -0.4), head, [[0, B.strut.radius[0]], [1, B.strut.radius[1]]], B.strut.sides, C.mast);
      measured.strutOff = Math.max(measured.strutOff, inPier(footTop, B.strut.radius[0]));
      measured.strutSeat.push(head.y - (fh.p.y - D.slab));
    });

    // cables: from a point on a mast's axis to a top-chord node
    const hang = (mast, a, b, list) => list.forEach(([below, ds]) => {
      const i = THREE.MathUtils.clamp(Math.round(((T.s + ds) / length) * bays), 1, bays - 1);
      const anchor = node(i, T.side);
      const head = b.clone().addScaledVector(b.clone().sub(a).normalize(), -below);
      cables.push({ tower: n, mast, head, anchor, i });
      measured.headOff = Math.max(measured.headOff, segmentDistance(head, head, a, b));
      measured.anchorOff = Math.max(measured.anchorOff, anchor.distanceTo(edge(stations[i], T.side, D.chord[0] / 2, stations[i].side - D.chord[1] / 2)));
    });
    hang(`${name} mast`, mainFoot, mainHead, T.cables.main);
    hang(`${name} side mast`, sideFoot, sideHead, T.cables.side);
    towerReports.push({ name, height: +(mainHead.y - water).toFixed(2), sideHeight: +(sideHead.y - water).toFixed(2), lean: M.main.lean, head: arr(mainHead), sideHead: arr(sideHead), pier: [arr(at(-P.half[0], 0)), arr(at(P.half[0], 0))], base: water + base });
  });
  const cablePart = part('cables');
  for (const k of cables) member(cablePart, k.head, k.anchor, [[0, B.cable.radius], [1, B.cable.radius]], 3, C.cable);

  // --- 4. Columns under the south approach, beyond the cables ----------------------------------
  const columns = (site.columns ?? []).map((ds) => {
    const s = south.s + ds;
    const f = frame(s);
    const groundY = groundSouth;
    const head = f.p.clone().setY(f.p.y - D.slab + 0.1);
    const foot = f.p.clone().setY(groundY - B.column.below);
    member(part(`column at ${Math.round(s)} m`), foot, head, [[0, B.column.radius[0]], [1, B.column.radius[1]]], B.column.sides, C.pier);
    return { footY: foot.y, groundY, tall: head.y - groundY };
  });

  // --- Audit every part, repair its winding by its volume, then merge into the slot -------------
  const audits = {};
  const worst = { degenerate: 0, boundary: 0, nonManifold: 0, flipped: 0, volume: Infinity };
  let triangles = 0;
  for (const p of parts) {
    let a = auditSolid(p.tris);
    if (a.volume < 0) {
      for (const t of p.tris) {
        [t.b, t.c] = [t.c, t.b];
        if (t.n) [t.n[1], t.n[2]] = [t.n[2], t.n[1]];
      }
      a = auditSolid(p.tris);
    }
    audits[p.name] = a;
    for (const k of ['degenerate', 'boundary', 'nonManifold', 'flipped']) worst[k] += a[k];
    worst.volume = Math.min(worst.volume, a.volume);
    triangles += p.tris.length;
    for (const t of p.tris) {
      if (t.n) writer.smoothTri('steel', [t.a, t.b, t.c], t.n, null, t.color);
      else writer.tri('steel', t.a, t.b, t.c, t.color);
    }
  }

  // --- What was built, measured ----------------------------------------------------------------
  let minClear = Infinity, maxGrade = 0, sunk = -Infinity;
  stations.forEach((f, i) => {
    if (f.s >= south.s && f.s <= north.s) minClear = Math.min(minClear, f.p.y - D.slab - water);
    if (f.s > north.s) sunk = Math.max(sunk, groundNorth(f.p.x, f.p.z) - f.p.y); // the far bank over the walkway
    if (i) maxGrade = Math.max(maxGrade, Math.abs(f.p.y - stations[i - 1].p.y) / (length / bays));
  });
  // a mast against the deck: where its axis passes the walkway's height band, how far it is outside the truss
  let mastClear = Infinity;
  for (const m of masts) {
    for (let k = 0; k <= 60; k++) {
      const p = m.a.clone().lerp(m.b, k / 60);
      let f = stations[0], bd = Infinity;
      for (const st of stations) {
        const d = (st.p.x - p.x) ** 2 + (st.p.z - p.z) ** 2;
        if (d < bd) [bd, f] = [d, st];
      }
      if (p.y < f.p.y - D.slab - 0.2 || p.y > f.p.y + f.side + 0.2) continue;
      const off = p.clone().sub(f.p).dot(f.left);
      mastClear = Math.min(mastClear, Math.abs(off) - (off > 0 ? f.hl : f.hr) - m.r);
    }
  }
  // a cable against the masts it does not hang from, and against the walking space
  let cableClear = Infinity, headroom = Infinity;
  for (const k of cables) {
    for (const m of masts) if (m.name !== k.mast) cableClear = Math.min(cableClear, segmentDistance(k.head, k.anchor, m.a, m.b) - m.r - B.cable.radius);
    for (let j = 1; j <= 40; j++) {
      const p = k.head.clone().lerp(k.anchor, j / 41);
      let f = stations[0], bd = Infinity;
      for (const st of stations) {
        const d = (st.p.x - p.x) ** 2 + (st.p.z - p.z) ** 2;
        if (d < bd) [bd, f] = [d, st];
      }
      const off = p.clone().sub(f.p).dot(f.left);
      if (off < f.hl - 0.2 && off > -f.hr + 0.2) headroom = Math.min(headroom, p.y - f.p.y);
    }
  }
  const scaled = (v) => v * B.scale;
  const contract = createContract('bridge');
  contract.range(`length in metres (sourced ${B.real.length} m, at scale ${B.scale})`, length, scaled(B.real.length) * 0.95, scaled(B.real.length) * 1.05);
  contract.is('towers', towerReports.length, 2);
  for (const t of towerReports) {
    contract.range(`${t.name} tower: mast head above the water (sourced ${B.real.tower.join(' to ')} m, at scale)`, t.height, scaled(B.real.tower[0]), scaled(B.real.tower[1]));
    contract.max(`${t.name} tower: side mast no taller than the main mast`, t.sideHeight, t.height);
  }
  contract.max('pier bases below the bed or the ground', Math.max(towerReports[1].base - (water - 2), towerReports[0].base - (south.onLand ? groundSouth - 1 : water - 2)), 0);
  contract.max('mast feet inside the piers\' tops (overhang)', measured.footOff, 0);
  contract.range('mast feet go into the pier (declared penetration)', Math.min(...measured.footEmbed), M.embed - B.allow.join, M.embed + B.allow.join);
  contract.max('strut feet inside the piers\' tops (overhang)', measured.strutOff, 0);
  contract.range('strut heads go into the slab (declared penetration)', Math.max(...measured.strutSeat), 0, B.strut.embed + B.allow.join);
  contract.near('side masts stand this far outside the deck\'s edge', Math.max(...measured.shoe), M.side.reach, B.allow.join);
  contract.near('side masts, the other one', Math.min(...measured.shoe), M.side.reach, B.allow.join);
  contract.near('walkway meets our bank', stations[0].p.y, groundSouth, B.allow.seat);
  contract.near('walkway meets the far bank\'s surface', stations[bays].p.y, groundEnd, B.allow.seat);
  contract.max('far bank no higher than the walkway along the north approach', sunk, B.allow.seat);
  contract.min('soffit over the water between the towers', minClear, D.clearance);
  contract.max('steepest walkway grade', maxGrade, 0.125);
  contract.max('cable heads off their mast\'s axis', measured.headOff, B.allow.join);
  contract.max('cable feet off their top-chord node', measured.anchorOff, B.allow.join);
  contract.min('masts clear of the deck', mastClear, 0.1);
  contract.min('cables clear of the other masts', cableClear, 0.3);
  contract.min('cables over the walkway leave headroom', headroom, 2.2);
  contract.max('columns: feet under the ground (highest foot, from the ground)', Math.max(-1, ...columns.map((k) => k.footY - k.groundY)), -1);
  contract.min('columns: shortest, from the ground to the soffit', Math.min(9, ...columns.map((k) => k.tall)), 0.5);
  contract.is('parts with an open edge, a non-manifold edge, a flipped or a degenerate triangle', worst.boundary + worst.nonManifold + worst.flipped + worst.degenerate, 0);
  contract.min('smallest part volume (all wound outward)', worst.volume, 1e-4);
  contract.range('triangles', triangles, B.triangles[0], B.triangles[1]);
  return {
    length: +length.toFixed(1),
    towers: towerReports,
    cables: cables.length,
    minClearance: +minClear.toFixed(2),
    stats: { parts: parts.length, triangles, bays, mastClear: +mastClear.toFixed(2), cableClear: +cableClear.toFixed(2), headroom: +headroom.toFixed(2), maxGrade: +maxGrade.toFixed(3) },
    audits,
    deckLine: stations.map((f) => [f.p.x, f.p.y, f.p.z, f.side]),
    contract: contract.assert(),
  };
}
