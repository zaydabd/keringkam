// The carved lattice panels at the bottom of the back windows (PLAN.backWindows, window.lattice).
// Material: lattice (cut out by its texture).

import * as THREE from 'three';
import { PLAN } from './plan.js';
import { M } from './builder.js';

/** Lattice panels in the lower part of each window: alpha-cut planes (own mesh, see createInterior). */
export function buildLattice(b) {
  const { z0 } = PLAN.room;
  const h = PLAN.window.lattice;
  for (const w of PLAN.backWindows) {
    const g = new THREE.PlaneGeometry(w.x1 - w.x0, h - 0.09);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w.x1 - w.x0) + w.x0, uv.getY(i) * (h - 0.09));
    b.place('lattice', g, M((w.x0 + w.x1) / 2, 0.09 + (h - 0.09) / 2, z0 - 0.02), 0.04, false);
  }
}
