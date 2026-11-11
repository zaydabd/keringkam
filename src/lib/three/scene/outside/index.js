// What you see out of the windows of the Sarawak Malay house (#/interior): the Sarawak River at
// Kuching, with the Darul Hana Bridge and the State Legislative Assembly building on the far bank.
//
// Reference R3 (a painting supplied by the user; not in the repo) gives the view and its look: a
// muddy river curving past the house, a mud-and-grass bank on our side, a mown embankment and
// trees on the far side, two roofed boats, the bridge on the left, the gold-roofed Assembly
// building on the right, blue sky with cumulus. site.js holds the layout (estimates read off the
// painting); sourced sizes are in assembly.js and bridge.js.
//
// The view is built object by object, each after its skill in .claude/skills:
//   farbank, nearbank  banks.js     procedural-geometry (swept cross-sections, contracts)
//   trees              trees.js     procedural-vegetation
//   river              water.js     water-optics
//   assembly, bridge, skyline, boats: the first versions, moved to the new river; not rebuilt yet.
// `stage` (a list of the names above, plus 'sky') builds only those, to look at one object alone.
// The solids are on layer 0, so the ink pass outlines them like the room; the sky is on layer 1.
// All solids share one flat paint material: a part is one colour, and the ink pass draws a seam
// where two colours meet (toon.js). The haze is the scene fog.

import * as THREE from 'three';
import { paintSoftSky, paintWater, paintZinc } from '../paint.js';
import { SlotWriter, createContract } from './contract.js';
import { SITE, mulberry32, rgb } from './site.js';
import { buildFarBank, buildNearBank } from './banks.js';
import { planAssembly, compileAssembly } from './assembly.js';
import { buildBridge } from './bridge.js';
import { createWaterMaterial } from './water.js';

export { SITE };
export const OBJECTS = ['farbank', 'nearbank', 'trees', 'river', 'assembly', 'bridge', 'skyline', 'boats', 'sky'];

// The sky is keyed down like the rest of the outdoors (see OUTSIDE_KEY in interior.js), so its
// blue survives an exposure set for the shaded room.
export const SKY_KEY = 0.3;

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
    if (prev) for (let k = 0; k < 4; k++) w.quad('paint', prev[k], ring[k], ring[(k + 1) % 4], prev[(k + 1) % 4], hull);
    prev = ring;
  }
  const ax = (len) => [c * len, 0, -s * len];
  const az = (len) => [s * len, 0, c * len];
  w.box('paint', at(0, 0.36, 0), ax(L * 0.36), [0, 0.03, 0], az(W * 0.42), rgb('#b08a62')); // deck boards
  for (const dx of [-2.1, 2.1]) for (const dz of [-0.6, 0.6]) w.box('paint', at(dx, 1.1, dz), ax(0.04), [0, 0.72, 0], az(0.04), rgb('#6a4a34'));
  w.box('paint', at(0, 1.86, 0), ax(2.5), [0, 0.05, 0], az(0.82), rgb('#efe6d0')); // canopy
  w.box('paint', at(0, 0.5, 0), ax(L * 0.34), [0, 0.05, 0], az(W * 0.5 + 0.02), rgb('#c9a37a')); // gunwale strip
}

/**
 * Builds the outside. `fog` is the scene's fog (the daylight haze: the sky's horizon and the
 * water use its colour too); `light` scales what gives off its own light, to match the scene's
 * lamps; `key` darkens the outdoor paint so it keeps its colour next to a room exposed for
 * shade; `mode` 'flat' or 'silhouette' are the checks the geometry skill asks for; `stage` lists
 * the objects to build (default: all).
 */
export function createOutside({ gradientMap, seed = 0, fog, haze = '#f4faea', light = 1, key = 1, sun, mode, stage }) {
  const rand = mulberry32(51 + seed);
  const group = new THREE.Group();
  const disposables = [];
  const S = SITE;
  const reports = {};
  const w = new SlotWriter();
  const want = (name) => !stage || stage.includes(name);
  const copy = (from, to, dx = 0, dy = 0, dz = 0) => {
    const dst = w.slot(to);
    for (let i = 0; i < from.position.length; i += 3) dst.position.push(from.position[i] + dx, from.position[i + 1] + dy, from.position[i + 2] + dz);
    dst.normal.push(...from.normal);
    dst.uv.push(...from.uv);
    dst.color.push(...from.color);
    dst.triangles += from.triangles;
  };

  // --- The banks (banks.js) ---------------------------------------------------------------------
  if (want('farbank')) reports.farbank = buildFarBank(w, { seed });
  if (want('nearbank')) reports.nearbank = buildNearBank(w, { seed });

  // --- Assembly building (planned, then compiled; not rebuilt yet) -----------------------------
  if (want('assembly')) {
    const building = new SlotWriter();
    reports.assembly = compileAssembly(planAssembly(), building);
    const slotOf = { gold: 'gold', rib: 'paint', glass: 'paint', stone: 'paint' }; // scene materials by role
    for (const [name, s] of building.slots) copy(s, slotOf[name], S.assembly.x, S.lawn, S.assembly.z);
  }

  // --- Bridge (checked against its contract; not rebuilt yet) ----------------------------------
  if (want('bridge')) {
    const steel = new SlotWriter();
    reports.bridge = buildBridge(steel, { points: S.bridge, water: S.water, bankY: S.ground });
    copy(steel.slot('steel'), 'paint');
  }

  // --- City skyline, far behind the trees (not rebuilt yet) ------------------------------------
  if (want('skyline')) {
    const K = S.skyline;
    for (let i = 0; i < K.count; i++) {
      const x = K.x0 + ((K.x1 - K.x0) * (i + rand() * 0.8)) / K.count;
      const h = 14 + rand() * 38;
      const bw = 6 + rand() * 7;
      const tone = 0.74 + rand() * 0.14;
      w.box('paint', [x, S.lawn + h / 2, K.z - rand() * 60], [bw, 0, 0], [0, h / 2, 0], [0, 0, bw], [tone * 0.92, tone * 0.97, tone * 1.05]);
    }
  }

  // --- Boats (not rebuilt yet) ------------------------------------------------------------------
  if (want('boats')) for (const b of S.boats) buildBoat(w, b, S.water);

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
    water: paintWater(22 + seed),
    zinc: paintZinc(24 + seed),
  };
  disposables.push(...Object.values(textures));
  const toon = ({ map, side = THREE.FrontSide } = {}) => {
    let m;
    if (mode === 'silhouette') m = new THREE.MeshBasicMaterial({ color: '#000000', fog: false, side });
    else if (mode === 'flat') m = new THREE.MeshToonMaterial({ gradientMap, color: '#bdbdbd', side });
    else {
      m = new THREE.MeshToonMaterial({ gradientMap, vertexColors: true, side, map: map ?? null });
      m.color.multiplyScalar(key);
    }
    disposables.push(m);
    return m;
  };
  const materials = {
    paint: toon(),
    blade: toon({ side: THREE.DoubleSide }),
    gold: toon({ map: textures.zinc, side: THREE.DoubleSide }),
  };
  for (const name of Object.keys(materials)) {
    if (!w.slots.has(name)) continue;
    const mesh = new THREE.Mesh(geometry(name), materials[name]);
    mesh.name = name;
    group.add(mesh);
  }

  // --- The river: one plane at the water level, under both banks' toes (water.js) --------------
  const E = S.extent;
  const water = createWaterMaterial({ map: textures.water, horizon: haze, zenith: '#3f8fe6', fog, light: light * SKY_KEY, key, sun });
  disposables.push(water);
  if (want('river')) {
    const river = new THREE.PlaneGeometry(E.x1 - E.x0, E.z1 - E.z0, 1, 1).rotateX(-Math.PI / 2).translate((E.x0 + E.x1) / 2, S.water, (E.z0 + E.z1) / 2);
    const uv = river.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((E.x1 - E.x0) / 70), uv.getY(i) * ((E.z1 - E.z0) / 230));
    river.setAttribute('color', new THREE.Float32BufferAttribute(new Array(uv.count * 3).fill(0.5), 3)); // one part, for the ink pass
    const riverMesh = new THREE.Mesh(river, mode === 'silhouette' ? new THREE.MeshBasicMaterial({ color: '#8a8a8a', fog: false }) : water);
    riverMesh.name = 'water';
    group.add(riverMesh);
  }

  // --- Sky: a painted dome; its horizon is the haze colour (layer 1: no ink) -------------------
  if (want('sky')) {
    const skyMat = new THREE.MeshBasicMaterial({ map: mode === 'silhouette' ? null : textures.sky, color: '#ffffff', side: THREE.BackSide, fog: false, depthWrite: false });
    skyMat.color.setScalar(mode === 'silhouette' ? light * 2 : light * SKY_KEY);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1300, 32, 16), skyMat);
    sky.rotation.y = 1.1 + seed;
    sky.renderOrder = -1;
    sky.name = 'sky';
    sky.layers.set(1);
    disposables.push(skyMat);
    group.add(sky);
  }

  // What was built: triangles per mesh, against the budget.
  const triangles = {};
  let total = 0;
  for (const m of group.children) {
    const n = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    triangles[m.name] = n;
    total += n;
  }
  const budget = createContract('outside budget');
  budget.max('triangles', total, 60000);
  budget.max('meshes (draw calls)', group.children.length, 10);
  reports.budget = { contract: budget.assert() };

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
