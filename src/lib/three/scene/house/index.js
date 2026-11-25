// The house, one of the scene's two items (the other is riverside/): the room, its furniture,
// curtains and fabrics, the house's shell, and the garden and plants round it. Where the garden
// ends, the riverside starts. scene/index.js wires it in; like every item it returns
// { group, update(t, dt), dispose() }, plus what the rest of the scene needs from it.

import * as THREE from 'three';
import { paintPlanks, paintCarving, paintWindowLattice, paintCurtain, paintDecor, paintGlow } from './paint.js';
import { setPaintDetail } from '../paint/core.js';
import { PLAN } from '../world/plan.js';
import { Builder } from './builder.js';
import { buildRoom } from './room.js';
import { buildExterior } from './exterior.js';
import { buildLattice, LATTICE_TILE } from './lattice.js';
import { buildCurtains } from './curtains.js';
import { buildSeat, furnitureOverlaps, buildTable } from './furniture.js';
import { buildHangings } from './hangings.js';
import { buildVines } from './vines.js';
import { windowHangingProposal, roomPlantsProposal } from './garden/plants.js';
import { buildFloraStylised } from '../../vegetation/stylised.js';
import { gardenChoice, buildGarden, buildBeds } from './garden/garden.js';
import { shadeWalls, glossBoards, buildContactShadows } from './surfaces.js';
import { maskOf } from './helpers.js';
import { loadFabrics } from './fabricLoader.js';
import { NO_INK_LAYER, INK_MASK_LAYER, FURNITURE_LAYER, SIDE_LAYER } from '../layers.js';
import { clayMaterial, FLAT_GREY } from '../debugMaterials.js';

/**
 * Builds the house. `theme` is the room's theme, `light` its overall level, `sky` the sky light
 * (the contact shadows fall its way), `TX` the texture detail setting (quality.js TEXTURES).
 * Returns { group, update, dispose, fabrics, inkMask, stats }: `fabrics` is the fabric loader
 * (house/fabricLoader.js, which adds its own group to `scene`), `inkMask` the lattice texture that
 * masks the ink of the view behind it.
 */
export function createHouse({ renderer, scene, camera, theme: THEME, params, debug, clay, off, seed, stage, flora, TX, gradientMap, light: LIGHT, sky, onFabricsPlaced, onFabricsFull }) {
  const owned = [];
  const own = (x) => (x && owned.push(x), x);
  const num = (k) => (params.has(k) ? Number(params.get(k)) || 0 : null);
  const L = THEME.light;
  const group = new THREE.Group();
  group.name = 'house';
  const stats = {};
  const T = THEME.textures;
  // The room's painted textures at twice their size on a drawing buffer of ratio 1.5 or more (the
  // texture detail setting, quality.js TEXTURES): seen from the seat, a plank texel covered about
  // 1.3-2.7 screen pixels at 2x (512 texels a metre), so the grain was magnified into blur.
  // ?paint=1 keeps the designed size. Made at load: changing the setting reloads the page.
  const paintWas = setPaintDetail(num('paint') ?? (renderer.getPixelRatio() >= TX.paintDetailFrom ? 2 : 1));
  const textures = {
    planks: paintPlanks(1 + seed, T.planks.boards),
    floor: paintPlanks(9 + seed, T.planks.floor),
    wall: paintPlanks(5 + seed, T.planks.wall),
    lattice: paintWindowLattice(11, T.windowLattice, LATTICE_TILE),
    carve: paintCarving(17, T.carving),
    valance: paintCurtain(12 + seed, T.curtains.valance),
    sheer: paintCurtain(16 + seed, T.curtains.drape),
    pale: paintCurtain(31 + seed, T.curtains.pale),
    decor: paintDecor(14, T.decor),
    blob: paintGlow('round'),
    footBlob: paintGlow('contact'),
  };
  setPaintDetail(paintWas);
  textures.carve.repeat.set(3.4, 3.4); // finer: chair-back carving
  const aniso = Math.min(TX.anisotropy, renderer.capabilities.getMaxAnisotropy());
  for (const t of Object.values(textures)) own(t).anisotropy = aniso;
  const D = THREE.DoubleSide;
  const M = THEME.materials;
  const G = THEME.glow;
  const materials = {};
  const masks = [];
  for (const [key, color, map, extra] of [
    ['floor', M.floor, textures.floor],
    ['wall', M.wall, textures.wall],
    ['ceiling', M.ceiling, textures.wall],
    ['frame', M.frame, textures.planks],
    ['wood', M.wood, textures.planks],
    ['top', M.top, textures.planks],
    ['lattice', M.lattice, textures.lattice, { side: D, alphaTest: 0.5 }],
    ['carve', M.carve, textures.carve, { side: D, alphaTest: 0.5 }],
    ['valance', M.valance, textures.valance, { side: D, emissive: G.valance, emissiveMap: textures.valance, emissiveIntensity: L.glow.valance }], // lit from behind
    ['sheer', M.sheer, textures.sheer, { side: D, emissive: G.sheer, emissiveMap: textures.sheer, emissiveIntensity: L.glow.sheer }],
    ['white', M.white, textures.pale, { side: D, emissive: G.white, emissiveMap: textures.pale, emissiveIntensity: L.glow.white }],
    ['decor', M.decor, textures.decor, { side: D }],
    ['plate', M.plate, null],
    // The house outside (house/exterior.js)
    ['clad', M.clad, textures.wall],
    ['zinc', M.zinc, null],
    ['trim', M.trim, textures.planks],
    ['post', M.post, textures.planks],
    ['concrete', M.concrete, null],
    ['ground', M.ground, null],
    ['earth', M.earth, null],
  ]) {
    if (clay) {
      // Plain grey, lit as it is; the lattice and carving keep their holes (their texture as a mask).
      const cut = key === 'lattice' || key === 'carve';
      if (cut) masks.push(own(maskOf(map)));
      materials[key] = clayMaterial({ fog: false, side: extra?.side ?? THREE.FrontSide, map: cut ? masks.at(-1) : null, alphaTest: cut ? 0.5 : 0 });
      continue;
    }
    materials[key] = new THREE.MeshToonMaterial({ color, map, vertexColors: true, gradientMap, fog: false, ...extra });
    materials[key].emissiveIntensity *= LIGHT;
    if (debug === 'flat' && key !== 'lattice' && key !== 'carve') {
      materials[key].map = null;
      materials[key].color.set(FLAT_GREY);
    }
  }

  for (const m of Object.values(materials)) own(m);
  if (!clay) shadeWalls(materials.wall, PLAN.room.top, L.windowWallShade);
  if (!clay && !off.has('gloss')) {
    const { window: windowGloss } = L.gloss;
    glossBoards(materials.floor, { window: windowGloss, ...L.gloss.floor, light: LIGHT, view: debug === 'gloss' });
    glossBoards(materials.top, { window: windowGloss, ...L.gloss.top, light: LIGHT, view: debug === 'gloss' });
  }
  const b = new Builder();
  // Each object rolls its own dice (house/builder.js), so this order does not change the look.
  buildRoom(b.as('room'));
  buildLattice(b.as('lattice'));
  buildCurtains(b.as('curtains'));
  buildSeat(b.as('furniture'), PLAN.settee);
  for (const c of PLAN.chairs) buildSeat(b, c);
  for (const t of PLAN.tables) buildTable(b, t);
  const overlaps = furnitureOverlaps();
  if (overlaps.length) console.warn('furniture overlaps:', overlaps.join('; '));
  buildHangings(b.as('hangings'));
  const room = new THREE.Group();
  room.name = 'room';
  room.add(...b.build(materials));
  // The lattice is cut out by its texture: give its shadow the same holes, and keep it out of the
  // ink pass (the edge buffer would see a solid panel).
  const latticeDepth = own(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: textures.lattice, alphaTest: 0.5 }));
  const carveDepth = own(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: textures.carve, alphaTest: 0.5 }));
  for (const mesh of room.children) {
    if (mesh.name === 'lattice' || mesh.name === 'carve') {
      mesh.customDepthMaterial = mesh.name === 'lattice' ? latticeDepth : carveDepth;
      mesh.layers.set(NO_INK_LAYER);
      if (mesh.name === 'lattice') mesh.layers.enable(INK_MASK_LAYER); // and masks the ink of the view behind it (toon.js)
    }
    if (mesh.name === 'decor') mesh.castShadow = false;
    if (['wood', 'top', 'carve'].includes(mesh.name)) mesh.layers.enable(FURNITURE_LAYER);
    if (['wood', 'top', 'carve', 'wall', 'frame'].includes(mesh.name)) mesh.layers.enable(SIDE_LAYER);
    if (['lattice', 'carve', 'sheer', 'white'].includes(mesh.name)) mesh.userData.noAO = true; // cut-outs and sheer cloth (ao.js)
  }
  group.add(room);
  // The vines beside the windows inside (house/vines.js): the garden's hanging vine.
  const vines = own(buildVines());
  vines.group.visible = !stage;
  group.add(vines.group);
  const contact = buildContactShadows(textures.blob, sky.target.position.clone().sub(sky.position), textures.footBlob); // they fall the way the sky's light travels
  group.add(contact.group);
  own(contact.mat), own(contact.core), own(contact.foot);
  room.visible = contact.group.visible = !stage;

  // The house outside the room (house/exterior.js): its own builder, so it can be shown or
  // hidden as one (?off=house). Seen only from outside: the room's views do not change.
  const hb = new Builder();
  buildExterior(hb.as('house'));
  const gardenPick = gardenChoice(params);
  if (gardenPick) buildBeds(hb.as('garden beds'), gardenPick.layout);
  const shell = new THREE.Group();
  shell.name = 'shell';
  shell.add(...hb.build(materials));
  // The house casts no sun shadow for now: its eaves shaded the curtains, and its deeper window
  // reveals narrowed the sun on the floor, so both room views changed. The room's own walls still
  // cast the house's shadow on the ground. The ground takes the haze: it runs far inland.
  for (const mesh of shell.children) mesh.castShadow = false;
  if (!clay) materials.ground.fog = true;
  shell.visible = !stage && !off.has('house');
  group.add(shell);

  // The fabrics (house/fabricLoader.js). The first frame waits for them (see tick), so they do
  // not pop in. Low texture detail or ?fabrics=preview keeps their 512 px previews.
  const fabrics = own(loadFabrics({
    renderer, scene, camera, theme: THEME, clay, flat: debug === 'flat', stage,
    previewsOnly: (params.get('fabrics') ?? TX.fabrics) === 'preview',
    onPlaced: onFabricsPlaced,
    onFull: onFabricsFull,
  }));
  if (off.has('contact')) contact.group.visible = false;
  if (clay) contact.group.visible = false; // painted shadows: the clay render shows only the sun's

  let vineBlockout = null;
  if (flora === 'stylised') {
    vineBlockout = own(buildFloraStylised([...windowHangingProposal(PLAN, { skipMiddle: true }), ...roomPlantsProposal(PLAN)], { potColour: THEME.materials.pot }));
    vineBlockout.group.visible = !stage;
    group.add(vineBlockout.group);
    stats.plants = vineBlockout.stats;
  }
  // Planting round the house (garden.js); ?garden=off leaves it out.
  const garden = gardenPick ? own(buildGarden(gardenPick)) : null;
  if (garden) {
    garden.group.visible = !stage && !off.has('house');
    group.add(garden.group);
    stats.garden = garden.stats;
  }
  return {
    group,
    fabrics,
    inkMask: textures.lattice,
    stats,
    update() {}, // nothing in the house moves yet
    dispose() {
      for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose();
    },
  };
}
