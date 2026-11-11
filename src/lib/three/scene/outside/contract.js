// Semantic geometry checks, after .claude/skills/threejs-procedural-geometry (quality gates):
// every builder measures what it built and states the accepted interval. A failed check throws,
// so a wrong number cannot pass as a picture.

export function createContract(name) {
  const checks = [];
  const add = (id, value, ok, accepted) => checks.push({ id, value: typeof value === 'number' ? +value.toFixed(3) : value, accepted, ok });
  return {
    name,
    checks,
    range: (id, value, min, max) => add(id, value, value >= min && value <= max, `${min}..${max}`),
    min: (id, value, min) => add(id, value, value >= min, `>= ${min}`),
    max: (id, value, max) => add(id, value, value <= max, `<= ${max}`),
    near: (id, value, target, tol) => add(id, value, Math.abs(value - target) <= tol, `${target} ± ${tol}`),
    is: (id, value, expected) => add(id, value, value === expected, `${expected}`),
    /** Throws with every failed check listed (measured value and accepted interval). */
    assert() {
      const failed = checks.filter((c) => !c.ok);
      if (failed.length) throw new Error(`${name}: ${failed.map((c) => `${c.id} = ${c.value} (accepted ${c.accepted})`).join('; ')}`);
      return { name, checks };
    },
  };
}

/** Collects triangles per material slot (non-indexed), with a flat colour per part. */
export class SlotWriter {
  constructor() {
    this.slots = new Map();
  }
  slot(name) {
    if (!this.slots.has(name)) this.slots.set(name, { position: [], normal: [], uv: [], color: [], triangles: 0 });
    return this.slots.get(name);
  }
  /** Adds a triangle a, b, c (arrays of 3); counter-clockwise seen from outside. uv optional. */
  tri(name, a, b, c, color, uva = [0, 0], uvb = [0, 0], uvc = [0, 0]) {
    const s = this.slot(name);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    s.position.push(...a, ...b, ...c);
    s.normal.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    s.uv.push(...uva, ...uvb, ...uvc);
    for (let i = 0; i < 3; i++) s.color.push(color[0], color[1], color[2]);
    s.triangles++;
  }
  /** A quad a, b, c, d in order around its edge. */
  quad(name, a, b, c, d, color, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    this.tri(name, a, b, c, color, uvs[0], uvs[1], uvs[2]);
    this.tri(name, a, c, d, color, uvs[0], uvs[2], uvs[3]);
  }
  /** A box given by its centre frame: origin o, half-axes x, y, z (arrays of 3). */
  box(name, o, x, y, z, color) {
    const p = (sx, sy, sz) => [o[0] + sx * x[0] + sy * y[0] + sz * z[0], o[1] + sx * x[1] + sy * y[1] + sz * z[1], o[2] + sx * x[2] + sy * y[2] + sz * z[2]];
    const f = (a, b, c, d) => this.quad(name, a, b, c, d, color);
    f(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1));
    f(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1));
    f(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1));
    f(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1));
    f(p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1));
    f(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1));
  }
  /** Three vertices with their own normals (for smooth, grown forms): p, n, uv are arrays of 3 points. */
  smoothTri(name, p, n, uv, color) {
    const s = this.slot(name);
    for (let i = 0; i < 3; i++) {
      s.position.push(...p[i]);
      s.normal.push(...n[i]);
      s.uv.push(...(uv ? uv[i] : [0, 0]));
      s.color.push(...(Array.isArray(color[0]) ? color[i] : color));
    }
    s.triangles++;
  }
  triangles() {
    const out = {};
    for (const [k, s] of this.slots) out[k] = s.triangles;
    return out;
  }
}
