// A small cloth simulation: a grid of particles moved with Verlet integration and held
// together by distance constraints (position-based dynamics).
//   structural  – neighbours left/right and up/down: keep the weave from stretching
//   shear       – diagonals: stop the grid collapsing sideways
//   bend        – every second particle: weak, so the fabric folds softly
//   tethers     – each particle may be no farther from its nearest anchor than it was at rest,
//                 which stops the cloth stretching like rubber without extra iterations
// References: Thomas Jakobsen, "Advanced Character Physics" (GDC 2001);
// Kim, Chentanez & Müller, "Long Range Attachments" (SCA 2012).

export class ClothSim {
  /**
   * @param {number} width  cloth width in world units
   * @param {number} height cloth height in world units
   * @param {number} cols   particles across
   * @param {number} rows   particles down
   */
  constructor(width, height, cols, rows) {
    this.width = width;
    this.height = height;
    this.cols = cols;
    this.rows = rows;
    const n = cols * rows;
    this.count = n;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.force = new Float32Array(n * 3);
    this.pinned = new Uint8Array(n);
    this.pinTarget = new Float32Array(n * 3);

    // Rest shape: hanging flat, top edge at y = 0.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        this.pos[i] = (c / (cols - 1) - 0.5) * width;
        this.pos[i + 1] = -(r / (rows - 1)) * height;
        this.pos[i + 2] = 0;
      }
    }
    this.prev.set(this.pos);

    const pairs = [];
    const add = (r1, c1, r2, c2, stiffness) => {
      if (r2 >= rows || c2 >= cols || c2 < 0) return;
      const a = r1 * cols + c1;
      const b = r2 * cols + c2;
      pairs.push(a, b, this.distance(a, b), stiffness);
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        add(r, c, r, c + 1, 1); // structural
        add(r, c, r + 1, c, 1);
        add(r, c, r + 1, c + 1, 0.6); // shear
        add(r, c, r + 1, c - 1, 0.6);
        add(r, c, r, c + 2, 0.08); // bend: weak, so it drapes softly
        add(r, c, r + 2, c, 0.08);
      }
    }
    const k = pairs.length / 4;
    this.ca = new Int32Array(k);
    this.cb = new Int32Array(k);
    this.rest = new Float32Array(k);
    this.stiff = new Float32Array(k);
    for (let j = 0; j < k; j++) {
      this.ca[j] = pairs[j * 4];
      this.cb[j] = pairs[j * 4 + 1];
      this.rest[j] = pairs[j * 4 + 2];
      this.stiff[j] = pairs[j * 4 + 3];
    }
  }

  /** Tethers every particle to the nearest of the given anchor particles (e.g. the pinned top edge). */
  setTethers(anchors) {
    this.tetherTo = new Int32Array(this.count).fill(-1);
    this.tetherLen = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      let best = -1;
      let bestD = Infinity;
      for (const a of anchors) {
        const d = this.distance(a, i);
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
      this.tetherTo[i] = best;
      this.tetherLen[i] = bestD * 1.01;
    }
  }

  distance(a, b) {
    const p = this.pos;
    return Math.hypot(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
  }

  /** Moves every particle by (dx, dy, dz) without adding velocity. */
  translate(dx, dy, dz) {
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] += dx;
      this.pos[i * 3 + 1] += dy;
      this.pos[i * 3 + 2] += dz;
      this.prev[i * 3] += dx;
      this.prev[i * 3 + 1] += dy;
      this.prev[i * 3 + 2] += dz;
    }
  }

  pin(i, x, y, z) {
    this.pinned[i] = 1;
    this.pinTarget[i * 3] = x;
    this.pinTarget[i * 3 + 1] = y;
    this.pinTarget[i * 3 + 2] = z;
  }

  unpin(i) {
    this.pinned[i] = 0;
  }

  /**
   * Advances the simulation by dt seconds.
   * Add per-particle accelerations to this.force before calling; they are cleared after.
   */
  step(dt, { gravity = -9.8, damping = 0.985, iterations = 14, wallZ = -Infinity } = {}) {
    const { pos, prev, force, pinned, pinTarget } = this;
    const dt2 = dt * dt;
    for (let i = 0; i < this.count; i++) {
      const x = i * 3;
      if (pinned[i]) {
        // Pinned particles follow their target; keep their last move as velocity so they pull smoothly.
        prev[x] = pos[x];
        prev[x + 1] = pos[x + 1];
        prev[x + 2] = pos[x + 2];
        pos[x] = pinTarget[x];
        pos[x + 1] = pinTarget[x + 1];
        pos[x + 2] = pinTarget[x + 2];
        continue;
      }
      for (let a = 0; a < 3; a++) {
        const v = (pos[x + a] - prev[x + a]) * damping;
        prev[x + a] = pos[x + a];
        pos[x + a] += v + (force[x + a] + (a === 1 ? gravity : 0)) * dt2;
      }
    }
    force.fill(0);

    const { ca, cb, rest, stiff } = this;
    const k = ca.length;
    for (let it = 0; it < iterations; it++) {
      for (let j = 0; j < k; j++) {
        const a = ca[j];
        const b = cb[j];
        const wa = pinned[a] ? 0 : 1;
        const wb = pinned[b] ? 0 : 1;
        if (wa + wb === 0) continue;
        const ax = a * 3;
        const bx = b * 3;
        const dx = pos[bx] - pos[ax];
        const dy = pos[bx + 1] - pos[ax + 1];
        const dz = pos[bx + 2] - pos[ax + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-6) continue;
        const c = ((d - rest[j]) / d) * stiff[j] / (wa + wb);
        pos[ax] += dx * c * wa;
        pos[ax + 1] += dy * c * wa;
        pos[ax + 2] += dz * c * wa;
        pos[bx] -= dx * c * wb;
        pos[bx + 1] -= dy * c * wb;
        pos[bx + 2] -= dz * c * wb;
      }
      // Keep the cloth in front of the wall behind it.
      for (let i = 0; i < this.count; i++) if (pos[i * 3 + 2] < wallZ) pos[i * 3 + 2] = wallZ;
    }

    if (this.tetherTo) {
      const { tetherTo, tetherLen } = this;
      for (let i = 0; i < this.count; i++) {
        const a = tetherTo[i];
        if (a < 0 || pinned[i]) continue;
        const ix = i * 3;
        const ax = a * 3;
        const dx = pos[ix] - pos[ax];
        const dy = pos[ix + 1] - pos[ax + 1];
        const dz = pos[ix + 2] - pos[ax + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= tetherLen[i]) continue;
        const f = tetherLen[i] / d;
        pos[ix] = pos[ax] + dx * f;
        pos[ix + 1] = pos[ax + 1] + dy * f;
        pos[ix + 2] = pos[ax + 2] + dz * f;
      }
    }
  }
}
