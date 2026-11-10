// Style: every keringkam on a slowly turning ring with a soft floor reflection.
// Drag sideways to spin, click a piece to bring it to the front.

import * as THREE from 'three';
import {
  fabrics, wrap, loopDistance, fitSize, fitDistance,
  createStage, createTextureStore, setMap,
} from '../common.js';

const N = fabrics.length;
const SPACING = 1.15; // arc length per item
const RADIUS = (N * SPACING) / (2 * Math.PI);
const PIXELS_PER_ITEM = 220;

export function create(canvas) {
  const stage = createStage(canvas, { fov: 40, onResize: () => fit() });
  const { scene, camera, renderer } = stage;
  const store = createTextureStore(renderer);

  const ring = new THREE.Group();
  scene.add(ring);
  const geometry = new THREE.PlaneGeometry(1, 1);

  // Each item: the picture plus an upside-down faded copy for the reflection.
  const items = fabrics.map((_, i) => {
    const { w, h } = fitSize(i);
    const angle = (i / N) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.position.set(Math.sin(angle) * RADIUS, -0.5, Math.cos(angle) * RADIUS); // origin on the floor line
    holder.rotation.y = angle;
    ring.add(holder);

    const material = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true });
    const picture = new THREE.Mesh(geometry, material);
    picture.scale.set(w, h, 1);
    picture.position.y = h / 2;
    picture.userData.index = i;
    holder.add(picture);

    const reflectionMaterial = new THREE.MeshBasicMaterial({
      color: 0x222222, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
    });
    const reflection = new THREE.Mesh(geometry, reflectionMaterial);
    reflection.scale.set(w, -h, 1);
    reflection.position.y = -h / 2 - 0.02;
    holder.add(reflection);

    return { holder, picture, material, reflectionMaterial, quality: null };
  });

  // Previews for all pieces first, so the whole ring fills in quickly.
  items.forEach((item, i) =>
    store.get(i, 'preview').then((t) => {
      if (item.quality) return;
      item.quality = 'preview';
      setMap(item.material, t);
      setMap(item.reflectionMaterial, t);
    }),
  );

  let position = 0; // continuous: which item faces the camera
  let target = 0;
  let velocity = 0;
  let dragging = null;

  function focus() {
    const front = wrap(Math.round(target));
    for (const d of [0, 1, -1]) {
      const i = wrap(front + d);
      store.get(i, 'full').then((t) => {
        if (!t) return;
        items[i].quality = 'full';
        setMap(items[i].material, t);
        setMap(items[i].reflectionMaterial, t);
      });
    }
    // Free full-size textures far from the front, fall back to previews.
    store.keep((i, kind) => {
      if (kind === 'preview' || loopDistance(i, front) <= 2) return true;
      const item = items[i];
      if (item.quality === 'full') {
        item.quality = 'preview';
        store.get(i, 'preview').then((t) => {
          setMap(item.material, t);
          setMap(item.reflectionMaterial, t);
        });
      }
      return false;
    });
  }

  function fit() {
    // Frame the front piece (up to 1.3 tall once enlarged), its neighbours and part of the reflection.
    const width = camera.aspect < 1 ? 1.5 : 2.8; // on narrow screens, frame mostly the front piece
    camera.position.set(0, 0.15, RADIUS + fitDistance(camera, width, 2.2, 1.0));
    camera.lookAt(0, -0.05, RADIUS);
  }

  // ---- input ----
  const raycaster = new THREE.Raycaster();
  const onDown = (e) => {
    dragging = { x: e.clientX, start: e.clientX, last: performance.now() };
    velocity = 0;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.x;
    const now = performance.now();
    velocity = (-dx / PIXELS_PER_ITEM) / Math.max(1, now - dragging.last) * 16;
    dragging.x = e.clientX;
    dragging.last = now;
    position -= dx / PIXELS_PER_ITEM;
    target = position;
  };
  const onUp = (e) => {
    if (!dragging) return;
    const moved = Math.abs(e.clientX - dragging.start);
    dragging = null;
    if (moved < 6) return pick(e);
    target = Math.round(position + velocity * 12);
    focus();
  };
  function pick(e) {
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(items.map((it) => it.picture))[0];
    if (!hit) return;
    const i = hit.object.userData.index;
    const front = Math.round(target);
    let d = wrap(i - front);
    if (d > N / 2) d -= N;
    go(front + d);
  }
  const go = (t) => {
    target = Math.round(t);
    focus();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // ---- every frame ----
  stage.start(() => {
    if (!dragging) position += (target - position) * 0.08;
    ring.rotation.y = -(position / N) * Math.PI * 2;

    items.forEach((item, i) => {
      const d = Math.abs(wrap(i - position + N / 2) - N / 2); // distance from front, in items
      const closeness = Math.max(0, 1 - d / 1.2);
      const s = 1 + 0.3 * closeness;
      item.holder.scale.setScalar(s);
      const shade = 0.35 + 0.65 * Math.max(0, 1 - d / 3);
      if (item.material.map) item.material.color.setScalar(shade);
      if (item.reflectionMaterial.map) item.reflectionMaterial.color.setScalar(shade);
    });
  });

  focus();

  return {
    next: () => go(target + 1),
    prev: () => go(target - 1),
    destroy() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      store.dispose();
      stage.dispose();
    },
  };
}
