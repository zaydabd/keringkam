// Broad shade trees for the river banks (R3 paints them as wide, round crowns on forked trunks).
// After .claude/skills/threejs-procedural-vegetation: a species table per branch level; growth
// from a queue (so budgets can be counted); children placed in stratified slots along the parent
// with independently shuffled directions; leaves along every final branch, with rounded normals.
// Divergences from the skill's ash reference, on purpose: three levels instead of four, single
// leaf cards instead of crossed pairs (far fewer triangles for trees seen across a river), a
// low-poly crown volume behind the cards for mass, and no wind (the scene is still).

import * as THREE from 'three';

// Level 0 trunk, 1 bough, 2 twig. Lengths in metres for a tree of scale 1.
export const SHADE_TREE = {
  taper: 0.7,
  lift: 0.12, // pull towards the light per section
  levels: [
    { length: 5.2, radius: 0.42, sections: 4, radial: 6, children: 4, childStart: 0.55, angle: 0, gnarl: 0.05 },
    { length: 5.6, radiusFactor: 0.6, sections: 4, radial: 5, children: 3, childStart: 0.4, angle: 52, gnarl: 0.18 },
    { length: 3.2, radiusFactor: 0.55, sections: 3, radial: 3, children: 0, childStart: 0, angle: 60, gnarl: 0.12 },
  ],
  leaves: { perTwig: 7, size: 2.6, variance: 0.6 },
  crowns: 3, // far tier: round volumes instead of cards
};

/**
 * Grows one tree at the origin (its base at y = 0). tier 'near' has leaf cards; 'far' has only
 * the branch structure down to the boughs and crown volumes. Returns arrays ready to be placed.
 */
export function growTree(rand, species = SHADE_TREE, tier = 'near') {
  const wood = { position: [], normal: [], uv: [] };
  const leaf = { position: [], normal: [], uv: [], shade: [] };
  const crown = { position: [], normal: [] };
  const report = { jobs: [0, 0, 0], leafCards: 0, triangles: { wood: 0, leaf: 0, crown: 0 } };
  const up = new THREE.Vector3(0, 1, 0);
  const tips = [];
  const queue = [{ level: 0, origin: new THREE.Vector3(), quat: new THREE.Quaternion(), length: species.levels[0].length, radius: species.levels[0].radius }];
  const maxLevel = tier === 'near' ? 2 : 1;
  while (queue.length) {
    const job = queue.shift();
    const L = species.levels[job.level];
    report.jobs[job.level]++;
    // Sections: each step leans a little at random and a little towards the light.
    const sections = [];
    const q = job.quat.clone();
    const pos = job.origin.clone();
    for (let i = 0; i <= L.sections; i++) {
      const f = i / L.sections;
      sections.push({ pos: pos.clone(), quat: q.clone(), radius: job.radius * (1 - species.taper * f) });
      const wobble = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * L.gnarl * 2, (rand() - 0.5) * L.gnarl * 2, (rand() - 0.5) * L.gnarl * 2));
      q.multiply(wobble);
      const dir = up.clone().applyQuaternion(q);
      dir.lerp(up, species.lift * (job.level ? 1 : 0.3)).normalize();
      q.setFromUnitVectors(up, dir);
      pos.addScaledVector(dir, job.length / L.sections);
    }
    // Rings to triangles.
    for (let i = 0; i < L.sections; i++) {
      for (let k = 0; k < L.radial; k++) {
        const corner = (s, j) => {
          const a = (j / L.radial) * Math.PI * 2;
          const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(s.quat);
          return { p: s.pos.clone().addScaledVector(n, s.radius), n };
        };
        const a = corner(sections[i], k), b = corner(sections[i], k + 1), c = corner(sections[i + 1], k + 1), d = corner(sections[i + 1], k);
        for (const v of [a, c, b, a, d, c]) {
          wood.position.push(v.p.x, v.p.y, v.p.z);
          wood.normal.push(v.n.x, v.n.y, v.n.z);
          wood.uv.push(0, 0);
        }
        report.triangles.wood += 2;
      }
    }
    const tip = sections[L.sections];
    // Children: one per longitudinal slot, directions shuffled independently.
    if (job.level < maxLevel && L.children) {
      const child = species.levels[job.level + 1];
      const slots = [...Array(L.children).keys()];
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      const offset = rand();
      for (let k = 0; k < L.children; k++) {
        const along = L.childStart + ((k + rand()) * (1 - L.childStart)) / L.children;
        const at = Math.min(L.sections - 1e-4, along * L.sections);
        const i0 = Math.floor(at);
        const f = at - i0;
        const origin = sections[i0].pos.clone().lerp(sections[i0 + 1].pos, f);
        const radius = THREE.MathUtils.lerp(sections[i0].radius, sections[i0 + 1].radius, f);
        const base = sections[i0].quat.clone().slerp(sections[i0 + 1].quat, f);
        const azimuth = Math.PI * 2 * (offset + (slots[k] + rand() - 0.5) / L.children);
        const quat = base.multiply(new THREE.Quaternion().setFromAxisAngle(up, azimuth)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(child.angle)));
        queue.push({ level: job.level + 1, origin, quat, length: child.length * (0.8 + rand() * 0.4), radius: radius * child.radiusFactor });
      }
    }
    if (job.level === maxLevel) tips.push({ sections, tip: tip.pos });
  }
  // Leaves along every final branch (near tier): single cards with rounded normals.
  const centre = new THREE.Vector3();
  for (const t of tips) centre.add(t.tip);
  centre.multiplyScalar(1 / Math.max(1, tips.length));
  if (tier === 'near') {
    const Lf = species.leaves;
    for (const t of tips) {
      for (let k = 0; k < Lf.perTwig; k++) {
        const at = ((k + rand()) / Lf.perTwig) * (t.sections.length - 1);
        const i0 = Math.min(t.sections.length - 2, Math.floor(at));
        const origin = t.sections[i0].pos.clone().lerp(t.sections[i0 + 1].pos, at - i0);
        const size = Lf.size + (rand() - 0.5) * 2 * Lf.variance;
        const out = origin.clone().sub(centre).normalize().lerp(new THREE.Vector3(rand() - 0.5, rand() * 0.8, rand() - 0.5), 0.5).normalize();
        const side = new THREE.Vector3().crossVectors(out, up).normalize().multiplyScalar(size / 2);
        const upv = new THREE.Vector3().crossVectors(side, out).normalize().multiplyScalar(size);
        const c0 = origin.clone().sub(side), c1 = origin.clone().add(side), c2 = c1.clone().add(upv), c3 = c0.clone().add(upv);
        const shade = 0.82 + 0.36 * Math.max(0, out.y) + (rand() - 0.5) * 0.1;
        const uvs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
        [c0, c1, c2, c0, c2, c3].forEach((v, i) => {
          const n = out.clone().add(v.clone().sub(origin).multiplyScalar(0.6)).normalize(); // rounded
          leaf.position.push(v.x, v.y, v.z);
          leaf.normal.push(n.x, n.y, n.z);
          leaf.uv.push(...uvs[i]);
          leaf.shade.push(shade);
        });
        report.leafCards++;
        report.triangles.leaf += 2;
      }
    }
  }
  // Crown volumes: a few squashed low-poly spheres around the branch tips (both tiers; on the
  // near tier they sit inside the cards and stop the sky showing through the middle).
  const blob = new THREE.IcosahedronGeometry(1, 1); // already one vertex per corner
  const bp = blob.attributes.position;
  const groups = Math.min(species.crowns, tips.length);
  for (let g = 0; g < groups; g++) {
    const c = new THREE.Vector3();
    let n = 0;
    tips.forEach((t, i) => {
      if (i % groups === g) {
        c.add(t.tip);
        n++;
      }
    });
    c.multiplyScalar(1 / n).lerp(centre, 0.25);
    const r = (tier === 'near' ? 3.0 : 4.4) + rand() * 0.8;
    for (let i = 0; i < bp.count; i++) {
      const v = new THREE.Vector3(bp.getX(i), bp.getY(i), bp.getZ(i));
      crown.normal.push(v.x, v.y, v.z);
      crown.position.push(c.x + v.x * r, c.y + v.y * r * 0.72, c.z + v.z * r);
    }
    report.triangles.crown += bp.count / 3;
  }
  blob.dispose();
  return { wood, leaf, crown, report };
}
