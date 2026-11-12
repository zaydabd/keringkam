// The embroidery frame in the foreground (PLAN.frame). Materials: wood, cloth, tape, bag.

import * as THREE from 'three';
import { PLAN } from './plan.js';
import { V, Q, ONE, M, boxWithGrainUVs } from './builder.js';

/**
 * The embroidery frame (pemidang): red cloth stretched between two rollers, held by side bars on
 * short legs, tilted towards the sitter. Plain cloth: the work has not started.
 */
export function buildEmbroideryFrame(b) {
  const { x, z, ry, w, d, front, back } = PLAN.frame;
  const F = new THREE.Matrix4().compose(V(x, 0, z), Q(0, ry, 0), ONE);
  const tilt = Math.atan2(back - front, d);
  const midY = (front + back) / 2;
  const cloth = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateX(tilt);
  b.place('cloth', cloth, M(0, midY + 0.012, 0).premultiply(F), 0.02, false);
  const pole = (a, c, r) => {
    const len = a.distanceTo(c);
    const g = new THREE.CylinderGeometry(r, r, len, 8).rotateZ(Math.PI / 2);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), uv.getY(i) * 0.2);
    b.place('wood', g, M((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2).premultiply(F));
  };
  const box = (w2, h, d2, lx, ly, lz, rx = 0) => b.place('wood', boxWithGrainUVs(w2, h, d2), M(lx, ly, lz, rx).premultiply(F));
  const half = w / 2 + 0.16;
  pole(V(-half, front, d / 2 + 0.03), V(half, front, d / 2 + 0.03), 0.026);
  pole(V(-half, back, -d / 2 - 0.03), V(half, back, -d / 2 - 0.03), 0.026);
  const len = d + 0.5;
  for (const s of [-1, 1]) {
    const sx = s * (w / 2 + 0.07);
    box(0.045, 0.035, len, sx, midY, 0, tilt); // side bar
    box(0.04, front, 0.04, sx, front / 2, d / 2 + 0.12); // front leg
    box(0.04, back, 0.04, sx, back / 2, -d / 2 - 0.12); // back leg
    box(0.05, 0.04, len + 0.1, sx, 0.02, 0); // floor runner
    // lacing: tapes from the cloth edge round the side bar
    for (let k = 0; k < 6; k++) {
      const lz = -d / 2 + 0.06 + ((d - 0.12) * k) / 5;
      b.place('tape', boxWithGrainUVs(0.08, 0.006, 0.012), M(s * (w / 2 + 0.03), midY + 0.02 - Math.sin(tilt) * lz, lz, tilt).premultiply(F), 0.1);
    }
  }
  box(w + 0.18, 0.035, 0.035, 0, 0.12, d / 2 + 0.12);
  box(w + 0.18, 0.035, 0.035, 0, 0.12, -d / 2 - 0.12);
  // A cloth bag on the floor by the frame.
  const bag = new THREE.SphereGeometry(1, 10, 8).scale(0.16, 0.2, 0.13);
  b.place('bag', bag, M(w / 2 + 0.3, 0.17, 0.25, 0, 0.4, 0.1).premultiply(F), 0.1);
}
