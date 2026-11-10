// Style: Anatomy. On a flat red field, the whole keringkam appears, then in one moment its
// five most detailed areas lift out of it and fly into a labelled strip joined by connector
// curves. The collection name sets in huge type with the piece itself standing in for one letter.
// Lessons: LILIUM (anatomy strip, kinetic type with an image in place of a letter),
// "directed" motion (one moment, smear while moving, settle, perfect idle loop).

import * as THREE from 'three';
import {
  wrap, loopDistance, fitSize, createStage, createTextureStore, createTweens,
  pieceInfo, positionName, toScreen, viewSize, easeOutBack, easeInOutCubic,
} from '../common.js';
import { createBlockMaterial, cropRect } from '../shaders.js';
import { el, createSvg, draw, fitWidth } from '../overlay.js';

const RED = '#c8102e';
const INK = '#141414';
const DISTANCE = 6;
const LOOP_S = 6;

const CSS = `
  .an-grid { stroke: rgba(255,255,255,.28); stroke-dasharray: 5 5; }
  .an-curve { stroke: rgba(255,255,255,.75); }
  .an-handle { fill: #fff; stroke: none; }
  .an-label { position: absolute; color: #fff; white-space: nowrap; }
  .an-label span { opacity: .7; }
  .an-head { position: absolute; top: 20px; left: 64px; color: #fff; }
  .an-count { position: absolute; top: 20px; right: 72px; color: #fff; text-align: right; }
  .an-title { position: absolute; left: 50%; bottom: 7vh; transform: translateX(-50%); white-space: nowrap;
    color: #fff; font-size: 12vw; }
  .an-title .an-box { display: inline-block; width: 0.78em; height: 0.72em; margin: 0 0.04em;
    vertical-align: -0.02em; outline: 1px solid rgba(255,255,255,.8); }
`;

export function create(canvas, { root, front }) {
  root.style.setProperty('--ui', '#fff');
  const stage = createStage(canvas, { fov: 30, background: RED, onResize: () => relayout() });
  const { scene, camera, renderer } = stage;
  camera.position.set(0, 0, DISTANCE);
  const store = createTextureStore(renderer);
  const tweens = createTweens();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);

  el('style', null, front, CSS);
  const svg = createSvg(front);
  const ui = el('div', null, front);

  const plane = new THREE.PlaneGeometry(1, 1);
  let index = 0;
  let slot = null;

  // ---- layout ----
  function layoutFor(i) {
    const view = viewSize(camera, DISTANCE);
    const portrait = camera.aspect < 1;
    const { w, h } = fitSize(i);
    const scale = Math.min((view.w * 0.5) / w, (view.h * 0.6) / h);
    const piece = { x: 0, y: view.h * 0.06, w: w * scale, h: h * scale };
    const n = 5;
    let slots;
    if (portrait) {
      const S = view.w * 0.27;
      slots = Array.from({ length: n }, (_, k) => {
        const row = k < 3 ? 0 : 1;
        const inRow = row === 0 ? 3 : 2;
        const col = row === 0 ? k : k - 3;
        return { x: (col - (inRow - 1) / 2) * S * 1.12, y: view.h * 0.2 - row * S * 1.4, s: S };
      });
    } else {
      const S = Math.min(view.w * 0.13, view.h * 0.27);
      const gap = S * 0.1;
      const total = n * S + (n - 1) * gap;
      slots = Array.from({ length: n }, (_, k) => ({
        x: -total / 2 + S / 2 + k * (S + gap),
        y: view.h * 0.1 + (k % 2 ? -S * 0.12 : S * 0.06),
        s: S,
      }));
    }
    return { piece, slots };
  }

  // ---- slot ----
  function makeSlot(i) {
    const info = pieceInfo(i);
    const layout = layoutFor(i);
    const group = new THREE.Group();
    const piece = new THREE.Mesh(plane, createBlockMaterial({ accent: INK, seed: 11 }));
    group.add(piece);
    const crops = info.details.map((detail, k) => {
      const material = createBlockMaterial({ accent: INK, seed: 11 + k });
      material.uniforms.uvRect.value.copy(cropRect(info.width, info.height, detail));
      const mesh = new THREE.Mesh(plane, material);
      mesh.userData.k = k;
      group.add(mesh);
      return { mesh, detail, flight: 0, hover: 0, start: null };
    });
    const letter = new THREE.Mesh(plane, createBlockMaterial({ accent: INK, seed: 5 }));
    group.add(letter);
    scene.add(group);
    const s = { i, info, layout, group, piece, crops, letter, materials: [piece.material, letter.material, ...crops.map((c) => c.mesh.material)] };
    placePiece(s);
    return s;
  }

  function placePiece(s) {
    const p = s.layout.piece;
    s.piece.position.set(p.x, p.y, 0);
    s.piece.scale.set(p.w, p.h, 1);
    // Where each crop sits on the whole piece: the start of its flight.
    s.crops.forEach((c) => {
      const r = c.mesh.material.uniforms.uvRect.value;
      c.start = { x: p.x + (r.x + r.z / 2 - 0.5) * p.w, y: p.y + (r.y + r.w / 2 - 0.5) * p.h, s: r.z * p.w };
    });
  }

  /** Position of each crop between its place on the piece (flight 0) and its strip slot (flight 1). */
  function placeCrops(s, t) {
    s.crops.forEach((c, k) => {
      const end = s.layout.slots[k];
      const f = c.flight;
      const bob = Math.sin((t / LOOP_S) * Math.PI * 2 + k * 0.9) * end.s * 0.03 * f;
      const x = THREE.MathUtils.lerp(c.start.x, end.x, f);
      const y = THREE.MathUtils.lerp(c.start.y, end.y, f) + bob;
      const size = THREE.MathUtils.lerp(c.start.s, end.s, f) * (1 + c.hover * 0.22);
      // Smear: stretch along the path while it moves fastest, like a smear frame.
      const horizontal = Math.abs(end.x - c.start.x) >= Math.abs(end.y - c.start.y);
      const smear = c.moving ? 1 + Math.sin(Math.min(1, f) * Math.PI) * 0.35 : 1;
      c.mesh.scale.set(size * (horizontal ? smear : 1), size * (horizontal ? 1 : smear), 1);
      c.mesh.position.set(x, y, 0.01 + c.hover * 0.05);
    });
  }

  // ---- overlay ----
  let titleObserver = null;
  function buildOverlay(s, animate) {
    titleObserver?.disconnect();
    svg.clear();
    ui.replaceChildren();
    const W = stage.width;
    const H = stage.height;
    const grid = [
      ...[0.3, 0.55, 0.78].map((f) => svg.line(0, H * f, W, H * f, 'an-grid')),
      ...[0.12, 0.38, 0.62, 0.88].map((f) => svg.line(W * f, 0, W * f, H, 'an-grid')),
    ];
    if (animate) draw(grid, { duration: 1200, stagger: 50 });

    const { info } = s;
    el('div', 'an-head kk-mono', ui).innerHTML = `KERINGKAM — ANATOMY<br>${info.plate}`;
    el('div', 'an-count kk-mono', ui).innerHTML = `${info.index} / ${info.total}<br>${info.details.length} DETAILS`;

    s.labels = s.crops.map((c, k) => {
      const label = el('div', 'an-label kk-mono kk-fade', ui);
      label.innerHTML = `${String(k + 1).padStart(2, '0')} ${positionName(c.detail.u, c.detail.v).toUpperCase()}<br><span>U ${c.detail.u.toFixed(2)} · V ${c.detail.v.toFixed(2)}</span>`;
      label.style.opacity = animate ? 0 : 1;
      return label;
    });
    s.curves = s.crops.slice(1).map(() => svg.path('', 'an-curve'));
    // Hidden until drawn in after the crops land.
    if (animate) s.curves.forEach((c) => { c.style.strokeDasharray = '1'; c.style.strokeDashoffset = '1'; });
    s.handles = s.crops.map(() => [0, 1, 2, 3].map(() => svg.rect(0, 0, 6, 6, 'an-handle')));
    s.handles.flat().forEach((h) => (h.style.opacity = animate ? 0 : 1));

    // Title with the piece standing in for one letter.
    const title = el('div', 'an-title kk-wide', ui);
    const text = info.title.toUpperCase();
    const boxAt = text.indexOf('O') > 0 ? text.indexOf('O') : Math.floor(text.length / 2);
    [...text].forEach((ch, k) => {
      if (k === boxAt) {
        s.box = el('span', animate ? 'an-box kk-rise' : 'an-box', title);
        if (animate) s.box.style.animationDelay = `${1700 + k * 30}ms`;
        return;
      }
      const span = el('span', animate ? 'kk-rise' : '', title, ch === ' ' ? ' ' : ch);
      if (animate) span.style.animationDelay = `${1700 + k * 30}ms`;
    });
    // Keep the title within the screen width, and the piece in its letter box, as fonts load.
    titleObserver = fitWidth(title, () => stage.width * 0.94, () => placeLetter(s));
  }

  /** Puts the small piece exactly where the empty letter box is in the title. */
  function placeLetter(s) {
    if (!s.box) return;
    // Use layout offsets, not getBoundingClientRect, so the letters' rise animation doesn't shift it.
    const t = s.box.parentElement.getBoundingClientRect();
    const r = {
      left: t.left + s.box.offsetLeft,
      top: t.top + s.box.offsetTop,
      right: t.left + s.box.offsetLeft + s.box.offsetWidth,
      bottom: t.top + s.box.offsetTop + s.box.offsetHeight,
    };
    const view = viewSize(camera, DISTANCE);
    const toWorld = (px, py) => ({ x: (px / stage.width - 0.5) * view.w, y: (0.5 - py / stage.height) * view.h });
    const a = toWorld(r.left, r.top);
    const b = toWorld(r.right, r.bottom);
    const { w, h } = fitSize(s.i);
    const boxW = b.x - a.x;
    const boxH = a.y - b.y;
    const scale = Math.min(boxW / w, boxH / h);
    s.letter.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
    s.letter.scale.set(w * scale, h * scale, 1);
  }

  /** Keeps labels, curves and handles attached to the crops as they move. */
  function updateOverlay(s) {
    if (!s.labels) return;
    const rects = s.crops.map((c) => {
      const half = c.mesh.scale.y / 2;
      const halfW = c.mesh.scale.x / 2;
      const a = toScreen(stage, new THREE.Vector3(c.mesh.position.x - halfW, c.mesh.position.y + half, 0));
      const b = toScreen(stage, new THREE.Vector3(c.mesh.position.x + halfW, c.mesh.position.y - half, 0));
      return { a, b };
    });
    rects.forEach(({ a, b }, k) => {
      s.labels[k].style.left = `${a.x}px`;
      s.labels[k].style.top = `${a.y - 34}px`;
      [[a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y]].forEach(([x, y], j) => {
        s.handles[k][j].setAttribute('x', x - 3);
        s.handles[k][j].setAttribute('y', y - 3);
      });
      // In the two-row phone layout, don't link the end of one row to the start of the next.
      const rowBreak = camera.aspect < 1 && k === 3;
      if (k > 0 && !rowBreak) {
        const p = rects[k - 1];
        const x1 = (p.a.x + p.b.x) / 2;
        const x2 = (a.x + b.x) / 2;
        const y = Math.max(p.b.y, b.y);
        s.curves[k - 1].setAttribute('d', `M${x1},${p.b.y} Q${(x1 + x2) / 2},${y + (x2 - x1) * 0.45} ${x2},${b.y}`);
      }
    });
  }

  // ---- sequence ----
  function show(i, direction) {
    index = i;
    const old = slot;
    if (old) leave(old);
    const s = makeSlot(i);
    slot = s;
    const delay = old ? 520 : 0;
    let started = false;
    store.progressive(i, (texture) => {
      s.materials.forEach((m) => (m.uniforms.map.value = texture));
      if (started) return;
      started = true;
      play(s, delay, direction);
    });
    for (const d of [1, -1]) store.get(wrap(i + d), 'preview').then(() => store.get(wrap(i + d), 'full'));
    store.keep((n) => loopDistance(n, i) <= 1 || n === old?.i);
  }

  function play(s, delay, direction) {
    // 1. The whole piece arrives and settles.
    tweens.add({ delay, duration: 700, ease: easeInOutCubic, update: (p) => (s.piece.material.uniforms.reveal.value = p) });
    tweens.add({ delay, duration: 900, ease: easeOutBack, update: (p) => (s.group.rotation.y = direction * 0.12 * (1 - p)) });
    setTimeout(() => slot === s && buildOverlay(s, true), delay);

    // 2. The moment: details lift out of the piece and fly to the strip, the piece dissolves.
    s.crops.forEach((c, k) => {
      tweens.add({ delay: delay + 900 + k * 70, duration: 120, update: (p) => (c.mesh.material.uniforms.reveal.value = p) });
      tweens.add({
        delay: delay + 1000 + k * 70, duration: 750, ease: easeOutBack,
        update: (p) => { c.moving = p < 1; c.flight = p; },
      });
    });
    tweens.add({ delay: delay + 1050, duration: 450, update: (p) => (s.piece.material.uniforms.reveal.value = 1 - p) });

    // 3. Labels, handles and curves; then the title with the piece as a letter.
    tweens.add({
      delay: delay + 1600, duration: 400,
      update: (p) => {
        s.labels?.forEach((l) => (l.style.opacity = p));
        s.handles?.flat().forEach((h) => (h.style.opacity = p));
      },
      done: () => s.curves && draw(s.curves, { duration: 700, stagger: 90 }),
    });
    tweens.add({ delay: delay + 1900, duration: 700, update: (p) => (s.letter.material.uniforms.reveal.value = p) });
  }

  function leave(s) {
    // Anticipation: everything lifts slightly, then drops and dissolves.
    tweens.add({ duration: 160, ease: easeInOutCubic, update: (p) => (s.group.position.y = 0.06 * p) });
    tweens.add({
      delay: 160, duration: 380, ease: easeInOutCubic,
      update: (p) => {
        s.group.position.y = 0.06 - 0.3 * p;
        s.materials.forEach((m) => (m.uniforms.reveal.value = Math.min(m.uniforms.reveal.value, 1 - p)));
      },
      done: () => {
        scene.remove(s.group);
        s.materials.forEach((m) => m.dispose());
      },
    });
    svg.svg.querySelectorAll('path, line').forEach((n) => {
      n.style.transition = 'stroke-dashoffset 300ms ease';
      n.style.strokeDasharray = '1';
      n.style.strokeDashoffset = '1';
    });
    ui.querySelectorAll('div').forEach((n) => n.classList.add('kk-fade', 'kk-out'));
    s.labels = null;
  }

  function relayout() {
    if (!slot) return;
    slot.layout = layoutFor(slot.i);
    placePiece(slot);
    buildOverlay(slot, false);
  }

  // ---- hover: enlarge the crop under the pointer ----
  const onMove = (e) => pointer.set((e.clientX / stage.width) * 2 - 1, -(e.clientY / stage.height) * 2 + 1);
  const onLeave = () => pointer.set(9, 9);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);

  stage.start((t) => {
    tweens.tick();
    if (!slot) return;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(slot.crops.map((c) => c.mesh))[0];
    slot.crops.forEach((c) => {
      const target = hit?.object === c.mesh && c.flight > 0.99 ? 1 : 0;
      c.hover += (target - c.hover) * 0.15;
    });
    placeCrops(slot, t);
    updateOverlay(slot);
  });

  show(0, 1);

  return {
    next: () => show(wrap(index + 1), 1),
    prev: () => show(wrap(index - 1), -1),
    destroy() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      titleObserver?.disconnect();
      tweens.clear();
      store.dispose();
      stage.dispose();
    },
  };
}
