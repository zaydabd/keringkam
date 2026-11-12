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
// stay as in R1.
//
// Pass graph (each has one owner and a way to switch it off; see research/INTERIOR-NOTES.md):
//   scene (linear HDR) -> ink (toon.js) -> pigment (watercolour.js) -> finish (exposure from
//   meter.js, the one tone map, sRGB, grade).
// Inspection, all as URL parameters before the #:
//   debug = nopost | flat | silhouette | paint-pigment | paint-edge | paint-bleed | gloss | meter
//           | water-normal | water-fresnel | water-filter | water-reflection | water-body
//           | water-crest | water-lost | tree-level | tree-kind
//   off   = ink, pigment, grade, outside (comma-separated: switches those off)
//   cam   = design (default) | near | far      look = x,y (fixes the pointer sway, -1..1)
//   view  = seat (default) | window (start in that camera shot; SHOTS below)
//   seed  = n (moves the pigment field and the painted textures)
//   t     = seconds (stops the clock of the view outside, so two captures match pixel for pixel)
//   eye = x,y,z   yaw = deg   pitch = deg   fov = deg   (a free camera, for close-ups)
//   perf  (or perf=n: n seconds per shot) a timed run from the seat to the window (perf.js)
//   theme = off: a clay render, the scene without its look (no colours, painted textures, toon
//           bands, ink, watercolour, grade or painted fakes; white light, real shadows). The
//           "Theme off" button in Interior.svelte sets it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { toonGradient, createOutline } from './toon.js';
import { paintPlanks, paintLattice, paintCurtain, paintCloth, paintDecor, paintGlow } from './paint.js';
import { createOutside, OBJECTS, MIRROR_LAYER, CLAY } from './outside/index.js';
import { PIGMENT_SHADER, FINISH_SHADER, createPigmentField } from './watercolour.js';
import { createMeter } from './meter.js';
import { createPerfRun } from './perf.js';
import { INTERIOR_THEME } from './themes/interior.js';
import { OUTSIDE_THEME } from './themes/outside.js';
import { PLAN } from './interior/plan.js';
import { V, Builder } from './interior/builder.js';
import { buildRoom } from './interior/room.js';
import { buildLattice } from './interior/lattice.js';
import { buildCurtains } from './interior/curtains.js';
import { buildSeat, furnitureOverlaps, buildTable } from './interior/furniture.js';
import { buildEmbroideryFrame } from './interior/frame.js';
import { buildHangings } from './interior/hangings.js';
import { buildVines } from './interior/vines.js';
import { shadeWalls, glossBoards, buildContactShadows } from './interior/surfaces.js';
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
const SHOT_MOVE_SECONDS = 2.2;

export function createInterior(canvas, { onReady, onShot } = {}) {
  const startedAt = performance.now();
  const params = new URLSearchParams(window.location.search);
  const debug = params.get('debug');
  const clay = params.get('theme') === 'off';
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
  const clockParam = num('t');
  // ?stage=farbank,trees,... shows only those objects of the view outside (outside/index.js
  // OBJECTS), without the room, from the window shot's eye; yaw, pitch, fov and eye then apply to
  // it. ?exposure=n sets the exposure instead of metering (the stage uses the window shot's 1.85).
  const stage = params.get('stage')?.split(',').filter((n) => OBJECTS.includes(n)) ?? null;
  const exposureParam = num('exposure') ?? (stage ? 1.85 : null);
  // No MSAA on the screen under post-processing: the scene is drawn into the composer's own
  // (single-sample) buffers and only the last full-screen pass reaches the screen, so screen MSAA
  // would smooth nothing and still cost its memory and resolve. ?debug=nopost draws straight to
  // the screen and keeps it.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: debug === 'nopost' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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

  // Light: sun behind the window wall, high enough that the patches fall just inside the windows.
  const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity * LIGHT);
  sun.target.position.set(-1, 0, -4);
  sun.position.set(-4, 11, -14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = new THREE.HemisphereLight(L.bounce.sky, L.bounce.ground, L.bounce.intensity * LIGHT); // warm bounce off the floor and walls
  const fill = new THREE.DirectionalLight(L.fill.color, L.fill.intensity * LIGHT); // soft light from the room behind the camera
  fill.position.set(1.5, 2.5, 4);
  scene.add(sun, sun.target, hemi, fill);
  if (clay) {
    for (const c of [sun.color, hemi.color, hemi.groundColor, fill.color]) neutral(c);
    scene.background = new THREE.Color(CLAY).multiplyScalar(LIGHT);
  }

  const gradientMap = toonGradient(THEME.shading.bands, { smooth: THEME.shading.smooth });
  const T = THEME.textures;
  const textures = {
    planks: paintPlanks(1 + seed, T.planks.boards),
    floor: paintPlanks(9 + seed, T.planks.floor),
    wall: paintPlanks(5 + seed, T.planks.wall),
    lattice: paintLattice(11, T.lattice),
    carve: paintLattice(17, T.lattice),
    valance: paintCurtain(12 + seed, T.curtains.valance),
    sheer: paintCurtain(16 + seed, T.curtains.drape),
    cloth: paintCloth(13 + seed, T.cloth),
    pale: paintCurtain(31 + seed, T.curtains.pale),
    decor: paintDecor(14, T.decor),
    blob: paintGlow('round'),
  };
  textures.lattice.repeat.set(1.6, 1.6);
  textures.carve.repeat.set(3.4, 3.4); // finer: chair-back carving
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
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
    ['cloth', M.cloth, textures.cloth, { side: D, emissive: G.cloth, emissiveMap: textures.cloth, emissiveIntensity: L.glow.cloth }],
    ['decor', M.decor, textures.decor, { side: D }],
    ['plate', M.plate, null],
    ['leaf', M.leaf, null, { side: D }],
    ['tape', M.tape, null],
    ['bag', M.bag, null],
  ]) {
    if (clay) {
      // Plain grey, lit as it is; the lattice and carving keep their holes (their texture as a mask).
      const cut = key === 'lattice' || key === 'carve';
      if (cut) masks.push(maskOf(map));
      materials[key] = new THREE.MeshStandardMaterial({ color: CLAY, roughness: 1, metalness: 0, fog: false, side: extra?.side ?? THREE.FrontSide, map: cut ? masks.at(-1) : null, alphaTest: cut ? 0.5 : 0 });
      continue;
    }
    materials[key] = new THREE.MeshToonMaterial({ color, map, vertexColors: true, gradientMap, fog: false, ...extra });
    materials[key].emissiveIntensity *= LIGHT;
    if (debug === 'flat' && key !== 'lattice' && key !== 'carve') {
      materials[key].map = null;
      materials[key].color.set('#bdbdbd');
    }
  }

  if (!clay) {
    shadeWalls(materials.wall, PLAN.room.top);
    const { window: windowGloss, clothTint } = L.gloss;
    glossBoards(materials.floor, { window: windowGloss, clothTint, ...L.gloss.floor, light: LIGHT, view: debug === 'gloss' });
    glossBoards(materials.top, { window: windowGloss, clothTint, ...L.gloss.top, light: LIGHT, view: debug === 'gloss' });
  }
  const b = new Builder();
  buildRoom(b);
  buildLattice(b);
  buildCurtains(b);
  buildSeat(b, PLAN.settee);
  for (const c of PLAN.chairs) buildSeat(b, c);
  for (const t of PLAN.tables) buildTable(b, t);
  const overlaps = furnitureOverlaps();
  if (overlaps.length) console.warn('furniture overlaps:', overlaps.join('; '));
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
      if (mesh.name === 'lattice') mesh.layers.enable(3); // and masks the ink of the view behind it (toon.js)
    }
    if (['leaf', 'cloth', 'decor'].includes(mesh.name)) mesh.castShadow = mesh.name === 'leaf';
  }
  scene.add(room);
  const contact = buildContactShadows(textures.blob);
  scene.add(contact.group);
  room.visible = contact.group.visible = !stage;
  if (clay) contact.group.visible = false; // painted shadows: the clay render shows only the sun's

  // Outside: the Sarawak River at Kuching (outside/index.js). ?off=outside hides it (the windows
  // then show plain daylight). ?debug=flat and ?debug=silhouette also apply to it.
  const outsideAt = performance.now();
  const landscape = createOutside({ gradientMap, seed, fog: scene.fog, haze: AIR.daylight, light: LIGHT, key: AIR.key, sun: sun.position.clone().sub(sun.target.position), mode: clay ? 'clay' : debug === 'flat' || debug === 'silhouette' ? debug : undefined, stage, tint: debug?.startsWith('tree-') ? debug : undefined });
  const outsideMs = performance.now() - outsideAt;
  if (clay) scene.fog = null; // no haze
  landscape.group.visible = !off.has('outside');
  landscape.setWaterView({ 'water-normal': 1, 'water-fresnel': 2, 'water-filter': 3, 'water-reflection': 4, 'water-body': 5, 'water-crest': 6, 'water-lost': 7 }[debug] ?? 0);
  scene.traverse((o) => o.isLight && o.layers.enable(MIRROR_LAYER)); // the river's mirror is lit like the view itself
  scene.add(landscape.group);
  if (debug) {
    console.info('outside', JSON.stringify(landscape.stats));
    for (const [name, r] of Object.entries(landscape.reports)) {
      if (r.contract) console.info(`contract ${r.contract.name}: ${r.contract.checks.map((c) => `${c.id} = ${c.value}`).join('; ')}`);
      if (r.stats) console.info(`built ${name}`, JSON.stringify(r.stats));
    }
  }
  camera.layers.enable(1);

  const { color: ink, lineWidth, ...inkLook } = THEME.ink;
  const outline = createOutline(renderer, scene, camera, { ink, lineWidth, mask: { layer: 3, map: textures.lattice } });
  setUniforms(outline.material.uniforms, inkLook);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const inkPass = !off.has('ink') && !clay;
  if (inkPass) composer.addPass(new ShaderPass(outline.material));
  // Watercolour (watercolour.js): pigment in linear light, then the finish pass.
  const pigment = new ShaderPass(PIGMENT_SHADER);
  const finish = new ShaderPass(FINISH_SHADER);
  finish.material.toneMapped = false; // the shader tone-maps itself
  setUniforms(pigment.uniforms, THEME.paint);
  setUniforms(finish.uniforms, THEME.grade);
  const paintView = { 'paint-pigment': 1, 'paint-edge': 2, 'paint-bleed': 3 }[debug] ?? 0;
  pigment.uniforms.view.value = paintView;
  const pigmentField = createPigmentField(renderer);
  pigment.uniforms.tField.value = pigmentField.texture;
  if (!off.has('pigment') && !clay) composer.addPass(pigment);
  finish.uniforms.view.value = off.has('grade') || paintView || clay ? 1 : 0; // 1: tone map and encode only, no grade
  composer.addPass(finish);
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
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    outline.setSize(w, h, renderer.getPixelRatio());
    pigment.uniforms.resolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    pigment.uniforms.scale.value = renderer.getPixelRatio();
    pigmentField.update(w * renderer.getPixelRatio(), h * renderer.getPixelRatio(), renderer.getPixelRatio(), seed);
    camera.aspect = w / h;
    // Keep R1's vertical view on wide screens; on narrow ones keep its horizontal view instead.
    if (move.t >= 1) {
      camera.fov = shotFov(shot);
      camera.updateProjectionMatrix();
    }
    metered = false; // a new framing shows a different share of window and wall
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
    const yaw = (free ? yawParam : 0) - look.x * sh.look[0];
    const pitch = THREE.MathUtils.degToRad(seat ? C.pitch : sh.pitch) + (free ? pitchParam : 0) - look.y * sh.look[1];
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
    if (width) meterFor(name); // start adapting now, so the light changes during the move, not after it
    onShot?.(name);
  }
  const timer = new THREE.Timer();
  let frame = 0;
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
    else look.lerp(pointer, 1 - Math.exp(-dt * 2)); // smooths the input, not the camera
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
    if (!readyCalled && exposure !== null) {
      // Ready once a frame has been drawn at the metered exposure.
      readyCalled = true;
      if (perf) perfLoad.readyAtMs = Math.round(performance.now());
      if (debug) console.info('triangles', renderer.info.render.triangles, 'calls', renderer.info.render.calls);
      onReady?.();
    }
    // Inspection metrics: after 15 warm-up frames, average 30 frames. cpuMs is the time spent in
    // this function (it does not include the GPU's own work); frameMs is the time between frames.
    if (debug || params.has('cam') || params.has('off') || params.has('seed') || params.has('theme') || fixedLook || params.has('shot')) {
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
        metrics.targets = `composer 2 x ${Math.round(width * px)}x${Math.round(height * px)} half-float; ink 1 x same + depth; shadow 2048x2048; meter 64x36 half-float + 64x36 bytes`;
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
    // Time each composer pass on its own (scene, ink, pigment, finish).
    for (const pass of composer.passes) perf.wrap(pass, pass === pigment ? 'pigment' : pass === finish ? 'finish' : pass instanceof RenderPass ? 'scene' : 'ink');
  }
  // Inspection handle for profiling scripts (?perf or ?debug only): stop the loop, draw one frame.
  if (perf || debug) {
    window.__interior = {
      renderer, scene, camera, composer, outline, landscape, setShot,
      stop: () => cancelAnimationFrame(frame),
      draw() {
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
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      perf?.dispose();
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      for (const m of Object.values(materials)) m.dispose();
      for (const t of Object.values(textures)) t.dispose();
      for (const t of masks) t.dispose();
      latticeDepth.dispose();
      carveDepth.dispose();
      contact.mat.dispose();
      contact.core.dispose();
      landscape.dispose();
      gradientMap.dispose();
      outline.dispose();
      pigment.dispose();
      pigmentField.dispose();
      finish.dispose();
      meter.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
