// What you see out of the windows of the Sarawak Malay house (#/interior): the Sarawak River at
// Kuching, with the Darul Hana Bridge and the State Legislative Assembly building on the far bank.
//
// Reference R3 (a painting supplied by the user; not in the repo) gives the view and its look: a
// muddy river curving past the house, a mown embankment on the far side, two roofed boats, the bridge on the left, the gold-roofed Assembly
// building on the right, blue sky with cumulus. site.js holds the layout (estimates read off the
// painting); sourced sizes are in assembly.js and bridge.js. Our own bank is the Kuching
// Waterfront's street and railing (pass e11, the user's choice and photos; waterfront.js). The
// house's garden (garden.js) replaced the old painted bush below the window.
//
// The view is built object by object, each after its skill in .claude/skills:
//   farbank            banks.js     procedural-geometry (swept cross-sections, contracts)
//   forecourt          forecourt.js procedural-architecture (the Assembly's river front; pass e7)
//   waterfront         waterfront.js procedural-geometry (pass e11: our side's street and railing)
//   river              water.js     water-optics
//   assembly: rebuilt from the user's Sketchfab model (pass w5, research/INTERIOR-NOTES.md).
//   boats: Kuching river taxis (penambang) in boats.js, gated against photos (pass w6).
//   bridge: the first version, moved to the new river; not rebuilt yet.
//   skyline: removed in pass e7 (the user's far-bank renders and the river-front photo show trees there).
//   trees: the far bank's trees, palms and bushes (trees.js), removed in pass e14 (the user found them
//     ugly; see git history before that pass).
// `stage` (a list of the names above, plus 'sky') builds only those, to look at one object alone.
// The solids are on layer 0, so the ink pass outlines them like the room; the sky is on layer 1.
// All solids share one flat paint material: a part is one colour, and the ink pass draws a seam
// where two colours meet (toon.js). The haze is the scene fog.

import * as THREE from 'three';
import { paintPaving, paintAssembly, paintStylized, styleGain } from './paint.js';
import { paintSoftSky } from './sky.js';
import { SlotWriter, createContract } from './contract.js';
import { SITE, WINDOW_EYE } from '../world/site.js';
import { mulberry32 } from '../../../utils/rng.js';
import { buildForecourt, forecourtFrame } from './forecourt.js';
import { OUTSIDE_THEME } from '../themes/index.js';
import { ASSEMBLY_STYLE } from '../themes/outside.js';
import { buildFarBank, BANK_PAINT } from './banks.js';
import { FAR_GRASS_GROUND } from './grass.js';
import { buildFarFur } from './fur.js';
import { bladePatches, farBankProposal } from './plants.js';
import { buildFloraStylised } from '../../vegetation/stylised.js';
import { buildNearWaterfront } from './waterfront.js';
import { planAssembly, compileAssembly } from './assembly.js';
import { PENAMBANG, planBoat, compileBoat } from './boats.js';
import { checkBoats } from './placement.js';
import { buildBridge } from './bridge.js';
import { createWater, fresnelF0, WAVES } from './water.js';
import { NO_INK_LAYER, MIRROR_LAYER } from '../layers.js';
import { clayMaterial, FLAT_GREY } from '../debugMaterials.js';

export { SITE };
/** The mirrored camera of the river draws this layer: the outside without the water. Lights must be on it too. */
export const OBJECTS = ['farbank', 'forecourt', 'waterfront', 'river', 'assembly', 'bridge', 'boats', 'sky'];

// The sky is keyed down like the rest of the outdoors, so its blue survives an exposure set for
// the shaded room (themes/outside.js air.skyKey).
const SKY_KEY = OUTSIDE_THEME.air.skyKey;

/**
 * Builds the outside. `fog` is the scene's fog (the daylight haze: the sky's horizon and the
 * water use its colour too); `light` scales what gives off its own light, to match the scene's
 * lamps; `key` darkens the outdoor paint so it keeps its colour next to a room exposed for
 * shade; `mode` 'flat' or 'silhouette' are the checks the geometry skill asks for, 'clay' the
 * clay render of the clay theme (plain grey, no painted textures, no water shader); `stage` lists
 * the objects to build (default: all).
 */
export function createRiverside({ gradientMap, seed = 0, fog, haze = OUTSIDE_THEME.air.daylight, light = 1, key = 1, sun, mode, stage, flora = null }) {
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
    dst.uv1.push(...from.uv1);
    dst.hasUv1 ||= from.hasUv1;
    dst.color.push(...from.color);
    dst.triangles += from.triangles;
  };

  // --- The banks (banks.js) ---------------------------------------------------------------------
  // ?flora=stylised (the default; house/garden/plants.js and riverside/plants.js): the entries where the stylised plants stand.
  const floraEntries = [];
  const bladeFrom = w.slot('blade').triangles;
  if (want('farbank')) reports.farbank = buildFarBank(w, { seed, paint: flora === 'stylised' ? FAR_GRASS_GROUND : null });
  if (flora && want('farbank')) {
    const ticks = { 'far slope ticks': BANK_PAINT.tick };
    floraEntries.push(...bladePatches(w.slot('blade'), bladeFrom, ticks));
  }
  // Proposed far-bank planting (house/garden/plants.js and riverside/plants.js): markers only, a composition to judge.
  if (flora && want('farbank')) {
    const { place } = reports.farbank;
    floraEntries.push(...farBankProposal({ place, forecourt: forecourtFrame().xRange, rand: mulberry32(613 + seed), stepPlanting: flora === 'stylised' }));
  }
  if (want('forecourt')) reports.forecourt = buildForecourt(w); // the Assembly's river front on the embankment (pass e7)
  if (want('waterfront')) reports.waterfront = buildNearWaterfront(w); // our side: the waterfront's street and railing (pass e11)

  // --- Assembly building (planned, then compiled; measured on the user's Sketchfab model) -------
  if (want('assembly')) {
    const building = new SlotWriter();
    reports.assembly = compileAssembly(planAssembly(), building);
    // Scene materials by role. Since pass e15 the concrete and glass have their own painted map
    // (paint.js paintAssembly): each quad's 0..1 uv goes into the left half (glass) or the right
    // (concrete), inset so the halves do not bleed into each other.
    const slotOf = { gold: 'gold', rib: 'assembly', glass: 'assembly', stone: 'assembly' };
    // Pass e16 (?asm=c|cd): light painted in, as in a Ghibli background: darker at the foot, lighter
    // to the top, over the whole building (the glass keeps its colour).
    const lit = ASSEMBLY_STYLE && OUTSIDE_THEME.textures.assemblyStyle.light[ASSEMBLY_STYLE];
    if (lit && lit[0] !== lit[1]) {
      let y0 = Infinity, y1 = -Infinity;
      for (const s of building.slots.values()) for (let i = 1; i < s.position.length; i += 3) { y0 = Math.min(y0, s.position[i]); y1 = Math.max(y1, s.position[i]); }
      for (const [name, s] of building.slots) {
        if (name === 'glass') continue;
        for (let i = 0; i < s.color.length; i++) {
          const t = (s.position[i - (i % 3) + 1] - y0) / (y1 - y0);
          s.color[i] = Math.min(1, s.color[i] * (lit[0] + (lit[1] - lit[0]) * t));
        }
      }
    }
    const inset = 4 / 512;
    const half = { glass: 0, rib: 0.5, stone: 0.5 };
    for (const [name, s] of building.slots) {
      if (name in half) {
        const uv = s.uv.map((v, i) => (i % 2 === 0 ? half[name] + inset + v * (0.5 - 2 * inset) : inset * 2 + v * (1 - 4 * inset)));
        s.uv.length = 0;
        s.uv.push(...uv);
      } else if (name === 'gold' && ASSEMBLY_STYLE) {
        // pass e16: the gold's own brushwork tile. A triangle written without uvs (all 0, 0) takes
        // the tile's middle, not its corner, so it is not all edge highlight.
        const uv = s.uv.slice();
        for (let t = 0; t < uv.length; t += 6) {
          if (uv.slice(t, t + 6).every((v) => v === 0)) uv.splice(t, 6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
        }
        s.uv.length = 0;
        s.uv.push(...uv.map((v) => inset * 2 + v * (1 - 4 * inset)));
      }
      copy(s, slotOf[name], S.assembly.x, S.lawn, S.assembly.z);
    }
  }

  // --- Bridge (checked against its contract; not rebuilt yet) ----------------------------------
  if (want('bridge')) {
    const steel = new SlotWriter();
    reports.bridge = buildBridge(steel, { points: S.bridge, water: S.water, bankY: S.ground });
    copy(steel.slot('steel'), 'paint');
  }

  // --- Boats: Kuching river taxis (boats.js; planned, compiled, checked against photos) ---------
  if (want('boats')) {
    reports.boats = S.boats.map((b) => compileBoat(planBoat(PENAMBANG, b.scheme), w, b, S.water));
    reports.boatPlacement = checkBoats(S.boats); // where they sit in the window shot (placement.js)
  }

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
  const skySeed = (OUTSIDE_THEME.sky.seed ?? 0) + seed; // the sky's own seed (themes/outside.js sky.seed)
  const textures = {
    sky: paintSoftSky(25 + skySeed, { ...OUTSIDE_THEME.sky[OUTSIDE_THEME.sky.style], haze: hazeStyle }),
  };
  if (w.slots.has('paving')) textures.paving = paintPaving(61, OUTSIDE_THEME.textures.paving); // the waterfront's street (pass e11)
  const asmStyle = OUTSIDE_THEME.textures.assemblyStyle;
  if (w.slots.has('assembly')) textures.assembly = paintAssembly(71, OUTSIDE_THEME.textures.assembly, ASSEMBLY_STYLE, asmStyle); // the Assembly's glass and concrete (pass e15)
  if (ASSEMBLY_STYLE && w.slots.has('gold')) textures.gold = paintStylized(73, ASSEMBLY_STYLE, asmStyle); // ?asm=c|d|cd (pass e16)
  disposables.push(...Object.values(textures));
  const toon = ({ map, side = THREE.FrontSide } = {}) => {
    let m;
    if (mode === 'silhouette') m = new THREE.MeshBasicMaterial({ color: '#000000', fog: false, side });
    else if (mode === 'flat') m = new THREE.MeshToonMaterial({ gradientMap, color: FLAT_GREY, side });
    else if (mode === 'clay') {
      // plain grey, lit as it is; keyed down like the paint so sunlit ground does not burn out
      m = clayMaterial({ side });
      m.color.multiplyScalar(key);
    }
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
    gold: toon({ side: THREE.DoubleSide }), // the Assembly building's gold: plain paint; its folds come from the facets
  };
  // The waterfront's street (pass e11): its colour is the painted map; flat and clay modes leave it plain.
  if (textures.paving) materials.paving = toon({ map: mode ? null : textures.paving });
  // The Assembly's concrete and glass (pass e15): vertex colours times the painted map.
  if (textures.assembly) materials.assembly = toon({ map: mode ? null : textures.assembly });
  // Pass e16 (?asm=c|d|cd): the gold gets its brushwork map, and both are brightened by the
  // paper's inverse so the light strokes can rise above the plain colour.
  if (ASSEMBLY_STYLE && !mode) {
    if (textures.gold) {
      materials.gold = toon({ side: THREE.DoubleSide, map: textures.gold });
      materials.gold.color.multiplyScalar(styleGain(asmStyle));
    }
    if (materials.assembly) materials.assembly.color.multiplyScalar(styleGain(asmStyle));
  }
  for (const name of Object.keys(materials)) {
    if (!w.slots.has(name)) continue;
    const mesh = new THREE.Mesh(geometry(name), materials[name]);
    mesh.name = name;
    // The paving is not mirrored: the river hides its reflection behind the kerb and the edge
    // face (pass e11 tidy: 0.003% of the window shot's pixels change, under the 1% rule).
    if (name !== 'paving') mesh.layers.enable(MIRROR_LAYER);
    group.add(mesh);
  }

  // --- The river: one plane at the water level, under both banks' toes (water.js) --------------
  // It mirrors everything else out here: those meshes are also on MIRROR_LAYER, the water is not.
  const E = S.extent;
  const water = createWater({ level: S.water, layer: MIRROR_LAYER, pale: haze, fog, light: light * SKY_KEY, key, sun });
  disposables.push(water);
  const hasRiver = want('river') && mode !== 'silhouette' && mode !== 'clay'; // the plain river mirrors nothing
  if (want('river')) {
    const river = new THREE.PlaneGeometry(E.x1 - E.x0, E.z1 - E.z0, 1, 1).rotateX(-Math.PI / 2).translate((E.x0 + E.x1) / 2, S.water, (E.z0 + E.z1) / 2);
    river.setAttribute('color', new THREE.Float32BufferAttribute(new Array(river.attributes.position.count * 3).fill(0.5), 3)); // one part, for the ink pass
    const riverMesh = new THREE.Mesh(river, mode === 'silhouette' ? new THREE.MeshBasicMaterial({ color: '#8a8a8a', fog: false }) : mode === 'clay' ? toon() : water.material);
    riverMesh.name = 'water';
    group.add(riverMesh);
    const c = createContract('river');
    c.is('waves in the shared list', WAVES.length, 5);
    c.max('steepest band (k A)', Math.max(...WAVES.map((v) => v.k * v.amplitude)), 0.08);
    c.max('summed steepness (q k A), below 1: no loops', WAVES.reduce((a, v) => a + v.q * v.k * v.amplitude, 0), 1);
    c.near('phase speed of the longest band (m/s) = sqrt(g / k)', WAVES[0].omega / WAVES[0].k, Math.sqrt((9.81 * WAVES[0].length) / (2 * Math.PI)), 1e-6);
    c.near('Fresnel at normal incidence, from the air', fresnelF0(false), 0.0204, 0.0005);
    c.near('Fresnel at normal incidence, from below (the same)', fresnelF0(true), fresnelF0(false), 1e-9);
    reports.river = { contract: c.assert(), stats: { waves: WAVES.map((v) => ({ length: v.length, amplitude: v.amplitude, slope: +(v.k * v.amplitude).toFixed(4), speed: +(v.omega / v.k).toFixed(2) })) } };
  }

  // --- Sky: a painted dome; its horizon is the haze colour (layer 1: no ink) -------------------
  if (want('sky')) {
    const skyMat = new THREE.MeshBasicMaterial({ map: mode === 'silhouette' || mode === 'clay' ? null : textures.sky, color: '#ffffff', side: THREE.BackSide, fog: false, depthWrite: false });
    skyMat.color.setScalar(mode === 'silhouette' ? light * 2 : light * SKY_KEY * (OUTSIDE_THEME.sky.gain ?? 1));
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1300, 32, 16), skyMat);
    sky.rotation.y = 1.1 + skySeed;
    sky.renderOrder = -1;
    sky.name = 'sky';
    sky.layers.set(NO_INK_LAYER);
    sky.layers.enable(MIRROR_LAYER);
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
  // 155,196 built (pass e11, both waterfronts). The user set no limit; the history of this number
  // (95,000 to 240,000 and back) is in research/INTERIOR-NOTES.md, pass by pass.
  budget.max('triangles', total, 160000);
  budget.max('meshes (draw calls)', group.children.length, 8); // 6 since pass e5 (the mud and turf meshes went with the near bank); 7 since e11 (the paving); 8 since e15 (the Assembly's painted concrete and glass)
  reports.budget = { contract: budget.assert() };
  const stats = { triangles: total, meshes: group.children.length, perMesh: triangles };

  // ?flora=stylised: the approved plants at the same entries (vegetation/stylised.js), also after the budget.
  const stylised = flora === 'stylised' ? buildFloraStylised(floraEntries, { eye: WINDOW_EYE, layer: MIRROR_LAYER }) : null;
  if (stylised) group.add(stylised.group);
  // ?flora=stylised: the far bank covered in grass like fur (fur.js), over its dark-green ground
  // (grass.js FAR_GRASS_GROUND). One instanced draw, after the budget like the plants. Layer 1: the
  // ink pass would outline every blade.
  if (flora === 'stylised' && want('farbank')) {
    const fur = buildFarFur(reports.farbank, { seed, material: toon({ side: THREE.DoubleSide }) });
    fur.mesh.layers.set(NO_INK_LAYER);
    fur.mesh.layers.enable(MIRROR_LAYER);
    disposables.push(fur.mesh.geometry);
    group.add(fur.mesh);
    reports.farFur = { stats: fur.stats };
  }

  return {
    group,
    reports,
    stats,
    /** ?flora=stylised: { copies, triangles, meshes } of the plants, or null. */
    floraStats: stylised?.stats ?? null,
    /** Moves the water. t in seconds (dt unused). */
    update(t) {
      water.material.uniforms.uTime.value = t;
    },
    /** Draws the river's mirror image. Call each frame before the scene is drawn. */
    renderMirror(renderer, scene, camera) {
      if (hasRiver && group.visible) water.renderMirror(renderer, scene, camera);
    },
    setWaterView(v) {
      water.material.uniforms.uView.value = v;
    },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      for (const d of disposables) d.dispose();
      stylised?.dispose();
    },
  };
}
