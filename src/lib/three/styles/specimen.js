// Style: Specimen. Each keringkam is presented like a botanical specimen plate:
// construction lines and a circle draw themselves around it on a paper grid, two tracking
// boxes lock onto its most detailed areas and feed magnified insets, and pieces dissolve
// into one another in pixel blocks.
// Lessons: LILIUM (grid, construction, tracking boxes, pixel blocks),
// "directed" motion (anticipation → one moment → settle, a perfect idle loop).

import * as THREE from 'three';
import {
  wrap, loopDistance, fitSize, createStage, createTextureStore, createTweens,
  pieceInfo, positionName, toScreen, viewSize, easeOutBack, easeInOutCubic,
} from '../common.js';
import { createBlockMaterial, cropRect } from '../shaders.js';
import { el, createSvg, draw, riseText, fitWidth } from '../overlay.js';

const PAPER = '#efece8';
const INK = '#141414';
const ACCENT = '#c8102e';
const DISTANCE = 6;
const LOOP_S = 8; // idle loop length, seconds

const CSS = `
  .sp-line { stroke: #c9c3bd; }
  .sp-faint { stroke: #d8d2cc; stroke-dasharray: 4 4; }
  .sp-spin { stroke: ${ACCENT}; stroke-dasharray: 0.004 0.012; transform-box: fill-box;
    transform-origin: center; animation: sp-spin ${LOOP_S * 3}s linear infinite; opacity: .7; }
  @keyframes sp-spin { to { transform: rotate(360deg); } }
  .sp-node { fill: ${ACCENT}; stroke: none; animation: sp-pop 400ms cubic-bezier(.2,.9,.2,1.4) both; }
  .sp-track { stroke: ${ACCENT}; stroke-width: 1.5; }
  .sp-frame { stroke: ${INK}; }
  .sp-handle { fill: #fff; stroke: ${ACCENT}; animation: sp-pop 400ms cubic-bezier(.2,.9,.2,1.4) both; }
  @keyframes sp-pop { from { transform: scale(0); } }
  .sp-node, .sp-handle { transform-box: fill-box; transform-origin: center; }
  .sp-head { position: absolute; top: 20px; left: 64px; color: ${INK}; }
  .sp-data { position: absolute; top: 20px; right: 72px; color: ${INK}; text-align: right; }
  .sp-data b { font-weight: 500; color: ${ACCENT}; }
  .sp-title { position: absolute; transform: translateX(-50%); text-align: center; white-space: nowrap;
    color: #fff; mix-blend-mode: difference; font-size: clamp(26px, 5vw, 84px); }
  .sp-tag { position: absolute; transform: translateX(-50%); }
  .sp-label { position: absolute; color: ${INK}; white-space: nowrap; }
  @media (max-width: 700px) {
    .sp-data { top: auto; bottom: 14px; right: auto; left: 16px; text-align: left; font-size: 9px; }
    .sp-data .sp-wide, .sp-label span { display: none; }
    .sp-title { white-space: normal; width: 92vw; }
  }
`;

export function create(canvas, { root, front }) {
  root.style.setProperty('--ui', INK);
  const stage = createStage(canvas, { fov: 30, background: PAPER, onResize: () => relayout() });
  const { scene, camera, renderer } = stage;
  camera.position.set(0, 0, DISTANCE);
  const store = createTextureStore(renderer);
  const tweens = createTweens();

  el('style', null, front, CSS);
  const svg = createSvg(front);
  const ui = el('div', null, front);

  const plane = new THREE.PlaneGeometry(1, 1);
  let index = 0;
  let slot = null; // what is on screen: { i, group, piece, insets, info, ... }

  // ---- layout: where the piece and its two insets go, in world units ----
  function geometryFor(i) {
    const view = viewSize(camera, DISTANCE);
    const { w, h } = fitSize(i);
    const portrait = camera.aspect < 1;
    const maxW = view.w * (portrait ? 0.7 : 0.4);
    const maxH = view.h * (portrait ? 0.5 : 0.68);
    const scale = Math.min(maxW / w, maxH / h);
    const piece = { x: 0, y: portrait ? view.h * 0.1 : view.h * 0.02, w: w * scale, h: h * scale };
    let insets;
    if (portrait) {
      const s = Math.min(view.w * 0.26, view.h * 0.15);
      insets = [
        { x: -view.w * 0.2, y: -view.h * 0.25, s },
        { x: view.w * 0.2, y: -view.h * 0.25, s },
      ];
    } else {
      const gutter = view.w / 2 - piece.w / 2;
      const s = Math.min(view.h * 0.24, gutter * 0.5);
      insets = [
        { x: -(piece.w / 2 + gutter * 0.5), y: view.h * 0.12, s },
        { x: piece.w / 2 + gutter * 0.5, y: -view.h * 0.12, s },
      ];
    }
    return { piece, insets };
  }

  // ---- building and removing a slot ----
  function makeSlot(i) {
    const info = pieceInfo(i);
    const geo = geometryFor(i);
    const group = new THREE.Group();
    const piece = new THREE.Mesh(plane, createBlockMaterial({ accent: ACCENT, seed: 3 }));
    group.add(piece);
    const insets = info.details.slice(0, 2).map((detail) => {
      const mesh = new THREE.Mesh(plane, createBlockMaterial({ accent: ACCENT, seed: 3 }));
      group.add(mesh);
      return { mesh, detail };
    });
    scene.add(group);
    const s = { i, info, geo, group, piece, insets, materials: [piece.material, ...insets.map((n) => n.mesh.material)] };
    place(s);
    return s;
  }

  function place(s) {
    const { piece, insets } = s.geo;
    s.piece.position.set(piece.x, piece.y, 0);
    s.piece.scale.set(piece.w, piece.h, 1);
    s.insets.forEach((inset, k) => {
      inset.mesh.position.set(insets[k].x, insets[k].y, 0);
      inset.mesh.scale.set(insets[k].s, insets[k].s, 1);
    });
  }

  function disposeSlot(s) {
    scene.remove(s.group);
    s.materials.forEach((m) => m.dispose());
  }

  // ---- overlay (construction lines, tracking, labels) ----
  let titleObserver = null;
  function buildOverlay(s, animate) {
    titleObserver?.disconnect();
    svg.clear();
    ui.replaceChildren();
    const P = (x, y) => toScreen(stage, new THREE.Vector3(x, y, 0));
    const g = s.geo.piece;
    const tl = P(g.x - g.w / 2, g.y + g.h / 2);
    const br = P(g.x + g.w / 2, g.y - g.h / 2);
    const W = stage.width;
    const H = stage.height;
    const cx = (tl.x + br.x) / 2;
    const cy = (tl.y + br.y) / 2;
    const r = Math.max(br.x - tl.x, br.y - tl.y) * 0.56;

    const lines = [
      svg.line(0, tl.y, W, tl.y, 'sp-line'),
      svg.line(0, br.y, W, br.y, 'sp-line'),
      svg.line(tl.x, 0, tl.x, H, 'sp-line'),
      svg.line(br.x, 0, br.x, H, 'sp-line'),
      svg.circle(cx, cy, r, 'sp-line'),
      svg.line(tl.x, tl.y, br.x, br.y, 'sp-faint'),
      svg.line(br.x, tl.y, tl.x, br.y, 'sp-faint'),
    ];
    svg.circle(cx, cy, r * 1.07, 'sp-spin');
    const nodes = [[tl.x, tl.y], [br.x, tl.y], [tl.x, br.y], [br.x, br.y], [cx - r, cy], [cx + r, cy]];
    nodes.forEach(([x, y], k) => {
      const n = svg.rect(x - 3.5, y - 3.5, 7, 7, 'sp-node');
      n.style.animationDelay = `${animate ? 500 + k * 70 : 0}ms`;
    });
    if (animate) draw(lines, { duration: 900, stagger: 70 });

    // Tracking: a box on the piece, an elbow connector and a framed inset for each detail.
    s.tracks = s.insets.map((inset, k) => {
      const box = s.geo.insets[k];
      const a = P(box.x - box.s / 2, box.y + box.s / 2);
      const b = P(box.x + box.s / 2, box.y - box.s / 2);
      const frame = svg.rect(a.x, a.y, b.x - a.x, b.y - a.y, 'sp-frame');
      const track = svg.rect(0, 0, 0, 0, 'sp-track');
      const link = svg.path('', 'sp-track');
      [[a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y]].forEach(([x, y]) => {
        const hnd = svg.rect(x - 3, y - 3, 6, 6, 'sp-handle');
        hnd.style.animationDelay = `${animate ? 1100 : 0}ms`;
      });
      const label = el('div', 'sp-label kk-mono', ui);
      label.innerHTML = `DETAIL_0${k + 1}<span> · ${positionName(inset.detail.u, inset.detail.v)}</span>`;
      label.style.left = `${a.x}px`;
      label.style.top = `${a.y - 18}px`;
      if (animate) draw([frame, track, link], { duration: 600, stagger: 120, delay: 1000 + k * 150 });
      return { track, link, frame: { a, b } };
    });

    // Labels: only facts from the files themselves.
    const { info } = s;
    const head = el('div', 'sp-head kk-mono', ui);
    head.innerHTML = `KERINGKAM<br>${info.index} / ${info.total}`;
    const data = el('div', 'sp-data kk-mono', ui);
    data.innerHTML =
      [
        `COLLECTION <b>${info.title.toUpperCase()}</b>`,
        `PLATE <b>${info.number}</b>`,
        `SOURCE <b>${info.size.toUpperCase()}</b>`,
      ].join('<br>') +
      info.details
        .slice(0, 2)
        .map((d, k) => `<span class="sp-wide"><br>DETAIL_0${k + 1} <b>U ${d.u.toFixed(2)} · V ${d.v.toFixed(2)}</b></span>`)
        .join('');
    const title = el('div', 'sp-title kk-wide', ui);
    title.style.left = `${cx}px`;
    title.style.top = `${tl.y + (br.y - tl.y) * 0.6}px`;
    if (animate) riseText(title, info.title.toUpperCase(), { delay: 350, stagger: 28 });
    else title.textContent = info.title.toUpperCase();
    const tag = el('div', 'sp-tag kk-tag', ui, info.plate);
    tag.style.left = `${cx}px`;
    // Fit the title to the screen (re-checked when the font loads) and keep the tag under it.
    titleObserver = fitWidth(title, () => stage.width * 0.94, () => {
      tag.style.top = `${tl.y + (br.y - tl.y) * 0.6 + title.offsetHeight + 10}px`;
    });
  }

  /** Moves each inset's crop in a slow loop and keeps its tracking box and connector on it. */
  function updateTracking(s, t) {
    if (!s?.tracks) return;
    const fabric = s.geo.piece;
    s.insets.forEach((inset, k) => {
      const phase = (t / LOOP_S) * Math.PI * 2 + k * 2;
      const d = inset.detail;
      const moving = { u: d.u + Math.sin(phase) * 0.02, v: d.v + Math.cos(phase) * 0.015, size: d.size };
      const rect = cropRect(s.info.width, s.info.height, moving, 1.6);
      inset.mesh.material.uniforms.uvRect.value.copy(rect);

      const a = toScreen(stage, new THREE.Vector3(fabric.x + (rect.x - 0.5) * fabric.w, fabric.y + (rect.y + rect.w - 0.5) * fabric.h, 0));
      const b = toScreen(stage, new THREE.Vector3(fabric.x + (rect.x + rect.z - 0.5) * fabric.w, fabric.y + (rect.y - 0.5) * fabric.h, 0));
      const tr = s.tracks[k];
      tr.track.setAttribute('x', a.x);
      tr.track.setAttribute('y', a.y);
      tr.track.setAttribute('width', b.x - a.x);
      tr.track.setAttribute('height', b.y - a.y);
      // Elbow from the side of the box facing the inset to the inset frame.
      const toLeft = (tr.frame.a.x + tr.frame.b.x) / 2 < (a.x + b.x) / 2;
      const sx = toLeft ? a.x : b.x;
      const sy = (a.y + b.y) / 2;
      const ex = toLeft ? tr.frame.b.x : tr.frame.a.x;
      const ey = (tr.frame.a.y + tr.frame.b.y) / 2;
      const portrait = camera.aspect < 1;
      tr.link.setAttribute('d', portrait
        ? `M${(a.x + b.x) / 2},${b.y} V${(b.y + tr.frame.a.y) / 2} H${(tr.frame.a.x + tr.frame.b.x) / 2} V${tr.frame.a.y}`
        : `M${sx},${sy} H${(sx + ex) / 2} V${ey} H${ex}`);
    });
  }

  // ---- showing a piece ----
  function show(i, direction) {
    index = i;
    const old = slot;
    if (old) leave(old, direction);
    const s = makeSlot(i);
    slot = s;
    const delay = old ? 420 : 0;
    let started = false;
    store.progressive(i, (texture) => {
      s.materials.forEach((m) => (m.uniforms.map.value = texture));
      if (started) return;
      started = true;
      enter(s, direction, delay);
    });
    for (const d of [1, -1]) store.get(wrap(i + d), 'preview').then(() => store.get(wrap(i + d), 'full'));
    store.keep((n) => loopDistance(n, i) <= 1 || n === old?.i);
  }

  function enter(s, direction, delay) {
    // Settle: overshoot slightly and tilt back to face the viewer.
    tweens.add({
      delay, duration: 900, ease: easeOutBack,
      update: (p) => {
        s.group.scale.setScalar(1.04 - 0.04 * p);
        s.group.rotation.y = direction * 0.1 * (1 - p);
      },
    });
    tweens.add({ delay, duration: 800, ease: easeInOutCubic, update: (p) => (s.piece.material.uniforms.reveal.value = p) });
    s.insets.forEach((inset, k) =>
      tweens.add({ delay: delay + 1000 + k * 150, duration: 600, update: (p) => (inset.mesh.material.uniforms.reveal.value = p) }),
    );
    setTimeout(() => slot === s && buildOverlay(s, true), delay);
  }

  function leave(s, direction) {
    // Anticipation: a small pull back against the direction of travel, then dissolve.
    tweens.add({
      duration: 180, ease: easeInOutCubic,
      update: (p) => {
        s.group.scale.setScalar(1 - 0.03 * p);
        s.group.rotation.y = -direction * 0.06 * p;
      },
    });
    tweens.add({
      delay: 120, duration: 450,
      update: (p) => s.materials.forEach((m) => (m.uniforms.reveal.value = Math.min(m.uniforms.reveal.value, 1 - p))),
      done: () => disposeSlot(s),
    });
    svg.svg.querySelectorAll('line, circle, path').forEach((n) => {
      n.style.transition = 'stroke-dashoffset 300ms ease';
      n.style.strokeDasharray = '1';
      n.style.strokeDashoffset = '1';
    });
    ui.querySelectorAll('div').forEach((n) => n.classList.add('kk-fade', 'kk-out'));
  }

  function relayout() {
    if (!slot) return;
    slot.geo = geometryFor(slot.i);
    place(slot);
    buildOverlay(slot, false);
  }

  stage.start((t) => {
    tweens.tick();
    if (slot) {
      // Idle loop: a barely-there breath, exactly one cycle every LOOP_S seconds.
      slot.piece.position.y = slot.geo.piece.y + Math.sin((t / LOOP_S) * Math.PI * 2) * 0.01;
      updateTracking(slot, t);
    }
  });

  show(0, 1);

  return {
    next: () => show(wrap(index + 1), 1),
    prev: () => show(wrap(index - 1), -1),
    destroy() {
      titleObserver?.disconnect();
      tweens.clear();
      store.dispose();
      stage.dispose();
    },
  };
}
