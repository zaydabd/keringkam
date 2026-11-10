// Shows one keringkam at a time as a gently moving 3D cloth.
// Drag to rotate, scroll/pinch to zoom; next()/prev() switch fabric.
//
// Loading: only the current fabric and its two neighbours are fetched.
// The 512px preview appears first, then the 2048px texture replaces it.
// Textures further away are disposed to keep GPU memory low.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fabrics, createKTX2Loader } from './textures.js';

const SEGMENTS = 96; // cloth subdivisions along the long side
const KEEP = 2; // textures kept on each side of the current fabric
const SLIDE_MS = 600;
const SLIDE_DISTANCE = 0.5;

let renderer, scene, camera, controls, loader, resizeObserver;
let destroyed = false;
let index = 0;
let request = 0; // id of the latest show() call; older calls are dropped
let current = null; // mesh on screen
let leaving = null; // mesh sliding out
let targetDistance = null; // camera distance we are easing towards
const cache = new Map(); // "i:preview" | "i:full" -> { promise, texture }

export function init(canvas) {
  destroyed = false;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(1.5, 2, 3);
  scene.add(sun);

  camera = new THREE.PerspectiveCamera(45, 1, 0.05, 50);
  camera.position.set(0, 0, 3);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.4;
  controls.maxDistance = 6;
  controls.addEventListener('start', () => (targetDistance = null));

  loader = createKTX2Loader(renderer);

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  show(0, 1);
  renderer.setAnimationLoop(tick);
}

export function destroy() {
  destroyed = true;
  renderer?.setAnimationLoop(null);
  resizeObserver?.disconnect();
  controls?.dispose();
  for (const mesh of [current, leaving]) if (mesh) disposeMesh(mesh);
  current = leaving = null;
  for (const entry of cache.values()) entry.texture?.dispose();
  cache.clear();
  loader?.dispose();
  renderer?.dispose();
}

export const next = () => show((index + 1) % fabrics.length, 1);
export const prev = () => show((index - 1 + fabrics.length) % fabrics.length, -1);

// ---- showing a fabric ----

async function show(i, direction) {
  index = i;
  const id = ++request;

  const preview = await getTexture(i, 'preview');
  if (destroyed || id !== request || !preview) return;

  // Finish any slide still running, then slide the current cloth out.
  if (leaving) disposeMesh(leaving);
  leaving = current;
  if (leaving) leaving.userData.leaveDirection = -direction;

  current = createCloth(i, cache.get(`${i}:full`)?.texture ?? preview);
  current.userData.enterDirection = direction;
  scene.add(current);

  for (const mesh of [current, leaving]) if (mesh) mesh.userData.slideStart = performance.now();
  fitCamera();

  // Swap in the full-size texture when it arrives.
  getTexture(i, 'full').then((full) => {
    if (full && current?.userData.index === i) setMap(current, full);
  });

  // Fetch the neighbours so the next click is instant, and free the rest.
  for (const d of [1, -1]) {
    const n = (i + d + fabrics.length) % fabrics.length;
    getTexture(n, 'preview').then(() => getTexture(n, 'full'));
  }
  prune(i);
}

function getTexture(i, kind) {
  const key = `${i}:${kind}`;
  if (!cache.has(key)) {
    const fabric = fabrics[i];
    const entry = {};
    entry.promise = loader
      .loadAsync(kind === 'full' ? fabric.fullUrl : fabric.previewUrl)
      .then((texture) => {
        if (cache.get(key) !== entry) return texture.dispose(); // pruned while loading
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        entry.texture = texture;
        return texture;
      })
      .catch((err) => console.error(fabric.name, err));
    cache.set(key, entry);
  }
  return cache.get(key).promise;
}

function prune(centre) {
  const n = fabrics.length;
  for (const [key, entry] of cache) {
    const i = Number(key.split(':')[0]);
    const distance = Math.min((i - centre + n) % n, (centre - i + n) % n);
    if (distance <= KEEP) continue;
    const inUse = [current, leaving].some((m) => m?.material.map === entry.texture);
    if (inUse) continue;
    entry.texture?.dispose();
    cache.delete(key);
  }
}

// ---- the cloth ----

function createCloth(i, texture) {
  const { width, height } = fabrics[i];
  const aspect = width / height;
  // Fit the cloth inside a 1×1 square.
  const w = aspect >= 1 ? 1 : aspect;
  const h = aspect >= 1 ? 1 / aspect : 1;
  const geometry = new THREE.PlaneGeometry(
    w,
    h,
    Math.max(8, Math.round(SEGMENTS * w)),
    Math.max(8, Math.round(SEGMENTS * h)),
  );

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    alphaTest: 0.02,
    roughness: 0.9,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { index: i, w, h, base: geometry.attributes.position.array.slice() };
  return mesh;
}

function setMap(mesh, texture) {
  mesh.material.map = texture;
  mesh.material.needsUpdate = true;
}

function disposeMesh(mesh) {
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose(); // textures live in the cache and are disposed by prune()
}

/** Hanging-cloth ripple: still along the top edge, moving more towards the bottom. */
function wave(mesh, t) {
  const { base, h } = mesh.userData;
  const position = mesh.geometry.attributes.position;
  const a = position.array;
  for (let v = 0; v < position.count; v++) {
    const x = base[v * 3];
    const y = base[v * 3 + 1];
    const hang = (h / 2 - y) / h; // 0 at the top edge, 1 at the bottom
    a[v * 3 + 2] =
      hang * (0.035 * Math.sin(x * 7 + t * 1.2) + 0.02 * Math.sin(y * 6 - t * 0.8)) +
      hang * hang * 0.03 * Math.sin(x * 3 + y * 2 + t * 0.6);
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

// ---- every frame ----

function tick(ms) {
  const t = ms / 1000;
  const now = performance.now();

  if (current) {
    const e = ease(current.userData.slideStart, now);
    current.material.opacity = e;
    current.position.x = current.userData.enterDirection * SLIDE_DISTANCE * (1 - e);
    current.rotation.y = 0.12 * Math.sin(t * 0.35);
    wave(current, t);
  }
  if (leaving) {
    const e = ease(leaving.userData.slideStart, now);
    leaving.material.opacity = 1 - e;
    leaving.position.x = leaving.userData.leaveDirection * SLIDE_DISTANCE * e;
    wave(leaving, t);
    if (e >= 1) {
      disposeMesh(leaving);
      leaving = null;
    }
  }

  if (targetDistance !== null) {
    const offset = camera.position.clone().sub(controls.target);
    const d = offset.length();
    const nextD = d + (targetDistance - d) * 0.12;
    camera.position.copy(controls.target).add(offset.setLength(nextD));
    if (Math.abs(targetDistance - nextD) < 0.001) targetDistance = null;
  }

  controls.update();
  renderer.render(scene, camera);
}

const ease = (start, now) => {
  const p = Math.min(1, (now - start) / SLIDE_MS);
  return 1 - (1 - p) ** 3;
};

// ---- sizing ----

function resize() {
  const canvas = renderer.domElement;
  const { clientWidth: w, clientHeight: h } = canvas;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fitCamera();
}

/** Eases the camera to the distance where the current cloth fills most of the screen. */
function fitCamera() {
  if (!current) return;
  const { w, h } = current.userData;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  targetDistance = 1.2 * Math.max(h / 2 / tan, w / 2 / (tan * camera.aspect));
}
