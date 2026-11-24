// Bougainvillea branch skeleton, shared by the near and far levels so both read as one plant.
// A trained, mounded shrub (guess: ~2 m): a few short trunks from the ground, each throwing
// long canes that rise and then arch over and cascade down (growHanging's gravity bends them).
// Every number here is a design choice (guess), tuned by eye.

import * as THREE from 'three';
import { range, stratified, shuffled } from '../../rng.js';
import { growHanging, taper, UP } from '../../grow.js';

export const SPEC = {
  trunks: [3, 5], // (guess) "multi-trunked" is sourced, the count is not
  trunk: { length: [0.3, 0.5], tilt: [0.2, 0.45], radius: 0.04, tip: 0.022, sections: 6, gnarl: 0.06 },
  cane: { perTrunk: [4, 5], emerge: [0.5, 1], rise: [1.5, 2.6], length: [1.6, 2.3], step: 0.09, gravity: [0.05, 0.08], wander: 0.12, radius: 0.016, tip: 0.004 },
  twig: { count: 5, emerge: [0.3, 0.95], length: [0.25, 0.45], step: 0.06, gravity: 0.03, wander: 0.2, radius: 0.007, tip: 0.002 },
  stopY: 0.12,
};

/** Grows a straight-ish stem with persistent smooth bends (after tree.js growBranch). */
function growStem(rand, origin, dir, length, sections, gnarl) {
  const points = [origin.clone()];
  const d = dir.clone().normalize();
  const bend = new THREE.Vector3();
  const kick = new THREE.Vector3();
  const p = origin.clone();
  const step = length / sections;
  for (let i = 0; i < sections; i++) {
    kick.set(range(rand, -1, 1), range(rand, -1, 1), range(rand, -1, 1));
    bend.multiplyScalar(0.6).addScaledVector(kick, gnarl);
    d.add(bend).addScaledVector(UP, 0.05).normalize();
    p.addScaledVector(d, step);
    points.push(p.clone());
  }
  return points;
}

function at(points, t) {
  const f = THREE.MathUtils.clamp(t, 0, 1) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(f));
  return { i, point: points[i].clone().lerp(points[i + 1], f - i), tangent: points[i + 1].clone().sub(points[i]).normalize() };
}

/**
 * Returns { stems: [{level, points, radii}], tips: [{point, dir, t, level}] }.
 * `tips` are foliage anchor points: along the canes and at the twig ends, with `t` the position
 * along the cane (0 base .. 1 tip), used to put the bracts on the outer branch ends.
 */
export function growSkeleton(rand) {
  const S = SPEC;
  const stems = [];
  const tips = [];
  const nTrunks = Math.round(range(rand, ...S.trunks));
  const turn = range(rand, 0, Math.PI * 2);
  const trunkAz = shuffled(rand, Array.from({ length: nTrunks }, (_, i) => turn + (i / nTrunks) * Math.PI * 2 + range(rand, -0.4, 0.4)));
  const canes = [];
  for (let k = 0; k < nTrunks; k++) {
    const az = trunkAz[k];
    const tilt = range(rand, ...S.trunk.tilt);
    const dir = new THREE.Vector3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
    const base = new THREE.Vector3(Math.cos(az) * 0.06, -0.03, Math.sin(az) * 0.06);
    const len = range(rand, ...S.trunk.length);
    const pts = growStem(rand, base, dir, len, S.trunk.sections, S.trunk.gnarl);
    stems.push({ level: 0, points: pts, radii: taper(pts.length, S.trunk.radius, S.trunk.tip, 0.8) });

    // Canes fan out around the trunk's own lean, so the mound fills all round.
    const nCanes = Math.round(range(rand, ...S.cane.perTrunk));
    const hs = stratified(rand, nCanes, ...S.cane.emerge);
    hs.forEach((h, j) => {
      const a = at(pts, h);
      const caz = az + ((j + 0.5) / nCanes - 0.5) * 2.4 + range(rand, -0.3, 0.3);
      const rise = range(rand, ...S.cane.rise);
      const cdir = new THREE.Vector3(Math.cos(caz), rise, Math.sin(caz));
      const cpts = growHanging(rand, a.point, cdir, {
        step: S.cane.step,
        gravity: range(rand, ...S.cane.gravity),
        wander: S.cane.wander,
        stopY: S.stopY,
        length: range(rand, ...S.cane.length),
      });
      canes.push(cpts);
      stems.push({ level: 1, points: cpts, radii: taper(cpts.length, S.cane.radius, S.cane.tip, 0.9) });
    });
  }

  for (const cpts of canes) {
    // Foliage anchors along the outer two thirds of each cane.
    const n = cpts.length;
    for (let i = Math.floor(n * 0.15); i < n; i += 2) {
      const t = i / (n - 1);
      const dir = cpts[Math.min(n - 1, i + 1)].clone().sub(cpts[Math.max(0, i - 1)]).normalize();
      tips.push({ point: cpts[i].clone(), dir, t, level: 1 });
    }
    tips.push({ point: cpts[n - 1].clone(), dir: cpts[n - 1].clone().sub(cpts[n - 2]).normalize(), t: 1, level: 1 });

    // Short side twigs, each ending in a leaf and bract clump.
    const hs = stratified(rand, S.twig.count, ...S.twig.emerge);
    for (const h of hs) {
      const a = at(cpts, h);
      const side = new THREE.Vector3(range(rand, -1, 1), range(rand, 0.2, 1), range(rand, -1, 1)).normalize();
      const tdir = a.tangent.clone().multiplyScalar(0.5).add(side);
      const tpts = growHanging(rand, a.point, tdir, {
        step: S.twig.step,
        gravity: S.twig.gravity,
        wander: S.twig.wander,
        stopY: S.stopY,
        length: range(rand, ...S.twig.length) * (1 - 0.4 * h),
      });
      if (tpts.length < 2) continue;
      stems.push({ level: 2, points: tpts, radii: taper(tpts.length, S.twig.radius, S.twig.tip) });
      const m = tpts.length;
      tips.push({ point: tpts[m - 1].clone(), dir: tpts[m - 1].clone().sub(tpts[m - 2]).normalize(), t: h, level: 2 });
    }
  }
  return { stems, tips };
}
