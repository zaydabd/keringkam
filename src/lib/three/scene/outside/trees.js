// Trees and bushes of the far bank (reference R3: slender forked trunks under round, lumpy crowns
// drawn as scalloped masses in two or three flat greens).
//
// After .claude/skills/threejs-procedural-vegetation and its growth contract
// (references/structured-ash-growth-system.md):
//   - a species table per branch level (below), in species units;
//   - growth from a queue, so the jobs can be counted per level;
//   - every branch that is not on the last level gives one terminal continuation (it carries the
//     tip's place, direction, radius, and the parent's section and segment counts) and lateral
//     children in stratified slots along it, with independently shuffled directions around it;
//   - a section leans by seeded gnarliness (stronger on thin branches), twists, and turns towards
//     the light by force / radius;
//   - the foliage is made only after the branches are final, with normals rounded by the crown.
// Divergences from that contract, on purpose:
//   - the species is not the Ash: its own table, three levels (the trees stand 125 m and more
//     from the window, about 100 pixels tall);
//   - foliage is solid lobes, not alpha leaf cards: R3 paints a crown as a few scalloped masses,
//     and the ink pass (toon.js) outlines solid parts, one flat colour each;
//   - no bark texture (flat paint; the UVs are still written: u around, v in metres along);
//   - no wind: the view is a still picture. Nothing moves, so nothing can come unrooted.
// Tiers: 'near' grows all levels; 'far' stops one level earlier and has fewer, larger lobes.

import * as THREE from 'three';
import { createContract } from './contract.js';
import { SITE, mulberry32, rgb } from './site.js';

const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

// Level 0 trunk, 1 bough, 2 twig. Lengths and radii in species units (`unit` metres each).
export const BANK_TREE = {
  name: 'bank tree',
  unit: 0.2,
  taper: 0.7,
  force: 0.012, // towards the light (up)
  levels: [
    { length: 32, radius: 1.7, sections: 6, radial: 6, children: 3, childStart: 0.42, angle: 0, gnarl: 0.035, twist: 0.06 },
    { length: 19, radiusFactor: 0.62, sections: 4, radial: 5, children: 3, childStart: 0.28, angle: 40, gnarl: 0.1, twist: -0.05 },
    { length: 11.5, radiusFactor: 0.72, sections: 3, radial: 4, children: 0, childStart: 0, angle: 56, gnarl: 0.08, twist: 0 },
  ],
  lobe: { radius: 9, variance: 0.25, squash: 0.8, lumps: 0.13, core: 1.3 },
};

// A bush: the same growth, a stub of a trunk and one level of stems.
export const BANK_BUSH = {
  name: 'bank bush',
  unit: 0.2,
  taper: 0.7,
  force: 0.012,
  levels: [
    { length: 3.5, radius: 0.7, sections: 2, radial: 4, children: 4, childStart: 0.2, angle: 0, gnarl: 0.05, twist: 0 },
    { length: 6.5, radiusFactor: 0.6, sections: 2, radial: 3, children: 0, childStart: 0, angle: 62, gnarl: 0.1, twist: 0 },
  ],
  lobe: { radius: 5.2, variance: 0.3, squash: 0.72, lumps: 0.15, core: 1.25 },
};

// Paint, as vertex colours (tuned in the window shot against colours sampled from R3).
export const TREE_PAINT = {
  trunk: rgb('#5c5a34'),
  light: rgb('#74a845'),
  mid: rgb('#528c3c'),
  dark: rgb('#3a6c38'),
};

/**
 * Grows one plant at the origin (base at y = 0), in metres. Returns its branches (sections with
 * place, orientation and radius), its lobes, a report and its bounds; emitTree writes triangles.
 */
export function growTree(seed, species = BANK_TREE, tier = 'near') {
  const rand = mulberry32(seed);
  const levels = species.levels;
  const last = tier === 'near' ? levels.length - 1 : Math.max(1, levels.length - 2);
  const zero = () => levels.map(() => 0);
  const report = { preset: species.name, tier, seed, jobs: zero(), continuations: zero(), laterals: zero(), lobes: 0, slotGap: Infinity };
  const branches = [];
  const queue = [{ level: 0, kind: 'trunk', origin: new THREE.Vector3(), quat: new THREE.Quaternion(), length: levels[0].length * (0.92 + rand() * 0.16), radius: levels[0].radius, sections: levels[0].sections, radial: levels[0].radial }];
  while (queue.length) {
    const job = queue.shift();
    const L = levels[job.level];
    report.jobs[job.level]++;
    const sections = [];
    const q = job.quat.clone();
    const pos = job.origin.clone();
    const step = job.length / job.sections;
    for (let i = 0; i <= job.sections; i++) {
      const radius = job.radius * (1 - (species.taper * i) / job.sections);
      sections.push({ pos: pos.clone(), quat: q.clone(), radius, along: i * step });
      if (i === job.sections) break;
      pos.addScaledVector(UP.clone().applyQuaternion(q), step);
      const gnarl = Math.max(1, 1 / Math.sqrt(radius)) * L.gnarl;
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 2 * gnarl, L.twist, (rand() - 0.5) * 2 * gnarl)));
      const dir = UP.clone().applyQuaternion(q);
      const angle = dir.angleTo(UP);
      if (angle > 1e-5) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(dir, UP).normalize(), Math.min(angle, species.force / radius)));
    }
    branches.push({ level: job.level, kind: job.kind, sections, radial: job.radial });
    if (job.level >= last) continue;
    const child = levels[job.level + 1];
    // One terminal continuation: the branch goes on, a level thinner in its table.
    const tip = sections[job.sections];
    queue.push({ level: job.level + 1, kind: 'continuation', origin: tip.pos.clone(), quat: tip.quat.clone(), length: child.length * (0.85 + rand() * 0.3), radius: tip.radius, sections: job.sections, radial: job.radial });
    report.continuations[job.level + 1]++;
    // Lateral children: one per slot along the parent, directions shuffled on their own.
    const n = L.children;
    const slots = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const offset = rand();
    let before = null;
    for (let k = 0; k < n; k++) {
      const jitter = 0.2 + rand() * 0.6;
      if (before !== null) report.slotGap = Math.min(report.slotGap, k + jitter - before);
      before = k + jitter;
      const along = L.childStart + (k + jitter) * ((1 - L.childStart) / n);
      const at = Math.min(job.sections - 1e-4, along * job.sections);
      const i0 = Math.floor(at), alpha = at - i0;
      const A = sections[i0], B = sections[i0 + 1];
      const azimuth = Math.PI * 2 * (offset + (slots[k] + rand() - 0.5) / n);
      const quat = B.quat.clone().slerp(A.quat, alpha) // from B towards A, as the growth contract has it
        .multiply(new THREE.Quaternion().setFromAxisAngle(UP, azimuth))
        .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, THREE.MathUtils.degToRad(child.angle)));
      queue.push({ level: job.level + 1, kind: 'lateral', origin: A.pos.clone().lerp(B.pos, alpha), quat, length: child.length * (0.8 + rand() * 0.4), radius: THREE.MathUtils.lerp(A.radius, B.radius, alpha) * child.radiusFactor, sections: child.sections, radial: child.radial });
      report.laterals[job.level + 1]++;
    }
  }

  // Foliage, now that the branches are final: one lobe on every last branch, and one in the
  // middle of the crown so the sky does not show through it.
  const P = species.lobe;
  const tips = branches.filter((b) => b.level === last);
  const centre = new THREE.Vector3();
  for (const b of tips) centre.add(b.sections[b.sections.length - 1].pos);
  centre.multiplyScalar(1 / tips.length);
  const grow = tier === 'near' ? 1 : 1.55; // fewer lobes on the far tier, so larger ones
  const lobes = tips.map((b) => {
    const s = b.sections;
    const end = s[s.length - 1].pos, dir = end.clone().sub(s[s.length - 2].pos).normalize();
    const radius = P.radius * grow * (1 + (rand() - 0.5) * 2 * P.variance);
    return { centre: end.clone().addScaledVector(dir, radius * 0.25), radius, phase: [rand() * 6.28, rand() * 6.28, rand() * 6.28] };
  });
  lobes.push({ centre: centre.clone(), radius: P.radius * grow * P.core, phase: [rand() * 6.28, rand() * 6.28, rand() * 6.28] });
  report.lobes = lobes.length;

  // To metres, with bounds.
  const u = species.unit;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = min.clone().negate();
  for (const b of branches) for (const s of b.sections) {
    s.pos.multiplyScalar(u);
    s.radius *= u;
    s.along *= u;
    min.min(s.pos);
    max.max(s.pos);
  }
  let woodLow = min.y;
  for (const l of lobes) {
    l.centre.multiplyScalar(u);
    l.radius *= u;
    min.min(l.centre.clone().subScalar(l.radius));
    max.max(l.centre.clone().addScalar(l.radius));
  }
  centre.multiplyScalar(u);
  const lowest = Math.min(...lobes.map((l) => l.centre.y - l.radius * P.squash));
  report.height = +max.y.toFixed(2);
  report.width = +Math.max(max.x - min.x, max.z - min.z).toFixed(2);
  report.clear = +lowest.toFixed(2); // bare trunk below the crown
  return { species, tier, branches, lobes, centre, report, bounds: { min, max }, woodLow };
}

const ICO = [0, 1].map((d) => {
  const g = new THREE.IcosahedronGeometry(1, d);
  const p = g.attributes.position;
  const out = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize());
  g.dispose();
  return out;
});

const TINT = {
  level: [[0.9, 0.25, 0.2], [0.2, 0.8, 0.3], [0.25, 0.4, 0.95]],
  kind: { trunk: [0.95, 0.95, 0.95], continuation: [0.1, 0.8, 0.9], lateral: [0.95, 0.5, 0.1] },
};

/**
 * Writes a grown plant into slot `slot`, standing at `at`, scaled and turned about its trunk.
 * `tint` 'tree-level' or 'tree-kind' paints the diagnostic colours the growth contract asks for.
 * Returns the triangles written.
 */
export function emitTree(w, slot, tree, { at, scale = 1, yaw = 0, paint = TREE_PAINT, detail = 1, tint } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const place = (v) => [at[0] + (v.x * c + v.z * s) * scale, at[1] + v.y * scale, at[2] + (-v.x * s + v.z * c) * scale];
  const turn = (v) => [v.x * c + v.z * s, v.y, -v.x * s + v.z * c];
  let wood = 0, leaf = 0;
  const v = new THREE.Vector3();
  for (const b of tree.branches) {
    const radial = tree.tier === 'near' ? b.radial : Math.min(4, b.radial);
    const colour = tint === 'tree-level' ? TINT.level[b.level] : tint === 'tree-kind' ? TINT.kind[b.kind] : paint.trunk;
    const ring = (sec) => {
      const out = [];
      for (let k = 0; k <= radial; k++) { // the last corner repeats the first: the UV seam
        const a = (k / radial) * Math.PI * 2;
        const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(sec.quat);
        out.push({ p: place(v.copy(sec.pos).addScaledVector(n, sec.radius)), n: turn(n), uv: [k / radial, sec.along / 2] });
      }
      return out;
    };
    let prev = ring(b.sections[0]);
    for (let i = 1; i < b.sections.length; i++) {
      const cur = ring(b.sections[i]);
      for (let k = 0; k < radial; k++) {
        const A = prev[k], B = prev[k + 1], C = cur[k + 1], D = cur[k];
        w.smoothTri(slot, [A.p, C.p, B.p], [A.n, C.n, B.n], [A.uv, C.uv, B.uv], colour);
        w.smoothTri(slot, [A.p, D.p, C.p], [A.n, D.n, C.n], [A.uv, D.uv, C.uv], colour);
        wood += 2;
      }
      prev = cur;
    }
  }
  // Lobes: three flat greens by height in the crown (R3: light on top, dark underneath).
  const P = tree.species.lobe;
  const ys = tree.lobes.map((l) => l.centre.y);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const dirs = ICO[detail];
  tree.lobes.forEach((l, index) => {
    const t = y1 > y0 ? (l.centre.y - y0) / (y1 - y0) : 0.5;
    const core = index === tree.lobes.length - 1;
    const colour = tint ? [0.55, 0.55, 0.55] : core ? paint.dark : t > 0.6 ? paint.light : t > 0.28 ? paint.mid : paint.dark;
    const corner = (d) => {
      const lump = 1 + P.lumps * Math.sin(d.x * 5.1 + l.phase[0]) * Math.sin(d.y * 4.3 + l.phase[1]) * Math.sin(d.z * 4.7 + l.phase[2]) * 2;
      const p = new THREE.Vector3(l.centre.x + d.x * l.radius * lump, l.centre.y + d.y * l.radius * lump * P.squash, l.centre.z + d.z * l.radius * lump);
      const n = d.clone().lerp(p.clone().sub(tree.centre).normalize(), 0.4).normalize(); // rounded by the crown
      return { p: place(p), n: turn(n) };
    };
    for (let i = 0; i < dirs.length; i += 3) {
      const A = corner(dirs[i]), B = corner(dirs[i + 1]), C = corner(dirs[i + 2]);
      w.smoothTri(slot, [A.p, B.p, C.p], [A.n, B.n, C.n], null, colour);
      leaf++;
    }
  });
  return { wood, leaf };
}

/**
 * Plants the far bank: the clump of tall trees left of the embankment (R3's centre), bushes at
 * their feet, the big tree and the wooded bank upstream, a far row behind the terrace.
 * `place(xWater, offset)` gives a point of the far bank [x, y, z] (banks.js); `groundAt(x, z)` its height.
 */
export function buildTrees(w, { seed = 0, place, groundAt, tint } = {}) {
  const T = SITE.trees;
  const rand = mulberry32(977 + seed);
  const stats = { trees: 0, bushes: 0, wood: 0, leaf: 0, jobs: [0, 0, 0], continuations: [0, 0, 0], laterals: [0, 0, 0], lobes: 0, heights: {}, seeds: [] };
  const contract = createContract('trees');
  let lowestGround = Infinity, n = 0;
  const plant = (group, at, { species = BANK_TREE, tier = 'near', scale = 1, detail = 1 }) => {
    const treeSeed = 4000 + seed * 131 + n++ * 17;
    const tree = growTree(treeSeed, species, tier);
    const out = emitTree(w, 'paint', tree, { at, scale, yaw: rand() * Math.PI * 2, detail, tint });
    stats.wood += out.wood;
    stats.leaf += out.leaf;
    tree.report.jobs.forEach((v, i) => (stats.jobs[i] += v));
    tree.report.continuations.forEach((v, i) => (stats.continuations[i] += v));
    tree.report.laterals.forEach((v, i) => (stats.laterals[i] += v));
    stats.lobes += tree.report.lobes;
    const h = tree.report.height * scale;
    const g = (stats.heights[group] ??= [Infinity, -Infinity]);
    g[0] = Math.min(g[0], +h.toFixed(1));
    g[1] = Math.max(g[1], +h.toFixed(1));
    lowestGround = Math.min(lowestGround, at[1]);
    if (species === BANK_TREE) stats.trees++;
    else stats.bushes++;
    if (group === 'clump') stats.seeds.push(treeSeed);
    return tree;
  };
  const on = (x, z) => [x, groundAt(x, z) - 0.05, z];

  for (const [x, z, scale] of T.clump) plant('clump', on(x, z), { scale });
  for (const [x, z, scale] of T.big) plant('big', on(x, z), { scale });
  for (const [xw, offset, scale] of T.bushes) plant('bushes', place(xw, offset), { species: BANK_BUSH, scale });
  for (const row of T.rows) {
    for (let i = 0; i < row.count; i++) {
      const f = (i + 0.15 + rand() * 0.7) / row.count;
      let at;
      if (row.box) at = on(row.box[0] + (row.box[1] - row.box[0]) * f, row.box[2] + (row.box[3] - row.box[2]) * rand());
      else at = place(row.x0 + (row.x1 - row.x0) * f, row.offset[0] + rand() * (row.offset[1] - row.offset[0]));
      plant(row.name, at, { species: row.bush ? BANK_BUSH : BANK_TREE, tier: row.bush ? 'near' : 'far', scale: row.scale[0] + rand() * (row.scale[1] - row.scale[0]), detail: row.detail });
    }
  }

  // The growth contract, measured on one tree of each tier and on three seeds.
  const L = BANK_TREE.levels;
  const near = growTree(1, BANK_TREE, 'near').report, far = growTree(1, BANK_TREE, 'far').report;
  contract.is('near tier: jobs per level', near.jobs.join(','), [1, L[0].children + 1, (L[0].children + 1) * (L[1].children + 1)].join(','));
  contract.is('near tier: terminal continuations per level', near.continuations.join(','), [0, 1, L[0].children + 1].join(','));
  contract.is('near tier: lateral children per level', near.laterals.join(','), [0, L[0].children, (L[0].children + 1) * L[1].children].join(','));
  contract.is('near tier: lobes = last branches + 1', near.lobes, near.jobs[2] + 1);
  contract.is('far tier: jobs per level', far.jobs.join(','), [1, L[0].children + 1, 0].join(','));
  contract.min('smallest gap between sibling slots (slots)', near.slotGap, 0.4);
  const three = [11, 12, 13].map((s) => growTree(s, BANK_TREE, 'near'));
  const hs = three.map((t) => t.report.height), ws = three.map((t) => t.report.width);
  contract.range('three seeds: height (m), lowest', Math.min(...hs), 11, 16);
  contract.range('three seeds: height (m), highest', Math.max(...hs), 11, 16);
  contract.max('three seeds: height spread (ratio)', Math.max(...hs) / Math.min(...hs), 1.2);
  contract.range('three seeds: crown width (m), smallest', Math.min(...ws), 6, 13);
  contract.range('three seeds: crown width (m), largest', Math.max(...ws), 6, 13);
  contract.min('three seeds: bare trunk below the crown (m), least', Math.min(...three.map((t) => t.report.clear)), 2);
  contract.min('wood never dips below the base (m)', Math.min(...three.map((t) => t.woodLow)), -0.05);
  contract.range('clump heights (m), lowest', stats.heights.clump[0], 13, 19);
  contract.range('clump heights (m), highest', stats.heights.clump[1], 13, 19);
  contract.min('every plant stands on land above the water (m)', lowestGround - SITE.water, 0.3);
  contract.range('triangles', stats.wood + stats.leaf, 8000, 34000);
  stats.threeSeeds = three.map((t) => ({ seed: t.report.seed, height: t.report.height, width: t.report.width, clear: t.report.clear }));
  return { contract: contract.assert(), stats };
}
