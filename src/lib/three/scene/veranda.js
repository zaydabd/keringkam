// The veranda page: a fully 3D background (riverScene.js) with the keringkam overlaid on top.
//
// The two are separate: the background has its own camera; the keringkam is simulated cloth in
// its own small scene and camera, drawn over the background in a second pass. They do not collide
// or share geometry. Only the light is shared, so the cloth is lit like the scene behind it.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ClothSim } from '../gallery/clothSim.js';
import { fabrics, wrap, loopDistance, createTextureStore } from '../common.js';
import { createRiverScene, MOODS } from './riverScene.js';

export { MOODS };

const EYE = new THREE.Vector3(0, 1.15, 1.9); // seated, a little back from the railing
const LOOK = new THREE.Vector3(0, 1.12, -2.4);
const BAR_R = 0.03; // the invisible bar the cloth is folded over
const BACK = 0.4; // share of the cloth behind the bar
const PARTICLES = 40;
const STEP = 1 / 60;

/** Cloth size in the overlay's units: 1.5 long, wide pieces up to 1.9 wide. */
function clothSize(i) {
  const { width, height } = fabrics[i];
  const aspect = width / height;
  return aspect >= 1 ? { w: Math.min(1.9, 1.5 * aspect), h: Math.min(1.9, 1.5 * aspect) / aspect } : { w: 1.5 * aspect, h: 1.5 };
}

export function createVeranda(canvas, { onChange, onReady } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // the scene is heavy; cap the resolution
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // ---- background: the 3D river scene ----
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 6000);
  camera.position.copy(EYE);
  const river = createRiverScene(scene, renderer);
  const bgSun = scene.children.find((o) => o.isDirectionalLight);
  const bgHemi = scene.children.find((o) => o.isHemisphereLight);

  // ---- overlay: the keringkam, in its own scene and camera ----
  const clothScene = new THREE.Scene();
  const clothCamera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  clothCamera.position.set(0, 0, 4.6);
  const hemi = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  const fill = new THREE.DirectionalLight('#ffffff', 0.35);
  fill.position.set(0, 0.5, 3); // a soft light from the viewer's side, so the front isn't in silhouette
  clothScene.add(hemi, key, fill);

  // ---- passes: background, then the cloth on top, then soft bloom ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const clothPass = new RenderPass(clothScene, clothCamera);
  clothPass.clear = false;
  clothPass.clearDepth = true;
  composer.addPass(clothPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.28, 0.5, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---- the keringkam ----
  const store = createTextureStore(renderer);
  let index = 0;
  let current = null;
  const leaving = [];
  let ready = false;

  function makePiece(i) {
    const { w, h } = clothSize(i);
    const cols = w >= h ? PARTICLES : Math.max(10, Math.round((PARTICLES * w) / h));
    const rows = w >= h ? Math.max(10, Math.round((PARTICLES * h) / w)) : PARTICLES;
    const sim = new ClothSim(w, h, cols, rows);

    // Folded over an invisible bar at the origin: a short part behind, the rest hanging in front.
    const foldRow = Math.round(BACK * (rows - 1));
    const spacing = h / (rows - 1);
    const arc = (Math.PI * BAR_R) / 2;
    for (let r = 0; r < rows; r++) {
      const u = (r - foldRow) * spacing;
      let y;
      let z;
      if (u > arc) [y, z] = [-(u - arc), BAR_R];
      else if (u < -arc) [y, z] = [-(-u - arc), -BAR_R];
      else [y, z] = [BAR_R * Math.cos(u / BAR_R), BAR_R * Math.sin(u / BAR_R)];
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        sim.pos[k * 3 + 1] = sim.prev[k * 3 + 1] = y;
        sim.pos[k * 3 + 2] = sim.prev[k * 3 + 2] = z + Math.sin(k * 12.9898) * 0.001;
        if (r > foldRow + 1) sim.zMin[k] = 0.004;
        if (r < foldRow - 1) sim.zMax[k] = -0.004;
      }
    }
    const pins = Array.from({ length: cols }, (_, c) => foldRow * cols + c);
    for (const k of pins) sim.pin(k, ((k % cols) / (cols - 1) - 0.5) * w, BAR_R, 0);
    sim.setTethers(pins);
    sim.cylinders.push({ y: 0, z: 0, r: BAR_R, x0: -5, x1: 5 });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(sim.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(sim.count * 2);
    const indices = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        uv[(r * cols + c) * 2] = c / (cols - 1);
        uv[(r * cols + c) * 2 + 1] = 1 - r / (rows - 1);
        if (r < rows - 1 && c < cols - 1) {
          const a = r * cols + c;
          indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        }
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhysicalMaterial({
      side: THREE.DoubleSide,
      alphaTest: 0.1,
      transparent: true,
      opacity: 0,
      roughness: 0.8,
      sheen: 0.8,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color('#fff0dc'),
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    clothScene.add(mesh);
    const p = { i, w, h, drop: h - foldRow * spacing, sim, mesh, material, opacity: 0, target: 0, wind: Math.random() * 100 };
    let first = true;
    store.progressive(i, (texture) => {
      material.map = texture;
      material.needsUpdate = true;
      mesh.visible = true;
      if (!first) return;
      first = false;
      p.target = 1;
      if (!ready) {
        ready = true;
        onReady?.();
      }
    });
    return p;
  }

  function show(i) {
    index = wrap(i);
    onChange?.(index);
    if (current) {
      current.target = 0;
      leaving.push(current);
    }
    current = makePiece(index);
    frameCloth();
    for (const d of [1, -1]) store.get(wrap(index + d), 'preview');
    store.keep((n) => loopDistance(n, index) <= 1 || leaving.some((l) => l.i === n));
  }

  function disposePiece(p) {
    clothScene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.material.dispose();
  }

  /** Places the overlay camera so the cloth sits over the railing area, about 45% of the height. */
  const clothGoal = new THREE.Vector3();
  function frameCloth() {
    if (!current) return;
    const tan = Math.tan(THREE.MathUtils.degToRad(clothCamera.fov / 2));
    const portrait = clothCamera.aspect < 0.8;
    const fill = portrait ? 0.38 : 0.48;
    const dist = Math.max(current.drop / fill / (2 * tan), current.w / (portrait ? 0.82 : 0.5) / (2 * tan * clothCamera.aspect));
    const visibleH = 2 * dist * tan;
    // The bar sits at about 42% from the top of the screen (near the railing in the background).
    clothGoal.set(0, -(0.5 - 0.42) * visibleH, dist);
  }

  // ---- pointer: parallax, stir and pull the cloth ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(9, 9);
  const parallax = new THREE.Vector2();
  let grab = null;
  const setNdc = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const onMove = (e) => {
    setNdc(e);
    raycaster.setFromCamera(ndc, clothCamera);
    if (grab) {
      const target = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(grab.plane, target)) grab.piece.sim.pin(grab.i, target.x, target.y, Math.max(target.z, 0.01));
    } else if (current?.mesh.visible) {
      canvas.style.cursor = raycaster.intersectObject(current.mesh)[0] ? 'grab' : '';
    }
  };
  const onDown = (e) => {
    setNdc(e);
    raycaster.setFromCamera(ndc, clothCamera);
    const hit = current?.mesh.visible && raycaster.intersectObject(current.mesh)[0];
    if (!hit) return;
    const { sim } = current;
    const near = (v) => hit.point.distanceToSquared(new THREE.Vector3(sim.pos[v * 3], sim.pos[v * 3 + 1], sim.pos[v * 3 + 2]));
    const best = [hit.face.a, hit.face.b, hit.face.c].reduce((a, b) => (near(a) < near(b) ? a : b));
    grab = { piece: current, i: best, wasPinned: sim.pinned[best] === 1, plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -hit.point.z) };
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  };
  const onUp = () => {
    if (!grab) return;
    if (!grab.wasPinned) grab.piece.sim.unpin(grab.i);
    grab = null;
    canvas.style.cursor = 'grab';
  };
  const onLeave = () => ndc.set(9, 9);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  // ---- a gentle breeze ----
  function applyWind(p, t) {
    const { sim } = p;
    const normals = p.mesh.geometry.attributes.normal.array;
    const gust = (0.6 + 0.3 * Math.sin(t * 0.45 + p.wind) + 0.2 * Math.sin(t * 1.6 + p.wind * 2)) * 1.8;
    const wx = Math.sin(t * 0.21 + p.wind) * 0.3;
    const wz = Math.sin(t * 0.33 + p.wind);
    for (let k = 0; k < sim.count; k++) {
      const x = k * 3;
      const ripple = 0.7 + 0.3 * Math.sin(sim.pos[x] * 5 + sim.pos[x + 1] * 4 + t * 1.4);
      const push = (normals[x] * wx + normals[x + 2] * wz) * gust * ripple;
      sim.force[x] += normals[x] * push;
      sim.force[x + 1] += normals[x + 1] * push;
      sim.force[x + 2] += normals[x + 2] * push;
    }
  }

  // ---- size ----
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = clothCamera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 66 : 50; // step back on tall phone screens
    camera.updateProjectionMatrix();
    clothCamera.updateProjectionMatrix();
    frameCloth();
    if (current) clothCamera.position.copy(clothGoal);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  // ---- loop ----
  let last = performance.now();
  let accumulator = 0;
  let time = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    accumulator += dt;

    river.update(now / 1000, dt);

    // The cloth is lit like the scene behind it.
    key.color.copy(bgSun.color);
    key.intensity = bgSun.intensity * 0.8;
    key.position.copy(bgSun.position).normalize();
    key.position.z = Math.abs(key.position.z) * -0.4 + 0.6; // behind-side light, wrapped forward a little
    hemi.color.copy(bgHemi.color);
    hemi.groundColor.copy(bgHemi.groundColor);
    hemi.intensity = bgHemi.intensity * 1.2;

    while (accumulator >= STEP) {
      accumulator -= STEP;
      time += STEP;
      for (const p of [current, ...leaving]) {
        if (!p) continue;
        if (grab?.piece === p) p.sim.pinned[grab.i] = 1;
        applyWind(p, time);
        p.sim.step(STEP, { iterations: 10 });
      }
    }
    for (const p of [current, ...leaving]) {
      if (!p) continue;
      p.mesh.geometry.attributes.position.needsUpdate = true;
      p.mesh.geometry.computeVertexNormals();
      p.opacity += (p.target - p.opacity) * Math.min(1, dt * 3);
      p.material.opacity = p.opacity;
    }
    for (let k = leaving.length - 1; k >= 0; k--) {
      if (leaving[k].opacity < 0.01) {
        disposePiece(leaving[k]);
        leaving.splice(k, 1);
      }
    }

    // Parallax: the background moves more than the cloth, which reads as depth between them.
    const target = Math.abs(ndc.x) > 1 || grab ? new THREE.Vector2() : ndc;
    parallax.lerp(target, 0.03);
    camera.position.set(EYE.x + parallax.x * 0.35, EYE.y + parallax.y * 0.12, EYE.z);
    camera.lookAt(LOOK.x + parallax.x * 0.6, LOOK.y + parallax.y * 0.25, LOOK.z);
    clothCamera.position.lerp(clothGoal, 0.08);
    clothCamera.position.x = clothGoal.x - parallax.x * 0.06;
    clothCamera.lookAt(clothCamera.position.x * 0.5, clothCamera.position.y, 0);

    composer.render();
  });

  resize();
  show(0);
  clothCamera.position.copy(clothGoal);

  return {
    next: () => show(index + 1),
    prev: () => show(index - 1),
    setMood: (i) => river.setMood(i),
    destroy() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      for (const p of [current, ...leaving]) if (p) disposePiece(p);
      river.dispose();
      composer.dispose();
      store.dispose();
      renderer.dispose();
    },
  };
}
