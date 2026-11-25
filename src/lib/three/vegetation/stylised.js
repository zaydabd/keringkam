// `?flora=stylised`: the approved stylised plants (vegetation/plants/*.js) stand at the proposed
// layout entries (house/garden/plants.js and outside/plants.js) instead of the markers. Each entry gets one copy of its plant,
// based at the entry's `at`, turned by its `yaw` and scaled so its height matches the entry's
// (satin pothos, the table's Schismatoglottis and the bougainvillea keep their modelled size).
// The level of detail is picked once per copy, by its distance from `eye` against the plant's
// `switchAt` (the camera stays near the window, so a static pick is enough), unless the entry names its own `lod`. Copies of the same
// plant, seed and level are baked into one mesh per material, so each costs no extra draw call.
// Sizes, seeds and the bush's footprint are design choices, tuned by eye.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plant as kuchingTree } from './plants/kuchingTree.js';
import { plant as pedada } from './plants/pedada.js';
import { plant as nipah } from './plants/nipah.js';
import { plant as satinPothos } from './plants/satinPothos.js';
import { plant as aglaonema } from './plants/aglaonema.js';
import { plant as bougainvillea } from './plants/bougainvillea.js';
import { plant as schismatoglottis } from './plants/schismatoglottis.js';
import { createTree } from './tree.js';
import { FOLIAGE_SUN } from './celFoliage.js';

/**
 * The `?flora=` flag: 'stylised' (the stylised plants, vegetation/stylised.js; the default, the user's
 * choice, 25 Nov 2026) or null (?flora=off).
 */
export function floraMode(params) {
  const f = params.get('flora') ?? 'stylised';
  return f === 'stylised' ? f : null;
}

// The oak bush preset (vegetation/tree.js) as a plant: one level of detail, used near and far.
const oakBush = { id: 'oakBush', label: 'Oak bush', create: ({ seed }) => createTree({ seed, kind: 'oakBush' }), switchAt: Infinity };

// Layout group → plant. Groups not listed (the rubber plant, trailing markers, grass, fern, the
// window vines that already exist) get nothing.
const PLANT_OF = [
  [/^proposed: rain tree/, kuchingTree], // the user's Kuching trees: rain tree, kapok, trumpet tree
  [/^proposed: pedada/, pedada],
  [/^proposed: nipah/, nipah],
  [/^proposed: Chinese evergreen \(floor\)$/, aglaonema],
  [/^proposed: Chinese evergreen \(table\)$/, schismatoglottis], // the user's choice: the Schismatoglottis on the table
  [/^proposed: satin pothos \((stand|ledge)\)$/, satinPothos],
  [/^proposed: bougainvillea/, bougainvillea], // outside the middle window (outside/index.js)
  [/^proposed: step planting \(oak bush\)$/, oakBush], // by the Assembly's side stairs
  [/^proposed: step planting \(bougainvillea\)$/, bougainvillea],
];
// Drawn at the size their session modelled them, not scaled to the entry's height. Scaling also
// scales the leaf and bract cards: the bougainvillea's 11 cm bracts (its session's own size) grew
// to 18 cm, which the user saw as roses too big.
const NATURAL_SIZE = new Set([satinPothos.id, schismatoglottis.id, bougainvillea.id]);
// Plants that bring their own pot: they stand on the named planter's base, and its box is not drawn.
const OWN_POT = [[/^proposed: Chinese evergreen \(table\)$/, /^proposed: table pot/]];
// A `faceEye` entry is turned so its lit side (the plants shade the side towards FOLIAGE_SUN
// lighter, in model space) faces the eye, give or take FACE_SPREAD radians (design choice).
const FACE_SPREAD = 0.35;
const SUN_YAW = Math.atan2(FOLIAGE_SUN.x, FOLIAGE_SUN.z);
const SEEDS = 5; // seeds per plant, reused round the copies: each a different branching and leaf spread
const POTHOS_SPACING = 0.35; // m between pothos along a ledge trough

// How each vertex attribute moves with a copy: points, directions, or view-space card offsets
// (`corner`, in metres, which the model matrix does not scale).
const POINTS = ['position', 'centre'];
const DIRECTIONS = ['normal', 'proxyNormal', 'tanU', 'tanV', 'face', 'tangent'];
const SCALED = ['corner'];

function bake(geometry, matrix, rotation, scale) {
  const g = geometry.clone();
  for (const [name, attr] of Object.entries(g.attributes)) {
    if (POINTS.includes(name)) attr.applyMatrix4(matrix);
    else if (DIRECTIONS.includes(name)) attr.applyMatrix3(rotation);
    else if (SCALED.includes(name)) for (let i = 0; i < attr.array.length; i++) attr.array[i] *= scale;
    else continue;
    attr.needsUpdate = true;
  }
  return g;
}

/** Turns layout entries into copies: [{ plant, at, yaw, height, index }]. */
function copiesOf(entries, eye) {
  const out = [];
  entries.forEach((e, index) => {
    const plant = PLANT_OF.find(([re]) => re.test(e.group))?.[1];
    if (!plant) return;
    if (plant === satinPothos) {
      // A ledge trough is longer than one pothos: one every POTHOS_SPACING along it.
      const n = Math.max(1, Math.round(e.width / POTHOS_SPACING));
      for (let i = 0; i < n; i++) {
        const dx = (i - (n - 1) / 2) * (e.width / n);
        out.push({ plant, at: [e.at[0] + dx, e.at[1], e.at[2]], yaw: (index + i) * 2.1, height: e.height, squash: 1, index: index + i });
      }
      return;
    }
    const potRe = OWN_POT.find(([re]) => re.test(e.group))?.[1];
    const pot = potRe && entries.find((p) => p.kind === 'planter' && potRe.test(p.group));
    const at = pot ? [e.at[0], pot.at[1], e.at[2]] : e.at;
    let yaw = e.yaw ?? index * 2.1;
    if (e.faceEye && eye) yaw = Math.atan2(eye[0] - at[0], eye[2] - at[2]) - SUN_YAW + (((yaw % 1) + 1) % 1 - 0.5) * 2 * FACE_SPREAD;
    out.push({ plant, at, yaw, height: e.height, squash: e.squash ?? 1, index, lod: e.lod, leaves: e.leaves });
  });
  return out;
}

/**
 * The plants for `entries`, plus a plain box for each planter entry (except the rubber plant's
 * pot: that plant was cancelled). `eye` picks each copy's level (null: all near). `layer` is
 * enabled on every mesh (the river's mirror). Returns { group, stats, dispose }.
 */
export function buildFloraStylised(entries, { eye = null, layer } = {}) {
  const root = new THREE.Group();
  root.name = 'flora-stylised';
  const models = new Map(); // `${id}|${seed}|${lod}|${leaves}` → { result, height, list: [copy] }
  const eyeV = eye && new THREE.Vector3(...eye);
  for (const c of copiesOf(entries, eye)) {
    const lod = c.lod ?? (eyeV && eyeV.distanceTo(new THREE.Vector3(...c.at)) > c.plant.switchAt ? 'far' : 'near'); // an entry's own `lod` wins
    const seed = 1 + (c.index % SEEDS);
    const key = `${c.plant.id}|${seed}|${lod}|${c.leaves ?? 1}`;
    if (!models.has(key)) {
      const result = c.plant.create({ seed, lod, leaves: c.leaves }); // `leaves`: a factor on the leaf clumps' size, where the plant takes one
      result.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(result.group);
      models.set(key, { result, top: box.max.y, list: [] });
    }
    models.get(key).list.push(c);
  }

  const disposables = [];
  const stats = { copies: {}, triangles: 0, meshes: 0 };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), rot = new THREE.Matrix3();
  for (const [key, { result, top, list }] of models) {
    const [id, , lod] = key.split('|');
    stats.copies[`${id} ${lod}`] = (stats.copies[`${id} ${lod}`] ?? 0) + list.length;
    const parts = [];
    result.group.traverse((o) => o.isMesh && parts.push(o));
    for (const part of parts) {
      const baked = list.map((c) => {
        const s = NATURAL_SIZE.has(id) ? 1 : c.height / top;
        q.setFromAxisAngle(up, c.yaw);
        // `squash` narrows a copy across (x, z) without lowering it; card corners follow the height.
        m.compose(new THREE.Vector3(...c.at), q, new THREE.Vector3(s * c.squash, s, s * c.squash)).multiply(part.matrixWorld);
        rot.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q).multiply(new THREE.Matrix4().extractRotation(part.matrixWorld)));
        return bake(part.geometry, m, rot, s);
      });
      const geometry = baked.length > 1 ? mergeGeometries(baked) : baked[0];
      if (baked.length > 1) baked.forEach((g) => g.dispose());
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, part.material);
      mesh.name = `${key} ${part.name}`;
      mesh.frustumCulled = true;
      if (layer != null) mesh.layers.enable(layer);
      root.add(mesh);
      disposables.push(geometry);
      stats.triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
      stats.meshes++;
    }
    disposables.push(result); // its materials (and its own geometries)
  }

  // Planters and the plant stand: plain boxes, the neutral grey of unglazed pots.
  const rubber = entries.find((e) => /rubber plant/.test(e.group));
  const ownPots = OWN_POT.filter(([re]) => entries.some((e) => re.test(e.group))).map(([, potRe]) => potRe);
  const pots = entries.filter((e) => e.kind === 'planter' && !(rubber && e.at[0] === rubber.at[0] && e.at[2] === rubber.at[2]) && !ownPots.some((re) => re.test(e.group)));
  if (pots.length) {
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#9a8f84', roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geo, mat, pots.length);
    mesh.name = 'flora-stylised pots';
    pots.forEach((e, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(...e.at), q.setFromAxisAngle(up, e.yaw ?? 0), new THREE.Vector3(e.width, e.height, e.depth ?? e.width))));
    if (layer != null) mesh.layers.enable(layer);
    root.add(mesh);
    disposables.push(geo, mat);
    stats.meshes++;
  }
  return { group: root, stats, dispose: () => disposables.forEach((d) => d.dispose()) };
}
