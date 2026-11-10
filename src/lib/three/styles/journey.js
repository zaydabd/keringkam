// Style: the keringkam float one behind another in a dark space. Scroll (or swipe up/down)
// to fly forward through them; the view drifts slightly with the pointer.

import * as THREE from 'three';
import {
  fabrics, wrap, fitSize, fitDistance,
  createStage, createTextureStore, setMap,
} from '../common.js';

const N = fabrics.length;
const BACKGROUND = 0x0d0d10;

export function create(canvas) {
  const stage = createStage(canvas, { fov: 50, background: BACKGROUND, onResize: () => fit() });
  const { scene, camera, renderer } = stage;
  const store = createTextureStore(renderer);
  scene.fog = new THREE.Fog(BACKGROUND, 3, 14);

  let viewDistance = 2.2; // camera distance in front of the piece in view
  let spacing = 3; // distance between pieces along z

  const geometry = new THREE.PlaneGeometry(1, 1);
  const pieces = fabrics.map((_, i) => {
    const { w, h } = fitSize(i);
    const material = new THREE.MeshBasicMaterial({
      color: 0x222222, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(w, h, 1);
    mesh.rotation.z = Math.sin(i * 3.1) * 0.05;
    mesh.rotation.y = -Math.sin(i * 1.9) * 0.12;
    scene.add(mesh);
    return { mesh, material, x: Math.sin(i * 1.9) * 0.55, y: Math.cos(i * 2.7) * 0.3, loaded: null };
  });

  // Drifting dust for depth.
  const dustCount = 600;
  const dust = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dust[i * 3] = (Math.random() - 0.5) * 8;
    dust[i * 3 + 1] = (Math.random() - 0.5) * 5;
    dust[i * 3 + 2] = -Math.random() * N * 3.5 + 3;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const particles = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({ color: 0x9a8a70, size: 0.018, transparent: true, opacity: 0.6 }),
  );
  scene.add(particles);

  // ---- position along the path ----
  let position = 0; // continuous piece index the camera is at
  let target = 0;
  let lastInput = 0;
  let focused = -1;
  const pointer = new THREE.Vector2();

  function fit() {
    viewDistance = fitDistance(camera, 1, 1, 1.15);
    spacing = Math.max(2.8, viewDistance + 1);
  }

  function updateTextures(centre) {
    focused = centre;
    pieces.forEach((piece, i) => {
      const d = Math.abs(i - centre);
      if (d <= 1) {
        store.progressive(i, (t) => setMap(piece.material, t));
      } else if (d <= 8) {
        store.get(i, 'preview').then((t) => {
          if (Math.abs(i - focused) > 1) setMap(piece.material, t);
        });
      }
    });
    store.keep((i, kind) => Math.abs(i - centre) <= (kind === 'full' ? 2 : 10));
  }

  // ---- input ----
  const onWheel = (e) => {
    e.preventDefault();
    target = THREE.MathUtils.clamp(target + e.deltaY * 0.004, 0, N - 1);
    lastInput = performance.now();
  };
  let touchY = null;
  const onDown = (e) => {
    touchY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    pointer.set((e.clientX / stage.width) * 2 - 1, (e.clientY / stage.height) * 2 - 1);
    if (touchY === null) return;
    target = THREE.MathUtils.clamp(target + (touchY - e.clientY) * 0.01, 0, N - 1);
    touchY = e.clientY;
    lastInput = performance.now();
  };
  const onUp = () => (touchY = null);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const go = (i) => {
    target = wrap(Math.round(target) + i);
    lastInput = 0;
  };

  // ---- every frame ----
  const lookAt = new THREE.Vector3();
  stage.start((t) => {
    // Settle on the nearest piece shortly after the user stops scrolling.
    if (touchY === null && performance.now() - lastInput > 250) target = Math.round(target);
    position += (target - position) * 0.07;

    const centre = Math.round(position);
    if (centre !== focused) updateTextures(centre);

    const a = pieces[Math.floor(position)];
    const b = pieces[Math.min(N - 1, Math.ceil(position))];
    const f = position - Math.floor(position);
    const cx = THREE.MathUtils.lerp(a.x, b.x, f);
    const cy = THREE.MathUtils.lerp(a.y, b.y, f);
    const cz = -position * spacing + viewDistance;

    camera.position.set(cx + pointer.x * 0.15, cy - pointer.y * 0.1, cz);
    lookAt.set(cx, cy, cz - viewDistance);
    camera.lookAt(lookAt);

    pieces.forEach((piece, i) => {
      const z = -i * spacing;
      piece.mesh.position.set(piece.x, piece.y + Math.sin(t * 0.8 + i) * 0.03, z);
      // Fade pieces out as the camera flies past them.
      piece.material.opacity = THREE.MathUtils.clamp((cz - z - 0.3) / 0.8, 0, 1);
      piece.mesh.visible = piece.material.opacity > 0;
    });
    particles.rotation.z = t * 0.01;
  });

  updateTextures(0);

  return {
    next: () => go(1),
    prev: () => go(-1),
    destroy() {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      store.dispose();
      stage.dispose();
    },
  };
}
