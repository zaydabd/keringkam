// The branch skeleton and clump centres of createTree (tree.js), copied step for step so the far
// level grows the same limbs as the near level for a seed. It must use the random numbers in the
// same order as createTree's branch growth; if that code changes, change this copy too.
// tree.js does not export these steps, and it is a shared file, so it is not edited.

import * as THREE from 'three';
import { mulberry32, range, shuffled, stratified } from '../../rng.js';
import { UP } from '../../grow.js';

const _n = new THREE.Vector3();
const _b = new THREE.Vector3();

function perpendiculars(t) {
  _n.set(0, 0, 1);
  if (Math.abs(t.z) > 0.9) _n.set(1, 0, 0);
  _n.addScaledVector(t, -t.dot(_n)).normalize();
  _b.crossVectors(t, _n);
}

function growBranch(rand, origin, dir, length, spec) {
  const points = [origin.clone()];
  const d = dir.clone().normalize();
  const bend = new THREE.Vector3();
  const kick = new THREE.Vector3();
  const p = origin.clone();
  const step = length / spec.sections;
  for (let i = 0; i < spec.sections; i++) {
    kick.set(range(rand, -1, 1), range(rand, -1, 1), range(rand, -1, 1));
    bend.multiplyScalar(0.6).addScaledVector(kick, spec.gnarl);
    d.add(bend).addScaledVector(UP, spec.up).normalize();
    p.addScaledVector(d, step);
    points.push(p.clone());
  }
  return points;
}

function pointAndRadius(points, radii, t) {
  const f = THREE.MathUtils.clamp(t, 0, 1) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(f));
  return {
    point: points[i].clone().lerp(points[i + 1], f - i),
    tangent: points[i + 1].clone().sub(points[i]).normalize(),
    radius: THREE.MathUtils.lerp(radii[i], radii[i + 1], f - i),
  };
}

const radiiFor = (n, r0, r1) => Array.from({ length: n }, (_, i) => r0 + (r1 - r0) * (i / (n - 1)) ** 0.8);

/** Returns { branches: [{level, points, radii, length}], centres: Vector3[] } as createTree grows them. */
export function growSkeleton(seed, species) {
  const rand = mulberry32(seed);
  const L = species.levels;
  const T = L[0];
  const leanAz = range(rand, 0, Math.PI * 2);
  const trunkDir = new THREE.Vector3(Math.cos(leanAz) * T.lean, 1, Math.sin(leanAz) * T.lean);
  const trunkLen = range(rand, ...T.length);
  const trunkPts = growBranch(rand, new THREE.Vector3(0, -0.05, 0), trunkDir, trunkLen, T);
  const queue = [{ level: 0, points: trunkPts, radii: radiiFor(trunkPts.length, T.radius, T.tip), length: trunkLen }];
  const branches = [];
  while (queue.length) {
    const job = queue.shift();
    branches.push(job);
    const spec = L[job.level + 1];
    if (!spec) continue;
    const heights = stratified(rand, spec.count, ...spec.emerge);
    const turn = range(rand, 0, Math.PI * 2);
    const azimuths = shuffled(rand, heights.map((_, i) => turn + (i / spec.count) * Math.PI * 2 + range(rand, -0.3, 0.3)));
    heights.forEach((t, i) => {
      const at = pointAndRadius(job.points, job.radii, t);
      perpendiculars(at.tangent);
      const az = azimuths[i];
      const ang = range(rand, ...spec.angle);
      const side = _n.clone().multiplyScalar(Math.cos(az)).addScaledVector(_b, Math.sin(az));
      const dir = at.tangent.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
      const length = job.length * range(rand, ...spec.length) * (1 - spec.shorten * t);
      const r0 = Math.max(spec.tip * 1.5, at.radius * spec.radius);
      const points = growBranch(rand, at.point, dir, length, spec);
      queue.push({ level: job.level + 1, points, radii: radiiFor(points.length, r0, spec.tip), length });
    });
  }
  const F = species.foliage;
  const last = L.length - 1;
  const centres = [];
  for (const b of branches) {
    if (b.level !== last) continue;
    const n = b.points.length;
    const tip = b.points[n - 1];
    const dir = tip.clone().sub(b.points[n - 2]).normalize();
    const c = tip.clone().addScaledVector(dir, F.radius * 0.3);
    if (centres.every((o) => o.distanceTo(c) > F.radius * F.merge)) centres.push(c);
  }
  return { branches, centres };
}
