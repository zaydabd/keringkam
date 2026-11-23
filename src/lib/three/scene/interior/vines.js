// The vines around the windows (PLAN.room, backWindows, sideWindow). Material: leaf.

import * as THREE from 'three';
import { PLAN } from './plan.js';
import { M, dice } from './builder.js';
import { windowVineLayout } from '../flora-layout.js';

/** Trailing vines beside the windows: small leaf cards along a gently swinging line. */
export function buildVines(b) {
  let v = 0; // the vine's number
  const vine = (x, z, yTop, yBottom, alongX) => {
    const id = v++;
    b.as(`vines/${id}`); // each vine counts its own leaves' colour rolls
    let k = 0;
    for (let y = yTop; y > yBottom; y -= 0.028) {
      const sway = Math.sin(y * 5 + x) * 0.04;
      const rand = dice('vines', id, k); // this leaf's own rolls
      const leaf = new THREE.CircleGeometry(0.026 + rand() * 0.012, 5).scale(1.35, 0.8, 1); // small pointed-oval leaves
      const a = rand() * Math.PI * 2;
      const px = alongX ? x + sway + Math.cos(a) * 0.035 : x - 0.04 - rand() * 0.02;
      const pz = alongX ? z + 0.05 + rand() * 0.03 : z + sway + Math.cos(a) * 0.035;
      b.place('leaf', leaf, M(px, y + Math.sin(a) * 0.02, pz, (rand() - 0.5) * 0.8, alongX ? (rand() - 0.5) * 1.2 : -Math.PI / 2 + (rand() - 0.5) * 1.2, a), 0.25, false);
      k++;
    }
  };
  for (const l of windowVineLayout(PLAN)) vine(l.x, l.z, l.yTop, l.yBottom, l.alongX); // where: flora-layout.js
}
