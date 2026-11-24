// Growth helpers shared by the vine and tree builders.

import * as THREE from 'three';
import { range } from './rng.js';

export const UP = new THREE.Vector3(0, 1, 0);
export const DOWN = new THREE.Vector3(0, -1, 0);

/** Samples a polyline at roughly even steps. */
export function resample(curve, step) {
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n);
}

export function pointAt(points, t) {
  const f = THREE.MathUtils.clamp(t, 0, 1) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(f));
  return { index: i, point: points[i].clone().lerp(points[i + 1], f - i), tangent: points[i + 1].clone().sub(points[i]).normalize() };
}

export function taper(n, r0, r1, power = 1) {
  return Array.from({ length: n }, (_, i) => r0 + (r1 - r0) * (i / (n - 1)) ** power);
}

/** A smooth seeded wander: three detuned sines per axis. */
export function wanderField(rand) {
  const w = Array.from({ length: 6 }, () => ({ f: range(rand, 2, 9), p: range(rand, 0, Math.PI * 2) }));
  return (s, out) => out.set(Math.sin(w[0].f * s + w[0].p) + 0.5 * Math.sin(w[1].f * s + w[1].p), 0, Math.sin(w[2].f * s + w[2].p) * 0.4);
}

/** Grows one hanging stem from `origin` with direction `dir`. */
export function growHanging(rand, origin, dir, { step, gravity, wander, plane = 0, stopY = -Infinity, length }) {
  const field = wanderField(rand);
  const points = [origin.clone()];
  const d = dir.clone().normalize();
  const w = new THREE.Vector3();
  const p = origin.clone();
  const maxSteps = Math.ceil(length / step);
  for (let i = 0; i < maxSteps; i++) {
    field(i * step, w);
    d.addScaledVector(DOWN, gravity).addScaledVector(w, wander);
    d.z -= p.z * plane * step * 10;
    d.normalize();
    p.addScaledVector(d, step);
    points.push(p.clone());
    if (p.y < stopY) break;
  }
  return points;
}

/** A tendril: a coil that tightens towards the tip, around an axis that leans down. */
export function growTendril(rand, origin, dir, spec) {
  const axis = dir.clone().addScaledVector(DOWN, 0.6).normalize();
  const side = new THREE.Vector3().crossVectors(axis, Math.abs(axis.z) > 0.9 ? UP : new THREE.Vector3(0, 0, 1)).normalize();
  const other = new THREE.Vector3().crossVectors(axis, side);
  const turns = range(rand, ...spec.turns) * (rand() < 0.5 ? -1 : 1);
  const length = range(rand, ...spec.length);
  const points = [];
  for (let i = 0; i <= spec.samples; i++) {
    const t = i / spec.samples;
    const a = t * turns * Math.PI * 2;
    // Starts straight (no coil), then coils.
    const coil = THREE.MathUtils.lerp(spec.coil[0], spec.coil[1], t) * THREE.MathUtils.smoothstep(t, 0, 0.3);
    points.push(
      origin
        .clone()
        .addScaledVector(axis, length * t)
        .addScaledVector(side, Math.cos(a) * coil - coil)
        .addScaledVector(other, Math.sin(a) * coil),
    );
  }
  return points;
}
