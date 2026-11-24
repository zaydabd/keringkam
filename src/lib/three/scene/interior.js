// The Sarawak Malay house interior (#/interior): a hand-drawn rendition of one room, built from a
// reference photo the user supplied (R1, research/INTERIOR-NOTES.md): the sitting room of a
// Sarawak Malay house, looking at the window wall. Dark red-brown board walls, full-height windows
// with lattice panels at the bottom, pleated floral valances and tied-back sheer curtains, golden
// wood settee, armchairs and tables, and woven hangings on the side wall.
// It is a rendition, not a copy. Sizes are estimated from the photo (see PLAN).
//
// Structure (after .claude/skills/threejs-procedural-architecture): PLAN holds every size in
// metres and can be serialised; the build* functions turn it into parts; the Builder merges the
// parts into one mesh per material. Debug views: ?debug=nopost (no ink pass) or ?debug=flat
// (no textures), e.g. /?debug=flat#/interior. Both log the triangle count.
// Look: watercolour, after R2 (a painting of the same room; see watercolour.js). Layout and items
// stay as in R1.
//
// Pass graph (each has one owner and a way to switch it off; see research/INTERIOR-NOTES.md):
//   scene (linear HDR) -> ink (toon.js) -> pigment (watercolour.js) -> finish (exposure from
//   meter.js, the one tone map, sRGB, grade) -> anti-aliasing (SMAA).
// Inspection, all as URL parameters before the #:
//   debug = nopost | flat | silhouette | paint-pigment | paint-edge | paint-bleed | gloss | meter | fabric-mask
//           | water-normal | water-fresnel | water-filter | water-reflection | water-body
//           | water-crest | water-lost
//   off   = ink, pigment, grade, aa, outside, ao, contact, gloss (comma-separated: switches those off),
//           the lights: sun, sky, side, bounce, and skyshadow (the sky light casts no shadow)
//   cam   = design (default) | near | far      look = x,y (fixes the pointer sway, -1..1)
//   view  = seat (default) | window | fabric-<name> (start in that camera shot; SHOTS below)
//   seed  = n (moves the pigment field and the painted textures)
//   t     = seconds (stops the clock of the view outside, so two captures match pixel for pixel)
//   eye = x,y,z   yaw = deg   pitch = deg   fov = deg   (a free camera, for close-ups)
//   perf  (or perf=n: n seconds per shot) a timed run from the seat to the window (perf.js)
//   dpr   = n (draws at this pixel ratio and never steps it down; default: the device's, up to 3)
//   theme = original (default) | detailed | clay: the theme (themes/index.js). clay is the clay render, the
//           scene without its look (themes/clay.js); theme=off still means clay. The theme
//           picker in Interior.svelte sets it.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import './stableShadows.js'; // soft shadow edges dithered on the world, not the screen
import { toonGradient, createOutline } from './toon.js';
import { paintPlanks, paintCarving, paintWindowLattice, paintCurtain, paintDecor, paintGlow, setPaintDetail } from './paint.js';
import { createOutside, OBJECTS, MIRROR_LAYER } from './outside/index.js';
import { PIGMENT_SHADER, FINISH_SHADER, createPigmentField } from './watercolour.js';
import { createMeter } from './meter.js';
import { RESOLUTIONS, MAX_PIXEL_RATIO, MIN_PIXEL_RATIO, PACE, AO, SHADOWS, TEXTURES, OUTLINES, normalise } from './quality.js';
import { createPerfRun } from './perf.js';
import { INTERIOR_THEME, OUTSIDE_THEME, CLAY_LOOK } from './themes/index.js';
import { PLAN } from './interior/plan.js';
import { V, Builder } from './interior/builder.js';
import { buildRoom } from './interior/room.js';
import { buildLattice, LATTICE_TILE } from './interior/lattice.js';
import { buildCurtains } from './interior/curtains.js';
import { buildSeat, furnitureOverlaps, buildTable } from './interior/furniture.js';
import { buildHangings } from './interior/hangings.js';
import { buildVines } from './interior/vines.js';
import { floraMode, windowVineLayout, vineMarkers, buildFloraBlockout, showFloraLegend, windowHangingProposal, roomPlantsProposal } from './flora-layout.js';
import { shadeWalls, glossBoards, buildContactShadows } from './interior/surfaces.js';
import { drapeAll, fabricGeometry, partColour, fabricIndex } from './interior/fabrics.js';
import { createTextureStore, fabrics as FABRIC_PHOTOS } from '../common.js';
import { createAO } from './ao.js';
export { PLAN } from './interior/plan.js';
export { furnitureOverlaps } from './interior/furniture.js';

const THEME = INTERIOR_THEME;

/** Sets a pass's uniforms from a theme section: colours take a hex, vectors an array, the rest a number. */
function setUniforms(uniforms, values) {
  for (const [k, v] of Object.entries(values)) {
    if (uniforms[k].value?.isColor) uniforms[k].value.set(v);
    else if (uniforms[k].value?.isVector3) uniforms[k].value.fromArray(v);
    else uniforms[k].value = v;
  }
}

/** A white copy of a cut-out texture with the same alpha: keeps the holes, drops the paint (clay render). */
function maskOf(texture) {
  const src = texture.image;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = texture.wrapS;
  t.wrapT = texture.wrapT;
  t.repeat.copy(texture.repeat);
  t.anisotropy = texture.anisotropy;
  return t;
}

/** A light's colour turned to the grey of the same luminance (linear), so the clay render keeps its balance. */
function neutral(color) {
  const y = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return color.setRGB(y, y, y);
}

// ---------------------------------------------------------------------------------------------
// Camera shots (after .claude/skills/threejs-camera-direction): each is an authored frame with its
// own lens, its own limits on how far the pointer may turn the view, and its own exposure
// compensation. `seat` is the design view (R1). `window` stands at the middle window and looks
// out over the lattice, framed by the curtains (R3).
export const SHOTS = {
  seat: { look: [0.06, 0.03], ev: 0 }, // eye, pitch and lens come from PLAN.camera
  window: { eye: [-0.475, 1.5, -4.62], pitch: 4.3, fov: 54, look: [0.36, 0.1], ev: 1.3 }, // +1.3 stops: outdoors is meant to read as full daylight
};
// One shot per fabric (PLAN.fabrics), 'fabric-<name>': standing or sitting where a person would
// look at it, aimed at it (`at`), the cloth filling about half the frame.
const FABRIC_SHOTS = {
  armchair: { eye: [0.0, 1.1, -0.55], at: [0.45, 0.6, -1.62] },
  settee: { eye: [-0.7, 1.45, -3.7], at: [-0.8, 0.8, -4.9], fov: 45 },
  table: { eye: [-0.3, 1.45, -2.1], at: [-0.95, 0.35, -3.4] },
  'left-chair': { eye: [-0.55, 1.1, -3.35], at: [-1.6, 0.6, -4.0] },
  'right-chair': { eye: [-1.25, 1.1, -3.35], at: [-0.1, 0.6, -4.0] },
  window: { eye: [-2.47, 1.3, -4.3], at: [-2.47, 0.85, -5.5] },
};
for (const f of PLAN.fabrics) SHOTS[`fabric-${f.name}`] = { fov: 50, look: [0.12, 0.06], ev: 0, ...FABRIC_SHOTS[f.name], fabric: f.name };

/** The fabric views for the menu: shot name, place, and the photo's real name (from its file name). */
export const FABRIC_VIEWS = PLAN.fabrics.map((f) => {
  const photo = FABRIC_PHOTOS[fabricIndex(f.fabric)];
  const words = photo.group.split('-').join(' ');
  return { shot: `fabric-${f.name}`, label: f.label, fabric: `${words.replace(/^./, (c) => c.toUpperCase())}, no. ${Number(photo.name.split('-').pop())}` };
});
const SHOT_MOVE_SECONDS = 2.2;

export function createInterior(canvas, { onReady, onShot, onResolution, onFrameRate, quality } = {}) {
  // The graphics settings (quality.js): the resolution, AO, shadows, anti-aliasing and texture
  // detail. setQuality changes them while the page runs.
  const Q = normalise(quality);
  const startedAt = performance.now();
  const params = new URLSearchParams(window.location.search);
  const debug = params.get('debug');
  const clay = CLAY_LOOK !== null; // the clay theme: the look switched off (themes/clay.js)
  const off = new Set((params.get('off') ?? '').split(',').filter(Boolean));
  const seed = Number(params.get('seed') ?? 0) || 0;
  const fixedLook = params.get('look')?.split(',').map(Number);
  // Camera bookmarks for validation: the design view, 1.4 m nearer, and 0.9 m further back.
  const camOffset = { near: -1.4, far: 0.9 }[params.get('cam')] ?? 0;
  // Free inspection camera: eye=x,y,z (metres), yaw and pitch (degrees, added to the design view;
  // positive yaw turns right, positive pitch looks up), fov (vertical degrees, e.g. 20 for a close-up).
  const num = (k) => (params.has(k) ? Number(params.get(k)) || 0 : null);
  const eyeParam = params.get('eye')?.split(',').map(Number);
  const yawParam = THREE.MathUtils.degToRad(num('yaw') ?? 0);
  const pitchParam = THREE.MathUtils.degToRad(num('pitch') ?? 0);
  const fovParam = num('fov');
  const dprParam = num('dpr');
  const clockParam = num('t');
  // ?stage=farbank,trees,... shows only those objects of the view outside (outside/index.js
  // OBJECTS), without the room, from the window shot's eye; yaw, pitch, fov and eye then apply to
  // it. ?exposure=n sets the exposure instead of metering (the stage uses the window shot's 1.85).
  const stage = params.get('stage')?.split(',').filter((n) => OBJECTS.includes(n)) ?? null;
  const exposureParam = num('exposure') ?? (stage ? 1.85 : null);
  // ?flora=blockout draws a flat marker where each plant stands instead of the plant; ?flora=both
  // draws the markers over the plants (flora-layout.js). For trying a layout before replanting.
  const flora = floraMode(params);
  // No MSAA on the screen under post-processing: the scene is drawn into the composer's own
  // (single-sample) buffers and only the last full-screen pass reaches the screen, so screen MSAA
  // would smooth nothing and still cost its memory and resolve. ?debug=nopost draws straight to
  // the screen and keeps it.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: debug === 'nopost' });
  // The resolution (quality.js RESOLUTIONS): the device's own pixels up to the setting's pixel
  // count, like a game's render resolution. A 1080p screen is drawn at its own pixels at the
  // 1080p setting; a 2x laptop or a 4K monitor at about 1920 x 1080 pixels, stretched to fill it
  // (the user's choice, 2026-11-18): MDN's "rendering to a smaller back buffer, and upscaling the
  // result" (WebGL best practices). Pixels go with the ratio squared, so the ratio is
  // sqrt(budget / CSS pixels). ?maxpx=n sets the budget
  // (0: none), ?dpr=n fixes the ratio. If the device cannot keep up while the view moves,
  // paceResolution steps the device ratio down (PACE), never back up.
  let deviceRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
  const budget = () => (params.has('maxpx') ? num('maxpx') : RESOLUTIONS[Q.resolution].pixels);
  const ratioFor = (w, h) => {
    const max = budget();
    if (dprParam) return dprParam;
    return !max || !w || !h ? deviceRatio : Math.max(MIN_PIXEL_RATIO, Math.min(deviceRatio, Math.sqrt(max / (w * h))));
  };
  renderer.setPixelRatio(ratioFor(canvas.clientWidth, canvas.clientHeight));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // the sun and the room don't move: draw the shadows once
  renderer.shadowMap.needsUpdate = true;
  // Tone mapping belongs to the finish pass. The renderer's own setting only matters for
  // ?debug=nopost (drawn straight to the screen); it gets the same metered exposure.
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const L = THEME.light;
  const AIR = OUTSIDE_THEME.air;
  const LIGHT = L.level; // one level for everything that gives off light (themes/interior.js)
  scene.background = new THREE.Color(AIR.daylight).multiplyScalar(LIGHT);
  // Daylight haze, for the outside only (the room's materials have fog off). One colour is shared
  // by this fog, the sky's horizon and the river's reflection of the sky.
  scene.fog = new THREE.Fog(AIR.daylight, AIR.haze.near, AIR.haze.far);
  scene.fog.color.multiplyScalar(LIGHT * AIR.skyKey); // as bright as the sky's horizon, which it must match
  const C = PLAN.camera;
  const camera = new THREE.PerspectiveCamera(C.fov, C.aspect, 0.2, 1600); // at 0.05 the big ground plane outside drew over the near floor on tall screens

  // Light. The room's only openings are the three back windows and the side window, so every
  // light stands for one of them or for what bounces round the room (themes/interior.js light):
  //   sun    through the back windows: hard patches on the boards just inside them
  //   sky    through the back windows: soft, low light towards the viewer, so the room is backlit
  //   side   sky through the side window: a pool of soft light across the foreground
  //   bounce what the boards and walls give back, from all round (no shadow; the AO pass stands in)
  const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity * LIGHT);
  sun.target.position.set(-1, 0, -4);
  sun.position.set(-4, 11, -14);
  sun.castShadow = true;
  const shadowSize = () => SHADOWS[Q.shadows]; // quality.js
  sun.shadow.mapSize.setScalar(shadowSize().sun);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  sun.shadow.radius = L.sun.shadowSoftness;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.004; // small: a larger one opens a gap between a leg and its shadow
  const hemi = new THREE.HemisphereLight(L.bounce.sky, L.bounce.ground, L.bounce.intensity * LIGHT);
  // The sky: one direction stands for the three windows. Only the furniture casts its shadow
  // (FURNITURE_LAYER): the window wall would otherwise shut it out, as one direction cannot go
  // round the wall the way the whole sky does. Its shadows fall towards the viewer.
  const FURNITURE_LAYER = 4;
  const sky = new THREE.DirectionalLight(L.sky.color, L.sky.intensity * LIGHT);
  sky.target.position.set(-0.7, 0.4, -3.4); // the middle of the furniture
  sky.position.copy(sky.target.position).addScaledVector(V(...L.sky.from).normalize(), 8);
  sky.castShadow = !off.has('skyshadow');
  sky.shadow.mapSize.setScalar(shadowSize().sky); // at 2048, about 2.3 mm a texel over the furniture, so thin legs keep their shadow
  Object.assign(sky.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 0.5, far: 16 });
  sky.shadow.camera.layers.set(FURNITURE_LAYER);
  sky.shadow.radius = L.sky.shadowSoftness;
  sky.shadow.bias = -0.0005;
  sky.shadow.normalBias = 0.004;
  // The side window: a lamp outside it, shining in. The wall casts its shadow (SIDE_LAYER: walls,
  // frames and furniture, not the curtain that hangs in the opening), so the light keeps the
  // window's shape, widens across the room and fades with distance.
  const SIDE_LAYER = 5;
  const sw = PLAN.sideWindow;
  const side = new THREE.SpotLight(L.side.color, L.side.intensity * LIGHT, L.side.reach, 0.62, 0.5, 2);
  side.position.set(PLAN.room.x1 + L.side.outside, 1.7, (sw.z0 + sw.z1) / 2);
  side.target.position.set(PLAN.room.x1 - 2.2, 0.2, (sw.z0 + sw.z1) / 2 - 0.25);
  side.castShadow = true;
  side.shadow.mapSize.setScalar(shadowSize().side);
  side.shadow.camera.near = 0.5;
  side.shadow.camera.far = L.side.reach;
  side.shadow.camera.layers.set(SIDE_LAYER);
  side.shadow.radius = L.side.shadowSoftness;
  side.shadow.bias = -0.0008;
  side.shadow.normalBias = 0.004;
  const lights = { sun, sky, side, bounce: hemi };
  scene.add(sun, sun.target, sky, sky.target, side, side.target, hemi);
  // ?off=sun,sky,side,bounce switches lights off, to see what each one does (one alone: the others off).
  for (const [name, light] of Object.entries(lights)) if (off.has(name)) light.intensity = 0;
  if (clay) {
    for (const c of [sun.color, sky.color, side.color, hemi.color, hemi.groundColor]) neutral(c);
    scene.background = new THREE.Color(CLAY_LOOK.colour).multiplyScalar(LIGHT);
  }

  const gradientMap = toonGradient(THEME.shading.bands, { smooth: THEME.shading.smooth });
  const T = THEME.textures;
  // The room's painted textures at twice their size on a drawing buffer of ratio 1.5 or more (the
  // texture detail setting, quality.js TEXTURES): seen from the seat, a plank texel covered about
  // 1.3-2.7 screen pixels at 2x (512 texels a metre), so the grain was magnified into blur.
  // ?paint=1 keeps the designed size. Made at load: changing the setting reloads the page.
  const TX = TEXTURES[Q.textures];
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
  for (const t of Object.values(textures)) t.anisotropy = aniso;
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
    ['leaf', M.leaf, null, { side: D }],
  ]) {
    if (clay) {
      // Plain grey, lit as it is; the lattice and carving keep their holes (their texture as a mask).
      const cut = key === 'lattice' || key === 'carve';
      if (cut) masks.push(maskOf(map));
      materials[key] = new THREE.MeshStandardMaterial({ color: CLAY_LOOK.colour, roughness: 1, metalness: 0, fog: false, side: extra?.side ?? THREE.FrontSide, map: cut ? masks.at(-1) : null, alphaTest: cut ? 0.5 : 0 });
      continue;
    }
    materials[key] = new THREE.MeshToonMaterial({ color, map, vertexColors: true, gradientMap, fog: false, ...extra });
    materials[key].emissiveIntensity *= LIGHT;
    if (debug === 'flat' && key !== 'lattice' && key !== 'carve') {
      materials[key].map = null;
      materials[key].color.set('#bdbdbd');
    }
  }

  if (!clay) shadeWalls(materials.wall, PLAN.room.top, L.windowWallShade);
  if (!clay && !off.has('gloss')) {
    const { window: windowGloss } = L.gloss;
    glossBoards(materials.floor, { window: windowGloss, ...L.gloss.floor, light: LIGHT, view: debug === 'gloss' });
    glossBoards(materials.top, { window: windowGloss, ...L.gloss.top, light: LIGHT, view: debug === 'gloss' });
  }
  const b = new Builder();
  // Each object rolls its own dice (interior/builder.js), so this order does not change the look.
  buildRoom(b.as('room'));
  buildLattice(b.as('lattice'));
  buildCurtains(b.as('curtains'));
  buildSeat(b.as('furniture'), PLAN.settee);
  for (const c of PLAN.chairs) buildSeat(b, c);
  for (const t of PLAN.tables) buildTable(b, t);
  const overlaps = furnitureOverlaps();
  if (overlaps.length) console.warn('furniture overlaps:', overlaps.join('; '));
  buildHangings(b.as('hangings'));
  if (flora !== 'blockout') buildVines(b.as('vines'));
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
      if (mesh.name === 'lattice') mesh.layers.enable(3); // and masks the ink of the view behind it (toon.js)
    }
    if (['leaf', 'decor'].includes(mesh.name)) mesh.castShadow = mesh.name === 'leaf';
    if (['wood', 'top', 'carve'].includes(mesh.name)) mesh.layers.enable(FURNITURE_LAYER);
    if (['wood', 'top', 'carve', 'wall', 'frame'].includes(mesh.name)) mesh.layers.enable(SIDE_LAYER);
    if (['lattice', 'carve', 'sheer', 'white'].includes(mesh.name)) mesh.userData.noAO = true; // cut-outs and sheer cloth (ao.js)
  }
  scene.add(room);
  const contact = buildContactShadows(textures.blob, sky.target.position.clone().sub(sky.position), textures.footBlob); // they fall the way the sky's light travels
  scene.add(contact.group);
  room.visible = contact.group.visible = !stage;

  // The fabrics (interior/fabrics.js): settled in Workers while the rest loads, then placed with
  // their 512 px photos. A fabric's 2048 px photo loads when its view is chosen (showFull). The
  // first frame waits for them (see tick), so they do not pop in.
  const fabricGroup = new THREE.Group();
  fabricGroup.visible = !stage;
  scene.add(fabricGroup);
  const fabricStore = clay ? null : createTextureStore(renderer);
  const fabricMeshes = new Map();
  let fabricsPending = true;
  const fabricsAt = performance.now();
  drapeAll()
    .then(async (results) => {
      if (destroyed) return;
      const settledMs = performance.now() - fabricsAt;
      const maps = clay ? [] : await Promise.all(PLAN.fabrics.map((f) => fabricStore.get(fabricIndex(f.fabric), 'preview')));
      if (destroyed) return;
      const staged = new THREE.Group();
      // The room's light ramp, in grey: its bands are tinted (warm lights, rosy darks), which
      // turned a lilac photo yellow-green. The cloth keeps the photo's own hues.
      const fabricGradient = toonGradient(THEME.shading.bands.map((b) => Array(3).fill((b[0] + b[1] + b[2]) / 3)), { smooth: THEME.shading.smooth });
      PLAN.fabrics.forEach((f, k) => {
        const g = fabricGeometry(results[k], FABRIC_PHOTOS[fabricIndex(f.fabric)].crop, f);
        partColour(g, k);
        const flat = debug === 'flat';
        const material = clay
          ? new THREE.MeshStandardMaterial({ color: CLAY_LOOK.colour, roughness: 1, metalness: 0, fog: false, side: D })
          : new THREE.MeshToonMaterial({
              map: flat ? null : maps[k], color: flat ? new THREE.Color('#bdbdbd') : new THREE.Color(...THEME.fabric.balance), gradientMap: fabricGradient, fog: false, side: D,
              transparent: true, opacity: 1, depthWrite: true, // opaque, as in the photos: at 0.95 the chair showed through the black scarf (5% of a lit chair is half the cloth's own value)
              // The photo's own colours (no part tint; the ink still reads the part id from the
              // colour attribute). Alpha 0 in the scene buffer marks the cloth, so the ink, the
              // pigment and the grade leave it close to its photo (THEME.fabric).
              blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
              blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor,
            });
        const mesh = new THREE.Mesh(g, material);
        mesh.name = `fabric-${f.name}`;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.layers.enable(FURNITURE_LAYER); // casts the sky's and the side window's shadows, like the furniture
        mesh.layers.enable(SIDE_LAYER);
        staged.add(mesh);
        fabricMeshes.set(f.name, mesh);
      });
      // Their shaders are compiled off the frame (in parallel where the driver can) before they
      // join the room: compiled inside a frame, they held the first exposure reading back.
      const compileAt = performance.now();
      await renderer.compileAsync(staged, camera, scene).catch(() => {});
      if (destroyed) return;
      const compileMs = performance.now() - compileAt;
      fabricGroup.add(...staged.children);
      renderer.shadowMap.needsUpdate = true; // the shadows are drawn once: again, with the fabrics
      // They change what the camera sees: metered again. The page does not wait for that reading:
      // it comes back behind the frames already queued (a few ms on a GPU, but up to a minute in
      // software GL), and the exposure adapts to it as on a change of view.
      metered = false;
      fabricsPending = false;
      metrics.fabrics = { settledMs: Math.round(settledMs), compileMs: Math.round(compileMs), readyMs: Math.round(performance.now() - fabricsAt), steps: results.map((r) => r.steps), simMs: results.map((r) => Math.round(r.ms)) };
      if (perf) Object.assign(perfLoad, { fabricsMs: metrics.fabrics.readyMs });
      if (debug) console.info('fabrics', JSON.stringify(metrics.fabrics));
      if (SHOTS[shot].fabric) showFull(SHOTS[shot].fabric);
      // Then every fabric's full photo, one after another, so the room views show them sharp too
      // (the 512 px previews blur at a laptop's 2x). Low texture detail or ?fabrics=preview keeps the previews.
      if ((params.get('fabrics') ?? TX.fabrics) !== 'preview')
        (async () => {
          for (const name of fabricMeshes.keys()) if (!destroyed) await showFull(name);
          metrics.fabricsFull = true;
        })();
    })
    .catch((e) => {
      console.error('fabrics', e);
      fabricsPending = false;
    });
  /** Swaps a fabric's 512 px photo for its full one (once loaded); resolves when it is shown. */
  function showFull(name) {
    const mesh = fabricMeshes.get(name);
    if (!fabricStore || !mesh || debug === 'flat') return Promise.resolve();
    const place = PLAN.fabrics.find((f) => f.name === name);
    return fabricStore.get(fabricIndex(place.fabric), 'full').then((t) => {
      if (!t || destroyed) return;
      mesh.material.map = t;
      mesh.material.needsUpdate = true;
    });
  }
  if (off.has('contact')) contact.group.visible = false;
  if (clay) contact.group.visible = false; // painted shadows: the clay render shows only the sun's

  // Outside: the Sarawak River at Kuching (outside/index.js). ?off=outside hides it (the windows
  // then show plain daylight). ?debug=flat and ?debug=silhouette also apply to it.
  const outsideAt = performance.now();
  const landscape = createOutside({ gradientMap, seed, fog: scene.fog, haze: AIR.daylight, light: LIGHT, key: AIR.key, sun: sun.position.clone().sub(sun.target.position), mode: clay ? 'clay' : debug === 'flat' || debug === 'silhouette' ? debug : undefined, stage, flora });
  const outsideMs = performance.now() - outsideAt;
  if (clay) scene.fog = null; // no haze
  landscape.group.visible = !off.has('outside');
  landscape.setWaterView({ 'water-normal': 1, 'water-fresnel': 2, 'water-filter': 3, 'water-reflection': 4, 'water-body': 5, 'water-crest': 6, 'water-lost': 7 }[debug] ?? 0);
  scene.traverse((o) => o.isLight && o.layers.enable(MIRROR_LAYER)); // the river's mirror is lit like the view itself
  landscape.group.userData.noAO = true; // the view outside is too far for AO, and it moves
  scene.add(landscape.group);
  let vineBlockout = null, removeLegend = null;
  if (flora) {
    vineBlockout = buildFloraBlockout([...vineMarkers(windowVineLayout(PLAN)), ...windowHangingProposal(PLAN), ...roomPlantsProposal(PLAN)], { opacity: flora === 'both' ? 0.55 : 1, firstColour: landscape.flora?.length ?? 0 });
    vineBlockout.group.visible = !stage;
    scene.add(vineBlockout.group);
    const legend = [...(landscape.flora ?? []), ...vineBlockout.legend];
    console.info('[flora]', JSON.stringify(legend.map(({ group, kind, count }) => ({ group, kind, count }))));
    removeLegend = showFloraLegend(legend, `?flora=${flora}`);
  }
  if (debug) {
    console.info('outside', JSON.stringify(landscape.stats));
    for (const [name, r] of Object.entries(landscape.reports)) {
      if (r.contract) console.info(`contract ${r.contract.name}: ${r.contract.checks.map((c) => `${c.id} = ${c.value}`).join('; ')}`);
      if (r.stats) console.info(`built ${name}`, JSON.stringify(r.stats));
    }
  }
  camera.layers.enable(1);

  const { color: ink, lineWidth, ...inkLook } = THEME.ink;
  const outline = createOutline(renderer, scene, camera, { ink, lineWidth, mask: [{ layer: 3, map: textures.lattice }, ...landscape.inkMasks] });
  setUniforms(outline.material.uniforms, inkLook);
  // The theme's ink, which the outlines setting (quality.js OUTLINES) scales.
  const inkBase = Object.fromEntries(Object.keys(OUTLINES.full).map((k) => [k, outline.material.uniforms[k].value]));
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Ambient occlusion (ao.js): darkens under the furniture and in the corners; before the ink.
  // The AO setting (quality.js AO): full is at most one AO pixel a CSS pixel, half is half that a
  // side, auto is half while the view moves and full when it holds still, off skips the pass.
  // ?aores=k: the AO buffer at k times the drawing buffer; ?aosamples=n (debug,
  // research/INTERIOR-NOTES.md, passes p1 and p2).
  const aoRes = num('aores');
  const aoScale = (moving = false) => aoRes ?? (moving ? (AO.moving[Q.ao] ?? AO.scale[Q.ao]) : AO.scale[Q.ao]) * Math.min(1, 1 / renderer.getPixelRatio());
  const ao = off.has('ao') || stage ? null : createAO(scene, camera, L.ao, { view: debug === 'ao', bufferScale: aoScale, samples: num('aosamples') });
  if (ao) composer.addPass(ao);
  if (ao) ao.enabled = Q.ao !== 'off' || aoRes !== null;
  const inkPass = !off.has('ink') && !clay;
  if (inkPass) composer.addPass(new ShaderPass(outline.material));
  // Watercolour (watercolour.js): pigment in linear light, then the finish pass.
  const pigment = new ShaderPass(PIGMENT_SHADER);
  const finish = new ShaderPass(FINISH_SHADER);
  finish.material.toneMapped = false; // the shader tone-maps itself
  const { detail: paintDetail, ...paintLook } = THEME.paint;
  setUniforms(pigment.uniforms, paintLook);
  setUniforms(finish.uniforms, THEME.grade);
  const paintView = { 'paint-pigment': 1, 'paint-edge': 2, 'paint-bleed': 3 }[debug] ?? 0;
  pigment.uniforms.view.value = paintView;
  const pigmentField = createPigmentField(renderer, pigment.uniforms, { detail: paintDetail });
  pigmentField.update(seed);
  if (!off.has('pigment') && !clay) composer.addPass(pigment);
  finish.uniforms.view.value = debug === 'fabric-mask' ? 2 : off.has('grade') || paintView || clay ? 1 : 0; // 1: tone map and encode only, no grade; 2: the fabric mask
  // The fabrics keep most of their photo (THEME.fabric; their material marks them with alpha 0).
  outline.material.uniforms.fabricKeep.value = pigment.uniforms.fabricKeep.value = finish.uniforms.fabricKeep.value = THEME.fabric.keep;
  outline.material.uniforms.fabricInk.value = THEME.fabric.ink;
  composer.addPass(finish);
  // ?set=pass.uniform:value,... (debug): overrides a post uniform, e.g. set=pigment.bleed:0 or set=ink.wobble:0.
  const overrides = [];
  for (const kv of (params.get('set') ?? '').split(',').filter(Boolean)) {
    const [path, v] = kv.split(':');
    const [pass, name] = path.split('.');
    const u = { ink: outline.material.uniforms, pigment: pigment.uniforms, finish: finish.uniforms }[pass]?.[name];
    if (u && typeof u.value === 'number') overrides.push([u, Number(v)]);
  }
  /** The outlines setting, then the ?set overrides over it. Off also skips the edge buffer (a second draw of the room). */
  function applyOutlines() {
    const f = OUTLINES[Q.outlines];
    outline.setLines(inkPass && !!f);
    if (f) for (const k in f) outline.material.uniforms[k].value = inkBase[k] * f[k];
    for (const [u, v] of overrides) u.value = v;
  }
  applyOutlines();
  // Anti-aliasing (SMAA) on the finished, encoded image, where its edge thresholds were set: it
  // smooths the 1 px ink lines and geometry edges, which otherwise crawl as the view turns.
  // ?off=aa leaves it out. The anti-aliasing setting (quality.js): on, off, or auto: skipped at a
  // pixel ratio of 2 or more (resize), where the lines are 2 device pixels wide and SMAA took 8%
  // of the sharpness (34% of the fine detail) at 2x, measured (research/INTERIOR-NOTES.md,
  // "Sharpness"). ?aa=1 keeps it at any ratio.
  const smaa = off.has('aa') ? null : new SMAAPass();
  if (smaa) {
    // Switched off, it keeps its two buffers (edges and blend weights) at one pixel instead of a
    // full screen each; resize() sets enabled before it sizes the passes.
    const setSize = smaa.setSize.bind(smaa);
    smaa.setSize = (w, h) => (smaa.enabled ? setSize(w, h) : setSize(1, 1));
    composer.addPass(smaa);
  }
  const meter = createMeter(renderer);
  let metered = false;
  let meterToken = 0;
  let destroyed = false;
  const metrics = { frames: 0, cpuMs: 0, frameMs: 0 };
  renderer.info.autoReset = false; // count draw calls over all passes of a frame

  let width = 0;
  let height = 0;
  let shot = stage ? 'window' : SHOTS[params.get('view')] ? params.get('view') : 'seat';
  const move = { t: 1, from: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: C.fov } };
  let exposure = null; // the exposure in use; it follows exposureTarget
  let exposureTarget = 1;
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    const ratio = ratioFor(w, h);
    if (ratio !== renderer.getPixelRatio()) {
      renderer.setPixelRatio(ratio);
      composer.setPixelRatio(ratio);
    }
    metrics.pixelRatio = ratio;
    renderer.setSize(w, h, false);
    if (smaa) smaa.enabled = params.get('aa') === '1' || Q.aa === 'on' || (Q.aa === 'auto' && renderer.getPixelRatio() < 2);
    composer.setSize(w, h);
    outline.setSize(w, h, renderer.getPixelRatio());
    pigment.uniforms.resolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    pigment.uniforms.scale.value = renderer.getPixelRatio();
    finish.uniforms.texel.value.set(1 / w, 1 / h);
    camera.aspect = w / h;
    // Keep R1's vertical view on wide screens; on narrow ones keep its horizontal view instead.
    if (move.t >= 1) {
      camera.fov = shotFov(shot);
      camera.updateProjectionMatrix();
    }
    metered = false; // a new framing shows a different share of window and wall
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    onResolution?.({ width: buffer.x, height: buffer.y, cssWidth: w, cssHeight: h, pixelRatio: +ratio.toFixed(3) });
  }
  /** The lens of a shot for the current screen shape (vertical degrees). */
  function shotFov(name) {
    if (name === 'seat') {
      // Wide screens keep R1's vertical view; narrow ones keep its horizontal view instead.
      const hTan = Math.tan(THREE.MathUtils.degToRad(C.fov / 2)) * C.aspect;
      return fovParam || (camera.aspect >= C.aspect ? C.fov : Math.min(80, THREE.MathUtils.radToDeg(2 * Math.atan(hTan / camera.aspect))));
    }
    if (stage && fovParam) return fovParam;
    return camera.aspect >= 1 ? SHOTS[name].fov : Math.min(80, SHOTS[name].fov + 14); // a little wider on tall screens
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  // Steps the resolution down while frames come too slowly. Measured only on frames where the
  // view moved (the AO is worked out again then: the dearest frames), after the first frame is
  // ready: PACE.frames such frames with a median interval over PACE.slowMs (24 ms: under about 40
  // a second) step the device ratio down once, then it measures again. ?dpr=n fixes the ratio; a
  // timed ?perf run keeps it too. It never goes below 2: a 3x phone may step to 2, a 2x laptop
  // keeps 2 (at 1.5 the picture lost a quarter of its sharpness, measured; the user asked not to
  // lower the resolution). The resolution setting still caps the pixels drawn (ratioFor).
  const pace = { steps: dprParam || params.has('perf') ? [] : PACE.steps.filter((r) => r < deviceRatio), last: 0, samples: [], seen: new THREE.Matrix4() };
  function paceResolution(now) {
    const moved = !pace.seen.equals(camera.matrixWorld);
    pace.seen.copy(camera.matrixWorld);
    const interval = now - pace.last;
    pace.last = now;
    if (!readyCalled || !pace.steps.length || !moved || interval > PACE.hiddenMs) return; // a hidden tab, not a pace
    pace.samples.push(interval);
    if (pace.samples.length < PACE.frames) return;
    const median = pace.samples.sort((a, b) => a - b)[PACE.frames >> 1];
    pace.samples = [];
    if (median <= PACE.slowMs) return;
    deviceRatio = pace.steps.shift();
    width = 0; // resize() sizes every pass again at the new ratio
    resize();
    console.info(`interior: frames took ${median.toFixed(1)} ms while moving; drawing at pixel ratio ${metrics.pixelRatio}`);
  }

  const pointer = new THREE.Vector2();
  const look = new THREE.Vector2();
  function onPointerMove(e) {
    if (fixedLook) return;
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }
  window.addEventListener('pointermove', onPointerMove);

  const eye = V(...C.eye);
  eye.z += camOffset;
  const eyeGiven = eyeParam?.length === 3 && eyeParam.every(Number.isFinite);
  if (eyeGiven) eye.set(...eyeParam);
  if (fixedLook) pointer.set(fixedLook[0] || 0, fixedLook[1] || 0);
  const target = new THREE.Vector3();
  // Where a shot puts the camera, with the pointer's turn added inside that shot's limits.
  const poseCam = new THREE.PerspectiveCamera();
  function poseOf(name, into) {
    const sh = SHOTS[name];
    const seat = name === 'seat';
    const free = seat || !!stage; // the inspection camera's parameters apply
    const at = seat || (stage && eyeGiven) ? eye : V(...sh.eye);
    // A shot aims either by its pitch (and faces -z) or at a point (`at`).
    const aim = sh.at ? [Math.atan2(sh.at[0] - at.x, at.z - sh.at[2]), Math.atan2(sh.at[1] - at.y, Math.hypot(sh.at[0] - at.x, sh.at[2] - at.z))] : [0, THREE.MathUtils.degToRad(seat ? C.pitch : sh.pitch)];
    const yaw = aim[0] + (free ? yawParam : 0) - look.x * sh.look[0];
    const pitch = aim[1] + (free ? pitchParam : 0) - look.y * sh.look[1];
    into.position.copy(at);
    target.set(at.x + Math.sin(yaw) * Math.cos(pitch), at.y + Math.sin(pitch), at.z - Math.cos(yaw) * Math.cos(pitch));
    into.lookAt(target);
  }
  /** Meters the scene from a shot's frame and sets the exposure to move towards. */
  function meterFor(name) {
    poseCam.aspect = camera.aspect;
    poseCam.fov = shotFov(name);
    poseCam.near = camera.near;
    poseCam.far = camera.far;
    poseCam.layers.mask = camera.layers.mask;
    poseCam.updateProjectionMatrix();
    poseOf(name, poseCam);
    poseCam.updateMatrixWorld();
    const token = ++meterToken; // only the latest reading counts
    meter
      .measure(scene, poseCam)
      .then((average) => {
        if (token !== meterToken || destroyed) return;
        exposureTarget = exposureParam ?? meter.exposureFor(average, L.exposureEV + SHOTS[name].ev);
        if (exposure === null) exposure = exposureTarget; // the first reading: no fade in
        metrics.luminance = average;
        metrics.exposure = exposureTarget;
        if (debug) console.info('meter: average luminance', average.toFixed(4), 'exposure', exposureTarget.toFixed(3), 'shot', name);
      })
      .catch(() => {}); // the scene was destroyed while the read was in flight
  }
  // The ink and pigment passes work before the tone map: they need the exposure to judge what
  // counts as a dark or a mid tone.
  function applyExposure(value) {
    finish.uniforms.toneMappingExposure.value = value;
    outline.material.uniforms.exposure.value = value / 1.85; // 1.85: the exposure its thresholds were tuned at
    pigment.uniforms.exposure.value = value;
    renderer.toneMappingExposure = value;
  }
  /** Moves to another shot: one eased interpolation of position, direction and lens. */
  function setShot(name, immediate = false) {
    if (!SHOTS[name] || (name === shot && move.t >= 1)) return;
    move.from.position.copy(camera.position);
    move.from.quaternion.copy(camera.quaternion);
    move.from.fov = camera.fov;
    shot = name;
    move.t = immediate ? 1 : 0;
    if (SHOTS[name].fabric) showFull(SHOTS[name].fabric);
    if (width) meterFor(name); // start adapting now, so the light changes during the move, not after it
    onShot?.(name);
  }
  const timer = new THREE.Timer();
  let frame = 0;
  // The frame rate for the settings panel's counter (onFrameRate): frames and the mean time between
  // them, from the frames' own timestamps, about twice a second (every frame when they are slower).
  // A hidden tab draws no frames: the count starts again when the page is shown, so that gap is not
  // counted, while a slow frame, however long, is.
  const rate = { from: null, frames: 0 };
  function countFrames(now) {
    if (!onFrameRate) return;
    if (rate.from === null) Object.assign(rate, { from: now, frames: 0 });
    else rate.frames++;
    const span = now - rate.from;
    if (span < 500 || !rate.frames) return;
    const fps = (rate.frames * 1000) / span;
    onFrameRate({ fps: fps < 10 ? +fps.toFixed(1) : Math.round(fps), ms: +(span / rate.frames).toFixed(1) });
    Object.assign(rate, { from: now, frames: 0 });
  }
  const onVisibility = () => (rate.from = null);
  document.addEventListener('visibilitychange', onVisibility);
  let readyCalled = false;
  function tick(now) {
    frame = requestAnimationFrame(tick);
    resize();
    timer.update(now);
    renderer.info.reset();
    const t0 = performance.now();
    perf?.begin();
    landscape.update(clockParam ?? timer.getElapsed());
    const dt = Math.min(timer.getDelta(), 0.1);
    if (fixedLook) look.copy(pointer);
    else {
      look.lerp(pointer, 1 - Math.exp(-dt * 2)); // smooths the input, not the camera
      // The smoothing only ever approaches the pointer: the view kept turning by fractions of a
      // pixel for about 17 s after each move (and the AO was worked out again every frame). Within
      // a twentieth of a pixel it takes the last step, and the view holds still.
      const f = (height || 1) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); // CSS px a radian
      const [lx, ly] = SHOTS[shot].look;
      if (Math.abs(pointer.x - look.x) * lx * f < 0.05 && Math.abs(pointer.y - look.y) * ly * f < 0.05) look.copy(pointer);
    }
    poseOf(shot, poseCam);
    if (move.t < 1) {
      // A move between shots is one interpolation and nothing else: no second smoother on top.
      move.t = Math.min(1, move.t + dt / SHOT_MOVE_SECONDS);
      const e = 1 - (1 - move.t) ** 1.8;
      camera.position.lerpVectors(move.from.position, poseCam.position, e);
      camera.quaternion.slerpQuaternions(move.from.quaternion, poseCam.quaternion, e);
      camera.fov = THREE.MathUtils.lerp(move.from.fov, shotFov(shot), e);
      camera.updateProjectionMatrix();
    } else {
      camera.position.copy(poseCam.position);
      camera.quaternion.copy(poseCam.quaternion);
    }
    if (!metered && width) {
      metered = true;
      meterFor(shot); // the reading arrives a frame or two later; the veil stays up until then
    }
    if (exposure !== null && exposure !== exposureTarget) {
      // Eye adaptation: quicker towards a brighter view than towards a darker one (the skill's rates).
      const rate = exposureTarget > exposure ? 3.2 : 1.1;
      exposure += (exposureTarget - exposure) * (1 - Math.exp(-dt * rate));
      if (Math.abs(exposure - exposureTarget) < 0.002 || fixedLook) exposure = exposureTarget;
    }
    if (exposure !== null) applyExposure(exposure);
    // The ink's hand and the wash stay on the room when the view turns (toon.js VIEW_FIELD).
    camera.updateMatrixWorld();
    paceResolution(now);
    countFrames(now);
    outline.setView();
    pigmentField.setView(camera);
    perf?.section('mirror');
    landscape.renderMirror(renderer, scene, camera);
    perf?.section(debug === 'nopost' ? 'scene' : 'ink-prep');
    if (debug === 'nopost') renderer.render(scene, camera);
    else {
      if (inkPass) outline.render();
      composer.render(dt);
    }
    perf?.end(now, performance.now() - t0);
    if (perf && perfLoad.firstFrameMs == null) Object.assign(perfLoad, { firstFrameMs: +(performance.now() - t0).toFixed(1), firstFrameAtMs: Math.round(performance.now()) });
    if (!readyCalled && exposure !== null && (!fabricsPending || performance.now() - startedAt > 12000)) {
      // Ready once a frame has been drawn at the metered exposure, with the fabrics in place (or
      // after 12 s without them).
      readyCalled = true;
      if (perf) perfLoad.readyAtMs = Math.round(performance.now());
      if (debug) console.info('triangles', renderer.info.render.triangles, 'calls', renderer.info.render.calls);
      onReady?.();
    }
    // Inspection metrics, from the first ready frame: after 15 warm-up frames, average 30 frames. cpuMs is the time spent in
    // this function (it does not include the GPU's own work); frameMs is the time between frames.
    if (readyCalled && (debug || params.has('cam') || params.has('off') || params.has('seed') || params.has('theme') || fixedLook || params.has('shot'))) {
      window.__interiorMetrics = metrics; // inspection scripts wait on .frames and .done
      metrics.frames++;
      metrics.eye = camera.position.toArray().map((v) => +v.toFixed(3));
      if (metrics.frames > 15 && metrics.frames <= 45) {
        metrics.cpuMs += (performance.now() - t0) / 30;
        metrics.frameMs += (timer.getDelta() * 1000) / 30;
      }
      if (metrics.frames === 46) {
        const px = renderer.getPixelRatio();
        metrics.triangles = renderer.info.render.triangles;
        metrics.calls = renderer.info.render.calls;
        metrics.textures = renderer.info.memory.textures;
        metrics.geometries = renderer.info.memory.geometries;
        const S = shadowSize();
        metrics.targets = `composer 2 x ${Math.round(width * px)}x${Math.round(height * px)} half-float; ${outline.lines ? 'ink 1 x same + depth' : 'ink lines off'}; shadows sun ${S.sun}, sky ${S.sky}, side ${S.side}; meter 64x36 half-float + 64x36 bytes`;
        metrics.done = true;
        console.info('metrics', JSON.stringify(metrics));
      }
    }
  }
  // ?perf: the timed run from the seat to the window (perf.js). It starts from the seat whatever
  // ?view says, so every run covers the same path.
  const perfLoad = { buildMs: +(performance.now() - startedAt).toFixed(1), outsideMs: +outsideMs.toFixed(1) };
  const perf = params.has('perf') ? createPerfRun(renderer, { hold: Number(params.get('perf')) || 3, go: () => setShot('window'), moving: () => move.t < 1, load: perfLoad }) : null;
  if (perf) {
    setShot('seat', true);
    // Time each composer pass on its own (scene, ao, ink, pigment, finish, aa).
    for (const pass of composer.passes) perf.wrap(pass, pass === pigment ? 'pigment' : pass === finish ? 'finish' : pass === smaa ? 'aa' : pass === ao ? 'ao' : pass instanceof RenderPass ? 'scene' : 'ink');
  }
  // Inspection handle for profiling scripts (?perf or ?debug only): stop the loop, draw one frame.
  if (perf || debug) {
    window.__interior = {
      renderer, scene, camera, composer, outline, landscape, setShot,
      get aoComputes() { return ao?.computes ?? null; }, // frames the AO was worked out (ao.js)
      stop: () => cancelAnimationFrame(frame),
      draw() {
        camera.updateMatrixWorld();
        outline.setView();
        pigmentField.setView(camera);
        landscape.renderMirror(renderer, scene, camera);
        if (inkPass) outline.render();
        composer.render(0);
      },
    };
  }
  frame = requestAnimationFrame(tick);

  return {
    setShot,
    getShot: () => shot,
    /**
     * Changes the graphics settings while the page runs (quality.js). Returns whether the page must
     * reload for them: the texture detail is made at load.
     */
    setQuality(next) {
      const n = normalise(next);
      const reload = n.textures !== Q.textures;
      const shadowsChanged = n.shadows !== Q.shadows;
      Object.assign(Q, n);
      applyOutlines();
      if (ao) ao.enabled = Q.ao !== 'off' || aoRes !== null;
      if (shadowsChanged) {
        const S = shadowSize();
        sun.shadow.mapSize.setScalar(S.sun);
        sky.shadow.mapSize.setScalar(S.sky);
        side.shadow.mapSize.setScalar(S.side);
        renderer.shadowMap.needsUpdate = true; // three.js resizes each map on its next draw (WebGLShadowMap)
      }
      width = 0; // resize() sizes every pass again: resolution, AO buffer, anti-aliasing
      resize();
      return { reload };
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      perf?.dispose();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointerMove);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      for (const m of Object.values(materials)) m.dispose();
      for (const m of fabricMeshes.values()) { m.material.gradientMap?.dispose(); m.material.dispose(); }
      fabricStore?.dispose();
      for (const t of Object.values(textures)) t.dispose();
      for (const t of masks) t.dispose();
      latticeDepth.dispose();
      carveDepth.dispose();
      contact.mat.dispose();
      contact.core.dispose();
      contact.foot.dispose();
      landscape.dispose();
      vineBlockout?.dispose();
      removeLegend?.();
      gradientMap.dispose();
      outline.dispose();
      pigment.dispose();
      pigmentField.dispose();
      finish.dispose();
      smaa?.dispose();
      meter.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
