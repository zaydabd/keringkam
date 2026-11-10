// Style: one keringkam at a time, hanging as a lit, gently rippling cloth.
// Drag to rotate, scroll/pinch to zoom.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  wrap, loopDistance, fitSize, fitDistance, easeOutCubic,
  createStage, createTextureStore, setMap,
} from '../common.js';

const SEGMENTS = 96;
const SLIDE_MS = 600;
const SLIDE_DISTANCE = 0.5;

export function create(canvas) {
  const stage = createStage(canvas, { onResize: () => fit() });
  const { scene, camera, renderer } = stage;
  const store = createTextureStore(renderer);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(1.5, 2, 3);
  scene.add(sun);

  camera.position.set(0, 0, 3);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.4;
  controls.maxDistance = 6;
  controls.addEventListener('start', () => (targetDistance = null));

  let index = 0;
  let current = null;
  let leaving = null;
  let targetDistance = null;

  function show(i, direction) {
    index = i;
    if (leaving) removeCloth(leaving);
    leaving = current;
    if (leaving) {
      leaving.userData.direction = -direction;
      leaving.userData.start = performance.now();
    }

    current = createCloth(i);
    current.userData.direction = direction;
    current.userData.start = Infinity; // starts sliding once a texture arrives
    scene.add(current);
    const cloth = current;
    store.progressive(i, (texture) => {
      setMap(cloth.material, texture);
      if (cloth.userData.start === Infinity) cloth.userData.start = performance.now();
    });
    fit();

    for (const d of [1, -1]) store.get(wrap(i + d), 'preview').then(() => store.get(wrap(i + d), 'full'));
    store.keep((n) => loopDistance(n, i) <= 2 || n === leaving?.userData.index);
  }

  function createCloth(i) {
    const { w, h } = fitSize(i);
    const geometry = new THREE.PlaneGeometry(w, h, Math.round(SEGMENTS * w), Math.round(SEGMENTS * h));
    const material = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide, transparent: true, opacity: 0, alphaTest: 0.02, roughness: 0.9,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { index: i, w, h, base: geometry.attributes.position.array.slice() };
    return mesh;
  }

  function removeCloth(mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

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

  function fit() {
    if (current) targetDistance = fitDistance(camera, current.userData.w, current.userData.h);
  }

  stage.start((t) => {
    const now = performance.now();
    if (current) {
      const e = easeOutCubic((now - current.userData.start) / SLIDE_MS);
      current.material.opacity = e;
      current.position.x = current.userData.direction * SLIDE_DISTANCE * (1 - e);
      current.rotation.y = 0.12 * Math.sin(t * 0.35);
      wave(current, t);
    }
    if (leaving) {
      const e = easeOutCubic((now - leaving.userData.start) / SLIDE_MS);
      leaving.material.opacity = 1 - e;
      leaving.position.x = leaving.userData.direction * SLIDE_DISTANCE * e;
      wave(leaving, t);
      if (e >= 1) {
        removeCloth(leaving);
        leaving = null;
      }
    }
    if (targetDistance !== null) {
      const offset = camera.position.clone().sub(controls.target);
      const d = offset.length() + (targetDistance - offset.length()) * 0.12;
      camera.position.copy(controls.target).add(offset.setLength(d));
      if (Math.abs(targetDistance - d) < 0.001) targetDistance = null;
    }
    controls.update();
  });

  show(0, 1);

  return {
    next: () => show(wrap(index + 1), 1),
    prev: () => show(wrap(index - 1), -1),
    destroy() {
      controls.dispose();
      store.dispose();
      stage.dispose();
    },
  };
}

