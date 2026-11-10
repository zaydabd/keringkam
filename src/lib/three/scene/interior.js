// The kampung house interior (#/interior): a hand-drawn, anime-style rendition of an open veranda
// room, built from our reference photos (research/kampung-house-inside.jpg):
//   H1/H2  layout: open sides, hip roof with exposed rafters, carved posts, slatted rail, benches,
//          a sunken floor section, greenery outside            (Sarawak Cultural Village)
//   H3     basket lamps hanging from the rafters                 (Sarawak Cultural Village)
//   H4     split-bamboo floor                                    (Sarawak Cultural Village)
//   H7–H12 dark red-brown timber wall, panel door, lattice, sheer curtain   (P. Ramlee House, Penang)
//   H9     shelf props: terendak, kettle, clay pots, enamel plate          (P. Ramlee House, Penang)
//   H14/15 carved vent panel over the window, gold curtain accent          (Istana Satu, KL / Merlimau)
// It is a rendition, not a copy, and not to scale.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { toonGradient, createOutline } from './toon.js';
import { paintPlanks, paintThatch, paintMat, paintPost } from './paint.js';
import { createLandscape } from './landscape.js';

// Palette: sampled from H1, H7 and H14, then lifted into late-afternoon light.
export const PALETTE = {
  thatch: '#8a6a3c', // H1 roof underside (#483413), warmed
  timber: '#b08a5f', // H1 floor boards (#6c6e6b), warmed
  wall: '#7a3f34', // H7 red-brown wall (#724649)
  post: '#e6d3ad', // H1 carved post ground
  motif: '#8c4a35', // H1 post carving
  leaf: '#6f9a5c', // H1 greenery (#618466)
  gold: '#d9a632', // H14 gold curtain (#866b04), lifted
  ink: '#3a2418', // H14 dark timber (#181714), warmed: the outline colour
};

const ROOM = { x0: -5, x1: 5, z0: -4, z1: 4, plate: 2.75 };
const PITCH = 0.5625; // roof rise per metre
const EAVE = 1.3; // eave overhang
// The lowered mat section: a pit inside the room, in front of the viewer, as in H1 (the step edge
// runs diagonally across the view). Boards all round it.
const SUNK = { x0: -1.75, x1: 2.6, z0: -2.9, z1: 0.8, y: -0.22 };

const rand = mulberry32(7);
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Geometry: boxes are collected per material, given a slightly different tint each (so every
// plank is its own colour, like painted wood), then merged into one mesh per material.

class Builder {
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
    const warm = (rand() - 0.5) * tint * 0.5;
    for (let i = 0; i < n; i++) {
      colors[i * 3] = shade + warm;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade - warm;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(geometry);
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
function boxWithGrainUVs(w, h, d) {
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

// ---------------------------------------------------------------------------------------------
// The room

function buildRoom(b) {
  const { x0, x1, z0, z1, plate } = ROOM;

  // Floor: wide boards running out towards the view, cut around the lowered mat section (H1).
  const BOARD = 0.3;
  for (let x = x0 + BOARD / 2; x < x1; x += BOARD) {
    const inSunk = x > SUNK.x0 && x < SUNK.x1;
    const runs = inSunk ? [[z0 - 0.12, SUNK.z0], [SUNK.z1, z1]] : [[z0 - 0.12, z1]];
    for (const [za, zb] of runs) b.box('floor', BOARD - 0.012, 0.05, zb - za, x, -0.025, (za + zb) / 2, 0, 0, 0, 0.1);
  }
  // The lowered section: a woven bamboo mat (H1, H4).
  b.box('bamboo', SUNK.x1 - SUNK.x0, 0.03, SUNK.z1 - SUNK.z0, (SUNK.x0 + SUNK.x1) / 2, SUNK.y - 0.015, (SUNK.z0 + SUNK.z1) / 2, 0, 0, 0, 0.03);
  // Step faces on all four sides, and a darker nosing board along the top edge (H1).
  const sx = SUNK.x1 - SUNK.x0;
  const sz = SUNK.z1 - SUNK.z0;
  const cx = (SUNK.x0 + SUNK.x1) / 2;
  const cz = (SUNK.z0 + SUNK.z1) / 2;
  for (const z of [SUNK.z0 + 0.03, SUNK.z1 - 0.03]) b.box('timber', sx, -SUNK.y, 0.06, cx, SUNK.y / 2, z);
  for (const x of [SUNK.x0 + 0.03, SUNK.x1 - 0.03]) b.box('timber', 0.06, -SUNK.y, sz, x, SUNK.y / 2, cz);
  for (const z of [SUNK.z0 - 0.06, SUNK.z1 + 0.06]) b.box('timber', sx + 0.24, 0.035, 0.12, cx, 0.012, z, 0, 0, 0, 0.04);
  for (const x of [SUNK.x0 - 0.06, SUNK.x1 + 0.06]) b.box('timber', 0.12, 0.035, sz, x, 0.012, cz, 0, 0, 0, 0.04);
  // Edge beams under the floor, and the stilts below.
  b.box('timber', x1 - x0 + 0.3, 0.24, 0.16, 0, -0.17, z0 - 0.08);
  b.box('timber', 0.16, 0.24, z1 - z0 + 0.3, x0 - 0.08, -0.17, 0);
  for (const [x, z] of [[x0, z0], [x0, -0.5], [x0, z1 - 1], [-1.5, z0], [2, z0]]) b.box('timber', 0.16, 1.6, 0.16, x, -1.05, z);

  // Carved posts (H1, H6).
  const posts = [[x0, z0], [x0, -0.5], [x0, 3], [-1.5, z0], [2, z0], [x1, z0]];
  for (const [x, z] of posts) {
    const g = new THREE.CylinderGeometry(0.23, 0.25, plate + 0.05, 24, 1);
    g.rotateY(rand() * Math.PI * 2); // each post shows a different side of the painted scrolls
    g.translate(x, plate / 2, z);
    b.add('post', g, 0.03, false);
  }

  // Wall plates.
  b.box('timber', x1 - x0 + 0.4, 0.22, 0.2, 0, plate, z0, 0, 0, 0, 0.06);
  b.box('timber', 0.2, 0.22, z1 - z0 + 0.4, x0, plate, 0, 0, 0, 0, 0.06);
  b.box('timber', 0.2, 0.22, z1 - z0 + 0.4, x1, plate, 0, 0, 0, 0, 0.06);
  b.box('timber', x1 - x0 + 0.4, 0.22, 0.2, 0, plate, z1, 0, 0, 0, 0.06);

  // Rail along the open sides: slats, a top rail and a low bench inside (H1).
  const railRun = (from, to, floorY) => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    const ry = Math.atan2(dir.x, dir.z) - Math.PI / 2;
    const out = new THREE.Vector3(dir.z, 0, -dir.x); // outward normal for front/left runs
    const h = 1.0 - floorY;
    // Wide planks with uneven gaps and heights, a little out of true (H1).
    for (let s = 0.1; s < len - 0.08; ) {
      const w = 0.11 + rand() * 0.06;
      const hh = h + (rand() - 0.5) * 0.07;
      const p = from.clone().addScaledVector(dir, s + w / 2).addScaledVector(out, 0.03);
      b.box('rail', w, hh, 0.03, p.x, floorY + hh / 2, p.z, 0, ry, (rand() - 0.5) * 0.035, 0.24);
      s += w + 0.06 + rand() * 0.05;
    }
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const top = mid.clone().addScaledVector(out, 0.02);
    b.box('timber', len, 0.06, 0.13, top.x, 1.02, top.z, 0, ry, 0, 0.05);
    const low = mid.clone().addScaledVector(out, 0.07);
    b.box('timber', len, 0.08, 0.05, low.x, floorY + 0.42, low.z, 0, ry, 0, 0.05);
  };
  const bench = (from, to, floorY) => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    const ry = Math.atan2(dir.x, dir.z) - Math.PI / 2;
    const inward = new THREE.Vector3(-dir.z, 0, dir.x);
    const seatY = floorY + 0.4;
    const c = from.clone().add(to).multiplyScalar(0.5).addScaledVector(inward, 0.24);
    b.box('bench', len, 0.05, 0.36, c.x, seatY, c.z, 0, ry, 0, 0.1);
    for (let s = 0.3; s < len; s += 1.6) {
      const p = from.clone().addScaledVector(dir, s).addScaledVector(inward, 0.24);
      b.box('bench', 0.14, seatY - floorY - 0.025, 0.3, p.x, floorY + (seatY - floorY) / 2 - 0.012, p.z, 0, ry, 0, 0.1);
    }
  };
  const v = (x, z) => new THREE.Vector3(x, 0, z);
  railRun(v(x0, z0), v(x1, z0), 0);
  railRun(v(x0, z1), v(x0, z0), 0);
  // Benches along the rails, broken at the posts (H1).
  bench(v(x0 + 0.3, z0), v(-1.8, z0), 0);
  bench(v(-1.2, z0), v(1.7, z0), 0);
  bench(v(2.3, z0), v(4.6, z0), 0);
  bench(v(x0, z1 - 0.4), v(x0, -0.8), 0);
  bench(v(x0, -0.2), v(x0, z0 + 0.45), 0);

  buildRoof(b);
  buildWall(b);
}

function roofY(dist) {
  // height of the roof surface at a horizontal distance `dist` inside the eave line
  return ROOM.plate - EAVE * PITCH + dist * PITCH;
}

function buildRoof(b) {
  const ex0 = ROOM.x0 - EAVE;
  const ex1 = ROOM.x1 + EAVE;
  const ez0 = ROOM.z0 - EAVE;
  const ez1 = ROOM.z1 + EAVE;
  const half = (ez1 - ez0) / 2; // run from eave to ridge
  const ridgeY = roofY(half);
  const rx = ex1 - half; // ridge runs from -rx to rx
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // Thatch underside: four faces, just above the laths.
  const lift = 0.03;
  const eY = roofY(0) + lift;
  const rY = ridgeY + lift;
  const quads = [
    [V(ex0, eY, ez0), V(ex1, eY, ez0), V(rx, rY, 0), V(-rx, rY, 0)],
    [V(ex1, eY, ez1), V(ex0, eY, ez1), V(-rx, rY, 0), V(rx, rY, 0)],
    [V(ex0, eY, ez1), V(ex0, eY, ez0), V(-rx, rY, 0), V(-rx, rY, 0)],
    [V(ex1, eY, ez0), V(ex1, eY, ez1), V(rx, rY, 0), V(rx, rY, 0)],
  ];
  const positions = [];
  const uvs = [];
  const slope = Math.sqrt(1 + PITCH * PITCH);
  for (const [a, c, d, e] of quads) {
    for (const p of [a, c, d, a, d, e]) {
      positions.push(p.x, p.y, p.z);
      // UVs in metres: across the face, and up the slope from the eave (rows of shingles)
      const across = Math.abs(a.x - c.x) > 0.1 ? p.x : p.z;
      const run = Math.abs(a.x - c.x) > 0.1 ? half - Math.abs(p.z) : ex1 - Math.abs(p.x);
      uvs.push(across, run * slope);
    }
  }
  const thatch = new THREE.BufferGeometry();
  thatch.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  thatch.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  thatch.computeVertexNormals();
  b.add('thatch', thatch, 0, false);

  // Ridge, hips and purlins: round logs (H1).
  b.pole('timber', V(-rx - 0.3, ridgeY - 0.1, 0), V(rx + 0.3, ridgeY - 0.1, 0), 0.1, 0.05, 9);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.pole('timber', V(sx * ex1, roofY(0) - 0.08, sz * ez1), V(sx * rx, ridgeY - 0.08, 0), 0.085, 0.05, 8);
  for (const d of [0.9, 2.2, 3.5]) {
    for (const sz of [-1, 1]) {
      const z = sz * (half - d);
      const xr = ex1 - d;
      b.pole('timber', V(-xr, roofY(d) - 0.13, z), V(xr, roofY(d) - 0.13, z), 0.075, 0.08, 8);
    }
    for (const sx of [-1, 1]) {
      const x = sx * (ex1 - d);
      const zr = half - d;
      b.pole('timber', V(x, roofY(d) - 0.13, -zr), V(x, roofY(d) - 0.13, zr), 0.075, 0.08, 8);
    }
  }

  // Rafters: thin round poles, close together, straight up the slope to the ridge or a hip (H1).
  const STEP = 0.36;
  for (let x = ex0 + 0.2; x < ex1 - 0.15; x += STEP) {
    const run = Math.abs(x) <= rx ? half : half - (Math.abs(x) - rx);
    for (const sz of [-1, 1]) b.pole('rafter', V(x, roofY(0) - 0.05, sz * half), V(x, roofY(run) - 0.05, sz * (half - run)), 0.04, 0.2, 6);
  }
  for (let z = ez0 + 0.2; z < ez1 - 0.15; z += STEP) {
    const run = half - Math.abs(z);
    for (const sx of [-1, 1]) b.pole('rafter', V(sx * ex1, roofY(0) - 0.05, z), V(sx * (ex1 - run), roofY(run) - 0.05, z), 0.04, 0.2, 6);
  }

  // Laths: thin split-bamboo strips across the rafters, every 15 cm up the slope; the thatch is tied to these.
  const tilt = Math.atan(PITCH);
  for (let sl = 0.08; sl < half * slope - 0.05; sl += 0.15) {
    const d = sl / slope;
    const y = roofY(d) + 0.0;
    const xr = ex1 - d;
    const zr = half - d;
    for (const sz of [-1, 1]) b.box('lath', xr * 2, 0.012, 0.035, 0, y, sz * zr, sz * tilt, 0, 0, 0.22);
    for (const sx of [-1, 1]) b.box('lath', 0.035, 0.012, zr * 2, sx * xr, y, 0, 0, 0, -sx * tilt, 0.22);
  }

  // A tie beam across the room, as in H1.
  b.pole('timber', V(ROOM.x0 - 0.2, ROOM.plate + 0.08, -1.2), V(ROOM.x1 + 0.2, ROOM.plate + 0.08, -1.2), 0.11, 0.05, 9);
}

// The house wall on the right (H7–H12, H14): vertical boards with openings for a window and a door.
export const WINDOW = { z0: -2.3, z1: -0.9, y0: 0.15, y1: 2.05 };
export const DOOR = { z0: 1.6, z1: 2.5, y0: 0, y1: 2.05 };

function buildWall(b) {
  const x = ROOM.x1;
  const W = 0.2;
  for (let z = ROOM.z0 + W / 2; z < ROOM.z1; z += W) {
    const spans = [[0, ROOM.plate]];
    for (const o of [WINDOW, DOOR]) {
      if (z > o.z0 && z < o.z1) {
        const [s] = spans.splice(0, 1);
        if (o.y0 > s[0]) spans.push([s[0], o.y0]);
        spans.push([o.y1, s[1]]);
      }
    }
    for (const [a, c] of spans) b.box('wall', 0.05, c - a, W - 0.01, x + 0.03, (a + c) / 2, z, 0, 0, 0, 0.1);
  }
  // Battens, sill and frames.
  for (const y of [0.1, 1.0, ROOM.plate - 0.1]) b.box('timber', 0.05, 0.08, ROOM.z1 - ROOM.z0, x - 0.02, y, 0, 0, 0, 0, 0.04);
  for (const o of [WINDOW, DOOR]) {
    b.box('timber', 0.12, 0.09, o.z1 - o.z0 + 0.18, x - 0.02, o.y1 + 0.045, (o.z0 + o.z1) / 2);
    for (const z of [o.z0 - 0.045, o.z1 + 0.045]) b.box('timber', 0.12, o.y1 - o.y0 + 0.09, 0.09, x - 0.02, (o.y0 + o.y1) / 2, z);
  }
  b.box('timber', 0.16, 0.06, WINDOW.z1 - WINDOW.z0 + 0.2, x - 0.04, 0.78, (WINDOW.z0 + WINDOW.z1) / 2);

  // Louvred shutters, opened inward against the wall, and the door ajar (H7, H10).
  const leaf = (hingeZ, dir, angle, len, y0, y1, louvred) => {
    // dir: +1 if the closed leaf runs towards +z from its hinge
    const d = new THREE.Vector3(-Math.sin(angle), 0, dir * Math.cos(angle));
    const ry = Math.atan2(d.x, d.z);
    const c = new THREE.Vector3(x - 0.04, 0, hingeZ).addScaledVector(d, len / 2);
    const h = y1 - y0;
    if (louvred) {
      for (const s of [-1, 1]) {
        const e = c.clone().addScaledVector(d, s * (len / 2 - 0.03));
        b.box('timber', 0.04, h, 0.06, e.x, y0 + h / 2, e.z, 0, ry, 0, 0.04);
      }
      for (const y of [y0 + 0.03, y1 - 0.03]) b.box('timber', 0.04, 0.06, len, c.x, y, c.z, 0, ry, 0, 0.04);
      for (let y = y0 + 0.1; y < y1 - 0.06; y += 0.075) b.box('timber', 0.018, 0.05, len - 0.1, c.x, y, c.z, 0, ry, 0, 0.06);
    } else {
      b.box('wall', 0.05, h, len, c.x, y0 + h / 2, c.z, 0, ry, 0, 0.04);
      const n = new THREE.Vector3(d.z, 0, -d.x);
      for (const s of [-1, 1]) {
        for (const y of [0.5, 1.4]) {
          const pc = c.clone().addScaledVector(n, s * 0.03);
          b.box('timber', 0.02, 0.66, len - 0.22, pc.x, y, pc.z, 0, ry, 0, 0.04);
        }
      }
    }
  };
  const sw = (WINDOW.z1 - WINDOW.z0) / 2;
  leaf(WINDOW.z0, 1, 2.0, sw, 0.8, WINDOW.y1, true);
  leaf(WINDOW.z1, -1, 1.9, sw, 0.8, WINDOW.y1, true);
  leaf(DOOR.z1, -1, 1.05, DOOR.z1 - DOOR.z0, 0.01, DOOR.y1 - 0.01, false);

  // Shelf with props (H9) beside the door.
  b.box('timber', 0.3, 0.04, 1.4, x - 0.17, 1.45, 0.4);
  for (const z of [-0.2, 1.0]) b.box('timber', 0.26, 0.18, 0.04, x - 0.15, 1.36, z);
  b.box('timber', 0.3, 0.04, 1.4, x - 0.17, 0.85, 0.4);
}

// ---------------------------------------------------------------------------------------------

export function createInterior(canvas, { onReady } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // the sun and the house don't move: draw the shadows once
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bcd3df');
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
  const EYE = new THREE.Vector3(-1.4, 1.5, 1.2); // standing near the left rail, as in H1
  const LOOK = new THREE.Vector3(-3.0, 1.45, -4.2); // diagonally into the front-left corner

  // Lights: low warm sun from the front-left, cool sky fill.
  const sun = new THREE.DirectionalLight('#ffe2b8', 3.4);
  sun.position.set(-14, 9, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 50 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const hemi = new THREE.HemisphereLight('#d4d6e6', '#a08670', 2.4); // cool sky fill: shadows go blue, not grey
  scene.add(sun, hemi);

  const gradientMap = toonGradient();
  const textures = { planks: paintPlanks(), weathered: paintPlanks(9, { weathered: true }), thatch: paintThatch(), mat: paintMat(), post: paintPost() };
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  for (const t of Object.values(textures)) t.anisotropy = aniso;
  const materials = {};
  for (const [key, color, map] of [
    ['floor', '#bba98d', textures.planks],
    ['bamboo', '#d9bd84', textures.mat],
    ['timber', '#a6845e', textures.planks],
    ['rafter', '#cfae7c', textures.planks],
    ['lath', '#d2b07a', textures.planks],
    ['rail', '#b0a089', textures.weathered],
    ['bench', '#b39878', textures.weathered],
    ['post', '#ffffff', textures.post],
    ['thatch', '#c29a66', textures.thatch],
    ['wall', PALETTE.wall, textures.planks],
  ]) {
    materials[key] = new THREE.MeshToonMaterial({ color, map, vertexColors: true, gradientMap });
  }

  const b = new Builder();
  buildRoom(b);
  const room = new THREE.Group();
  room.add(...b.build(materials));
  scene.add(room);

  // Outside: painted sky, jungle, palms and banana plants (layer 1: no outlines).
  const landscape = createLandscape({ gradientMap, rand: mulberry32(21), groundY: -1.85 });
  scene.add(landscape.group);
  camera.layers.enable(1);
  scene.fog = new THREE.Fog('#d3dec6', 16, 90); // aerial perspective on the far jungle

  const outline = createOutline(renderer, scene, camera, { ink: PALETTE.ink });
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(outline.material));
  composer.addPass(new OutputPass());

  let width = 0;
  let height = 0;
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    outline.setSize(w, h, renderer.getPixelRatio());
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 78 : 60;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const pointer = new THREE.Vector2();
  const look = new THREE.Vector2();
  function onPointerMove(e) {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }
  window.addEventListener('pointermove', onPointerMove);

  const timer = new THREE.Timer();
  let frame = 0;
  let readyCalled = false;
  function tick(now) {
    frame = requestAnimationFrame(tick);
    resize();
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.1);
    look.lerp(pointer, 1 - Math.exp(-dt * 2));
    camera.position.set(EYE.x + look.x * 0.12, EYE.y - look.y * 0.05, EYE.z);
    camera.lookAt(LOOK.x + look.x * 0.5, LOOK.y - look.y * 0.3, LOOK.z);
    outline.render();
    composer.render(dt);
    if (!readyCalled) {
      readyCalled = true;
      onReady?.();
    }
  }
  frame = requestAnimationFrame(tick);

  return {
    destroy() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      for (const m of Object.values(materials)) m.dispose();
      for (const t of Object.values(textures)) t.dispose();
      landscape.dispose();
      gradientMap.dispose();
      outline.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

