// A hanging vine curtain, built from the 16 views of reference V1 (see research/CREDITS.md):
// an arched woody runner like an "M" (two humps that dip in the middle), long pendant strands
// hanging from it, short leafy side shoots, and thin curled tendrils at the tips. The leaves are
// large and crowded on the arch and get smaller towards the strand tips. The curtain is thin.
//
// After .claude/skills/threejs-procedural-vegetation (growth contract):
//   - a species table per level (VINE_CURTAIN, below);
//   - growth from a queue, so jobs and triangles can be counted per level;
//   - children in stratified slots along the parent, with independently shuffled sides;
//   - each strand section turns by gravity (tropism), a smooth seeded wander, and a pull back
//     to the curtain plane (z = 0), so strands hang like a curtain, not a bush;
//   - leaves are placed only after every stem is final.
// Divergences, on purpose:
//   - level 0 (the arch) is an authored spline, not grown: its "M" shape is the plant's identity
//     in every reference view;
//   - leaves are real lobed geometry (leaf.js), not alpha cards, so no texture is needed;
//   - no wind: the reference does not move, so nothing here moves.
// Units: metres. The size (about 0.75 m wide, 1.25 m tall) is a design choice: the reference gives no scale.

import * as THREE from 'three';
import { mulberry32, range, shuffled, stratified } from '../../utils/rng.js';
import { addTube, createMeshWriter } from './tube.js';
import { LEAF_PAINT, createLeafGeometry } from './leaf.js';
import { createCelLeafMaterial, setCelLeafAttributes } from './cel-foliage.js';
import { UP, growHanging, growTendril, pointAt, resample, taper } from './grow.js';

export const VINE_CURTAIN = {
  name: 'vine curtain',
  // Level 0: the arch, an authored datum (x, y, z in metres), left to right.
  arch: {
    points: [
      [-0.3, 0.32, 0.0],
      [-0.33, 0.64, 0.01],
      [-0.32, 0.95, 0.03],
      [-0.27, 1.16, 0.05],
      [-0.17, 1.24, 0.06],
      [-0.07, 1.18, 0.04],
      [-0.02, 1.12, 0.01],
      [0.04, 1.12, 0.0],
      [0.09, 1.18, 0.03],
      [0.19, 1.24, 0.06],
      [0.29, 1.18, 0.05],
      [0.34, 0.98, 0.03],
      [0.35, 0.66, 0.01],
      [0.32, 0.38, 0.0],
    ],
    radius: 0.0065,
    tipRadius: 0.0035,
    radial: 7,
    step: 0.012,
  },
  strand: {
    count: 16,
    leaders: 2, // the thickest strands, in the middle of each hump
    slots: [0.1, 0.9],
    gap: [0.44, 0.56], // fewer strands from the centre dip
    radius: 0.0034,
    leaderRadius: 0.0055,
    tipRadius: 0.0011,
    radial: 5,
    step: 0.018,
    bottom: [0.0, 0.32], // where a strand stops (y, metres)
    gravity: 0.6,
    wander: 0.16,
    plane: 0.7, // pull towards z = 0
    spread: 0.08, // initial outward lean
    sideShoots: [0, 2],
    tendril: 0.6, // chance of a tendril at the tip
  },
  shoot: {
    length: [0.06, 0.16],
    angle: 0.75, // radians off the strand
    radius: 0.0016,
    tipRadius: 0.0007,
    radial: 4,
    step: 0.014,
    gravity: 0.18,
    tendril: 0.35,
  },
  tendril: {
    radius: 0.0012,
    tipRadius: 0.0004,
    radial: 3,
    turns: [1.2, 2.6],
    coil: [0.018, 0.006], // coil radius at start and end
    length: [0.06, 0.13],
    samples: 34,
  },
  leaf: {
    archSpacing: 0.011,
    archSize: [0.1, 0.145],
    archDepth: 0.05, // how far forward the arch leaves reach (scales the blade's z)
    strandSpacing: 0.04,
    strandSize: [0.05, 0.14], // at the tip and at the top
    shootSize: [0.035, 0.07],
    faceBack: 0.08, // share of leaves turned to face the back
  },
};

export const VINE_PAINT = {
  stem: new THREE.Color('#5a1612'),
  strand: new THREE.Color('#6b1d16'),
  tendril: new THREE.Color('#8a5a52'),
};

/**
 * Grows the vine. Returns { group, stats, dispose }.
 * `stats` counts jobs and triangles per level, for the validation views.
 */
export function createVineCurtain({ seed = 1, species = VINE_CURTAIN, paint = VINE_PAINT } = {}) {
  const rand = mulberry32(seed);
  const stems = createMeshWriter();
  const stats = { seed, levels: { arch: 0, strand: 0, shoot: 0, tendril: 0 }, triangles: { stems: 0, leaves: 0 }, leaves: 0 };
  const branches = []; // finished stems, for the leaf pass: { kind, points, radii }

  // ---- Level 0: the arch (authored).
  const arch = species.arch;
  const archCurve = new THREE.CatmullRomCurve3(arch.points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const archPoints = resample(archCurve, arch.step);
  // Thick in the middle of each hump, thinner at the hanging ends.
  const archRadii = archPoints.map((_, i) => {
    const t = i / (archPoints.length - 1);
    const ends = Math.min(t, 1 - t) * 2;
    return THREE.MathUtils.lerp(arch.tipRadius, arch.radius, Math.min(1, ends * 2.5));
  });
  const queue = [{ kind: 'arch', points: archPoints, radii: archRadii }];

  // ---- Growth queue.
  while (queue.length) {
    const job = queue.shift();
    stats.levels[job.kind]++;
    if (job.kind === 'arch') {
      branches.push(job);
      const s = species.strand;
      const slots = stratified(rand, s.count, s.slots[0], s.slots[1]).filter(
        (t) => t < s.gap[0] || t > s.gap[1] || rand() < 0.3,
      );
      // Leaders: the slot nearest the middle of each hump.
      const leaderAt = [0.3, 0.7].map((h) => slots.reduce((best, t) => (Math.abs(t - h) < Math.abs(best - h) ? t : best)));
      const leans = shuffled(rand, slots.map((_, i) => (i / Math.max(1, slots.length - 1) - 0.5) * 2));
      slots.forEach((t, i) => {
        const at = pointAt(job.points, t);
        const leader = leaderAt.includes(t) && s.leaders > 0;
        // Lean away from the centre, mixed with a shuffled lean so neighbours differ.
        const outward = Math.sign(at.point.x) * s.spread + leans[i] * 0.15;
        const dir = new THREE.Vector3(outward, -1, range(rand, -0.1, 0.1));
        const stopY = range(rand, ...s.bottom) * (leader ? 0.3 : 1);
        const points = growHanging(rand, at.point, dir, {
          step: s.step,
          gravity: s.gravity,
          wander: s.wander,
          plane: s.plane,
          stopY,
          length: 2,
        });
        const r0 = Math.min(leader ? s.leaderRadius : s.radius, job.radii[at.index] * 0.9);
        queue.push({ kind: 'strand', points, radii: taper(points.length, r0, s.tipRadius, 0.7), leader });
      });
    } else if (job.kind === 'strand') {
      branches.push(job);
      const s = species.strand;
      const sh = species.shoot;
      const n = Math.round(range(rand, s.sideShoots[0], s.sideShoots[1] + 0.99));
      const sides = shuffled(rand, [-1, 1, -1, 1]);
      stratified(rand, n, 0.15, 0.8).forEach((t, i) => {
        const at = pointAt(job.points, t);
        const side = new THREE.Vector3(sides[i % 4], 0, 0);
        const dir = at.tangent.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), side.x * sh.angle);
        const points = growHanging(rand, at.point, dir, {
          step: sh.step,
          gravity: sh.gravity,
          wander: 0.15,
          plane: 1,
          length: range(rand, ...sh.length),
        });
        queue.push({ kind: 'shoot', points, radii: taper(points.length, sh.radius, sh.tipRadius) });
      });
      if (rand() < s.tendril) queue.push(tendrilJob(job));
    } else if (job.kind === 'shoot') {
      branches.push(job);
      if (rand() < species.shoot.tendril) queue.push(tendrilJob(job));
    } else if (job.kind === 'tendril') {
      branches.push(job);
    }
  }

  function tendrilJob(parent) {
    const n = parent.points.length;
    const tip = parent.points[n - 1];
    const dir = tip.clone().sub(parent.points[n - 2]).normalize();
    const t = species.tendril;
    const points = growTendril(rand, tip, dir, t);
    const r0 = Math.min(t.radius, parent.radii[n - 1] * 1.1);
    return { kind: 'tendril', points, radii: taper(points.length, r0, t.tipRadius) };
  }

  // ---- Stem mesh.
  const tubeStyle = {
    arch: { radial: arch.radial, color: paint.stem, closeStart: true },
    strand: { radial: species.strand.radial, color: paint.strand },
    shoot: { radial: species.shoot.radial, color: paint.strand },
    tendril: { radial: species.tendril.radial, color: paint.tendril },
  };
  for (const b of branches) stats.triangles.stems += addTube(stems, b.points, b.radii, tubeStyle[b.kind]);

  // ---- Leaves, after the stems are final.
  const L = species.leaf;
  const leaves = []; // { position, quaternion, scale, tint }
  const basis = new THREE.Matrix4();
  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();

  // Proxy normals for the cel shading (our adaptation; see cel-foliage.js): arch leaves take the
  // direction from the arch's leaf mass (behind the arch, at its middle), strand and shoot leaves
  // the direction out from their stem.
  const archPts = branches.find((b) => b.kind === 'arch').points;
  const archCentre = archPts.reduce((c, q) => c.add(q), new THREE.Vector3()).divideScalar(archPts.length);
  const archBox = new THREE.Box3().setFromPoints(archPts);
  const archRadius = Math.max(0.05, archBox.getSize(new THREE.Vector3()).length() * 0.5);
  const place = (root, blade, facing, size, axis, isArch) => {
    // Facing: mostly towards the front (+Z), tilted up a little towards the light.
    // The blade direction comes first; the facing is made perpendicular to it.
    y.copy(blade).normalize();
    z.copy(facing).addScaledVector(y, -facing.dot(y));
    if (z.lengthSq() < 1e-4) z.copy(UP).addScaledVector(y, -UP.dot(y));
    z.normalize();
    x.crossVectors(y, z);
    basis.makeBasis(x, y, z);
    // Per-leaf tint (multiplies the vertex colours): brightness and a slight yellow shift.
    const bright = range(rand, 0.8, 1.05);
    const yellow = range(rand, 0, 0.14);
    const tint = new THREE.Color(bright * (1 + yellow * 0.7), bright, bright * (1 - yellow));
    let proxy;
    let depth;
    if (isArch) {
      proxy = root.clone().addScaledVector(y, size * 0.5).sub(archCentre);
      depth = Math.min(1, proxy.length() / archRadius);
    } else {
      proxy = y.clone().addScaledVector(axis, -y.dot(axis)).addScaledVector(z, 0.3);
      depth = 0.8;
    }
    if (proxy.lengthSq() < 1e-8) proxy.set(0, 0, 1);
    leaves.push({ proxy: proxy.normalize(), depth, position: root.clone(), quaternion: new THREE.Quaternion().setFromRotationMatrix(basis), scale: size, tint });
  };

  const facingFor = () => {
    const back = rand() < L.faceBack ? -1 : 1;
    return new THREE.Vector3(range(rand, -0.5, 0.5), range(rand, 0.05, 0.45), back);
  };

  for (const b of branches) {
    if (b.kind === 'tendril') continue;
    const pts = b.points;
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += pts[i].distanceTo(pts[i - 1]);
    const spacing = b.kind === 'arch' ? L.archSpacing : L.strandSpacing * (b.kind === 'shoot' ? 0.7 : 1);
    let side = rand() < 0.5 ? -1 : 1;
    for (let s = range(rand, 0, spacing); s < length - 0.01; s += spacing * range(rand, 0.75, 1.25)) {
      const at = pointAt(pts, s / length);
      const t = s / length; // 0 at the base, 1 at the tip
      side = -side; // alternate leaves
      let size;
      const root = at.point.clone();
      const blade = new THREE.Vector3(side * range(rand, 0.4, 1.1), range(rand, -1.1, -0.2), 0);
      if (b.kind === 'arch') {
        // The arch carries a deep, crowded mass; leaves spread in depth and point every way.
        size = range(rand, ...L.archSize) * (0.75 + 0.25 * Math.min(1, Math.min(t, 1 - t) * 6));
        // Blades reach forward out of the arch (the stem stays at the back), which gives the
        // top its depth in the side views while every leaf stays rooted on the stem.
        blade.set(range(rand, -1, 1), range(rand, -0.9, 0.7), range(rand, 0.1, 1) * L.archDepth * 12);
      } else if (b.kind === 'strand') {
        const top = 1 - THREE.MathUtils.smoothstep(t, 0, 1);
        size = THREE.MathUtils.lerp(L.strandSize[0], L.strandSize[1], top ** 1.3) * range(rand, 0.85, 1.15);
        if (b.leader) size *= 1.25;
      } else {
        size = range(rand, ...L.shootSize) * (1 - 0.4 * t);
      }
      place(root, blade, facingFor(), size, at.tangent, b.kind === 'arch');
    }
  }

  // ---- Meshes.
  const group = new THREE.Group();
  group.name = 'vine curtain';
  const stemGeometry = stems.toGeometry();
  const stemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const stemMesh = new THREE.Mesh(stemGeometry, stemMaterial);
  stemMesh.name = 'stems';
  group.add(stemMesh);

  const leafGeometry = createLeafGeometry();
  // Cel ramp tones from the leaf paint (edge → blade → half-way to vein; the full vein yellow read
  // as blotches), so the vine keeps its colours.
  const leafMaterial = createCelLeafMaterial({ tones: [LEAF_PAINT.edge, LEAF_PAINT.blade, LEAF_PAINT.blade.clone().lerp(LEAF_PAINT.vein, 0.5)], paintRef: LEAF_PAINT.blade });
  setCelLeafAttributes(leafGeometry, leaves);
  const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, leaves.length);
  leafMesh.name = 'leaves';
  const m = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  leaves.forEach((leaf, i) => {
    m.compose(leaf.position, leaf.quaternion, sc.setScalar(leaf.scale));
    leafMesh.setMatrixAt(i, m);
    leafMesh.setColorAt(i, leaf.tint);
  });
  leafMesh.computeBoundingSphere();
  group.add(leafMesh);

  stats.leaves = leaves.length;
  stats.triangles.leaves = (leafGeometry.index.count / 3) * leaves.length;
  stats.triangles.total = stats.triangles.stems + stats.triangles.leaves;
  const box = new THREE.Box3().setFromObject(group);
  stats.bounds = box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));

  return {
    group,
    stats,
    dispose() {
      stemGeometry.dispose();
      stemMaterial.dispose();
      leafGeometry.dispose();
      leafMaterial.dispose();
      leafMesh.dispose();
    },
  };
}
