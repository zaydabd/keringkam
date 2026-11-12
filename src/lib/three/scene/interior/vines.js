// The vines around the windows (PLAN.room, backWindows, sideWindow). Material: leaf.

import * as THREE from 'three';
import { PLAN } from './plan.js';
import { M, rand } from './builder.js';

/** Trailing vines beside the windows: small leaf cards along a gently swinging line. */
export function buildVines(b) {
  const { z0, x1 } = PLAN.room;
  const vine = (x, z, yTop, yBottom, alongX) => {
    let k = 0;
    for (let y = yTop; y > yBottom; y -= 0.028) {
      const sway = Math.sin(y * 5 + x) * 0.04;
      const leaf = new THREE.CircleGeometry(0.026 + rand() * 0.012, 5).scale(1.35, 0.8, 1); // small pointed-oval leaves
      const a = rand() * Math.PI * 2;
      const px = alongX ? x + sway + Math.cos(a) * 0.035 : x - 0.04 - rand() * 0.02;
      const pz = alongX ? z + 0.05 + rand() * 0.03 : z + sway + Math.cos(a) * 0.035;
      b.place('leaf', leaf, M(px, y + Math.sin(a) * 0.02, pz, (rand() - 0.5) * 0.8, alongX ? (rand() - 0.5) * 1.2 : -Math.PI / 2 + (rand() - 0.5) * 1.2, a), 0.25, false);
      k++;
    }
  };
  const [w1, w2, w3] = PLAN.backWindows;
  vine(w1.x1 + 0.2, z0, 2.3, 1.45, true);
  vine(w2.x0 - 0.16, z0, 2.3, 1.7, true);
  vine(w3.x1 + 0.08, z0, 2.45, 1.25, true);
  vine(w3.x1 + 0.03, z0 + 0.15, 2.4, 1.6, true);
  vine(x1, PLAN.sideWindow.z0 - 0.2, 2.35, 1.0, false);
}
