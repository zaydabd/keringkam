// The Sarawak Malay house interior (#/interior): a hand-drawn rendition of one room, built from a
// reference photo the user supplied (R1, research/INTERIOR-NOTES.md): the sitting room of a
// Sarawak Malay house, looking at the window wall. Dark red-brown board walls, full-height windows
// with lattice panels at the bottom, pleated floral valances and tied-back sheer curtains, golden
// wood settee, armchairs and tables, woven hangings on the side wall, and a red cloth stretched on
// an embroidery frame in the foreground (plain cloth: no keringkam motif yet).
// It is a rendition, not a copy. Sizes are estimated from the photo (see PLAN).
//
// Structure (after .claude/skills/threejs-procedural-architecture): PLAN holds every size in
// metres and can be serialised; the build* functions turn it into parts; the Builder merges the
// parts into one mesh per material. Debug views: ?debug=nopost (no ink pass) or ?debug=flat
// (no textures), e.g. /?debug=flat#/interior. Both log the triangle count.
// Look: watercolour, after R2 (a painting of the same room; see watercolour.js). Layout and items
// stay as in R1. More debug views: ?debug=paint-off | paint-pigment | paint-edge | paint-bleed | gloss
// (the mirror mask of the polished boards).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { toonGradient, createOutline } from './toon.js';
import { paintPlanks, paintLattice, paintCurtain, paintCloth, paintDecor, paintGlow } from './paint.js';
import { createLandscape } from './landscape.js';
import { PIGMENT_SHADER, GRADE_SHADER } from './watercolour.js';

// Colours picked from R1, then lifted a little for the painted look.
export const PALETTE = {
  wall: '#8e6c5a', // mid brown boards, a little grey, as in R2
  frame: '#6a3a24', // window frames, dado rail
  floor: '#a06e50', // warm brown floor boards (R2)
  wood: '#b0764a', // honey-brown furniture (R2 is browner than R1's gold)
  top: '#b8845c', // table tops: brown and polished in R2 (they mirror the windows)
  lattice: '#977258', // lighter carved panels, as in R2
  cloth: '#d8283a', // red cloth on the frame
  leaf: '#6a8f46', // lighter, yellower leaves (R2)
  ink: '#4a2e1e', // brown ink, not black (R2)
};

// Everything in metres. The camera stands at the origin and looks along -z at the window wall.
export const PLAN = {
  camera: { eye: [0, 0.9, 0], pitch: -6.7, fov: 46.8, aspect: 1.387 }, // from R1's horizon and vanishing point
  room: { x0: -4.2, x1: 1.34, z0: -5.5, z1: 1.2, top: 2.7 },
  backWindows: [
    { x0: -3.02, x1: -1.92 },
    { x0: -1.0, x1: 0.05 },
    { x0: 0.72, x1: 1.2 },
  ],
  window: { y1: 2.25, lattice: 1.1, valance: [2.1, 2.45], tie: 1.2 },
  sideWindow: { z0: -2.45, z1: -1.45, y0: 0.3 }, // on the right wall, near the camera
  dado: 0.85,
  hangings: { z: -3.2, y: 1.52, size: 0.27 },
  plate: { x: 0.38, y: 1.78, r: 0.15 },
  settee: { x: -0.8, z: -5.08, ry: 0, w: 1.45, d: 0.55, back: 1.0 },
  chairs: [
    { x: -1.85, z: -4.0, ry: Math.PI / 2, w: 0.6, d: 0.55, back: 0.98 },
    { x: 0.15, z: -4.0, ry: -Math.PI / 2, w: 0.6, d: 0.55, back: 0.98 },
  ],
  tables: [
    { x0: -1.68, x1: -0.36, z0: -4.5, z1: -4.1, h: 0.46 },
    { x0: -1.9, x1: -0.45, z0: -3.8, z1: -3.0, h: 0.45, stretcher: true },
  ],
  frame: { x: 0.5, z: -1.78, ry: -0.42, w: 0.62, d: 0.52, front: 0.36, back: 0.5 }, // embroidery frame
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = (rx = 0, ry = 0, rz = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
const ONE = V(1, 1, 1);
const M = (x, y, z, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), Q(rx, ry, rz), ONE);

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
// Parts

/** Splits [from, to] into boards of uneven width (0.15–0.22 m), with joints at every `edges` value. */
function boardRuns(from, to, edges) {
  const cuts = [from, ...edges.filter((e) => e > from && e < to), to].sort((a, b) => a - b);
  const boards = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    let a = cuts[i];
    while (a < cuts[i + 1] - 0.01) {
      const bEnd = Math.min(cuts[i + 1], a + 0.15 + rand() * 0.07);
      boards.push([a, cuts[i + 1] - bEnd < 0.06 ? cuts[i + 1] : bEnd]);
      a = boards[boards.length - 1][1];
    }
  }
  return boards;
}

/**
 * A wall of vertical boards along one axis. `openings` are [a0, a1, y0, y1] along that axis; boards
 * stop at their edges. `at(a, y, w, h)` returns the box centre and size for a board piece.
 */
function boardWall(b, from, to, top, openings, at) {
  const edges = openings.flatMap((o) => [o[0], o[1]]);
  for (const [a0, a1] of boardRuns(from, to, edges)) {
    const mid = (a0 + a1) / 2;
    const o = openings.find((o) => mid > o[0] && mid < o[1]);
    const spans = o ? [[0, o[2]], [o[3], top]] : [[0, top]];
    for (const [y0, y1] of spans) if (y1 - y0 > 0.02) at(mid, (y0 + y1) / 2, a1 - a0 - 0.004, y1 - y0);
  }
}

const WALL_TINT = 0.3; // R2: neighbouring boards differ clearly in value

/**
 * R2's walls are darker low down and lighter up near the ceiling. Done in the material, not in the
 * vertex colours: the ink pass tells parts apart by their vertex colour.
 */
function shadeWalls(material, top) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWallY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWallY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWallY;')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(0.72, 1.12, smoothstep(0.0, ${top.toFixed(2)}, vWallY));`);
  };
}

function buildRoom(b) {
  const { x0, x1, z0, z1, top } = PLAN.room;
  const W = PLAN.window;
  // Floor: wide boards running towards the window wall, in staggered lengths.
  for (const [a0, a1] of boardRuns(x0, x1, [])) {
    let z = z0;
    while (z < z1) {
      const len = Math.min(z1 - z, 1.6 + rand() * 2.4);
      b.box('floor', a1 - a0 - 0.006, 0.03, len - 0.004, (a0 + a1) / 2, -0.015, z + len / 2);
      z += len;
    }
  }
  // Back wall (the window wall), boards outside the room line so the inner face is at z0.
  const back = PLAN.backWindows.map((w) => [w.x0, w.x1, 0, W.y1]);
  boardWall(b, x0, x1, top, back, (a, y, w, h) => b.box('wall', w, h, 0.025, a, y, z0 - 0.0125, 0, 0, 0, WALL_TINT));
  // Right wall, with the window near the camera.
  const s = PLAN.sideWindow;
  boardWall(b, z0, z1, top, [[s.z0, s.z1, s.y0, W.y1]], (a, y, w, h) => b.box('wall', 0.025, h, w, x1 + 0.0125, y, a, 0, 0, 0, WALL_TINT));
  // Left and front walls (out of shot: they close the room and cast shadows). Ceiling boards.
  boardWall(b, z0, z1, top, [], (a, y, w, h) => b.box('wall', 0.025, h, w, x0 - 0.0125, y, a, 0, 0, 0, WALL_TINT));
  boardWall(b, x0, x1, top, [], (a, y, w, h) => b.box('wall', w, h, 0.025, a, y, z1 + 0.0125, 0, 0, 0, WALL_TINT));
  for (const [a0, a1] of boardRuns(z0, z1, [])) b.box('ceiling', x1 - x0, 0.02, a1 - a0 - 0.004, (x0 + x1) / 2, top + 0.01, (a0 + a1) / 2);
  for (let x = x0 + 0.6; x < x1; x += 1.2) b.box('ceiling', 0.1, 0.14, z1 - z0, x, top - 0.07, (z0 + z1) / 2);

  // Window frames on the back wall: jambs, head, threshold, and the lattice rail.
  for (const w of PLAN.backWindows) {
    const cx = (w.x0 + w.x1) / 2;
    const ww = w.x1 - w.x0;
    for (const x of [w.x0 - 0.035, w.x1 + 0.035]) b.box('frame', 0.07, W.y1 + 0.1, 0.09, x, (W.y1 + 0.1) / 2, z0 - 0.01);
    b.box('frame', ww + 0.22, 0.1, 0.1, cx, W.y1 + 0.05, z0 - 0.005);
    b.box('frame', ww + 0.14, 0.03, 0.12, cx, 0.015, z0 - 0.01);
    b.box('frame', ww, 0.06, 0.07, cx, W.lattice + 0.03, z0 - 0.02);
    b.box('frame', ww, 0.05, 0.06, cx, 0.06, z0 - 0.02);
  }
  // Side window frame and the dado rail on the right wall.
  for (const z of [s.z0 - 0.035, s.z1 + 0.035]) b.box('frame', 0.09, W.y1 + 0.1, 0.07, x1 - 0.01, (W.y1 + 0.1) / 2, z);
  b.box('frame', 0.1, 0.1, s.z1 - s.z0 + 0.22, x1 - 0.005, W.y1 + 0.05, (s.z0 + s.z1) / 2);
  b.box('frame', 0.12, 0.04, s.z1 - s.z0 + 0.14, x1 - 0.02, s.y0, (s.z0 + s.z1) / 2);
  for (const [a, c] of [[z0, s.z0 - 0.07], [s.z1 + 0.07, z1]]) b.box('frame', 0.03, 0.06, c - a, x1 - 0.015, PLAN.dado, (a + c) / 2);
  b.box('frame', 0.03, 0.05, x1 - x0, (x0 + x1) / 2, top - 0.025, z0 + 0.015, 0, Math.PI / 2);
}

/** Lattice panels in the lower part of each window: alpha-cut planes (own mesh, see createInterior). */
function buildLattice(b) {
  const { z0 } = PLAN.room;
  const h = PLAN.window.lattice;
  for (const w of PLAN.backWindows) {
    const g = new THREE.PlaneGeometry(w.x1 - w.x0, h - 0.09);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w.x1 - w.x0) + w.x0, uv.getY(i) * (h - 0.09));
    b.place('lattice', g, M((w.x0 + w.x1) / 2, 0.09 + (h - 0.09) / 2, z0 - 0.02), 0.04, false);
  }
}

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

function buildCurtains(b) {
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

/** A turned leg, as a lathe: radius r, height h, standing on y = 0. UVs in metres. */
function turnedLeg(r, h) {
  const profile = [[0, 0], [0.55, 0], [0.8, 0.03], [0.55, 0.08], [0.55, 0.36], [1, 0.44], [0.62, 0.52], [0.5, 0.62], [0.5, 0.8], [0.8, 0.86], [0.8, 1], [0, 1]];
  const g = new THREE.LatheGeometry(profile.map(([a, k]) => new THREE.Vector2(a * r, k * h)), 8);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getY(i), uv.getX(i) * Math.PI * 2 * r);
  return g;
}

/**
 * An armchair or settee in the local frame (front towards +z), placed at (x, z) turned by ry:
 * turned legs, seat, aprons, arms on turned posts, and a back of slats between two rails.
 */
function buildSeat(b, { x, z, ry, w, d, back }) {
  const F = new THREE.Matrix4().compose(V(x, 0, z), Q(0, ry, 0), ONE);
  const box = (w2, h, d2, lx, ly, lz, rx = 0, rz = 0) => b.place('wood', boxWithGrainUVs(w2, h, d2), M(lx, ly, lz, rx, 0, rz).premultiply(F));
  const leg = (lx, lz, h, r = 0.025) => b.place('wood', turnedLeg(r, h), M(lx, 0, lz).premultiply(F));
  const seat = 0.44;
  const arm = 0.66;
  const hx = w / 2 - 0.03;
  const hz = d / 2 - 0.03;
  leg(-hx, hz, arm);
  leg(hx, hz, arm);
  box(0.045, back, 0.045, -hx, back / 2, -hz, 0.08);
  box(0.045, back, 0.045, hx, back / 2, -hz, 0.08);
  box(w, 0.035, d, 0, seat, 0);
  box(w - 0.06, 0.07, 0.025, 0, seat - 0.05, hz);
  for (const s of [-1, 1]) {
    box(0.025, 0.07, d - 0.06, s * hx, seat - 0.05, 0);
    box(0.07, 0.03, d + 0.06, s * (hx + 0.005), arm, 0.02); // arm
    box(0.02, 0.022, d - 0.08, s * hx, 0.13, 0); // side stretcher
    for (let k = 0; k < 3; k++) box(0.018, arm - seat - 0.03, 0.018, s * hx, (seat + arm) / 2, -hz + 0.12 + k * 0.13); // arm spindles
  }
  box(w - 0.06, 0.02, 0.022, 0, 0.13, hz);
  // Back: top rail, lower rail, and a carved panel (armchair) or slats and a carved band (settee).
  const lean = 0.08;
  const yz = (y) => -hz - Math.sin(lean) * (y - seat) * 0.5;
  box(w + 0.04, 0.085, 0.03, 0, back - 0.05, yz(back - 0.05), lean);
  box(w - 0.06, 0.05, 0.025, 0, seat + 0.1, yz(seat + 0.1), lean);
  const yA = seat + 0.125;
  const yB = back - 0.09;
  const carve = (y0, y1) => {
    const pw = w - 0.1;
    const g = new THREE.PlaneGeometry(pw, y1 - y0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * pw, uv.getY(i) * (y1 - y0));
    b.place('carve', g, M(0, (y0 + y1) / 2, yz((y0 + y1) / 2), lean).premultiply(F), 0.04, false);
  };
  if (w > 1) {
    // Settee: slats below, a carved band under the top rail, split by two posts.
    const yC = back - 0.3;
    const n = Math.round(w / 0.09);
    for (let k = 1; k < n; k++) box(0.035, yC - yA, 0.016, -hx + ((2 * hx) / n) * k, (yA + yC) / 2, yz((yA + yC) / 2), lean);
    box(w - 0.06, 0.04, 0.025, 0, yC + 0.02, yz(yC), lean);
    carve(yC + 0.04, yB - 0.02);
    for (const px of [-w / 6, w / 6]) box(0.05, yB - yC, 0.026, px, (yB + yC) / 2, yz((yB + yC) / 2), lean);
  } else {
    // Armchair: one carved panel framed by two stiles.
    carve(yA, yB);
    for (const px of [-w / 2 + 0.12, w / 2 - 0.12]) box(0.04, yB - yA, 0.024, px, (yA + yB) / 2, yz((yA + yB) / 2), lean);
  }
}

function buildTable(b, { x0, x1, z0, z1, h, stretcher }) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  b.box('top', w, 0.035, d, cx, h - 0.0175, cz);
  b.box('wood', w - 0.08, 0.07, 0.025, cx, h - 0.07, z1 - 0.05);
  b.box('wood', w - 0.08, 0.07, 0.025, cx, h - 0.07, z0 + 0.05);
  b.box('wood', 0.025, 0.07, d - 0.1, x0 + 0.05, h - 0.07, cz);
  b.box('wood', 0.025, 0.07, d - 0.1, x1 - 0.05, h - 0.07, cz);
  for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [z0 + 0.05, z1 - 0.05]) b.place('wood', turnedLeg(0.028, h - 0.035), M(x, 0, z));
  if (stretcher) {
    for (const x of [x0 + 0.05, x1 - 0.05]) b.box('wood', 0.03, 0.03, d - 0.1, x, 0.1, cz);
    b.box('wood', w - 0.1, 0.03, 0.03, cx, 0.1, cz);
  }
}

/**
 * The embroidery frame (pemidang): red cloth stretched between two rollers, held by side bars on
 * short legs, tilted towards the sitter. Plain cloth: the work has not started.
 */
function buildEmbroideryFrame(b) {
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

/** Woven mats and framed pictures hung as diamonds on the right wall; a plate on the back wall. */
function buildHangings(b) {
  const { x1, z0 } = PLAN.room;
  const { z, y, size } = PLAN.hangings;
  const step = size * Math.SQRT1_2 * 1.06;
  const cells = [[0, 0], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1], [0, -1], [1, -1], [0, 2], [-1, -1]];
  cells.forEach(([i, j], k) => {
    const cz = z + (i + j) * step;
    const cy = y + (i - j) * step + (rand() - 0.5) * 0.02;
    const s = size * (0.88 + rand() * 0.18);
    const g = new THREE.PlaneGeometry(s, s);
    const uv = g.attributes.uv;
    const tx = k % 4;
    const ty = Math.floor(k / 4) % 2;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, (tx + uv.getX(n)) / 4, (1 - ty + uv.getY(n)) / 2);
    const tilt = Math.PI / 4 + (rand() - 0.5) * 0.08;
    b.place('decor', g, M(x1 - 0.022, cy, cz, 0, -Math.PI / 2, tilt), 0.06, false);
    b.place('frame', boxWithGrainUVs(0.014, s + 0.02, s + 0.02), M(x1 - 0.008, cy, cz, tilt, 0, 0), 0.1);
  });
  const p = PLAN.plate;
  b.place('plate', new THREE.CylinderGeometry(p.r, p.r * 0.8, 0.02, 20).rotateX(Math.PI / 2), M(p.x, p.y, z0 + 0.012), 0.04, false);
  b.place('frame', new THREE.TorusGeometry(p.r * 0.72, 0.008, 4, 20), M(p.x, p.y, z0 + 0.024), 0.04, false);
  // A small framed print between the first two windows.
  b.box('frame', 0.24, 0.3, 0.02, -1.45, 1.62, z0 + 0.012);
  const g = new THREE.PlaneGeometry(0.18, 0.24);
  const uv = g.attributes.uv;
  for (let n = 0; n < uv.count; n++) uv.setXY(n, (2 + uv.getX(n)) / 4, (1 + uv.getY(n)) / 2);
  b.place('decor', g, M(-1.45, 1.62, z0 + 0.023), 0.04, false);
}

/** Trailing vines beside the windows: small leaf cards along a gently swinging line. */
function buildVines(b) {
  const { z0, x1 } = PLAN.room;
  const vine = (x, z, yTop, yBottom, alongX) => {
    let k = 0;
    for (let y = yTop; y > yBottom; y -= 0.035) {
      const sway = Math.sin(y * 5 + x) * 0.04;
      const leaf = new THREE.PlaneGeometry(0.075, 0.045);
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

/**
 * Polished boards (R2): the floor and the table tops mirror the bright windows, and the floor
 * mirrors the red cloth. Done in the material: each fragment's view ray is reflected off the
 * (level) surface and followed to the window wall or to the cloth; where it lands in an opening
 * the board is painted lighter. The mirror image is blurred more the further the ray travels, and
 * stretched along the boards, as a real polished floor does. `falloff` darkens the boards away
 * from the windows (R2's foreground floor is in shade). `view` shows the mask alone.
 */
function glossBoards(material, { strength = 0.6, cloth = 0, falloff = 0, view = false } = {}) {
  const { z0 } = PLAN.room;
  const W = PLAN.window;
  const F = PLAN.frame;
  const wins = PLAN.backWindows.map((w) => `refl += box(H.x, ${w.x0.toFixed(2)}, ${w.x1.toFixed(2)}, wx) * open;`).join('\n      ');
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlossP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGlossP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
    varying vec3 vGlossP;
    float box(float v, float a, float b, float w) { return smoothstep(a - w, a + w, v) * (1.0 - smoothstep(b - w, b + w, v)); }
    float gHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
    float gNoise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(gHash(i), gHash(i + 1.0), f); }`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
    {
      float shade = ${falloff.toFixed(2)} * smoothstep(-3.4, -1.3, vGlossP.z);
      outgoingLight *= 1.0 - shade;
      vec3 Vd = normalize(vGlossP - cameraPosition);
      vec3 Rd = vec3(Vd.x, abs(Vd.y), Vd.z); // mirrored off a level board
      float refl = 0.0;
      if (Rd.z < -0.001) {
        float t = (${z0.toFixed(2)} - vGlossP.z) / Rd.z;
        vec3 H = vGlossP + Rd * t;
        float wx = 0.05 + 0.03 * t; // blur grows with distance
        float wy = 0.18 + 0.14 * t; // and the image is stretched along the boards
        float open = box(H.y, ${W.lattice.toFixed(2)}, ${W.y1.toFixed(2)}, wy) + 0.35 * box(H.y, 0.0, ${W.lattice.toFixed(2)}, wy);
        ${wins}
      }
      // boards are not evenly polished: streaks along the grain, and each plank a little different
      float streak = 0.55 + 0.45 * gNoise(vGlossP.x * 31.0) * (0.7 + 0.6 * gNoise(vGlossP.x * 7.3 + vGlossP.z * 0.9));
      float plank = clamp(0.8 + (vColor.r - 1.0) * 6.0, 0.45, 1.15);
      float fres = 0.3 + 0.7 * pow(1.0 - abs(Vd.y), 2.0); // stronger at a glancing angle
      float gloss = clamp(refl, 0.0, 1.0) * streak * plank * fres * ${strength.toFixed(2)} * (1.0 - shade);
      // the red cloth, mirrored in the floor
      float red = 0.0;
      if (${cloth.toFixed(2)} > 0.0) {
        float tc = (${((F.front + F.back) / 2).toFixed(2)} - vGlossP.y) / Rd.y;
        vec3 Hc = vGlossP + Rd * tc - vec3(${F.x.toFixed(2)}, 0.0, ${F.z.toFixed(2)});
        float cs = ${Math.cos(F.ry).toFixed(4)}, sn = ${Math.sin(F.ry).toFixed(4)};
        vec2 L = vec2(cs * Hc.x - sn * Hc.z, sn * Hc.x + cs * Hc.z); // into the frame's own axes
        red = box(L.x, ${(-F.w / 2).toFixed(2)}, ${(F.w / 2).toFixed(2)}, 0.5) * box(L.y, ${(-F.d / 2).toFixed(2)}, ${(F.d / 2).toFixed(2)}, 0.5) * streak * ${cloth.toFixed(2)};
      }
      ${view ? 'outgoingLight = vec3(gloss) + vec3(red, 0.0, 0.0);' : 'outgoingLight = mix(outgoingLight, vec3(1.0, 0.77, 0.52), gloss); outgoingLight = mix(outgoingLight, vec3(0.9, 0.3, 0.16), red);'}
    }
    #include <opaque_fragment>`,
      );
  };
}

/**
 * Soft shadows under the furniture (R2 paints one under every piece). The sun only reaches the
 * boards by the windows, so these are painted on: a dark, soft-edged patch on the floor under each
 * piece, pulled a little towards the viewer (the light comes from the windows behind).
 */
function buildContactShadows(texture) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: texture, color: '#24140e', transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  const patch = (x, z, w, d, ry = 0) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
    mesh.position.set(x, 0.004, z);
    mesh.rotation.y = ry;
    mesh.layers.set(1); // no ink outline
    group.add(mesh);
  };
  const pull = 0.28;
  for (const sItem of [PLAN.settee, ...PLAN.chairs]) patch(sItem.x, sItem.z + pull, sItem.w * 1.5, sItem.d * 2.1, sItem.ry);
  for (const t of PLAN.tables) patch((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2 + pull, (t.x1 - t.x0) * 1.35, (t.z1 - t.z0) * 2.0);
  const F = PLAN.frame;
  patch(F.x, F.z + pull, F.w * 2.6, F.d * 3.0, F.ry);
  return { group, mat };
}

// ---------------------------------------------------------------------------------------------
export function createInterior(canvas, { onReady } = {}) {
  const debug = new URLSearchParams(window.location.search).get('debug'); // 'nopost' | 'flat'
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // the sun and the room don't move: draw the shadows once
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.NeutralToneMapping; // the only tone map: OutputPass applies it
  renderer.toneMappingExposure = 1.3; // R2 is lighter and airier than R1

  const scene = new THREE.Scene();
  const BRIGHT = '#ecf8dc'; // daylight in the windows: pale, a little green from the garden (R2)
  scene.background = new THREE.Color(BRIGHT);
  scene.fog = new THREE.Fog(BRIGHT, 2, 24); // only the landscape takes fog: the room's materials have fog off
  const C = PLAN.camera;
  const camera = new THREE.PerspectiveCamera(C.fov, C.aspect, 0.2, 400); // at 0.05 the big ground plane outside drew over the near floor on tall screens

  // Light: sun behind the window wall, high enough that the patches fall just inside the windows.
  const sun = new THREE.DirectionalLight('#ffe6c4', 3.2);
  sun.target.position.set(-1, 0, -4);
  sun.position.set(-4, 11, -14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = new THREE.HemisphereLight('#fff2e4', '#7a604e', 2.0); // warm bounce off the floor and walls
  const fill = new THREE.DirectionalLight('#ffd6ac', 0.55); // soft light from the room behind the camera
  fill.position.set(1.5, 2.5, 4);
  scene.add(sun, sun.target, hemi, fill);

  // Soft painted ramp (R2): lavender-grey shade, warm half-tones, cream light, blended not stepped.
  const gradientMap = toonGradient(
    [[0.44, 0.4, 0.4], [0.6, 0.55, 0.53], [0.76, 0.71, 0.68], [0.93, 0.88, 0.82], [1.0, 0.97, 0.9]],
    { smooth: true },
  );
  const textures = {
    planks: paintPlanks(),
    floor: paintPlanks(9, { weathered: true }),
    wall: paintPlanks(5, { brushy: true }),
    lattice: paintLattice(),
    carve: paintLattice(17),
    valance: paintCurtain(12, 'valance'),
    sheer: paintCurtain(16, 'drape'),
    cloth: paintCloth(),
    decor: paintDecor(),
    blob: paintGlow('round'),
  };
  textures.lattice.repeat.set(1.6, 1.6);
  textures.carve.repeat.set(3.4, 3.4); // finer: chair-back carving
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  for (const t of Object.values(textures)) t.anisotropy = aniso;
  const D = THREE.DoubleSide;
  const materials = {};
  for (const [key, color, map, extra] of [
    ['floor', PALETTE.floor, textures.floor],
    ['wall', PALETTE.wall, textures.wall],
    ['ceiling', '#6e5646', textures.wall], // grey-brown boards, as R2's ceiling (seen on tall screens)
    ['frame', PALETTE.frame, textures.planks],
    ['wood', PALETTE.wood, textures.planks],
    ['top', PALETTE.top, textures.planks],
    ['lattice', PALETTE.lattice, textures.lattice, { side: D, alphaTest: 0.5 }],
    ['carve', PALETTE.wood, textures.carve, { side: D, alphaTest: 0.5 }],
    ['valance', '#ffffff', textures.valance, { side: D, emissive: '#ffffff', emissiveMap: textures.valance, emissiveIntensity: 0.25 }], // lit from behind
    ['sheer', '#ffffff', textures.sheer, { side: D, emissive: '#ffffff', emissiveMap: textures.sheer, emissiveIntensity: 0.12 }],
    ['white', '#fffaf2', null, { side: D, emissive: '#fff4e4', emissiveIntensity: 0.4 }],
    ['cloth', '#ffffff', textures.cloth, { side: D, emissive: '#ffffff', emissiveMap: textures.cloth, emissiveIntensity: 0.12 }],
    ['decor', '#ffffff', textures.decor, { side: D }],
    ['plate', '#e6dcc0', null],
    ['leaf', PALETTE.leaf, null, { side: D }],
    ['tape', '#2f5f6a', null],
    ['bag', '#2c2420', null],
  ]) {
    materials[key] = new THREE.MeshToonMaterial({ color, map, vertexColors: true, gradientMap, fog: false, ...extra });
    if (debug === 'flat' && key !== 'lattice' && key !== 'carve') {
      materials[key].map = null;
      materials[key].color.set('#bdbdbd');
    }
  }

  shadeWalls(materials.wall, PLAN.room.top);
  glossBoards(materials.floor, { strength: 1.15, cloth: 0.7, falloff: 0.5, view: debug === 'gloss' });
  glossBoards(materials.top, { strength: 1.0, view: debug === 'gloss' });
  const b = new Builder();
  buildRoom(b);
  buildLattice(b);
  buildCurtains(b);
  buildSeat(b, PLAN.settee);
  for (const c of PLAN.chairs) buildSeat(b, c);
  for (const t of PLAN.tables) buildTable(b, t);
  buildEmbroideryFrame(b);
  buildHangings(b);
  buildVines(b);
  const room = new THREE.Group();
  room.add(...b.build(materials));
  // The lattice is cut out by its texture: give its shadow the same holes, and keep it out of the
  // ink pass (the edge buffer would see a solid panel).
  const latticeDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: textures.lattice, alphaTest: 0.5 });
  const carveDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: textures.carve, alphaTest: 0.5 });
  for (const mesh of room.children) {
    if (mesh.name === 'lattice' || mesh.name === 'carve') {
      mesh.customDepthMaterial = mesh.name === 'lattice' ? latticeDepth : carveDepth;
      mesh.layers.set(1);
    }
    if (['leaf', 'cloth', 'decor'].includes(mesh.name)) mesh.castShadow = mesh.name === 'leaf';
  }
  scene.add(room);
  const contact = buildContactShadows(textures.blob);
  scene.add(contact.group);

  // Outside: the jungle from the old scene, washed out by the fog; no painted sky (R1's windows are white).
  const landscape = createLandscape({ gradientMap, rand: mulberry32(21), groundY: -1.85 });
  landscape.group.traverse((o) => {
    if (o.material && o.material.side === THREE.BackSide) o.visible = false;
  });
  scene.add(landscape.group);
  camera.layers.enable(1);

  const outline = createOutline(renderer, scene, camera, { ink: PALETTE.ink });
  outline.material.uniforms.split.value = 0.18; // keep the dark wood warm
  outline.material.uniforms.strength.value = 0.65; // thinner, lighter lines, as in R2
  outline.material.uniforms.seams.value = 0.75; // but R2 draws every plank seam clearly
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(outline.material));
  // Watercolour (watercolour.js): pigment in linear light, then tone map once, then the grade.
  const pigment = new ShaderPass(PIGMENT_SHADER);
  const grade = new ShaderPass(GRADE_SHADER);
  const paintView = { 'paint-pigment': 1, 'paint-edge': 2, 'paint-bleed': 3 }[debug] ?? 0;
  pigment.uniforms.view.value = paintView;
  if (debug !== 'paint-off') composer.addPass(pigment);
  composer.addPass(new OutputPass());
  if (debug !== 'paint-off' && !paintView) composer.addPass(grade);

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
    pigment.uniforms.resolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    pigment.uniforms.scale.value = renderer.getPixelRatio();
    camera.aspect = w / h;
    // Keep R1's vertical view on wide screens; on narrow ones keep its horizontal view instead.
    const hTan = Math.tan(THREE.MathUtils.degToRad(C.fov / 2)) * C.aspect;
    camera.fov = camera.aspect >= C.aspect ? C.fov : Math.min(80, THREE.MathUtils.radToDeg(2 * Math.atan(hTan / camera.aspect)));
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

  const eye = V(...C.eye);
  const target = new THREE.Vector3();
  const timer = new THREE.Timer();
  let frame = 0;
  let readyCalled = false;
  function tick(now) {
    frame = requestAnimationFrame(tick);
    resize();
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.1);
    look.lerp(pointer, 1 - Math.exp(-dt * 2));
    const yaw = -look.x * 0.06;
    const pitch = THREE.MathUtils.degToRad(C.pitch) - look.y * 0.03;
    camera.position.copy(eye);
    target.set(eye.x + Math.sin(yaw) * Math.cos(pitch), eye.y + Math.sin(pitch), eye.z - Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(target);
    if (debug === 'nopost') renderer.render(scene, camera);
    else {
      outline.render();
      composer.render(dt);
    }
    if (!readyCalled) {
      readyCalled = true;
      if (debug) console.info('triangles', renderer.info.render.triangles, 'calls', renderer.info.render.calls);
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
      latticeDepth.dispose();
      carveDepth.dispose();
      contact.mat.dispose();
      landscape.dispose();
      gradientMap.dispose();
      outline.dispose();
      pigment.dispose();
      grade.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
