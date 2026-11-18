// A small cloth simulation: a grid of particles moved with Verlet integration and held
// together by distance constraints (position-based dynamics).
//   structural  – neighbours left/right and up/down: keep the weave from stretching
//   shear       – diagonals: stop the grid collapsing sideways
//   bend        – every second particle: weak, so the fabric folds softly
//   tethers     – each particle may be no farther from its nearest anchor than it was at rest,
//                 which stops the cloth stretching like rubber without extra iterations
// It also collides with a wall, bars (cylinders) and boxes (each may be tilted about x, like a
// leaning chair back), with friction where it touches them. settle() runs it until it is still.
// It has no randomness of its own: the same start gives the same folds.
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
    this.pos = new Float64Array(n * 3); // doubles: quicker to work on in JS than floats
    this.prev = new Float64Array(n * 3);
    this.force = new Float32Array(n * 3);
    this.pinned = new Uint8Array(n);
    this.pinTarget = new Float32Array(n * 3);
    // Per-particle depth limits, e.g. to keep two layers of a folded cloth apart.
    this.zMin = new Float32Array(n).fill(-Infinity);
    this.zMax = new Float32Array(n).fill(Infinity);
    // Bars the cloth rests on: cylinders along x, { y, z, r, x0, x1 }.
    this.cylinders = [];
    // Boxes: { c: centre, h: half sizes, rx: tilt about x }, made with addBox().
    this.boxes = [];
    this.friction = 0.7; // step() sets these two
    this.grip = 0;
    this.skin = 0.004; // the cloth stays this far off every box, so it never touches the surface it lies on
    this.floorY = -Infinity; // the cloth rests on a floor at this height
    this.contact = new Uint8Array(n);
    this.normal = new Float32Array(n * 3); // the face a touching particle was pushed out through
    this.near = new Uint32Array(n); // per particle, a bit for each box it may touch this step
    // Capsules: round bars between two points, made with addCapsule(). Thin edges the cloth folds
    // over (a crest rail, an arm, a window rail) are capsules: a fold needs a round top a few
    // particles long, or the two sides pull it through.
    this.capsules = [];
    this.nearCapsule = new Uint32Array(n);

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
    this.rest = new Float64Array(k);
    this.stiff = new Float64Array(k);
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

  /**
   * A solid box the cloth lies on: centre c [x, y, z], size [w, h, d], turned by rx about x (as
   * builder.js M() turns a part). Quick bounds (lo, hi) skip particles far from it.
   */
  addBox(c, size, rx = 0, thinnest = 0.04) {
    // A part thinner than the particle spacing could slip between two particles: it is made at
    // least `thinnest` thick for the cloth.
    const h = size.map((v) => Math.max(v, thinnest) / 2 + this.skin);
    const cos = Math.cos(rx);
    const sin = Math.sin(rx);
    const ey = Math.abs(cos) * h[1] + Math.abs(sin) * h[2];
    const ez = Math.abs(sin) * h[1] + Math.abs(cos) * h[2];
    if (this.boxes.length === 32) throw new Error('ClothSim: at most 32 boxes');
    this.boxes.push({ c, h, cos, sin, lo: [c[0] - h[0], c[1] - ey, c[2] - ez], hi: [c[0] + h[0], c[1] + ey, c[2] + ez] });
  }

  /** A round bar of radius r from point a to point b. */
  addCapsule(a, b, r) {
    if (this.capsules.length === 32) throw new Error('ClothSim: at most 32 capsules');
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const R = r + this.skin;
    this.capsules.push({ a, d, len2, R, lo: [0, 1, 2].map((k) => Math.min(a[k], b[k]) - R), hi: [0, 1, 2].map((k) => Math.max(a[k], b[k]) + R) });
  }

  /** Marks, for each particle, the boxes and capsules it is within `margin` of (once a step). */
  broadPhase(margin) {
    const { pos } = this;
    const mark = (list, near) => {
      for (let i = 0; i < this.count; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        let bits = 0;
        for (let k = 0; k < list.length; k++) {
          const { lo, hi } = list[k];
          if (x > lo[0] - margin && x < hi[0] + margin && y > lo[1] - margin && y < hi[1] + margin && z > lo[2] - margin && z < hi[2] + margin) bits |= 1 << k;
        }
        near[i] = bits;
      }
    };
    mark(this.boxes, this.near);
    mark(this.capsules, this.nearCapsule);
  }

  /**
   * Friction at a touching particle i (x = 3i), pushed out along the unit normal n: its slide
   * along the surface since the step began is undone if under `grip` (it holds), or cut by
   * `friction` (it drags). Done in every iteration, where the cloth's pull would otherwise drag it.
   */
  rub(x, n0, n1, n2) {
    const { pos, prev } = this;
    const d0 = pos[x] - prev[x], d1 = pos[x + 1] - prev[x + 1], d2 = pos[x + 2] - prev[x + 2];
    const dn = d0 * n0 + d1 * n1 + d2 * n2;
    const t0 = d0 - dn * n0, t1 = d1 - dn * n1, t2 = d2 - dn * n2;
    const cut = t0 * t0 + t1 * t1 + t2 * t2 < this.grip * this.grip ? 1 : this.friction;
    pos[x] -= t0 * cut;
    pos[x + 1] -= t1 * cut;
    pos[x + 2] -= t2 * cut;
  }

  /** Wall, layer limits, bars and boxes. Records which particles touch a bar or a box. */
  collide(wallZ) {
    const { pos, pinned, zMin, zMax, contact } = this;
    contact.fill(0);
    for (let i = 0; i < this.count; i++) {
      if (pinned[i]) continue;
      const x = i * 3;
      const lo = Math.max(zMin[i], wallZ);
      if (pos[x + 2] < lo) pos[x + 2] = lo;
      if (pos[x + 2] > zMax[i]) pos[x + 2] = zMax[i];
      if (pos[x + 1] < this.floorY) pos[x + 1] = this.floorY;
      for (const c of this.cylinders) {
        if (pos[x] < c.x0 || pos[x] > c.x1) continue;
        const dy = pos[x + 1] - c.y;
        const dz = pos[x + 2] - c.z;
        const d2 = dy * dy + dz * dz;
        if (d2 >= c.r * c.r) continue;
        const d = Math.sqrt(d2) || 1e-6;
        pos[x + 1] = c.y + (dy / d) * c.r;
        pos[x + 2] = c.z + (dz / d) * c.r;
        contact[i] = 1;
      }
      if (pos[x + 1] <= this.floorY) {
        contact[i] = 1;
        this.rub(x, 0, 1, 0);
      }
      for (let bits = this.near[i], k = 0; bits; bits >>>= 1, k++) {
        if (!(bits & 1)) continue;
        const b = this.boxes[k];
        const lx = pos[x] - b.c[0];
        const dy = pos[x + 1] - b.c[1];
        const dz = pos[x + 2] - b.c[2];
        let ly = b.cos * dy + b.sin * dz;
        let lz = -b.sin * dy + b.cos * dz;
        const ox = b.h[0] - Math.abs(lx);
        const oy = b.h[1] - Math.abs(ly);
        const oz = b.h[2] - Math.abs(lz);
        if (ox <= 0 || oy <= 0 || oz <= 0) continue;
        const n = this.normal;
        if (ox < oy && ox < oz) {
          const sx = Math.sign(lx || 1);
          pos[x] = b.c[0] + sx * b.h[0];
          n[x] = sx; n[x + 1] = 0; n[x + 2] = 0;
        } else {
          let ny = 0, nz = 0;
          if (oy < oz) { ny = Math.sign(ly || 1); ly = ny * b.h[1]; }
          else { nz = Math.sign(lz || 1); lz = nz * b.h[2]; }
          pos[x + 1] = b.c[1] + b.cos * ly - b.sin * lz;
          pos[x + 2] = b.c[2] + b.sin * ly + b.cos * lz;
          n[x] = 0; n[x + 1] = b.cos * ny - b.sin * nz; n[x + 2] = b.sin * ny + b.cos * nz;
        }
        contact[i] = 1;
        this.rub(x, n[x], n[x + 1], n[x + 2]);
      }
      for (let bits = this.nearCapsule[i], k = 0; bits; bits >>>= 1, k++) {
        if (!(bits & 1)) continue;
        const c = this.capsules[k];
        const px = pos[x] - c.a[0], py = pos[x + 1] - c.a[1], pz = pos[x + 2] - c.a[2];
        const t = Math.min(1, Math.max(0, (px * c.d[0] + py * c.d[1] + pz * c.d[2]) / c.len2));
        const ex = px - c.d[0] * t, ey = py - c.d[1] * t, ez = pz - c.d[2] * t;
        const e2 = ex * ex + ey * ey + ez * ez;
        if (e2 >= c.R * c.R) continue;
        const e = Math.sqrt(e2) || 1e-6;
        const n = this.normal;
        n[x] = ex / e; n[x + 1] = ey / e; n[x + 2] = ez / e;
        pos[x] += n[x] * (c.R - e);
        pos[x + 1] += n[x + 1] * (c.R - e);
        pos[x + 2] += n[x + 2] * (c.R - e);
        contact[i] = 1;
        this.rub(x, n[x], n[x + 1], n[x + 2]);
      }
    }
  }

  /** True if any particle is inside a box (past its skin) or under the floor: a check, not a fix. */
  inside(tolerance = 0.001) {
    const { pos } = this;
    for (let i = 0; i < this.count; i++) {
      const x = i * 3;
      if (pos[x + 1] < this.floorY - tolerance) return true;
      for (const b of this.boxes) {
        const lx = pos[x] - b.c[0];
        const dy = pos[x + 1] - b.c[1];
        const dz = pos[x + 2] - b.c[2];
        const ly = b.cos * dy + b.sin * dz;
        const lz = -b.sin * dy + b.cos * dz;
        const s = this.skin + tolerance;
        if (Math.abs(lx) < b.h[0] - s && Math.abs(ly) < b.h[1] - s && Math.abs(lz) < b.h[2] - s) return true;
      }
      for (const c of this.capsules) {
        const px = pos[x] - c.a[0], py = pos[x + 1] - c.a[1], pz = pos[x + 2] - c.a[2];
        const t = Math.min(1, Math.max(0, (px * c.d[0] + py * c.d[1] + pz * c.d[2]) / c.len2));
        if (Math.hypot(px - c.d[0] * t, py - c.d[1] * t, pz - c.d[2] * t) < c.R - tolerance - this.skin) return true;
      }
    }
    return false;
  }

  /** The largest distance any particle moved in the last step. */
  fastest() {
    let m = 0;
    for (let i = 0; i < this.count * 3; i += 3) {
      const d = Math.hypot(this.pos[i] - this.prev[i], this.pos[i + 1] - this.prev[i + 1], this.pos[i + 2] - this.prev[i + 2]);
      if (d > m) m = d;
    }
    return m;
  }

  /**
   * Steps until no particle moves more than `still` metres a step (or maxSteps), and returns the
   * steps taken and the last fastest move.
   */
  settle({ dt = 1 / 90, still = 0.0002, minSteps = 120, maxSteps = 900, ...opts } = {}) {
    let steps = 0;
    let fastest = Infinity;
    while (steps < maxSteps) {
      this.step(dt, opts);
      steps++;
      if (steps >= minSteps && steps % 10 === 0) {
        fastest = this.fastest();
        if (fastest < still) break;
      }
    }
    return { steps, fastest: this.fastest() };
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

  /** One pass over every distance constraint (its own small function, so it stays fast). */
  solve() {
    const { pos, pinned, ca, cb, rest, stiff } = this;
    const k = ca.length;
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
  }

  /**
   * Advances the simulation by dt seconds.
   * Add per-particle accelerations to this.force before calling; they are cleared after.
   */
  step(dt, { gravity = -9.8, damping = 0.985, iterations = 14, wallZ = -Infinity, friction = 0.7, grip = 0 } = {}) {
    const { pos, prev, force, pinned, pinTarget } = this;
    const dt2 = dt * dt;
    this.friction = friction;
    this.grip = grip;
    if (this.boxes.length || this.capsules.length) this.broadPhase(0.05);
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

    for (let it = 0; it < iterations; it++) {
      this.solve();
      this.collide(wallZ);
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
