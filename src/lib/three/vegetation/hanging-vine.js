// A hanging vine on a short branch, built from the 16 views of reference V2 (see
// research/CREDITS.md): a dense crown of large heart-shaped leaves at the top, about eight thin
// pale-green strands hanging almost straight down, leaves that shrink towards the tips, a few bare
// strands, and small curls at some tips. Narrow: about a third as wide as it is tall.
//
// Same growth contract as vine-curtain.js: a per-level species table, a growth queue,
// stratified slots with shuffled sides, gravity plus a seeded wander, leaves after the stems.
// The branch (level 0) is grown, not authored. No wind: the reference does not move.
// Units: metres. The size (about 0.45 m wide, 1.1 m tall) is a design choice: the reference gives no scale.

import * as THREE from 'three';
import { mulberry32, range, shuffled, stratified } from './rng.js';
import { addTube, createMeshWriter } from './tube.js';
import { HEART_LEAF_PAINT, HEART_LEAF_SHAPE, createLeafGeometry } from './leaf.js';
import { createCelLeafMaterial, setCelLeafAttributes } from './cel-foliage.js';
import { growHanging, growTendril, pointAt, taper } from './grow.js';

export const HANGING_VINE = {
  branch: { length: 0.34, radius: 0.012, tipRadius: 0.005, radial: 7, step: 0.02, droop: 0.12 },
  strand: {
    count: 9,
    slots: [0.05, 0.95],
    radius: 0.0035,
    tipRadius: 0.0012,
    radial: 5,
    step: 0.02,
    length: [0.55, 1.05],
    gravity: 0.7,
    wander: 0.12,
    bare: 0.2, // share of strands with leaves only near the top
    tendril: 0.45,
  },
  tendril: { radius: 0.0012, tipRadius: 0.0006, radial: 4, turns: [1.5, 3], coil: [0.012, 0.004], length: [0.04, 0.08], samples: 30 },
  leaf: {
    crown: 48, // extra leaves on the branch: the dense top
    crownSize: [0.13, 0.19],
    spacing: 0.055,
    size: [0.06, 0.16], // at the tip and at the top of a strand
    faceBack: 0.15,
  },
};

export const HANGING_VINE_PAINT = {
  branch: new THREE.Color('#5a4030'),
  strand: new THREE.Color('#9fae6a'),
  tendril: new THREE.Color('#b0b880'),
};

export function createHangingVine({ seed = 1, species = HANGING_VINE, paint = HANGING_VINE_PAINT } = {}) {
  const rand = mulberry32(seed);
  const stems = createMeshWriter();
  const stats = { seed, levels: { branch: 0, strand: 0, tendril: 0 }, triangles: { stems: 0, leaves: 0 }, leaves: 0 };
  const branches = [];

  // ---- Level 0: a short branch, nearly level, that droops a little.
  const B = species.branch;
  const start = new THREE.Vector3(-B.length / 2, 1.1, -0.02);
  const branchPoints = [];
  const n0 = Math.ceil(B.length / B.step);
  for (let i = 0; i <= n0; i++) {
    const t = i / n0;
    branchPoints.push(new THREE.Vector3(start.x + B.length * t, start.y - B.droop * t * t + range(rand, -0.004, 0.004), start.z + Math.sin(t * 3) * 0.02));
  }
  const queue = [{ kind: 'branch', points: branchPoints, radii: taper(branchPoints.length, B.radius, B.tipRadius) }];

  while (queue.length) {
    const job = queue.shift();
    stats.levels[job.kind]++;
    branches.push(job);
    if (job.kind === 'branch') {
      const s = species.strand;
      const leans = shuffled(rand, Array.from({ length: s.count }, (_, i) => (i / (s.count - 1) - 0.5) * 0.3));
      stratified(rand, s.count, ...s.slots).forEach((t, i) => {
        const at = pointAt(job.points, t);
        const dir = new THREE.Vector3(leans[i], -1, range(rand, -0.35, 0.35));
        const points = growHanging(rand, at.point, dir, {
          step: s.step,
          gravity: s.gravity,
          wander: s.wander,
          plane: 0.15,
          length: range(rand, ...s.length),
        });
        queue.push({ kind: 'strand', points, radii: taper(points.length, s.radius, s.tipRadius), bare: rand() < s.bare });
      });
    } else if (job.kind === 'strand' && rand() < species.strand.tendril) {
      const n = job.points.length;
      const T = species.tendril;
      const points = growTendril(rand, job.points[n - 1], job.points[n - 1].clone().sub(job.points[n - 2]).normalize(), T);
      queue.push({ kind: 'tendril', points, radii: taper(points.length, T.radius, T.tipRadius) });
    }
  }

  const style = {
    branch: { radial: B.radial, color: paint.branch, closeStart: true },
    strand: { radial: species.strand.radial, color: paint.strand },
    tendril: { radial: species.tendril.radial, color: paint.tendril },
  };
  for (const b of branches) stats.triangles.stems += addTube(stems, b.points, b.radii, style[b.kind]);

  // ---- Leaves. Heart leaves hang: the petiole leaves the stem sideways, the blade points down.
  const L = species.leaf;
  const leaves = [];
  const basis = new THREE.Matrix4();
  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();
  // Proxy normals for the cel shading (our adaptation; see cel-foliage.js): crown leaves take the
  // direction from the crown centre, strand leaves the direction out from their strand.
  const branch = branches[0];
  const crownCentre = branch.points.reduce((c, q) => c.add(q), new THREE.Vector3()).divideScalar(branch.points.length);
  crownCentre.y -= L.crownSize[1] * 0.4;
  const crownRadius = B.length * 0.5 + L.crownSize[1];
  const place = (root, blade, size, axis) => {
    const back = rand() < L.faceBack ? -1 : 1;
    const facing = new THREE.Vector3(range(rand, -0.6, 0.6), range(rand, 0.1, 0.5), back);
    y.copy(blade).normalize();
    z.copy(facing).addScaledVector(y, -facing.dot(y));
    if (z.lengthSq() < 1e-4) z.set(0, 0, 1);
    z.normalize();
    x.crossVectors(y, z);
    basis.makeBasis(x, y, z);
    const bright = range(rand, 0.75, 1.1);
    const yellow = range(rand, 0, 0.18);
    const mid = root.clone().addScaledVector(y, size * 0.5);
    let proxy;
    let depth;
    if (axis) {
      // Out from the strand, plus a little of the leaf's facing so the strand is not a flat ribbon.
      proxy = y.clone().addScaledVector(axis, -y.dot(axis)).addScaledVector(z, 0.3);
      depth = 0.8;
    } else {
      proxy = mid.clone().sub(crownCentre);
      depth = Math.min(1, proxy.length() / crownRadius);
    }
    if (proxy.lengthSq() < 1e-8) proxy.set(0, 0, 1);
    leaves.push({
      proxy: proxy.normalize(),
      depth,
      position: root.clone(),
      quaternion: new THREE.Quaternion().setFromRotationMatrix(basis),
      scale: size,
      tint: new THREE.Color(bright * (1 + yellow * 0.6), bright, bright * (1 - yellow)),
    });
  };

  // The crown: big leaves on the branch, pointing every way but mostly down and forward.
  for (let i = 0; i < L.crown; i++) {
    const at = pointAt(branch.points, (i + rand()) / L.crown);
    place(at.point, new THREE.Vector3(range(rand, -1, 1), range(rand, -1, 0.5), range(rand, -0.8, 1)), range(rand, ...L.crownSize));
  }

  for (const b of branches) {
    if (b.kind !== 'strand') continue;
    const pts = b.points;
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += pts[i].distanceTo(pts[i - 1]);
    const stopAt = b.bare ? 0.3 : 0.97;
    let side = rand() < 0.5 ? -1 : 1;
    for (let s = range(rand, 0, L.spacing); s < length * stopAt; s += L.spacing * range(rand, 0.7, 1.3)) {
      const t = s / length;
      side = -side;
      const size = THREE.MathUtils.lerp(L.size[1], L.size[0], t ** 0.8) * range(rand, 0.85, 1.15);
      const blade = new THREE.Vector3(side * range(rand, 0.3, 0.9), range(rand, -1.2, -0.4), range(rand, -0.3, 0.5));
      const at = pointAt(pts, t);
      place(at.point, blade, size, at.tangent);
    }
  }

  // ---- Meshes.
  const group = new THREE.Group();
  group.name = 'hanging vine';
  const stemGeometry = stems.toGeometry();
  const stemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const stemMesh = new THREE.Mesh(stemGeometry, stemMaterial);
  stemMesh.name = 'stems';
  group.add(stemMesh);

  const leafGeometry = createLeafGeometry(HEART_LEAF_SHAPE, HEART_LEAF_PAINT);
  // Cel ramp tones from the heart-leaf paint (edge → blade → vein), so the vine keeps its colours.
  const leafMaterial = createCelLeafMaterial({
    tones: [HEART_LEAF_PAINT.edge, HEART_LEAF_PAINT.blade, HEART_LEAF_PAINT.vein],
    paintRef: HEART_LEAF_PAINT.blade,
  });
  setCelLeafAttributes(leafGeometry, leaves);
  const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, leaves.length);
  leafMesh.name = 'leaves';
  const m = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  leaves.forEach((leaf, i) => {
    leafMesh.setMatrixAt(i, m.compose(leaf.position, leaf.quaternion, sc.setScalar(leaf.scale)));
    leafMesh.setColorAt(i, leaf.tint);
  });
  leafMesh.computeBoundingSphere();
  group.add(leafMesh);

  stats.leaves = leaves.length;
  stats.triangles.leaves = (leafGeometry.index.count / 3) * leaves.length;
  stats.triangles.total = stats.triangles.stems + stats.triangles.leaves;
  stats.bounds = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));

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
