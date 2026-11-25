// Pleated valances and tied-back curtains at every window (PLAN.window, backWindows, sideWindow).
// Materials: valance, sheer, white.

import * as THREE from 'three';
import { PLAN } from './plan.js';
import { M } from './builder.js';

/** A pleated valance: a strip folded in a sine along its width, scalloped a little at the hem. */
function valance(width, height, pleat = 0.085, depth = 0.028) {
  const g = new THREE.PlaneGeometry(width, height, Math.ceil(width / 0.012), 3);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const s = Math.sin((x / pleat) * Math.PI * 2);
    pos.setZ(i, depth * (0.5 + 0.5 * s) * (1.1 - (y / height + 0.5) * 0.3));
    if (y < -height / 2 + 0.01) pos.setY(i, y - 0.025 * Math.abs(Math.sin((x / pleat) * Math.PI)));
    uv.setXY(i, x + width / 2, y);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A sheer panel hanging from `top` to `bottom`, gathered to a narrow waist at `tie` (or loose when
 * tie is null). Local frame: the panel hangs from x = 0 towards +x, facing +z.
 */
function curtain({ width, top, bottom, tie, folds = 5, depth = 0.035 }) {
  const nu = 14;
  const nv = 30;
  const positions = [];
  const uvs = [];
  const index = [];
  for (let j = 0; j <= nv; j++) {
    const y = top - ((top - bottom) * j) / nv;
    let w = width;
    let pull = 0;
    if (tie != null) {
      w = y > tie ? 0.07 + (width - 0.07) * Math.pow((y - tie) / (top - tie), 0.75) : 0.07 + 0.11 * Math.pow((tie - y) / (tie - bottom), 0.6);
      pull = 0.07 * Math.exp(-(((y - tie) / 0.35) ** 2));
    }
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const z = depth * (width / Math.max(w, 0.07)) ** 0.3 * Math.sin(u * folds * Math.PI) ** 2 + pull * u;
      positions.push(u * w, y, z);
      uvs.push(u * width, y);
      if (i < nu && j < nv) {
        const a = j * (nu + 1) + i;
        index.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function buildCurtains(b) {
  const { z0, x1 } = PLAN.room;
  const W = PLAN.window;
  for (const w of PLAN.backWindows) {
    const ww = w.x1 - w.x0;
    const [v0, v1] = W.valance;
    b.place('valance', valance(ww + 0.22, v1 - v0), M((w.x0 + w.x1) / 2, (v0 + v1) / 2, z0 + 0.06), 0.04, false);
    const panel = Math.min(0.36, ww * 0.34);
    const opts = { width: panel, top: v0 + 0.02, bottom: 0.05, tie: W.tie };
    // Left panel hangs from the left jamb towards +x; the right one is mirrored.
    b.place('sheer', curtain(opts), M(w.x0 + 0.01, 0, z0 + 0.1), 0.05, false);
    b.place('sheer', curtain(opts), new THREE.Matrix4().makeScale(-1, 1, 1).premultiply(M(w.x1 - 0.01, 0, z0 + 0.1)), 0.05, false);
  }
  // Right-wall window: a long white sheer, drawn across.
  const s = PLAN.sideWindow;
  const g = curtain({ width: s.z1 - s.z0 + 0.1, top: W.y1 + 0.05, bottom: s.y0 + 0.02, tie: null, folds: 7, depth: 0.05 });
  b.place('white', g, M(x1 - 0.08, 0, s.z0 - 0.05, 0, -Math.PI / 2, 0), 0.03, false);
}
