// Style: a dark gallery corridor. Each keringkam is framed on alternating walls and the
// camera walks from piece to piece under a moving spotlight. Drag to look around.

import * as THREE from 'three';
import {
  fabrics, wrap, loopDistance, fitSize, fitDistance,
  createStage, createTextureStore, setMap,
} from '../common.js';

const N = fabrics.length;
const HALF_WIDTH = 2.5; // walls at x = ±HALF_WIDTH
const STEP = 1.7; // z distance between pieces
const EYE = 1.5; // eye and picture-centre height
const PICTURE_SIZE = 1.3; // longest side of each piece
const WALK_MS = 1400;

const easeInOut = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

export function create(canvas) {
  const stage = createStage(canvas, { fov: 50, background: 0x0c0c0c, onResize: () => go(index, true) });
  const { scene, camera, renderer } = stage;
  const store = createTextureStore(renderer);
  scene.fog = new THREE.Fog(0x0c0c0c, 5, 18);

  // ---- room ----
  const length = N * STEP + 8;
  const room = (w, h, color, roughness = 0.9) =>
    new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color, roughness }));
  const floor = room(HALF_WIDTH * 2, length, 0x1a1512, 0.6);
  floor.rotation.x = -Math.PI / 2;
  const ceiling = room(HALF_WIDTH * 2, length, 0x0e0e0e);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3.6;
  const left = room(length, 3.6, 0x2b2a2e);
  left.rotation.y = Math.PI / 2;
  left.position.set(-HALF_WIDTH, 1.8, 0);
  const right = room(length, 3.6, 0x2b2a2e);
  right.rotation.y = -Math.PI / 2;
  right.position.set(HALF_WIDTH, 1.8, 0);
  const roomGroup = new THREE.Group();
  roomGroup.add(floor, ceiling, left, right);
  roomGroup.position.z = -(N * STEP) / 2 + 2;
  scene.add(roomGroup);

  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x1a1512, 0.9));
  const spot = new THREE.SpotLight(0xfff0dc, 14, 0, 0.55, 0.7, 2);
  scene.add(spot, spot.target);

  // ---- framed pieces ----
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.5 });
  const matMaterial = new THREE.MeshStandardMaterial({ color: 0xe9e3d7, roughness: 1 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(1, 1);

  const pieces = fabrics.map((_, i) => {
    const side = i % 2 === 0 ? -1 : 1; // -1 left wall, +1 right wall
    const { w, h } = fitSize(i);
    const pw = w * PICTURE_SIZE;
    const ph = h * PICTURE_SIZE;

    const group = new THREE.Group();
    group.position.set(side * (HALF_WIDTH - 0.03), EYE, -i * STEP);
    group.rotation.y = -side * (Math.PI / 2); // face into the corridor

    const frame = new THREE.Mesh(box, frameMaterial);
    frame.scale.set(pw + 0.34, ph + 0.34, 0.05);
    const mat = new THREE.Mesh(plane, matMaterial);
    mat.scale.set(pw + 0.22, ph + 0.22, 1);
    mat.position.z = 0.026;
    const material = new THREE.MeshStandardMaterial({ color: 0x333333, transparent: true, alphaTest: 0.02, roughness: 0.85 });
    const picture = new THREE.Mesh(plane, material);
    picture.scale.set(pw, ph, 1);
    picture.position.z = 0.03;
    group.add(frame, mat, picture);
    scene.add(group);

    store.get(i, 'preview').then((t) => !material.map && setMap(material, t));
    return { side, pw, ph, group, material };
  });

  // ---- camera walk ----
  let index = 0;
  let from = null; // { pos, look, start }
  let to = null;
  const look = { yaw: 0, pitch: 0, dragging: null };

  function poseFor(i) {
    const p = pieces[i];
    const distance = Math.min((2 * HALF_WIDTH - 0.5) / Math.cos(0.38), fitDistance(camera, p.pw + 0.5, p.ph + 0.5, 1.3));
    const wallX = p.side * HALF_WIDTH;
    // Stand a little towards the entrance so the corridor and the next frames are visible.
    const angle = 0.38;
    return {
      pos: new THREE.Vector3(wallX - p.side * distance * Math.cos(angle), EYE, -i * STEP + distance * Math.sin(angle)),
      look: new THREE.Vector3(wallX, EYE, -i * STEP),
    };
  }

  const currentLook = new THREE.Vector3();
  function go(i, instant = false) {
    index = wrap(i);
    const pose = poseFor(index);
    from = instant || !to ? pose : { pos: camera.position.clone(), look: currentLook.clone() };
    to = { ...pose, start: performance.now(), duration: instant ? 0 : WALK_MS };

    const p = pieces[index];
    spot.position.set(p.side * (HALF_WIDTH - 1.6), 3.4, -index * STEP);
    spot.target.position.set(p.side * HALF_WIDTH, EYE, -index * STEP);

    for (const d of [0, 1, -1]) {
      const n = wrap(index + d);
      store.get(n, 'full').then((t) => t && setMap(pieces[n].material, t));
    }
    store.keep((n, kind) => {
      if (kind === 'preview' || loopDistance(n, index) <= 2) return true;
      store.get(n, 'preview').then((t) => setMap(pieces[n].material, t));
      return false;
    });
  }

  // ---- input: drag to look around, wheel to walk ----
  const onDown = (e) => {
    look.dragging = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!look.dragging) return;
    look.yaw = THREE.MathUtils.clamp(look.yaw + (e.clientX - look.dragging.x) * 0.004, -1.2, 1.2);
    look.pitch = THREE.MathUtils.clamp(look.pitch + (e.clientY - look.dragging.y) * 0.003, -0.5, 0.5);
    look.dragging = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => (look.dragging = null);
  let wheelSum = 0;
  let wheelLock = 0;
  const onWheel = (e) => {
    e.preventDefault();
    if (performance.now() < wheelLock) return;
    wheelSum += e.deltaY;
    if (Math.abs(wheelSum) > 80) {
      go(index + Math.sign(wheelSum));
      wheelSum = 0;
      wheelLock = performance.now() + 700;
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ---- every frame ----
  const lookOffset = new THREE.Vector3();
  stage.start(() => {
    const p = to.duration ? easeInOut(Math.min(1, (performance.now() - to.start) / to.duration)) : 1;
    camera.position.lerpVectors(from.pos, to.pos, p);
    currentLook.lerpVectors(from.look, to.look, p);
    // A slight step bob while walking.
    camera.position.y = EYE + 0.03 * Math.sin(p * Math.PI * 4) * (1 - p);

    if (!look.dragging) {
      look.yaw *= 0.92;
      look.pitch *= 0.92;
    }
    // Rotate the look direction by the drag offset.
    lookOffset.copy(currentLook).sub(camera.position);
    lookOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -look.yaw);
    lookOffset.y += look.pitch * lookOffset.length();
    camera.lookAt(camera.position.clone().add(lookOffset));
  });

  go(0, true);

  return {
    next: () => go(index + 1),
    prev: () => go(index - 1),
    destroy() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      store.dispose();
      stage.dispose();
    },
  };
}
