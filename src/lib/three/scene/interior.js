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
// Keys: with Walk on (the button beside Graphics; setWalk), W/S or up/down move forward/back and
//   A/D or left/right slide sideways; Shift: faster. Dragging on the view (mouse or touch) turns it
//   all the way round, at any time. Choosing a view from the menu goes back to that
//   view. No collision: it can pass through walls.
//   theme = original (default) | detailed | clay: the theme (themes/index.js). clay is the clay render, the
//           scene without its look (themes/clay.js); theme=off still means clay. The theme
//           picker in Interior.svelte sets it.

import * as THREE from 'three';
import './stableShadows.js'; // soft shadow edges dithered on the world, not the screen
import { toonGradient } from './toon.js';
import { paintPlanks, paintCarving, paintWindowLattice, paintCurtain, paintDecor, paintGlow, setPaintDetail } from './paint.js';
import { createOutside, OBJECTS } from './outside/index.js';
import { createMeter } from './meter.js';
import { RESOLUTIONS, MAX_PIXEL_RATIO, MIN_PIXEL_RATIO, PACE, SHADOWS, TEXTURES, normalise } from './quality.js';
import { createPerfRun } from './perf.js';
import { INTERIOR_THEME, OUTSIDE_THEME, CLAY_LOOK } from './themes/index.js';
import { PLAN } from './interior/plan.js';
import { V, Builder } from './interior/builder.js';
import { buildRoom } from './interior/room.js';
import { buildExterior } from './interior/exterior.js';
import { buildLattice, LATTICE_TILE } from './interior/lattice.js';
import { buildCurtains } from './interior/curtains.js';
import { buildSeat, furnitureOverlaps, buildTable } from './interior/furniture.js';
import { buildHangings } from './interior/hangings.js';
import { buildVines } from './interior/vines.js';
import { floraMode, windowHangingProposal, roomPlantsProposal } from './floraLayout.js';
import { buildFloraStylised } from './floraStylised.js';
import { gardenChoice, buildGarden, buildBeds } from './garden.js';
import { shadeWalls, glossBoards, buildContactShadows } from './interior/surfaces.js';
import { sceneOptions } from '../../utils/urlOptions.js';
import { maskOf } from './interior/helpers.js';
import { createLights } from './interior/lights.js';
import { NO_INK_LAYER, MIRROR_LAYER, INK_MASK_LAYER, FURNITURE_LAYER, SIDE_LAYER } from './layers.js';
import { SHOTS, SHOT_MOVE_SECONDS } from './interior/shots.js';
import { createControls } from './interior/controls.js';
import { createFrameCounter } from './interior/frameRate.js';
import { createPost } from './interior/post.js';
import { loadFabrics } from './interior/fabricLoader.js';
export { SHOTS, FABRIC_VIEWS } from './interior/shots.js';
export { PLAN } from './interior/plan.js';
export { furnitureOverlaps } from './interior/furniture.js';

const THEME = INTERIOR_THEME;

export function createInterior(canvas, { onReady, onShot, onResolution, onFrameRate, quality } = {}) {
  // The graphics settings (quality.js): the resolution, AO, shadows, anti-aliasing and texture
  // detail. setQuality changes them while the page runs.
  const Q = normalise(quality);
  const startedAt = performance.now();
  const params = sceneOptions();
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
  // The stylised plants (floraStylised.js) are on by default; ?flora=off leaves them out.
  const flora = floraMode(params);
  // No MSAA on the screen under post-processing: the scene is drawn into the composer's own
  // (single-sample) buffers and only the last full-screen pass reaches the screen, so screen MSAA
  // would smooth nothing and still cost its memory and resolve. ?debug=nopost draws straight to
  // the screen and keeps it.
  // Everything with a dispose() that destroy() must free, in the order made: destroy() frees it
  // in reverse, so the renderer goes last.
  const owned = [];
  const own = (x) => (x && owned.push(x), x);
  const renderer = own(new THREE.WebGLRenderer({ canvas, antialias: debug === 'nopost' }));
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

  // The lights (interior/lights.js).
  const shadowSize = () => SHADOWS[Q.shadows]; // quality.js
  const { sun, sky, side } = createLights(scene, { L, level: LIGHT, size: shadowSize(), off, clay });
  if (clay) scene.background = new THREE.Color(CLAY_LOOK.colour).multiplyScalar(LIGHT);

  const gradientMap = own(toonGradient(THEME.shading.bands, { smooth: THEME.shading.smooth }));
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
    ['leaf', M.leaf, null, { side: D }],
    // The house outside (interior/exterior.js)
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

  for (const m of Object.values(materials)) own(m);
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
  buildVines(b.as('vines'));
  const room = new THREE.Group();
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
    if (['leaf', 'decor'].includes(mesh.name)) mesh.castShadow = mesh.name === 'leaf';
    if (['wood', 'top', 'carve'].includes(mesh.name)) mesh.layers.enable(FURNITURE_LAYER);
    if (['wood', 'top', 'carve', 'wall', 'frame'].includes(mesh.name)) mesh.layers.enable(SIDE_LAYER);
    if (['lattice', 'carve', 'sheer', 'white'].includes(mesh.name)) mesh.userData.noAO = true; // cut-outs and sheer cloth (ao.js)
  }
  scene.add(room);
  const contact = buildContactShadows(textures.blob, sky.target.position.clone().sub(sky.position), textures.footBlob); // they fall the way the sky's light travels
  scene.add(contact.group);
  own(contact.mat), own(contact.core), own(contact.foot);
  room.visible = contact.group.visible = !stage;

  // The house outside the room (interior/exterior.js): its own builder, so it can be shown or
  // hidden as one (?off=house). Seen only from outside: the room's views do not change.
  const hb = new Builder();
  buildExterior(hb.as('house'));
  const gardenPick = gardenChoice(params);
  if (gardenPick) buildBeds(hb.as('garden beds'), gardenPick.layout);
  const house = new THREE.Group();
  house.name = 'house';
  house.add(...hb.build(materials));
  // The house casts no sun shadow for now: its eaves shaded the curtains, and its deeper window
  // reveals narrowed the sun on the floor, so both room views changed. The room's own walls still
  // cast the house's shadow on the ground. The ground takes the haze: it runs far inland.
  for (const mesh of house.children) mesh.castShadow = false;
  if (!clay) materials.ground.fog = true;
  house.visible = !stage && !off.has('house');
  scene.add(house);

  // The fabrics (interior/fabricLoader.js). The first frame waits for them (see tick), so they do
  // not pop in. Low texture detail or ?fabrics=preview keeps their 512 px previews.
  const fabrics = own(loadFabrics({
    renderer, scene, camera, theme: THEME, clay, flat: debug === 'flat', stage,
    previewsOnly: (params.get('fabrics') ?? TX.fabrics) === 'preview',
    onPlaced(stats) {
      if (!stats) return;
      // They change what the camera sees: metered again. The page does not wait for that reading:
      // it comes back behind the frames already queued (a few ms on a GPU, but up to a minute in
      // software GL), and the exposure adapts to it as on a change of view.
      metered = false;
      metrics.fabrics = stats;
      if (perf) Object.assign(perfLoad, { fabricsMs: stats.readyMs });
      if (debug) console.info('fabrics', JSON.stringify(stats));
      if (SHOTS[shot].fabric) fabrics.showFull(SHOTS[shot].fabric);
    },
    onFull: () => (metrics.fabricsFull = true),
  }));
  if (off.has('contact')) contact.group.visible = false;
  if (clay) contact.group.visible = false; // painted shadows: the clay render shows only the sun's

  // Outside: the Sarawak River at Kuching (outside/index.js). ?off=outside hides it (the windows
  // then show plain daylight). ?debug=flat and ?debug=silhouette also apply to it.
  const outsideAt = performance.now();
  const landscape = own(createOutside({ gradientMap, seed, fog: scene.fog, haze: AIR.daylight, light: LIGHT, key: AIR.key, sun: sun.position.clone().sub(sun.target.position), mode: clay ? 'clay' : debug === 'flat' || debug === 'silhouette' ? debug : undefined, stage, flora }));
  const outsideMs = performance.now() - outsideAt;
  if (clay) scene.fog = null; // no haze
  landscape.group.visible = !off.has('outside');
  landscape.setWaterView({ 'water-normal': 1, 'water-fresnel': 2, 'water-filter': 3, 'water-reflection': 4, 'water-body': 5, 'water-crest': 6, 'water-lost': 7 }[debug] ?? 0);
  scene.traverse((o) => o.isLight && o.layers.enable(MIRROR_LAYER)); // the river's mirror is lit like the view itself
  landscape.group.userData.noAO = true; // the view outside is too far for AO, and it moves
  scene.add(landscape.group);
  let vineBlockout = null;
  if (flora === 'stylised') {
    vineBlockout = own(buildFloraStylised([...windowHangingProposal(PLAN, { skipMiddle: true }), ...roomPlantsProposal(PLAN)]));
    vineBlockout.group.visible = !stage;
    scene.add(vineBlockout.group);
    console.info('[flora] stylised', JSON.stringify({ outside: landscape.floraStats, room: vineBlockout.stats }));
  }
  // Planting round the house (garden.js); ?garden=off leaves it out.
  const garden = gardenPick ? own(buildGarden(gardenPick)) : null;
  if (garden) {
    garden.group.visible = !stage && !off.has('house');
    scene.add(garden.group);
    console.info('[garden]', JSON.stringify(garden.stats));
  }
  if (debug) {
    console.info('outside', JSON.stringify(landscape.stats));
    for (const [name, r] of Object.entries(landscape.reports)) {
      if (r.contract) console.info(`contract ${r.contract.name}: ${r.contract.checks.map((c) => `${c.id} = ${c.value}`).join('; ')}`);
      if (r.stats) console.info(`built ${name}`, JSON.stringify(r.stats));
    }
  }
  camera.layers.enable(NO_INK_LAYER);

  // Post-processing (interior/post.js).
  const post = own(createPost(renderer, scene, camera, { theme: THEME, quality: Q, params, off, debug, clay, stage, seed, inkMask: textures.lattice }));
  const meter = own(createMeter(renderer));
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
      post.setPixelRatio(ratio);
    }
    metrics.pixelRatio = ratio;
    renderer.setSize(w, h, false);
    post.setSize(w, h);
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

  // The pointer's sway, walking with the keys and dragging to look (interior/controls.js).
  const controls = own(createControls(canvas, camera, { fixedLook }));
  const { pointer, walk, turn } = controls;
  const look = new THREE.Vector2();

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
    const yaw = aim[0] + (free ? yawParam : 0) - look.x * sh.look[0] + turn.x;
    const pitch = THREE.MathUtils.clamp(aim[1] + (free ? pitchParam : 0) - look.y * sh.look[1] + turn.y, -1.4, 1.4);
    into.position.copy(at).add(walk);
    target.set(into.position.x + Math.sin(yaw) * Math.cos(pitch), into.position.y + Math.sin(pitch), into.position.z - Math.cos(yaw) * Math.cos(pitch));
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
  /** Moves to another shot: one eased interpolation of position, direction and lens. */
  function setShot(name, immediate = false) {
    if (!SHOTS[name] || (name === shot && move.t >= 1)) return;
    move.from.position.copy(camera.position);
    move.from.quaternion.copy(camera.quaternion);
    move.from.fov = camera.fov;
    shot = name;
    controls.reset(); // a view from the menu starts where that view stands, facing its way
    move.t = immediate ? 1 : 0;
    if (SHOTS[name].fabric) fabrics.showFull(SHOTS[name].fabric);
    if (width) meterFor(name); // start adapting now, so the light changes during the move, not after it
    onShot?.(name);
  }
  const timer = new THREE.Timer();
  let frame = 0;
  const frames = own(createFrameCounter(onFrameRate)); // the settings panel's counter (interior/frameRate.js)
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
    controls.step(dt);
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
    if (exposure !== null) post.setExposure(exposure);
    camera.updateMatrixWorld();
    paceResolution(now);
    frames.count(now);
    post.setView();
    perf?.section('mirror');
    landscape.renderMirror(renderer, scene, camera);
    perf?.section(debug === 'nopost' ? 'scene' : 'ink-prep');
    if (debug === 'nopost') renderer.render(scene, camera);
    else post.render(dt);
    perf?.end(now, performance.now() - t0);
    if (perf && perfLoad.firstFrameMs == null) Object.assign(perfLoad, { firstFrameMs: +(performance.now() - t0).toFixed(1), firstFrameAtMs: Math.round(performance.now()) });
    if (!readyCalled && exposure !== null && (!fabrics.pending || performance.now() - startedAt > 12000)) {
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
        metrics.targets = `composer 2 x ${Math.round(width * px)}x${Math.round(height * px)} half-float; ${post.outline.lines ? 'ink 1 x same + depth' : 'ink lines off'}; shadows sun ${S.sun}, sky ${S.sky}, side ${S.side}; meter 64x36 half-float + 64x36 bytes`;
        metrics.done = true;
        console.info('metrics', JSON.stringify(metrics));
      }
    }
  }
  // ?perf: the timed run from the seat to the window (perf.js). It starts from the seat whatever
  // ?view says, so every run covers the same path.
  const perfLoad = { buildMs: +(performance.now() - startedAt).toFixed(1), outsideMs: +outsideMs.toFixed(1) };
  const perf = params.has('perf') ? own(createPerfRun(renderer, { hold: Number(params.get('perf')) || 3, go: () => setShot('window'), moving: () => move.t < 1, load: perfLoad })) : null;
  if (perf) {
    setShot('seat', true);
    // Time each composer pass on its own (scene, ao, ink, pigment, finish, aa).
    for (const pass of post.composer.passes) perf.wrap(pass, post.passName(pass));
  }
  // Inspection handle for profiling scripts (?perf or ?debug only): stop the loop, draw one frame.
  if (perf || debug) {
    window.__interior = {
      renderer, scene, camera, composer: post.composer, outline: post.outline, landscape, setShot,
      get aoComputes() { return post.ao?.computes ?? null; }, // frames the AO was worked out (ao.js)
      stop: () => cancelAnimationFrame(frame),
      draw() {
        camera.updateMatrixWorld();
        post.setView();
        landscape.renderMirror(renderer, scene, camera);
        post.render(0);
      },
    };
  }
  frame = requestAnimationFrame(tick);

  return {
    setShot,
    getShot: () => shot,
    /** Turns walking with WASD and the arrow keys on or off; off stops any held key. */
    setWalk: (on) => controls.setWalk(on),
    /**
     * Changes the graphics settings while the page runs (quality.js). Returns whether the page must
     * reload for them: the texture detail is made at load.
     */
    setQuality(next) {
      const n = normalise(next);
      const reload = n.textures !== Q.textures;
      const shadowsChanged = n.shadows !== Q.shadows;
      Object.assign(Q, n);
      post.applyQuality();
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
      resizeObserver.disconnect();
      scene.traverse((o) => o.geometry?.dispose());
      for (const x of owned.reverse()) x.dispose();
    },
  };
}
