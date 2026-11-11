// What you see out of the windows of the Sarawak Malay house (#/interior): a river kampung.
//
// Sources (research/CREDITS.md, research/INTERIOR-NOTES.md "Outside"): the Wikimedia Commons photos
// of Kampung Bako, one of the oldest Malay settlements near Kuching (K1, K2, K5): houses on stilts
// with painted board walls and corrugated zinc roofs (rust red, blue, green, bare grey), a wide
// muddy tidal river with small painted boats, mangrove on the far bank, a forested hill behind,
// cumulus. Coconut palms and banana plants by the house. It is a rendition of that kind of place,
// not a survey of one: every position and size in SITE is a design choice.
//
// Structure, as in interior.js: SITE (data, metres) -> build* functions -> one merged mesh per
// material. Everything is on layer 1 (no ink outline: it reads as a painted backdrop), and takes
// the scene fog, which is the daylight haze. Budget: under 25,000 triangles and 14 draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { leafStrip, skyLit } from './landscape.js';
import { toonGradient } from './toon.js';
import { paintSoftSky, paintFrond, paintBananaLeaf, paintLeafClump, paintPalmTrunk, paintPlanks, paintGround, paintWater, paintCanopy, paintZinc } from './paint.js';

// The room's window wall is at z = -5.5 and its floor at y = 0; the camera looks along -z.
export const SITE = {
  ground: -1.85, // the house stands on 1.85 m stilts
  bank: -24, // z where the yard ends and the river bank drops
  water: -3.0, // river level at this state of the tide
  farBank: -124,
  hill: { z: -235, base: 20, swell: 20 },
  // Neighbours on our bank. w runs along the ridge. Colours: K1, K2, K5.
  houses: [
    { x: -9.5, z: -15, ry: 0.22, w: 7.5, d: 5.4, stilts: 1.5, wall: '#e2d2ae', roof: '#b45c3c' },
    { x: 6.2, z: -17.5, ry: -0.3, w: 7, d: 5.2, stilts: 1.4, wall: '#8fb8b2', roof: '#9aa4a6' },
    { x: 12.5, z: -23.5, ry: 0.15, w: 6, d: 4.6, stilts: 1.3, wall: '#c8a57c', roof: '#b96a44' }, // clear of the middle window: that one looks to the river
    { x: 17, z: -13, ry: -0.6, w: 7, d: 5.2, stilts: 1.5, wall: '#d7c7d4', roof: '#6f8fa8' },
    { x: -21, z: -19, ry: 0.4, w: 7, d: 5, stilts: 1.4, wall: '#b9cf9c', roof: '#a85a3e' },
  ],
  farHouses: 13, // a row over the mud on the far bank
  palms: [
    { x: -6.5, z: -22.6, h: 7.2, lean: [-0.25, 0.35] },
    { x: 2.6, z: -23.2, h: 6.4, lean: [0.3, 0.2] },
    { x: -2.4, z: -22.8, h: 7.0, lean: [-0.15, 0.3] }, // in the middle window, against the hill and sky
    { x: 10.5, z: -22, h: 7.6, lean: [0.2, -0.3] },
    { x: -15, z: -22.5, h: 6.8, lean: [-0.3, -0.1] },
    { x: 3.8, z: -10.5, h: 8.5, lean: [0.35, 0.1] }, // near the right-hand window: only its trunk and low fronds show
  ],
  bananas: [
    [-3.7, -6.7], [0.3, -7.3], [2.9, -6.5], [-5.6, -8.2], // outside the back windows
    [3.0, -2.2], [3.4, -0.6], // outside the side window
  ],
  trees: [
    { x: -14, z: -9.5, h: 6.5 },
    { x: 12, z: -9, h: 7 },
    { x: -4.5, z: -13.5, h: 5 },
    { x: 24, z: -20, h: 7.5 },
    { x: -27, z: -11, h: 8 },
  ],
  jetty: { x: -4.6, z0: -22.5, z1: -37, w: 1.3 },
  boats: [
    { x: -7.5, z: -31, ry: 0.5, hull: '#3f8a5c', stripe: '#d8513a', canopy: true }, // K1
    { x: 3, z: -44, ry: -0.2, hull: '#3c7f8f', stripe: '#e8c25a' },
    { x: -2.6, z: -35.5, ry: 1.45, hull: '#c8553a', stripe: '#f1e6cc' }, // tied to the jetty
    { x: 22, z: -62, ry: 0.1, hull: '#4a8f62', stripe: '#e2603c', canopy: true },
  ],
};

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Collects geometry per material key, with one flat colour per part in the vertex colours. */
class Parts {
  constructor() {
    this.map = new Map();
  }
  add(key, geometry, color = '#ffffff') {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(g);
    if (g !== geometry) geometry.dispose();
  }
  box(key, w, h, d, x, y, z, ry = 0, color, uvScale = 0.5) {
    const g = new THREE.BoxGeometry(w, h, d);
    // UVs in metres, so painted boards and zinc ribs keep their size on every part.
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, uv.getX(f * 4 + k) * dims[f][0] * uvScale, uv.getY(f * 4 + k) * dims[f][1] * uvScale);
    g.rotateY(ry).translate(x, y, z);
    this.add(key, g, color);
  }
  build(materials) {
    const meshes = [];
    for (const [key, list] of this.map) {
      const mesh = new THREE.Mesh(mergeGeometries(list), materials[key]);
      mesh.name = key;
      for (const g of list) g.dispose();
      meshes.push(mesh);
    }
    return meshes;
  }
}

/** Rotates the offset (dx, dz) by ry about (x, z): local house axes to the site. */
const at = (h, dx, dz) => [h.x + dx * Math.cos(h.ry) + dz * Math.sin(h.ry), h.z - dx * Math.sin(h.ry) + dz * Math.cos(h.ry)];

/**
 * A kampung house: board box on stilts under a gabled zinc roof with wide eaves, a stair, and
 * dark window openings with a pale frame. `detail` 0 is for the far bank (box, roof, a few posts).
 */
function buildHouse(p, h, y0, detail = 1) {
  const floor = y0 + h.stilts;
  const wallH = detail ? 2.6 : 2.2;
  const rise = h.d * 0.36;
  const post = '#5a4636';
  const nx = detail ? Math.max(3, Math.round(h.w / 2.2)) : 3;
  const nz = detail ? 3 : 2;
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const [x, z] = at(h, -h.w / 2 + 0.25 + (i * (h.w - 0.5)) / (nx - 1), -h.d / 2 + 0.25 + (k * (h.d - 0.5)) / (nz - 1));
      p.box('wall', 0.16, h.stilts, 0.16, x, y0 + h.stilts / 2, z, h.ry, post);
    }
  }
  p.box('wall', h.w, wallH, h.d, h.x, floor + wallH / 2, h.z, h.ry, h.wall);
  p.box('wall', h.w + 0.1, 0.14, h.d + 0.1, h.x, floor, h.z, h.ry, post); // floor beam
  // Roof: two slopes with eaves, and the two gable triangles.
  const eave = detail ? 0.7 : 0.4;
  const top = floor + wallH;
  const slope = Math.hypot(h.d / 2 + eave, rise + (eave * rise) / (h.d / 2));
  const pitch = Math.atan2(rise, h.d / 2);
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(h.w + eave * 2, slope);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (h.w + eave * 2) * 0.5, uv.getY(i) * slope * 0.5);
    g.rotateX(-Math.PI / 2 + s * pitch).rotateY(s < 0 ? Math.PI : 0); // lies along the slope, facing up and out
    const mid = (h.d / 2 + eave) / 2;
    g.translate(0, top + rise - (mid * rise) / (h.d / 2) + 0.02, s * mid);
    g.rotateY(h.ry).translate(h.x, 0, h.z);
    p.add('roof', g, h.roof);
  }
  for (const s of [-1, 1]) {
    const tri = new THREE.BufferGeometry();
    const a = [s * h.w / 2, top, -h.d / 2];
    const b = [s * h.w / 2, top, h.d / 2];
    const c = [s * h.w / 2, top + rise, 0];
    tri.setAttribute('position', new THREE.Float32BufferAttribute(s > 0 ? [...a, ...c, ...b] : [...a, ...b, ...c], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, h.d * 0.5, 0, h.d * 0.25, rise * 0.5], 2));
    tri.computeVertexNormals();
    tri.rotateY(h.ry).translate(h.x, 0, h.z);
    p.add('wall', tri, h.wall);
  }
  if (!detail) return;
  // Windows on the long sides: dark opening, pale frame. Stair at one end of the front.
  const n = Math.max(2, Math.round(h.w / 2.6));
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const dx = -h.w / 2 + (h.w * (i + 0.5)) / n;
      if (s > 0 && i === 0) continue; // the door is here
      const [x, z] = at(h, dx, s * (h.d / 2 + 0.02));
      p.box('wall', 0.95, 1.25, 0.05, x, floor + 1.45, z, h.ry, '#f1e8d2');
      const [x2, z2] = at(h, dx, s * (h.d / 2 + 0.045));
      p.box('wall', 0.75, 1.05, 0.03, x2, floor + 1.45, z2, h.ry, '#4a3a30');
    }
  }
  const [dx0, dz0] = [-h.w / 2 + (h.w * 0.5) / n, h.d / 2 + 0.03];
  const [xd, zd] = at(h, dx0, dz0);
  p.box('wall', 0.9, 1.95, 0.05, xd, floor + 1.05, zd, h.ry, '#6a4a34'); // door
  const steps = Math.max(3, Math.round(h.stilts / 0.3));
  for (let i = 0; i < steps; i++) {
    const [xs, zs] = at(h, dx0, h.d / 2 + 0.25 + i * 0.3);
    p.box('wall', 1.1, 0.06, 0.28, xs, floor - ((i + 0.5) * h.stilts) / steps, zs, h.ry, '#8a6a4c');
  }
}

/** A perahu: a hull that narrows to both ends, a painted stripe, sometimes a small canopy (K1, K2, K4). */
function buildBoat(p, b, y) {
  const L = 5.2;
  const hull = new THREE.BoxGeometry(L, 0.5, 1.15, 8, 1, 1);
  const pos = hull.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.abs(pos.getX(i)) / (L / 2);
    const taper = 1 - t ** 2.2 * 0.9;
    pos.setZ(i, pos.getZ(i) * taper * (pos.getY(i) < 0 ? 0.6 : 1));
    pos.setY(i, pos.getY(i) + t ** 3 * 0.35); // the ends rise
  }
  hull.computeVertexNormals();
  hull.rotateY(b.ry).translate(b.x, y + 0.12, b.z);
  p.add('wall', hull, b.hull);
  p.box('wall', L * 0.8, 0.09, 1.19, b.x, y + 0.34, b.z, b.ry, b.stripe);
  if (b.canopy) {
    for (const [dx, dz] of [[-0.8, -0.45], [-0.8, 0.45], [0.8, -0.45], [0.8, 0.45]]) {
      const [x, z] = at(b, dx, dz);
      p.box('wall', 0.06, 1.1, 0.06, x, y + 0.9, z, b.ry, '#6a5040');
    }
    p.box('wall', 2.0, 0.06, 1.2, b.x, y + 1.46, b.z, b.ry, '#e9dcc0');
  }
}

/**
 * Builds the outside. `haze` is the daylight colour the fog fades to (the sky's horizon uses the
 * same one); `light` scales what gives off its own light (the sky), to match the scene's lights;
 * `key` darkens the outdoor paint so it keeps its colour next to a room exposed for shade.
 */
export function createOutside({ gradientMap, seed = 0, haze = '#f4faea', light = 1, key = 1 }) {
  const rand = mulberry32(33 + seed);
  const group = new THREE.Group();
  const disposables = [];
  const S = SITE;
  const hazeColor = new THREE.Color(haze);
  // Leaves seen against the light glow green: their shaded side stays light and green, not grey.
  const leafRamp = toonGradient([[0.74, 0.86, 0.66], [0.9, 0.94, 0.82], [1.0, 0.98, 0.9]], { smooth: true });
  disposables.push(leafRamp);
  const textures = {
    sky: paintSoftSky(25 + seed, { haze: hazeColor.getStyle().slice(4, -1) }),
    ground: paintGround(21 + seed),
    water: paintWater(22 + seed),
    canopy: paintCanopy(23 + seed),
    zinc: paintZinc(24 + seed),
    planks: paintPlanks(41 + seed, { brushy: true }),
    frond: paintFrond(),
    banana: paintBananaLeaf(),
    clump: paintLeafClump(),
    trunk: paintPalmTrunk(),
  };
  disposables.push(...Object.values(textures));
  const toon = (opts) => {
    const m = new THREE.MeshToonMaterial({ gradientMap, vertexColors: true, ...opts });
    m.color.multiplyScalar(key);
    disposables.push(m);
    return m;
  };
  const materials = {
    ground: toon({ map: textures.ground }),
    water: toon({ map: textures.water }),
    hill: toon({ map: textures.canopy, gradientMap: leafRamp }),
    wall: toon({ map: textures.planks }),
    roof: toon({ map: textures.zinc, side: THREE.DoubleSide }),
    trunk: toon({ map: textures.trunk }),
    frond: toon({ map: textures.frond, alphaTest: 0.5, side: THREE.DoubleSide, color: '#a9d08a', gradientMap: leafRamp }),
    banana: toon({ map: textures.banana, alphaTest: 0.5, side: THREE.DoubleSide, color: '#b4d890', gradientMap: leafRamp }),
    crown: toon({ gradientMap: leafRamp }),
    cards: toon({ map: textures.clump, alphaTest: 0.5, gradientMap: leafRamp }),
  };
  const p = new Parts();

  // --- Land and water -------------------------------------------------------------------------
  // The yard: level under and around the house, then a short bank down to the mud.
  const yard = new THREE.PlaneGeometry(640, 150, 32, 12).rotateX(-Math.PI / 2).translate(0, 0, S.bank + 75 - 4);
  {
    const pos = yard.attributes.position;
    const uv = yard.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const drop = THREE.MathUtils.smoothstep(-z, -S.bank - 0.5, -S.bank + 5); // 0 on the yard, 1 below the bank
      pos.setY(i, S.ground - drop * (S.ground - S.water + 0.4));
      uv.setXY(i, pos.getX(i) / 8, z / 8);
    }
    yard.computeVertexNormals();
  }
  p.add('ground', yard, '#ffffff');
  // The river, bank to bank; and the land behind the far bank up to the hill.
  const width = S.bank - 4 - S.farBank;
  const river = new THREE.PlaneGeometry(640, width, 1, 1).rotateX(-Math.PI / 2).translate(0, S.water, S.farBank + width / 2);
  {
    const uv = river.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 14);
  }
  p.add('water', river, '#ffffff');
  const far = new THREE.PlaneGeometry(900, 140, 1, 1).rotateX(-Math.PI / 2).translate(0, S.water + 0.3, S.farBank - 70);
  p.add('hill', far, '#8fae7c');

  // --- Hill and far bank: two scalloped walls of canopy ---------------------------------------
  const ridge = (z, x0, x1, n, height, uvScale, color) => {
    const pts = [];
    const uvs = [];
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = S.water + height(x);
      const zz = z - Math.cos((i / n - 0.5) * 2.2) * 12; // a shallow bay
      pts.push(x, S.water - 1, zz, x, y, zz);
      uvs.push(x * uvScale, 0, x * uvScale, (y - S.water) * uvScale);
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    p.add('hill', g, color);
  };
  const H = S.hill;
  ridge(H.z, -460, 460, 230, (x) => H.base + H.swell * (0.5 + 0.5 * Math.sin(x / 95 + 0.6)) + 7 * Math.sin(x / 38 + 2) + 1.6 * Math.sin(x / 5.5) + 1.1 * Math.sin(x / 2.3 + 1), 1 / 46, '#6f9870');
  ridge(S.farBank - 9, -330, 330, 220, (x) => 7.5 + 1.8 * Math.sin(x / 19) + 1.3 * Math.sin(x / 4.1 + 1) + 0.8 * Math.sin(x / 1.9), 1 / 13, '#5f8a5c'); // mangrove (K2, K4)

  // --- Houses ----------------------------------------------------------------------------------
  for (const h of S.houses) buildHouse(p, h, S.ground);
  const paints = ['#e0d2b4', '#8fb4c4', '#d9a48c', '#b8cfa2', '#e6dccb', '#c9b08c'];
  const roofs = ['#b45c3c', '#6f8fa8', '#9aa4a6', '#a8553a', '#7fa07c', '#b96a44'];
  for (let i = 0; i < S.farHouses; i++) {
    const x = -150 + i * 23 + (rand() - 0.5) * 9;
    buildHouse(p, { x, z: S.farBank + 2 + rand() * 5, ry: (rand() - 0.5) * 0.4, w: 7 + rand() * 3, d: 5 + rand(), stilts: 2.2, wall: paints[i % paints.length], roof: roofs[(i * 5 + 1) % roofs.length] }, S.water - 0.3, 0);
  }

  // --- Jetty and boats (K1, K2, K5) ------------------------------------------------------------
  const J = S.jetty;
  const deck = S.ground + 0.05;
  p.box('wall', J.w, 0.07, J.z0 - J.z1, J.x, deck, (J.z0 + J.z1) / 2, 0, '#a08a70');
  for (let z = J.z0 - 1; z > J.z1; z -= 2.4) {
    for (const s of [-1, 1]) p.box('wall', 0.12, deck - S.water + 0.6, 0.12, J.x + (s * J.w) / 2, (deck + S.water - 0.6) / 2, z, 0, '#5a4636');
  }
  for (const b of S.boats) buildBoat(p, b, S.water);

  // --- Coconut palms ---------------------------------------------------------------------------
  for (const t of S.palms) {
    const top = new THREE.Vector3(t.x + t.lean[0] * t.h * 0.3, S.ground + t.h, t.z + t.lean[1] * t.h * 0.3);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(t.x, S.ground - 0.2, t.z), new THREE.Vector3(t.x + t.lean[0] * t.h * 0.05, S.ground + t.h * 0.55, t.z + t.lean[1] * t.h * 0.05), top);
    p.add('trunk', new THREE.TubeGeometry(curve, 8, 0.14, 6, false), '#e0d6c4');
    const n = 12;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand() * 0.4;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      p.add('frond', leafStrip(top, dir, 2.7 + rand() * 1.0, 1.2, 0.35 + rand() * 0.25, 0.9 + rand() * 0.5, 0.35, (rand() - 0.5) * 0.6, 8));
    }
  }

  // --- Banana plants under the windows ---------------------------------------------------------
  for (const [bx, bz] of S.bananas) {
    const x = bx + (rand() - 0.5) * 0.5;
    const z = bz + (rand() - 0.5) * 0.5;
    const h = 2.3 + rand() * 0.6;
    p.add('crown', new THREE.CylinderGeometry(0.1, 0.16, h, 6).translate(x, S.ground + h / 2, z), '#8aa85a');
    const top = new THREE.Vector3(x, S.ground + h, z);
    const n = 6 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      p.add('banana', leafStrip(top, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 1.2 + rand() * 0.6, 0.5, 0.9 + rand() * 0.5, 0.9 + rand() * 0.6, 0.15, (rand() - 0.5) * 0.8, 8));
    }
  }

  // --- Fruit trees: a trunk, a few round crowns, and leaf-clump cards that break the outline ---
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const greens = ['#8fb86e', '#a6c676', '#82ab6c', '#b4cf7e'];
  for (const t of S.trees) {
    p.add('trunk', new THREE.CylinderGeometry(0.16, 0.26, t.h * 0.6, 6).translate(t.x, S.ground + t.h * 0.3, t.z), '#9a8468');
    const crowns = 4;
    for (let k = 0; k < crowns; k++) {
      const r = t.h * (0.22 + rand() * 0.1);
      const c = new THREE.Vector3(t.x + (rand() - 0.5) * t.h * 0.45, S.ground + t.h * (0.62 + rand() * 0.32), t.z + (rand() - 0.5) * t.h * 0.45);
      const color = new THREE.Color(greens[Math.floor(rand() * greens.length)]);
      const g = skyLit(blob.clone().scale(r, r * 0.8, r).translate(c.x, c.y, c.z), color);
      if (!p.map.has('crown')) p.map.set('crown', []);
      const flat = g.toNonIndexed();
      g.dispose();
      p.map.get('crown').push(flat); // keeps its own light-to-dark vertex colours
      for (let j = 0; j < 14; j++) {
        const d = new THREE.Vector3(rand() * 2 - 1, rand() * 1.6 - 0.5, rand() * 2 - 1).normalize();
        const s = r * (0.45 + rand() * 0.25);
        const card = new THREE.PlaneGeometry(s * 2, s * 2);
        card.lookAt(d);
        card.translate(c.x + d.x * r * 0.9, c.y + d.y * r * 0.72, c.z + d.z * r * 0.9);
        const nor = card.attributes.normal; // shade the card as part of the round crown
        for (let i = 0; i < nor.count; i++) nor.setXYZ(i, d.x, d.y, d.z);
        p.add('cards', card, color.clone().multiplyScalar(0.85 + 0.4 * Math.max(0, d.y)));
      }
    }
  }
  blob.dispose();

  group.add(...p.build(materials));

  // --- Sky: a painted dome; its horizon is the haze colour ------------------------------------
  const skyMat = new THREE.MeshBasicMaterial({ map: textures.sky, side: THREE.BackSide, fog: false, depthWrite: false });
  skyMat.color.setScalar(light);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(560, 32, 16), skyMat);
  sky.rotation.y = 2.4;
  sky.renderOrder = -1;
  disposables.push(skyMat);
  group.add(sky);

  group.traverse((o) => o.layers.set(1));
  let triangles = 0;
  group.traverse((o) => {
    if (o.geometry) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });

  return {
    group,
    stats: { triangles, meshes: group.children.length },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      for (const d of disposables) d.dispose();
    },
  };
}
