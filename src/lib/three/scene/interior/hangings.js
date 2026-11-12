// The woven hangings and the plate on the side wall (PLAN.hangings, plate).
// Materials: decor, frame, plate.

import * as THREE from 'three';
import { PLAN } from './plan.js';
import { M, rand, boxWithGrainUVs } from './builder.js';

/** Woven mats and framed pictures hung as diamonds on the right wall; a plate on the back wall. */
export function buildHangings(b) {
  const { x1, z0 } = PLAN.room;
  const { z, y, size } = PLAN.hangings;
  const step = size * Math.SQRT1_2 * 1.06;
  const cells = [[0, 0], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1], [0, -1], [1, -1], [0, 2], [-1, -1]];
  cells.forEach(([i, j], k) => {
    const cz = z + (i + j) * step;
    const cy = y + (i - j) * step + (rand() - 0.5) * 0.02;
    const s = size * (0.88 + rand() * 0.18);
    const g = new THREE.PlaneGeometry(s, s);
    const uv = g.attributes.uv;
    const tx = k % 4;
    const ty = Math.floor(k / 4) % 2;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, (tx + uv.getX(n)) / 4, (1 - ty + uv.getY(n)) / 2);
    const tilt = Math.PI / 4 + (rand() - 0.5) * 0.08;
    b.place('decor', g, M(x1 - 0.022, cy, cz, 0, -Math.PI / 2, tilt), 0.06, false);
    b.place('frame', boxWithGrainUVs(0.014, s + 0.02, s + 0.02), M(x1 - 0.008, cy, cz, tilt, 0, 0), 0.1);
  });
  const p = PLAN.plate;
  b.place('plate', new THREE.CylinderGeometry(p.r, p.r * 0.8, 0.02, 20).rotateX(Math.PI / 2), M(p.x, p.y, z0 + 0.012), 0.04, false);
  b.place('frame', new THREE.TorusGeometry(p.r * 0.72, 0.008, 4, 20), M(p.x, p.y, z0 + 0.024), 0.04, false);
  // A small framed print between the first two windows.
  b.box('frame', 0.24, 0.3, 0.02, -1.45, 1.62, z0 + 0.012);
  const g = new THREE.PlaneGeometry(0.18, 0.24);
  const uv = g.attributes.uv;
  for (let n = 0; n < uv.count; n++) uv.setXY(n, (2 + uv.getX(n)) / 4, (1 + uv.getY(n)) / 2);
  b.place('decor', g, M(-1.45, 1.62, z0 + 0.023), 0.04, false);
}
