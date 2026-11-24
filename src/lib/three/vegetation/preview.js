// Preview stage for the procedural vegetation: one plant on a plain grey ground, orbit controls,
// rendered on demand (only when the camera moves or the plant changes).
// The fixed views use the camera azimuth and elevation in degrees (azimuth 0 looks from +Z).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createVineCurtain } from './vine-curtain.js';
import { createHangingVine } from './hanging-vine.js';
import { createTree } from './tree.js';
import { makeLOD } from './lod.js';

// Plants added one file each under ./plants (see plants/README.md).
const added = Object.values(import.meta.glob('./plants/*.js', { eager: true }))
  .map((m) => m.plant)
  .filter(Boolean);

export const PLANTS = {
  vine: { label: 'Vine curtain', create: createVineCurtain, target: [0, 0.62, 0], distance: 2.6 },
  vineBranch: { label: 'Hanging vine', create: createHangingVine, target: [0, 0.6, 0], distance: 2.4 },
  birch: { label: 'Birch tree', create: (o) => createTree({ ...o, kind: 'birch' }), target: [0, 3.4, 0], distance: 17, background: '#1d2a33' },
  oak: { label: 'Oak tree', create: (o) => createTree({ ...o, kind: 'oak' }), target: [0, 2.6, 0], distance: 12, background: '#1d2a33' },
  birchBush: { label: 'Birch bush', create: (o) => createTree({ ...o, kind: 'birchBush' }), target: [0, 0.7, 0], distance: 5, background: '#1d2a33' },
  oakBush: { label: 'Oak bush', create: (o) => createTree({ ...o, kind: 'oakBush' }), target: [0, 0.7, 0], distance: 5, background: '#1d2a33' },
  ...Object.fromEntries(added.map((p) => [p.id, p])),
};

// lod: 'near' | 'far' builds one level; 'auto' builds both behind a THREE.LOD at def.switchAt.
// leaves: the leaf-clump factor, for plants that take one (rain tree); undefined → the plant's own.
// variant: a named design variant, for plants that have them (rain tree branch studies).
function build(def, seed, lod, leaves, variant) {
  if (lod === 'auto' && def.switchAt) {
    return makeLOD(def.create({ seed, lod: 'near', leaves, variant }), def.create({ seed, lod: 'far', variant }), def.switchAt);
  }
  return def.create({ seed, lod: lod === 'far' ? 'far' : 'near', leaves, variant });
}

export function init(canvas, { plant = 'vine', seed = 1, lod = 'near', leaves, bare = false, variant, azimuth = 0, elevation = 4, onStats } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const def = PLANTS[plant] ?? PLANTS.vine;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(def.background ?? '#dcdcdc');
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a8a80', 1.6));
  const sun = new THREE.DirectionalLight('#fff6e8', 2.2);
  sun.position.set(1.5, 3, 2.5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#e8f0ff', 0.6);
  fill.position.set(-2, 1, -2);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 2000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;

  let current = null;

  const render = () => {
    scene.traverse((o) => o.isLOD && o.update(camera));
    renderer.render(scene, camera);
  };
  controls.addEventListener('change', render);

  // ty (optional): the height the camera looks at, instead of the plant's own target.
  function setView(az, el, distance = def.distance, ty) {
    const a = THREE.MathUtils.degToRad(az);
    const e = THREE.MathUtils.degToRad(el);
    controls.target.set(def.target[0], ty ?? def.target[1], def.target[2]);
    camera.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(distance).add(controls.target);
    controls.update();
    render();
  }

  function grow(s) {
    if (current) {
      scene.remove(current.group);
      current.dispose();
    }
    current = build(def, s, lod, leaves, variant);
    // bare: branches only (leaf and crown meshes hidden), to judge the skeleton.
    if (bare) current.group.traverse((o) => o.isMesh && /leaves|crown|bracts/.test(o.name) && (o.visible = false));
    scene.add(current.group);
    onStats?.(current.stats);
    render();
  }

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  grow(seed);
  setView(azimuth, elevation);
  resize();

  return {
    setView,
    grow,
    destroy() {
      observer.disconnect();
      controls.dispose();
      current?.dispose();
      renderer.dispose();
    },
  };
}
