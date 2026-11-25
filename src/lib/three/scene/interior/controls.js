// The interior's camera input (interior.js): the pointer's sway, walking with the keys, and
// dragging to look. Each shot adds `walk` to its position and `turn` to its yaw and pitch.

import * as THREE from 'three';

// Walking, the user's ask ("make my camera movable with the arrow keys", "it should use wasd",
// with a button to turn it on and off). Keys are read by e.code, the key's place on the
// keyboard, so WASD sits in the same spot on any layout. Speeds are design choices.
const WALK_SPEED = 1.5; // m/s; four times that with Shift
const KEYS = {
  ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0],
};
// Drag to look (the user: "my mouse doesnt move the camera"; the pointer sway alone turns a few
// degrees). 0.005 rad a pixel is a design choice; the pitch stops short of straight up and down.
const DRAG_SPEED = 0.005;

/**
 * Listens for the pointer, the keys and drags on `canvas`. Returns { pointer, walk, turn,
 * step(dt), setWalk(on), reset(), dispose() }. With `fixedLook` the pointer does not sway the view.
 */
export function createControls(canvas, camera, { fixedLook } = {}) {
  const pointer = new THREE.Vector2();
  function onPointerMove(e) {
    if (fixedLook) return;
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }
  window.addEventListener('pointermove', onPointerMove);

  const walk = new THREE.Vector3();
  const held = new Set();
  let fast = false;
  let walkOn = false;
  function onKey(e) {
    fast = e.shiftKey;
    if (!walkOn || !(e.code in KEYS) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable]')) return;
    e.preventDefault(); // no page scroll
    if (e.type === 'keydown') held.add(e.code);
    else held.delete(e.code);
  }
  const onBlur = () => held.clear();
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onBlur);

  const turn = new THREE.Vector2(); // x: yaw, y: pitch, radians
  let drag = null;
  function onDragStart(e) {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }
  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    turn.x += (e.clientX - drag.x) * DRAG_SPEED;
    turn.y = THREE.MathUtils.clamp(turn.y - (e.clientY - drag.y) * DRAG_SPEED, -1.3, 1.3);
    drag.x = e.clientX;
    drag.y = e.clientY;
  }
  function onDragEnd(e) {
    if (drag && e.pointerId === drag.id) drag = null;
  }
  canvas.style.touchAction = 'none'; // a touch drag turns the view instead of scrolling the page
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onDragStart);
  canvas.addEventListener('pointermove', onDragMove);
  canvas.addEventListener('pointerup', onDragEnd);
  canvas.addEventListener('pointercancel', onDragEnd);

  const fwd = new THREE.Vector3(), rightward = new THREE.Vector3();
  /** Moves `walk` by the held keys over dt seconds, along the camera's heading. */
  function step(dt) {
    if (!held.size) return;
    let f = 0, r = 0;
    for (const k of held) { r += KEYS[k][0]; f += KEYS[k][1]; }
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
    if (fwd.lengthSq() < 1e-6) return;
    fwd.normalize();
    rightward.set(-fwd.z, 0, fwd.x);
    const d = WALK_SPEED * (fast ? 4 : 1) * dt;
    walk.addScaledVector(fwd, f * d).addScaledVector(rightward, r * d);
  }

  return {
    pointer, walk, turn, step,
    /** Turns walking on or off; off stops any held key. */
    setWalk(on) {
      walkOn = !!on;
      if (!walkOn) held.clear();
    },
    /** Back to where the shot stands, facing its way. */
    reset() {
      walk.set(0, 0, 0);
      turn.set(0, 0);
    },
    dispose() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onDragStart);
      canvas.removeEventListener('pointermove', onDragMove);
      canvas.removeEventListener('pointerup', onDragEnd);
      canvas.removeEventListener('pointercancel', onDragEnd);
    },
  };
}
