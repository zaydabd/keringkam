// What you see out of the windows of the Sarawak Malay house (#/interior): the Sarawak River at
// Kuching, with the Darul Hana Bridge and the State Legislative Assembly building on the far bank.
//
// Reference R3 (a painting supplied by the user; not in the repo) gives the view and its look:
// a wide muddy river, two roofed boats, the bridge on the left, trees and a small skyline in the
// middle, the gold-roofed Assembly building on a green lawn on the right, blue sky with cumulus.
// Sourced sizes are in assembly.js and bridge.js; every position here is a design choice
// (research/INTERIOR-NOTES.md, "Outside the windows").
//
// Each part follows its skill in .claude/skills: the building is planned then compiled
// (assembly.js), the bridge is measured against a contract (bridge.js), the trees are grown
// (trees.js), the river has a wave model (water.js). Everything is merged to one mesh per
// material and put on layer 1 (no ink outline: a painted backdrop). The haze is the scene fog.

import * as THREE from 'three';
import { leafStrip } from '../landscape.js';
import { toonGradient } from '../toon.js';
import { paintSoftSky, paintBananaLeaf, paintLeafClump, paintGround, paintWater, paintZinc } from '../paint.js';
import { SlotWriter, createContract } from './contract.js';
import { planAssembly, compileAssembly } from './assembly.js';
import { buildBridge } from './bridge.js';
import { growTree } from './trees.js';
import { createWaterMaterial } from './water.js';

// Metres. The room's window wall is at z = -5.5, its floor at y = 0; the seat looks along -z.
export const SITE = {
  ground: -1.85, // the house stands on 1.85 m stilts
  water: -3.2,
  south: -24, // z of our bank's edge
  north: -250, // z of the far bank's river wall
  lawn: 4, // height of the lawn terrace behind the far bank
  // South landing, the two tower piers, north landing. From the seat the towers stand in the left
  // and middle windows (bearings -25 and -8 degrees).
  bridge: [[-146, -28], [-63, -136], [-26, -183], [18, -252]],
  assembly: { x: 62, z: -335 }, // in the right-hand window from the seat (bearing 11 degrees)
  skyline: { z: -520, x0: -150, x1: 20, count: 15 },
  boats: [
    { x: -9, z: -52, ry: 0.35 },
    { x: -30, z: -88, ry: -0.2 },
  ],
  bananas: [[-5.8, -8.4], [3.0, -2.2], [3.4, -0.6]],
  nearTrees: [
    { x: -24, z: -19, scale: 1.25 },
    { x: -58, z: -17, scale: 1.5 },
  ],
};

// The sky is keyed down like the rest of the outdoors (see OUTSIDE_KEY in interior.js), so its
// blue survives an exposure set for the shaded room.
export const SKY_KEY = 0.3;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgb = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

/** A roofed river boat (tambang): a hull drawn in to both ends, benches, a long canopy on posts (R3). */
function buildBoat(w, b, y) {
  const L = 7.5;
  const W = 1.5;
  const c = Math.cos(b.ry), s = Math.sin(b.ry);
  const at = (dx, dy, dz) => [b.x + dx * c + dz * s, y + dy, b.z - dx * s + dz * c];
  const hull = rgb('#8a5a3a');
  const stations = 8;
  let prev = null;
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const half = (W / 2) * (1 - Math.abs(2 * t - 1) ** 2.4) + 0.04;
    const sheer = Math.abs(2 * t - 1) ** 3 * 0.45; // the ends rise
    const x = (t - 0.5) * L;
    const ring = [at(x, -0.25, -half * 0.55), at(x, -0.25, half * 0.55), at(x, 0.42 + sheer, half), at(x, 0.42 + sheer, -half)];
    if (prev) for (let k = 0; k < 4; k++) w.quad('plaster', prev[k], ring[k], ring[(k + 1) % 4], prev[(k + 1) % 4], hull);
    prev = ring;
  }
  const ax = (len) => [c * len, 0, -s * len];
  const az = (len) => [s * len, 0, c * len];
  w.box('plaster', at(0, 0.36, 0), ax(L * 0.36), [0, 0.03, 0], az(W * 0.42), rgb('#b08a62')); // deck boards
  for (const dx of [-2.1, 2.1]) for (const dz of [-0.6, 0.6]) w.box('plaster', at(dx, 1.1, dz), ax(0.04), [0, 0.72, 0], az(0.04), rgb('#6a4a34'));
  w.box('plaster', at(0, 1.86, 0), ax(2.5), [0, 0.05, 0], az(0.82), rgb('#efe6d0')); // canopy
  w.box('plaster', at(0, 0.5, 0), ax(L * 0.34), [0, 0.05, 0], az(W * 0.5 + 0.02), rgb('#c9a37a')); // gunwale strip
}

/**
 * Builds the outside. `fog` is the scene's fog (the daylight haze: the sky's horizon and the
 * water use its colour too); `light` scales what gives off its own light, to match the scene's
 * lamps; `key` darkens the outdoor paint so it keeps its colour next to a room exposed for
 * shade; `mode` 'flat' or 'silhouette' are the checks the architecture skill asks for.
 */
export function createOutside({ gradientMap, seed = 0, fog, haze = '#f4faea', light = 1, key = 1, sun, mode }) {
  const rand = mulberry32(51 + seed);
  const group = new THREE.Group();
  const disposables = [];
  const S = SITE;
  const reports = {};
  const w = new SlotWriter();

  // --- Land -------------------------------------------------------------------------------------
  // Our bank: level under and around the house, then a short slope to the mud.
  const strip = (slot, x0, x1, profile, color, nx = 24) => {
    // sweeps a (z, y) profile along x: a bank is one form, not a pile of boxes
    for (let i = 0; i < nx; i++) {
      const xa = x0 + ((x1 - x0) * i) / nx, xb = x0 + ((x1 - x0) * (i + 1)) / nx;
      for (let k = 0; k < profile.length - 1; k++) {
        const [z0, y0] = profile[k], [z1, y1] = profile[k + 1];
        w.quad(slot, [xa, y0, z0], [xb, y0, z0], [xb, y1, z1], [xa, y1, z1], color, [[xa / 8, z0 / 8], [xb / 8, z0 / 8], [xb / 8, z1 / 8], [xa / 8, z1 / 8]]);
      }
    }
  };
  const grass = [0.82, 1.0, 0.62]; // over the painted grass: a fresher green (the grade takes some colour out again)
  strip('ground', -420, 420, [[60, S.ground], [S.south + 4, S.ground], [S.south + 1.5, S.ground - 0.5], [S.south - 3, S.water - 0.6]], grass);
  // The far bank: a pale river wall, then a lawn rising to the terrace the Assembly stands on.
  strip('plaster', -700, 700, [[S.north + 1, S.water - 1], [S.north, S.water + 2.4]], rgb('#d9d2bf'), 8);
  strip('ground', -700, 700, [[S.north, S.water + 2.4], [S.north - 3, S.water + 2.5], [S.north - 42, S.lawn], [S.north - 520, S.lawn]], [0.78, 1.0, 0.56], 28);

  // --- Assembly building (planned, then compiled) ---------------------------------------------
  const building = new SlotWriter();
  reports.assembly = compileAssembly(planAssembly(), building);
  const slotOf = { gold: 'gold', rib: 'plaster', glass: 'plaster', stone: 'plaster' }; // scene materials by role
  for (const [name, s] of building.slots) {
    const dst = w.slot(slotOf[name]);
    for (let i = 0; i < s.position.length; i += 3) dst.position.push(s.position[i] + S.assembly.x, s.position[i + 1] + S.lawn, s.position[i + 2] + S.assembly.z);
    dst.normal.push(...s.normal);
    dst.uv.push(...s.uv);
    dst.color.push(...s.color);
    dst.triangles += s.triangles;
  }

  // --- Bridge (checked against its contract) ---------------------------------------------------
  const steel = new SlotWriter();
  reports.bridge = buildBridge(steel, { points: S.bridge, water: S.water, bankY: S.ground });
  {
    const s = steel.slot('steel');
    const dst = w.slot('plaster');
    dst.position.push(...s.position);
    dst.normal.push(...s.normal);
    dst.uv.push(...s.uv);
    dst.color.push(...s.color);
    dst.triangles += s.triangles;
  }

  // --- City skyline, far behind the trees (R3) -------------------------------------------------
  const K = S.skyline;
  for (let i = 0; i < K.count; i++) {
    const x = K.x0 + ((K.x1 - K.x0) * (i + rand() * 0.8)) / K.count;
    const h = 14 + rand() * 38;
    const bw = 6 + rand() * 7;
    const tone = 0.74 + rand() * 0.14;
    w.box('plaster', [x, S.lawn + h / 2, K.z - rand() * 60], [bw, 0, 0], [0, h / 2, 0], [0, 0, bw], [tone * 0.92, tone * 0.97, tone * 1.05]);
  }

  // --- Boats -----------------------------------------------------------------------------------
  for (const b of S.boats) buildBoat(w, b, S.water);

  // --- Trees (grown) ---------------------------------------------------------------------------
  const greens = ['#5fae48', '#7cc452', '#52a04a', '#93cf58'];
  const variants = { near: [0, 1].map(() => growTree(rand, undefined, 'near')), far: [0, 1, 2].map(() => growTree(rand, undefined, 'far')) };
  const placeTree = (tree, x, y, z, scale, ry) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (a, i) => [x + (a[i] * c + a[i + 2] * s) * scale, y + a[i + 1] * scale, z + (-a[i] * s + a[i + 2] * c) * scale];
    const N = (a, i) => [a[i] * c + a[i + 2] * s, a[i + 1], -a[i] * s + a[i + 2] * c];
    const green = rgb(greens[Math.floor(rand() * greens.length)]);
    const each = (part, fn) => {
      for (let i = 0; i < part.position.length; i += 9) fn(i);
    };
    each(tree.wood, (i) => w.smoothTri('plaster', [P(tree.wood.position, i), P(tree.wood.position, i + 3), P(tree.wood.position, i + 6)], [N(tree.wood.normal, i), N(tree.wood.normal, i + 3), N(tree.wood.normal, i + 6)], null, [0.5, 0.4, 0.3]));
    each(tree.crown, (i) => {
      const ns = [N(tree.crown.normal, i), N(tree.crown.normal, i + 3), N(tree.crown.normal, i + 6)];
      // lighter on top, darker underneath, so the crown reads as round against the light
      w.smoothTri('crown', [P(tree.crown.position, i), P(tree.crown.position, i + 3), P(tree.crown.position, i + 6)], ns, null, ns.map((n) => green.map((v) => v * (0.7 + 0.45 * Math.max(0, n[1])))));
    });
    each(tree.leaf, (i) => {
      const v = i / 3;
      const uv = [0, 1, 2].map((k) => [tree.leaf.uv[(v + k) * 2], tree.leaf.uv[(v + k) * 2 + 1]]);
      w.smoothTri('leaf', [P(tree.leaf.position, i), P(tree.leaf.position, i + 3), P(tree.leaf.position, i + 6)], [N(tree.leaf.normal, i), N(tree.leaf.normal, i + 3), N(tree.leaf.normal, i + 6)], uv, [0, 1, 2].map((k) => green.map((g) => g * tree.leaf.shade[v + k])));
    });
  };
  for (const t of S.nearTrees) placeTree(variants.near[Math.floor(rand() * 2)], t.x, S.ground, t.z, t.scale, rand() * 6.28);
  const farSpots = [];
  for (let i = 0; i < 17; i++) farSpots.push([-250 + i * 14.5 + (rand() - 0.5) * 8, S.north - 10 - rand() * 26]); // the tree mass between the bridge and the Assembly
  for (let i = 0; i < 6; i++) farSpots.push([150 + i * 22 + (rand() - 0.5) * 10, S.north - 12 - rand() * 30]); // beyond the Assembly
  for (let i = 0; i < 5; i++) farSpots.push([-165 + i * 13 + (rand() - 0.5) * 6, S.south - 14 + (rand() - 0.5) * 6 + 22]); // by the south landing, on our bank
  for (const [x, z] of farSpots) {
    const onNorth = z < S.north;
    const y = onNorth ? S.water + 2.5 + ((S.lawn - S.water - 2.5) * Math.min(1, (S.north - 3 - z) / 39)) : S.ground;
    placeTree(variants.far[Math.floor(rand() * 3)], x, y, z, 1.5 + rand() * 0.6, rand() * 6.28);
  }
  reports.trees = { near: variants.near.map((t) => t.report), far: variants.far.map((t) => t.report), placed: { near: S.nearTrees.length, far: farSpots.length } };

  // --- Geometry per material -------------------------------------------------------------------
  const geometry = (name) => {
    const s = w.slot(name);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(s.normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(s.color, 3));
    return g;
  };
  const hazeStyle = new THREE.Color(haze).getStyle().slice(4, -1);
  const textures = {
    sky: paintSoftSky(25 + seed, { haze: hazeStyle, vivid: true }),
    ground: paintGround(21 + seed),
    water: paintWater(22 + seed),
    zinc: paintZinc(24 + seed),
    banana: paintBananaLeaf(),
    clump: paintLeafClump(),
  };
  disposables.push(...Object.values(textures));
  // Leaves seen against the light glow green: their shaded side stays light and green, not grey.
  const leafRamp = toonGradient([[0.74, 0.86, 0.66], [0.9, 0.94, 0.82], [1.0, 0.98, 0.9]], { smooth: true });
  disposables.push(leafRamp);
  const toon = (opts) => {
    let m;
    if (mode === 'silhouette') m = new THREE.MeshBasicMaterial({ color: '#000000', fog: false, side: opts.side, alphaTest: opts.alphaTest, map: opts.alphaTest ? opts.map : null });
    else if (mode === 'flat') m = new THREE.MeshToonMaterial({ gradientMap, color: '#bdbdbd', side: opts.side, alphaTest: opts.alphaTest, map: opts.alphaTest ? opts.map : null });
    else {
      m = new THREE.MeshToonMaterial({ gradientMap, vertexColors: true, ...opts });
      m.color.multiplyScalar(key);
    }
    disposables.push(m);
    return m;
  };
  const water = createWaterMaterial({ map: textures.water, horizon: haze, zenith: '#3f8fe6', fog, light: light * SKY_KEY, key, sun });
  disposables.push(water);
  const materials = {
    ground: toon({ map: textures.ground }),
    plaster: toon({}),
    gold: toon({ map: textures.zinc, side: THREE.DoubleSide }),
    crown: toon({ gradientMap: leafRamp }),
    leaf: toon({ map: textures.clump, alphaTest: 0.5, gradientMap: leafRamp, side: THREE.DoubleSide }),
    banana: toon({ map: textures.banana, alphaTest: 0.5, side: THREE.DoubleSide, color: '#b4d890', gradientMap: leafRamp }),
  };
  for (const name of ['ground', 'plaster', 'gold', 'crown', 'leaf']) {
    const mesh = new THREE.Mesh(geometry(name), materials[name]);
    mesh.name = name;
    group.add(mesh);
  }

  // --- The river: one plane, bank to bank (water.js) -------------------------------------------
  const width = S.south - S.north + 8;
  const river = new THREE.PlaneGeometry(1400, width, 1, 1).rotateX(-Math.PI / 2).translate(0, S.water, S.north + width / 2 - 2);
  {
    const uv = river.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 20);
  }
  const riverMesh = new THREE.Mesh(river, mode === 'silhouette' ? new THREE.MeshBasicMaterial({ color: '#8a8a8a', fog: false }) : water);
  riverMesh.name = 'water';
  group.add(riverMesh);

  // --- Banana plants by the house (kept low and to the sides: the view stays open) -------------
  const leaves = [];
  for (const [bx, bz] of S.bananas) {
    const h = 2.2 + rand() * 0.5;
    const top = new THREE.Vector3(bx, S.ground + h, bz);
    const n = 6 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      leaves.push(leafStrip(top, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 1.2 + rand() * 0.6, 0.5, 0.9 + rand() * 0.5, 0.9 + rand() * 0.6, 0.15, (rand() - 0.5) * 0.8, 8));
    }
  }
  const banana = new THREE.BufferGeometry();
  {
    const pos = [], nor = [], uvs = [], col = [];
    for (const g of leaves) {
      const ng = g.toNonIndexed();
      pos.push(...ng.attributes.position.array);
      nor.push(...ng.attributes.normal.array);
      uvs.push(...ng.attributes.uv.array);
      for (let i = 0; i < ng.attributes.position.count; i++) col.push(1, 1, 1);
      ng.dispose();
      g.dispose();
    }
    banana.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    banana.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    banana.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    banana.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const bananaMesh = new THREE.Mesh(banana, materials.banana);
  bananaMesh.name = 'banana';
  group.add(bananaMesh);

  // --- Sky: a painted dome; its horizon is the haze colour ------------------------------------
  const skyMat = new THREE.MeshBasicMaterial({ map: mode === 'silhouette' ? null : textures.sky, color: '#ffffff', side: THREE.BackSide, fog: false, depthWrite: false });
  if (mode !== 'silhouette') skyMat.color.setScalar(light * SKY_KEY);
  else skyMat.color.setScalar(light * 2);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
  sky.rotation.y = 1.1 + seed;
  sky.renderOrder = -1;
  sky.name = 'sky';
  disposables.push(skyMat);
  group.add(sky);

  group.traverse((o) => o.layers.set(1));

  // What was built: triangles per mesh, against the budget.
  const triangles = {};
  let total = 0;
  for (const m of group.children) {
    const n = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    triangles[m.name] = n;
    total += n;
  }
  const budget = createContract('outside budget');
  budget.max('triangles', total, 40000);
  budget.max('meshes (draw calls)', group.children.length, 10);
  reports.budget = budget.assert();

  return {
    group,
    reports,
    stats: { triangles: total, meshes: group.children.length, perMesh: triangles },
    /** Moves the water. t in seconds. */
    update(t) {
      water.uniforms.uTime.value = t;
    },
    setWaterView(v) {
      water.uniforms.uView.value = v;
    },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      for (const d of disposables) d.dispose();
    },
  };
}
