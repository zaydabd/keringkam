// Style: Grow. Each keringkam grows into view outward from its most detailed motifs, with a
// thin accent line along the growing edge like a running stitch. Choose a colour palette and
// a motion: Grow (once, then breathe), Breathe, Wither & bloom (an 8 s loop) or Gust (wind
// with smear frames). The piece leans towards the pointer.
// Lessons: type-garden (growth, palettes, motion presets), "directed" motion
// (anticipation, smear frames, perfect loops).

import * as THREE from 'three';
import {
  wrap, loopDistance, fitSize, createStage, createTextureStore, createTweens,
  pieceInfo, viewSize, easeInOutCubic,
} from '../common.js';
import { GLSL_NOISE } from '../shaders.js';
import { el } from '../overlay.js';

const DISTANCE = 5;
const FULL = 1.7; // growth radius that covers the whole piece

const PALETTES = [
  { name: 'Ink', bg: '#0f0f0f', accent: '#d9b46a', text: '#f2efe8' },
  { name: 'Paper', bg: '#f1ece2', accent: '#8e1b2b', text: '#1a1714' },
  { name: 'Midnight', bg: '#0d1633', accent: '#e86a8a', text: '#eef0ff' },
  { name: 'Moss', bg: '#17251c', accent: '#d6b25e', text: '#eef2e8' },
  { name: 'Clay', bg: '#a8432a', accent: '#f3dfc1', text: '#fff6ea' },
];
const MOTIONS = ['Grow', 'Breathe', 'Wither & bloom', 'Gust'];

function createGrowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: null },
      grow: { value: 0 },
      seeds: { value: Array.from({ length: 5 }, () => new THREE.Vector2(0.5, 0.5)) },
      aspect: { value: 1 },
      accent: { value: new THREE.Color() },
      time: { value: 0 },
      wind: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float time, wind;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float hang = 1.0 - uv.y; // the top edge stays put, the bottom moves most
        p.x += wind * hang * hang * 0.12;
        p.z += wind * hang * 0.06 * sin(uv.y * 9.0 - time * 5.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform sampler2D map;
      uniform float grow, aspect, wind, time;
      uniform vec2 seeds[5];
      uniform vec3 accent;
      varying vec2 vUv;

      void main() {
        // Distance to the nearest seed, roughened so the edge spreads like growth.
        vec2 q = vUv * vec2(aspect, 1.0);
        float d = 10.0;
        for (int k = 0; k < 5; k++) d = min(d, length(q - seeds[k] * vec2(aspect, 1.0)));
        d += (noise(q * 7.0) - 0.5) * 0.22 + (noise(q * 38.0) - 0.5) * 0.05;
        float edge = grow - d;
        if (edge < 0.0) discard;

        // Smear frames: while the wind gusts, blur along the direction of travel.
        vec4 c = vec4(0.0);
        for (int k = 0; k < 6; k++) c += texture2D(map, vUv - vec2(wind * 0.025 * float(k), 0.0));
        c /= 6.0;
        if (c.a < 0.02) discard;

        // A thin stitched line along the growing edge.
        float line = 1.0 - smoothstep(0.004, 0.016, edge);
        float stitch = step(0.35, fract(atan(q.y - 0.5, q.x - 0.5 * aspect) * 40.0 + time * 0.5));
        c.rgb = mix(c.rgb, accent, line * mix(0.6, 1.0, stitch));
        gl_FragColor = c;
        #include <colorspace_fragment>
      }
    `,
  });
}

const CSS = `
  .gr-title { position: absolute; left: 64px; bottom: 120px; color: var(--text); max-width: 46vw; transition: color .5s; }
  .gr-title .kk-serif { font-size: clamp(40px, 7vw, 112px); line-height: .92; }
  .gr-title em { color: var(--accent); font-family: var(--serif); font-style: italic; transition: color .5s; }
  .gr-title .kk-mono { margin-top: 14px; }
  .gr-controls { position: absolute; left: 64px; bottom: 28px; display: grid; gap: 8px; color: var(--text); }
  .gr-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .gr-row > span { width: 64px; opacity: .6; }
  .gr-chip { font: inherit; color: inherit; background: none; border: 1px solid currentColor; padding: 4px 9px;
    cursor: pointer; opacity: .55; border-radius: 0; text-transform: uppercase; letter-spacing: .06em; }
  .gr-chip[aria-pressed="true"] { opacity: 1; background: var(--text); color: var(--bg); }
  .gr-chip:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
  @media (max-width: 700px) {
    .gr-title { left: 16px; bottom: 132px; max-width: 90vw; }
    .gr-controls { left: 16px; right: 16px; bottom: 16px; }
    .gr-row > span { width: 100%; }
  }
`;

export function create(canvas, { root, front }) {
  const stage = createStage(canvas, { fov: 35, onResize: () => relayout() });
  const { scene, camera, renderer } = stage;
  camera.position.set(0, 0, DISTANCE);
  const store = createTextureStore(renderer);
  const tweens = createTweens();
  const geometry = new THREE.PlaneGeometry(1, 1, 80, 120);

  // ---- overlay ----
  el('style', null, front, CSS);
  const title = el('div', 'gr-title', front);
  const controls = el('div', 'gr-controls kk-mono', front);
  const makeRow = (label, items, onPick) => {
    const row = el('div', 'gr-row', controls);
    el('span', null, row, label);
    return items.map((name, k) => {
      const chip = el('button', 'gr-chip kk-interactive', row, name);
      chip.type = 'button';
      chip.addEventListener('click', () => onPick(k));
      return chip;
    });
  };
  const paletteChips = makeRow('Palette', PALETTES.map((p) => p.name), (k) => setPalette(k));
  const motionChips = makeRow('Motion', MOTIONS, (k) => setMotion(k));

  let palette = PALETTES[0];
  function setPalette(k) {
    palette = PALETTES[k];
    paletteChips.forEach((c, j) => c.setAttribute('aria-pressed', String(j === k)));
    for (const [name, value] of [['--bg', palette.bg], ['--accent', palette.accent], ['--text', palette.text], ['--ui', palette.text]]) {
      root.style.setProperty(name, value);
    }
  }
  const background = new THREE.Color();
  let motion = 0;
  let motionStart = 0;
  function setMotion(k) {
    motion = k;
    motionStart = performance.now() / 1000;
    motionChips.forEach((c, j) => c.setAttribute('aria-pressed', String(j === k)));
  }
  setPalette(0);
  setMotion(0);

  // ---- pieces ----
  let index = 0;
  let current = null;
  let leaving = null;

  function makePiece(i) {
    const material = createGrowMaterial();
    const info = pieceInfo(i);
    info.details.forEach((d, k) => material.uniforms.seeds.value[k].set(d.u, d.v));
    const { w, h } = fitSize(i);
    material.uniforms.aspect.value = w / h;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { i, w, h, grow: 0 };
    scene.add(mesh);
    place(mesh);
    return mesh;
  }

  function place(mesh) {
    const view = viewSize(camera, DISTANCE);
    const portrait = camera.aspect < 1;
    const { w, h } = mesh.userData;
    const scale = portrait
      ? Math.min((view.w * 0.8) / w, (view.h * 0.5) / h)
      : Math.min((view.w * 0.42) / w, (view.h * 0.78) / h);
    mesh.scale.set(w * scale, h * scale, 1);
    mesh.position.set(portrait ? 0 : view.w * 0.2, portrait ? view.h * 0.16 : 0, 0);
  }

  function show(i) {
    index = i;
    const old = current;
    if (old) {
      if (leaving) dispose(leaving);
      leaving = old;
      // Anticipation: a small swell, then wither back to the seeds.
      const from = old.userData.grow;
      tweens.add({ duration: 140, ease: easeInOutCubic, update: (p) => (old.userData.lift = 0.1 * p) });
      tweens.add({
        delay: 140, duration: 450, ease: easeInOutCubic,
        update: (p) => {
          old.userData.grow = from * (1 - p);
          old.userData.lift = 0.1 * (1 - p);
        },
        done: () => {
          if (leaving === old) leaving = null;
          dispose(old);
        },
      });
    }
    const mesh = makePiece(i);
    current = mesh;
    let started = false;
    store.progressive(i, (texture) => {
      mesh.material.uniforms.map.value = texture;
      if (started) return;
      started = true;
      mesh.userData.bornAt = performance.now() / 1000 + (old ? 0.5 : 0);
    });
    const info = pieceInfo(i);
    title.innerHTML = `<div class="kk-serif">${info.title} <em>No. ${info.number}</em></div><div class="kk-mono">${info.index} / ${info.total} · ${info.size}</div>`;
    for (const d of [1, -1]) store.get(wrap(i + d), 'preview').then(() => store.get(wrap(i + d), 'full'));
    store.keep((n) => loopDistance(n, i) <= 1 || n === old?.userData.i);
  }

  function dispose(mesh) {
    scene.remove(mesh);
    mesh.material.dispose();
  }

  function relayout() {
    for (const m of [current, leaving]) if (m) place(m);
  }

  /** Growth radius and wind for the current motion at time t (seconds). */
  function motionAt(mesh, now) {
    if (mesh.userData.bornAt === undefined || now < mesh.userData.bornAt) return { grow: 0, wind: 0 };
    const age = now - mesh.userData.bornAt;
    const intro = FULL * easeInOutCubic(age / 2.4); // every piece grows in first
    const since = now - Math.max(motionStart, mesh.userData.bornAt + 2.4);
    switch (MOTIONS[motion]) {
      case 'Wither & bloom': {
        if (age < 2.4) return { grow: intro, wind: 0 };
        // Exactly one wither-and-bloom every 8 s, starting from full.
        const cycle = 0.5 + 0.5 * Math.cos((Math.max(0, since) / 8) * Math.PI * 2);
        return { grow: 0.12 + (FULL - 0.12) * cycle, wind: 0 };
      }
      case 'Gust': {
        // A gust every 5 s, rising and falling smoothly.
        const g = Math.max(0, Math.sin((Math.max(0, since) / 5) * Math.PI * 2)) ** 4;
        return { grow: intro, wind: age < 2.4 ? 0 : g };
      }
      default:
        return { grow: intro, wind: 0 };
    }
  }

  // ---- pointer: lean towards it ----
  const pointer = new THREE.Vector2();
  const onMove = (e) => pointer.set((e.clientX / stage.width) * 2 - 1, -(e.clientY / stage.height) * 2 + 1);
  canvas.addEventListener('pointermove', onMove);

  stage.start((t) => {
    tweens.tick();
    const now = performance.now() / 1000;
    background.set(palette.bg);
    scene.background = background;

    if (current) {
      const m = motionAt(current, now);
      current.userData.grow = m.grow;
      current.material.uniforms.wind.value = m.wind;
      // Perfect 6 s loops: a slow sway, and for Breathe a slow move towards the viewer and back.
      const name = MOTIONS[motion];
      const phase = (t / 6) * Math.PI * 2;
      const sway = name === 'Grow' || name === 'Breathe' ? Math.sin(phase) * 0.06 : 0;
      current.rotation.y = pointer.x * 0.25 + sway;
      current.rotation.x = -pointer.y * 0.15;
      current.position.z = name === 'Breathe' ? Math.sin(phase) * 0.08 : 0;
    }
    if (leaving) leaving.position.z = leaving.userData.lift ?? 0;
    for (const mesh of [current, leaving]) {
      if (!mesh) continue;
      mesh.material.uniforms.grow.value = mesh.userData.grow;
      mesh.material.uniforms.time.value = now;
      mesh.material.uniforms.accent.value.set(palette.accent);
    }
  });

  show(0);

  return {
    next: () => show(wrap(index + 1)),
    prev: () => show(wrap(index - 1)),
    destroy() {
      canvas.removeEventListener('pointermove', onMove);
      tweens.clear();
      for (const m of [current, leaving]) if (m) dispose(m);
      geometry.dispose();
      store.dispose();
      stage.dispose();
    },
  };
}
