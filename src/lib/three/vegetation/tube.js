// Branch emission: oriented rings along a polyline with parallel-transport frames, so a stem never
// twists on its own. UVs: u around (seam at u = 0/1), v in metres along the stem.

import * as THREE from 'three';

export function createMeshWriter() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  return {
    positions,
    normals,
    uvs,
    colors,
    indices,
    get vertexCount() {
      return positions.length / 3;
    },
    toGeometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      g.setIndex(indices);
      g.computeBoundingSphere();
      return g;
    },
  };
}

const _t = new THREE.Vector3();
const _prevT = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();

/**
 * Adds a tapered tube. `points` are THREE.Vector3, `radii` one per point. A tip whose radius is
 * under `closeBelow` ends in a point vertex; a thicker end gets a flat cap with its own normal.
 * `colorAt(v, u, t)` (optional) returns a colour per vertex: v in metres, u around, t 0..1 along.
 * `uRepeat` (integer, default 1) multiplies the around coordinate of the UVs, so a bark pattern
 * can keep about the same width in metres on thick and thin stems without a seam.
 * `shape(i, angle)` (optional) returns a factor on ring i's radius at that angle (0..2π), e.g.
 * buttress lobes at a trunk base.
 * Returns the number of triangles written.
 */
export function addTube(writer, points, radii, { radial = 6, color, colorAt, closeStart = false, uRepeat = 1, shape } = {}) {
  const n = points.length;
  if (n < 2) return 0;
  const base = writer.vertexCount;
  let along = 0;

  for (let i = 0; i < n; i++) {
    // Tangent: central difference.
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    _t.subVectors(b, a).normalize();
    if (i === 0) {
      // Any normal perpendicular to the first tangent.
      _n.set(0, 0, 1);
      if (Math.abs(_t.dot(_n)) > 0.9) _n.set(1, 0, 0);
      _n.sub(_d.copy(_t).multiplyScalar(_t.dot(_n))).normalize();
    } else {
      // Parallel transport: rotate the previous normal by the turn between tangents.
      _axis.crossVectors(_prevT, _t);
      const s = _axis.length();
      if (s > 1e-6) {
        _q.setFromAxisAngle(_axis.divideScalar(s), Math.atan2(s, _prevT.dot(_t)));
        _n.applyQuaternion(_q);
      }
      along += points[i].distanceTo(points[i - 1]);
    }
    _prevT.copy(_t);
    _b.crossVectors(_t, _n);

    for (let k = 0; k <= radial; k++) {
      const ang = (k / radial) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      _d.set(_n.x * c + _b.x * s, _n.y * c + _b.y * s, _n.z * c + _b.z * s);
      const p = points[i];
      const r = shape ? radii[i] * shape(i, ang) : radii[i];
      writer.positions.push(p.x + _d.x * r, p.y + _d.y * r, p.z + _d.z * r);
      writer.normals.push(_d.x, _d.y, _d.z);
      writer.uvs.push((k / radial) * uRepeat, along);
      const col = colorAt ? colorAt(along, k / radial, i / (n - 1)) : color;
      writer.colors.push(col.r, col.g, col.b);
    }
  }

  const ring = radial + 1;
  let tris = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = base + i * ring + k;
      const b = a + ring;
      writer.indices.push(a, a + 1, b, a + 1, b + 1, b);
      tris += 2;
    }
  }

  // Close the ends so a cut end never shows the inside of the tube.
  const cap = (i, sign) => {
    const p = points[i];
    const q = points[i + (sign > 0 ? -1 : 1)];
    _d.subVectors(p, q).normalize();
    const centre = writer.vertexCount;
    writer.positions.push(p.x, p.y, p.z);
    writer.normals.push(_d.x, _d.y, _d.z);
    writer.uvs.push(0.5, along);
    const c = colorAt ? colorAt(along, 0.5, i / (n - 1)) : color;
    writer.colors.push(c.r, c.g, c.b);
    const first = base + i * ring;
    for (let k = 0; k < radial; k++) {
      if (sign > 0) writer.indices.push(first + k, first + k + 1, centre);
      else writer.indices.push(first + k + 1, first + k, centre);
      tris++;
    }
  };
  cap(n - 1, 1);
  if (closeStart) cap(0, -1);
  return tris;
}
