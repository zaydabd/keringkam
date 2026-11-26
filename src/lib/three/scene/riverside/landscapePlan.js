// A planting layout for the far bank round the buildings and structures, drawn as placeholders
// (the user's ask, 2026-11-26: "the layout of vegetation near the buildings and structures, using
// placeholders only, lay them out like a landscaper would"). ?layout=plan shows it: every tree on
// the far bank, the ones already planted and the ones proposed here, becomes a simple trunk and
// ball, coloured by its role, so the layout can be judged from above before any real plant goes in.
//
// The rules, from landscaping guidance on planting round buildings:
// - Shade trees stand back from a building by at least half their grown crown width, more for big
//   trees (coohom.com "landscape industry guidelines for planting trees near walls"; UF IFAS
//   hort.ifas.ufl.edu/woody/buildings.shtml). Here: a ring 14 m outside the Assembly's podium.
// - A low band of shrubs runs along the building's faces that people see, broken at the entrance;
//   the bed need not be continuous (a Wisconsin planning standard, search.library.wisc.edu).
// - The main approach is kept open, framed on each side, so the building is the view; colour
//   (flowering trees and beds) marks the entrances. These are the usual civic-landscape habits,
//   ESTIMATED, not taken from a source.
// - Nothing tall under or against the bridge's low decks; low shrubs hug their feet instead.
import * as THREE from 'three';
import { SITE } from '../world/site.js';
import { bridgeClash, bridgePoint, BRIDGE, inRiver } from './bridgePlace.js';

export const LAYOUT = {
  front: 110, // degrees either side of the river-facing side that the rings cover
  porchGap: 6, // m: the walk ends this far in front of the porch
  // The rings follow the Assembly's star-shaped base (assemblyFootprint), `out` m outside its edge.
  foundation: { out: 3, step: 4.5, gap: 12 }, // the shrub band: spacing along it, half-gap at the entrance (m)
  shade: { out: 14, step: 13, gap: 18, height: 13, width: 12 }, // the shade-tree ring: half a 12 m crown plus 8 m
  accent: { side: 22, height: 8, width: 7 }, // a flowering tree each side of the porch's front
  avenue: { side: 9, step: 12, stop: 14, height: 10, width: 8 }, // trees each side of the walk, `side` m off it, stopping `stop` m short of the porch
  beds: { offset: 31, size: 1.6 }, // flower beds at the top of each forecourt stair
  rampShrubs: { reach: 45, grid: 3, hug: 4.5, shore: 17 }, // low shrubs within `hug` m of the bridge's low decks, `shore` m or more from the waterline (behind the path and the tree row)
};

// Role → colour. Proposed plants are bright; trees already planted keep a muted colour by species.
export const ROLE_COLOUR = {
  shade: '#8fdc4f', avenue: '#33c7c0', accent: '#ff4fa3', shrub: '#2f6e37', bed: '#f2c94c',
  existing: '#7f8f76', existingFlower: '#c48aa8',
};

/** The proposed placeholders: [{ role, at: [x, y, z], height, width }]. */
/**
 * The Assembly's base as seen from above: for each of 180 directions round its centre, the
 * furthest point of the building within 3 m of the ground (m). `building` is its SlotWriter, in
 * the building's own frame (index.js only moves it).
 */
export function assemblyFootprint(building, bins = 180) {
  const r = new Array(bins).fill(0);
  for (const s of building.slots.values())
    for (let i = 0; i < s.position.length; i += 3) {
      if (s.position[i + 1] > 3) continue;
      const x = s.position[i], z = s.position[i + 2];
      const k = Math.floor(((Math.atan2(z, x) / (2 * Math.PI) + 1) % 1) * bins) % bins;
      r[k] = Math.max(r[k], Math.hypot(x, z));
    }
  return r;
}

export function landscapePlan({ place, groundAt, forecourt: [f0, f1], footprint, trees = [], L = LAYOUT }) {
  const out = [];
  const A = [SITE.assembly.x, SITE.assembly.z];
  const top = place((f0 + f1) / 2, L.beds.offset);
  // The base's edge in direction a (radians): the largest of the nearby bins, so a ring clears the star's points.
  const n = footprint.length;
  const edge = (a) => {
    const k = Math.round(((a / (2 * Math.PI) + 1) % 1) * n);
    return Math.max(...[-2, -1, 0, 1, 2].map((d) => footprint[(k + d + n) % n]));
  };
  // The entrance: the porch that reaches furthest out of the base (the long low block in front).
  const far = Math.max(...footprint);
  const porch = footprint.map((r, k) => [r, k]).filter(([r]) => r > far * 0.95);
  const ea = Math.atan2(...porch.reduce(([sy, sx], [, k]) => [sy + Math.sin(((k + 0.5) / n) * 2 * Math.PI), sx + Math.cos(((k + 0.5) / n) * 2 * Math.PI)], [0, 0]));
  const door = [A[0] + Math.cos(ea) * (far + L.porchGap), A[1] + Math.sin(ea) * (far + L.porchGap)];
  // The approach: a straight walk from the forecourt's top to the front of the porch.
  const path = [[top[0], top[2]], door];
  const toSeg = (x, z, [p, q]) => {
    const dx = q[0] - p[0], dz = q[1] - p[1], t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - p[0] - t * dx, z - p[1] - t * dz);
  };
  const open = (x, z) => Math.min(toSeg(x, z, path), toSeg(x, z, [A, door])); // distance from the approach or the entrance
  const busy = (x, z, r) => trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < r) || out.some((p) => p.role !== 'bed' && Math.hypot(p.at[0] - x, p.at[2] - z) < r);
  const put = (role, x, z, height, width) => out.push({ role, at: [x, groundAt(x, z) - 0.05, z], height, width });
  // The rings cover the side facing the river: from the entrance round past the approach.
  const af = Math.atan2(top[2] - A[1], top[0] - A[0]);
  const mid = ea + Math.atan2(Math.sin(af - ea), Math.cos(af - ea)) / 2;
  const ring = ({ out: o, step, gap }, fn) => {
    const end = mid + THREE.MathUtils.degToRad(L.front);
    for (let a = mid - THREE.MathUtils.degToRad(L.front); a <= end; ) {
      const r = edge(a) + o, x = A[0] + Math.cos(a) * r, z = A[1] + Math.sin(a) * r;
      if (open(x, z) >= gap && !inRiver([x, z])) fn(x, z);
      a += step / r;
    }
  };
  // An avenue each side of the approach.
  const V = L.avenue, [p0, p1] = path, len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const ux = (p1[0] - p0[0]) / len, uz = (p1[1] - p0[1]) / len;
  for (let d = V.step / 2; d <= len - V.stop; d += V.step)
    for (const s of [-1, 1]) {
      const x = p0[0] + ux * d - uz * s * V.side, z = p0[1] + uz * d + ux * s * V.side;
      if (!busy(x, z, V.width * 0.6)) put('avenue', x, z, V.height, V.width);
    }
  // A flowering tree each side of the porch, then the shade ring, then the shrub band.
  for (const s of [-1, 1]) {
    const x = door[0] - Math.sin(ea) * s * L.accent.side, z = door[1] + Math.cos(ea) * s * L.accent.side;
    put('accent', x, z, L.accent.height, L.accent.width);
  }
  ring(L.shade, (x, z) => !busy(x, z, L.shade.width * 0.6) && put('shade', x, z, L.shade.height, L.shade.width));
  ring(L.foundation, (x, z) => put('shrub', x, z, 1.6, 3));
  // Colour at the top of each forecourt stair.
  for (const f of [f0 + 4, f1 - 4]) for (const d of [-2.2, 2.2]) {
    const p = place(f + d, L.beds.offset);
    put('bed', p[0], p[2], 0.35, L.beds.size * 2);
  }
  // Low shrubs hugging the bridge's far landing: close to a low deck, but clear of it.
  const R = L.rampShrubs, foot = bridgePoint(BRIDGE.model.ends[0], SITE.bridge);
  for (let x = foot[0] - R.reach; x <= foot[0] + R.reach; x += R.grid)
    for (let z = foot[1] - R.reach; z <= foot[1] + R.reach; z += R.grid) {
      if (inRiver([x, z]) || groundAt(x, z) < SITE.water + 1 || fromShore(x, z) < R.shore) continue;
      if (bridgeClash([x, z], 1.2, 2) || !bridgeClash([x, z], R.hug, 99)) continue;
      if (busy(x, z, 2.5)) continue;
      put('shrub', x, z, 1.2, 2);
    }
  return out;
}

// Distance (m) from [x, z] to the far bank's waterline (SITE.farLine).
function fromShore(x, z) {
  const L = SITE.farLine;
  let best = Infinity;
  for (let i = 1; i < L.length; i++) {
    const [p, q] = [L[i - 1], L[i]], dx = q[0] - p[0], dz = q[1] - p[1];
    const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - p[0] - t * dx, z - p[1] - t * dz));
  }
  return best;
}

/** The placeholders as two instanced meshes (trunks, crowns), from `existing` tree entries and `plan`. */
export function buildLayoutPlaceholders(existing, plan) {
  const items = [
    ...existing.map((e) => ({ role: e.seed === 3 ? 'existingFlower' : 'existing', at: e.at, height: e.height, width: e.width })),
    ...plan,
  ];
  const group = new THREE.Group();
  group.name = 'layout placeholders';
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1, 6).translate(0, 0.5, 0);
  const ballGeo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4f3a' });
  const trees = items.filter((p) => p.height > 2);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const balls = new THREE.InstancedMesh(ballGeo, mat, items.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  trees.forEach((p, i) => trunks.setMatrixAt(i, m.makeScale(1, p.height * 0.5, 1).setPosition(...p.at)));
  items.forEach((p, i) => {
    const tall = p.height > 2;
    const ry = tall ? p.height * 0.28 : p.height * 0.5;
    m.makeScale(p.width / 2, ry, p.width / 2).setPosition(p.at[0], p.at[1] + (tall ? p.height - ry : ry * 0.9), p.at[2]);
    balls.setMatrixAt(i, m);
    balls.setColorAt(i, c.set(ROLE_COLOUR[p.role]));
  });
  group.add(trunks, balls);
  const counts = {};
  for (const p of plan) counts[p.role] = (counts[p.role] ?? 0) + 1;
  return { group, counts, dispose: () => [trunkGeo, ballGeo, mat, trunkMat].forEach((x) => x.dispose()) };
}
