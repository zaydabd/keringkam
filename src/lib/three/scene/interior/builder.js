// Geometry helpers for the room: the shared seeded random stream, and the Builder that collects
// parts per material and merges them into one mesh each. `rand` is one stream for the whole room:
// the build order in createInterior decides every value, so keep that order.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INTERIOR_THEME as THEME } from '../themes/interior.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const Q = (rx = 0, ry = 0, rz = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));

export const ONE = V(1, 1, 1);

export const M = (x, y, z, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), Q(rx, ry, rz), ONE);

export const rand = mulberry32(7);

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Geometry: boxes are collected per material, given a slightly different tint each (so every
// plank is its own colour, like painted wood), then merged into one mesh per material.

export class Builder {
  constructor() {
    this.parts = new Map();
  }
  add(key, geometry, tint = 0.08, jitterUV = true) {
    const n = geometry.attributes.position.count;
    // Shift each part's UVs, so no two planks show the same stretch of painted grain.
    const uv = geometry.attributes.uv;
    if (uv && jitterUV) {
      const du = rand() * 20;
      const dv = rand() * 2;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
    }
    const colors = new Float32Array(n * 3);
    const shade = 1 - tint / 2 + rand() * tint;
    const warm = (rand() - 0.5) * tint * THEME.partWarmth;
    for (let i = 0; i < n; i++) {
      colors[i * 3] = shade + warm;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade - warm;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(geometry);
  }
  /** Adds a geometry after moving it by the matrix m (for parts built in a local frame). */
  place(key, geometry, m, tint, jitterUV) {
    geometry.applyMatrix4(m);
    this.add(key, geometry, tint, jitterUV);
  }
  /** A box of size (w, h, d) centred at (x, y, z), turned by the Euler angles (rx, ry, rz). */
  box(key, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, tint) {
    const g = boxWithGrainUVs(w, h, d);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    this.add(key, g, tint);
  }
  /** A beam of cross-section (w, h) from point a to point b. */
  beam(key, a, b, w, h, tint) {
    const len = a.distanceTo(b);
    const g = boxWithGrainUVs(w, h, len);
    const m = new THREE.Matrix4().lookAt(a, b, Math.abs(b.y - a.y) > len * 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    g.applyMatrix4(m);
    this.add(key, g, tint);
  }
  /** A round pole of radius r from a to b; UVs in metres, along the pole (grain) and around it. */
  pole(key, a, b, r, tint, segs = 7) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, len, segs, 1, false); // capped: no hollow log ends
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getY(i), uv.getX(i) * Math.PI * 2 * r);
    g.rotateX(Math.PI / 2); // axis along +z, ready for lookAt
    const m = new THREE.Matrix4().lookAt(a, b, Math.abs(b.y - a.y) > len * 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    g.applyMatrix4(m);
    this.add(key, g, tint);
  }
  build(materials) {
    const meshes = [];
    for (const [key, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list), materials[key]);
      for (const g of list) g.dispose();
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = key;
      meshes.push(mesh);
    }
    return meshes;
  }
}

/** A box whose UVs are in metres and run along the box's longest side on each face, like wood grain. */
export function boxWithGrainUVs(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  const size = [w, h, d];
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const axis = n.indexOf(Math.max(...n));
    const [a, b] = [0, 1, 2].filter((k) => k !== axis);
    const [long, short] = size[a] >= size[b] ? [a, b] : [b, a];
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    uv.setXY(i, p[long], p[short]);
  }
  return g;
}
