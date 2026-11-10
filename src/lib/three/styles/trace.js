// Style: Trace. Each keringkam is drawn as a glowing line trace of its own edges (computed
// live from the image) on a dark construction grid, with a fainter copy floating behind it for
// depth. A scan line sweeps across every 6 s and briefly reveals the real fabric; a lens follows
// the pointer (or finger) to show the true piece underneath. Click to switch trace / true.
// Lessons: LILIUM ("geometric trace", x-ray line drawing, construction circle, corner labels),
// "directed" motion (strongest lines first, anticipation, perfect scan loop).

import * as THREE from 'three';
import {
  wrap, loopDistance, fitSize, createStage, createTextureStore, createTweens,
  pieceInfo, toScreen, viewSize, easeOutBack, easeInOutCubic,
} from '../common.js';
import { BASIC_VERTEX } from '../shaders.js';
import { el, createSvg, draw } from '../overlay.js';

const BG = '#0a0a0b';
const LINE = '#5b8cff';
const DISTANCE = 5;
const SCAN_S = 6;
const REST = 0.35; // edge threshold when fully drawn
const HIDDEN = 4; // edge threshold at which no lines show

function createTraceMaterial({ ghost = false } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      map: { value: null },
      texel: { value: new THREE.Vector2(0.002, 0.002) },
      threshold: { value: HIDDEN },
      lineColor: { value: new THREE.Color(LINE) },
      truth: { value: 0 },
      scanX: { value: -1 },
      lens: { value: 0 },
      pointerUv: { value: new THREE.Vector2(-9, -9) },
      aspect: { value: 1 },
      opacity: { value: ghost ? 0.3 : 1 },
    },
    defines: ghost ? { GHOST: '' } : {},
    vertexShader: BASIC_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec2 texel, pointerUv;
      uniform float threshold, truth, scanX, lens, aspect, opacity;
      uniform vec3 lineColor;
      varying vec2 vUv;

      float lum(vec2 uv) {
        vec4 c = texture2D(map, uv);
        return dot(c.rgb, vec3(0.3, 0.59, 0.11)) * c.a;
      }

      void main() {
        vec4 c = texture2D(map, vUv);
        // Sobel edges at roughly screen resolution.
        float tl = lum(vUv + texel * vec2(-1.0, 1.0)), t = lum(vUv + texel * vec2(0.0, 1.0)), tr = lum(vUv + texel * vec2(1.0, 1.0));
        float l = lum(vUv + texel * vec2(-1.0, 0.0)), r = lum(vUv + texel * vec2(1.0, 0.0));
        float bl = lum(vUv + texel * vec2(-1.0, -1.0)), b = lum(vUv + texel * vec2(0.0, -1.0)), br = lum(vUv + texel * vec2(1.0, -1.0));
        float gx = tr + 2.0 * r + br - tl - 2.0 * l - bl;
        float gy = tl + 2.0 * t + tr - bl - 2.0 * b - br;
        float edge = length(vec2(gx, gy));
        float line = smoothstep(threshold, threshold * 1.8, edge);
        vec4 trace = vec4(lineColor * (0.6 + line), max(line, c.a * 0.06));

        #ifdef GHOST
          trace.a *= opacity;
          if (trace.a < 0.01) discard;
          gl_FragColor = trace;
        #else
          // Where the true fabric shows: the lens, the scan band and its fading trail, or everywhere.
          float dist = length((vUv - pointerUv) * vec2(aspect, 1.0));
          float inLens = 1.0 - smoothstep(lens * 0.94, lens, dist);
          float band = exp(-pow((vUv.x - scanX) / 0.02, 2.0));
          float trail = vUv.x < scanX ? exp(-(scanX - vUv.x) * 9.0) * 0.85 : 0.0;
          float show = clamp(max(max(inLens, trail), truth), 0.0, 1.0);
          vec4 col = mix(trace, c, show);
          col.rgb = mix(col.rgb, lineColor * 1.6, band * 0.9 * step(0.02, c.a)); // the scan line itself
          float rim = smoothstep(lens * 0.9, lens * 0.94, dist) * (1.0 - smoothstep(lens, lens * 1.03, dist));
          col = mix(col, vec4(lineColor * 1.4, 1.0), rim * step(0.001, lens));
          col.a *= opacity;
          if (col.a < 0.01) discard;
          gl_FragColor = col;
        #endif
        #include <colorspace_fragment>
      }
    `,
  });
}

const CSS = `
  .tr-grid { stroke: #1d1f24; }
  .tr-axis { stroke: #2b3040; stroke-dasharray: 3 5; }
  .tr-circle { stroke: ${LINE}; opacity: .55; }
  .tr-ticks { stroke: ${LINE}; stroke-width: 6; stroke-dasharray: 0.002 0.0225; opacity: .5;
    transform-box: fill-box; transform-origin: center; animation: tr-spin 36s linear infinite; }
  @keyframes tr-spin { to { transform: rotate(360deg); } }
  .tr-c { position: absolute; color: #c9cfdb; }
  .tr-c b { color: ${LINE}; font-weight: 500; }
  .tr-tl { top: 20px; left: 64px; }
  .tr-tr { top: 20px; right: 72px; text-align: right; }
  .tr-bl { bottom: 22px; left: 24px; }
  .tr-bl .kk-serif { font-size: clamp(26px, 3.4vw, 44px); line-height: 1; color: #eef1f7; }
  .tr-br { bottom: 22px; right: 24px; text-align: right; }
  @media (max-width: 700px) { .tr-br { display: none; } }
`;

export function create(canvas, { root, front }) {
  root.style.setProperty('--ui', '#eef1f7');
  const stage = createStage(canvas, { fov: 35, background: BG, onResize: () => relayout() });
  const { scene, camera, renderer } = stage;
  camera.position.set(0, 0, DISTANCE);
  const store = createTextureStore(renderer);
  const tweens = createTweens();
  const plane = new THREE.PlaneGeometry(1, 1);

  el('style', null, front, CSS);
  const svg = createSvg(front);
  const labels = el('div', null, front);

  let index = 0;
  let current = null;
  let leaving = null;
  let scanStart = 0;

  // ---- piece: the trace, plus a faint copy further back for parallax depth ----
  function makePiece(i) {
    const group = new THREE.Group();
    const ghost = new THREE.Mesh(plane, createTraceMaterial({ ghost: true }));
    ghost.position.z = -0.35;
    const main = new THREE.Mesh(plane, createTraceMaterial());
    group.add(ghost, main);
    group.userData = { i, main, ghost, materials: [main.material, ghost.material] };
    scene.add(group);
    place(group);
    return group;
  }

  function place(group) {
    const view = viewSize(camera, DISTANCE);
    const { w, h } = fitSize(group.userData.i);
    const scale = Math.min((view.w * (camera.aspect < 1 ? 0.8 : 0.5)) / w, (view.h * 0.7) / h);
    group.userData.size = { w: w * scale, h: h * scale };
    group.userData.main.scale.set(w * scale, h * scale, 1);
    group.userData.ghost.scale.set(w * scale * 1.04, h * scale * 1.04, 1);
    group.userData.materials.forEach((m) => {
      m.uniforms.aspect.value = w / h;
      // Edge detection at about 1.5 screen pixels.
      const pxW = (w * scale * stage.width) / view.w;
      const pxH = (h * scale * stage.height) / view.h;
      m.uniforms.texel.value.set(1.5 / pxW, 1.5 / pxH);
    });
  }

  function buildOverlay(i, animate) {
    svg.clear();
    labels.replaceChildren();
    const W = stage.width;
    const H = stage.height;
    const grid = [];
    const stepPx = Math.max(48, Math.round(Math.min(W, H) / 10));
    for (let x = (W / 2) % stepPx; x < W; x += stepPx) grid.push(svg.line(x, 0, x, H, 'tr-grid'));
    for (let y = (H / 2) % stepPx; y < H; y += stepPx) grid.push(svg.line(0, y, W, y, 'tr-grid'));
    const axes = [svg.line(W / 2, 0, W / 2, H, 'tr-axis'), svg.line(0, H / 2, W, H / 2, 'tr-axis')];
    const { w, h } = current.userData.size;
    const a = toScreen(stage, new THREE.Vector3(-w / 2, h / 2, 0));
    const b = toScreen(stage, new THREE.Vector3(w / 2, -h / 2, 0));
    const r = Math.max(b.x - a.x, b.y - a.y) * 0.56;
    const circle = svg.circle(W / 2, H / 2, r, 'tr-circle');
    svg.circle(W / 2, H / 2, r * 1.05, 'tr-ticks');
    if (animate) {
      draw(axes, { duration: 900 });
      draw([circle], { duration: 1400, delay: 200 });
    }

    const info = pieceInfo(i);
    el('div', 'tr-c tr-tl kk-mono', labels).innerHTML = 'Geometric trace<br>Keringkam';
    el('div', 'tr-c tr-tr kk-mono', labels).innerHTML = `<b>${info.plate}</b><br>${info.index} / ${info.total}`;
    el('div', 'tr-c tr-bl', labels).innerHTML = `<div class="kk-serif">${info.title}</div><div class="kk-mono">No. ${info.number}</div>`;
    el('div', 'tr-c tr-br kk-mono', labels).innerHTML = `Source ${info.size}<br>Click: trace / true`;
  }

  function show(i, direction) {
    index = i;
    const old = current;
    if (old) {
      if (leaving) dispose(leaving);
      leaving = old;
      const leavingMain = old.userData.main.material.uniforms;
      leavingMain.lens.value = 0;
      leavingMain.scanX.value = -1;
      // Anticipation: turn slightly against the direction of travel, then lines fade out.
      tweens.add({ duration: 160, ease: easeInOutCubic, update: (p) => (old.rotation.y = direction * 0.12 * p) });
      tweens.add({
        delay: 140, duration: 420, ease: easeInOutCubic,
        update: (p) => {
          old.position.x = -direction * 0.6 * p;
          old.userData.materials.forEach((m) => {
            m.uniforms.threshold.value = THREE.MathUtils.lerp(REST, HIDDEN, p);
            m.uniforms.opacity.value = (m.defines.GHOST !== undefined ? 0.3 : 1) * (1 - p);
          });
        },
        done: () => {
          if (leaving === old) leaving = null;
          dispose(old);
        },
      });
    }
    const group = makePiece(i);
    current = group;
    let started = false;
    store.progressive(i, (texture) => {
      group.userData.materials.forEach((m) => (m.uniforms.map.value = texture));
      if (started) return;
      started = true;
      const delay = old ? 380 : 0;
      // Strongest lines first, then the rest; the piece settles from the side.
      group.position.x = direction * 0.6;
      tweens.add({ delay, duration: 900, ease: easeOutBack, update: (p) => (group.position.x = direction * 0.6 * (1 - p)) });
      tweens.add({
        delay, duration: 1400, ease: easeInOutCubic,
        update: (p) => group.userData.materials.forEach((m) => (m.uniforms.threshold.value = THREE.MathUtils.lerp(HIDDEN, REST, p))),
      });
      setTimeout(() => {
        if (current !== group) return;
        scanStart = performance.now() / 1000;
        buildOverlay(i, true);
      }, delay);
    });
    for (const d of [1, -1]) store.get(wrap(i + d), 'preview').then(() => store.get(wrap(i + d), 'full'));
    store.keep((n) => loopDistance(n, i) <= 1 || n === old?.userData.i);
  }

  function dispose(group) {
    scene.remove(group);
    group.userData.materials.forEach((m) => m.dispose());
  }

  function relayout() {
    for (const g of [current, leaving]) if (g) place(g);
    if (current) buildOverlay(current.userData.i, false);
  }

  // ---- input: lens follows the pointer; click toggles trace / true ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  let touchDown = false;
  let lens = 0;
  let truth = 0;
  let truthTarget = 0;
  let downAt = 0;
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' && !touchDown) return;
    pointer.set((e.clientX / stage.width) * 2 - 1, -(e.clientY / stage.height) * 2 + 1);
  };
  const onDown = (e) => {
    touchDown = true;
    downAt = performance.now();
    onMove(e);
  };
  const onUp = (e) => {
    touchDown = false;
    if (e.pointerType !== 'mouse') pointer.set(9, 9);
    if (performance.now() - downAt < 250) truthTarget = truthTarget ? 0 : 1; // a quick tap or click
  };
  const onLeave = () => pointer.set(9, 9);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  stage.start(() => {
    tweens.tick();
    const now = performance.now() / 1000;
    truth += (truthTarget - truth) * 0.1;
    if (!current) return;

    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(current.userData.main)[0];
    lens += ((hit ? 0.17 : 0) - lens) * 0.15;
    const scanX = (((now - scanStart) % SCAN_S) / SCAN_S) * 1.6 - 0.3;
    for (const m of [current.userData.main.material]) {
      if (hit) m.uniforms.pointerUv.value.copy(hit.uv);
      m.uniforms.lens.value = lens;
      m.uniforms.scanX.value = scanX;
      m.uniforms.truth.value = truth;
    }
    // The piece and its ghost turn gently towards the pointer: the gap between them reads as depth.
    const px = Math.abs(pointer.x) > 1 ? 0 : pointer.x;
    const py = Math.abs(pointer.y) > 1 ? 0 : pointer.y;
    current.rotation.y += (px * 0.3 - current.rotation.y) * 0.06;
    current.rotation.x += (-py * 0.2 - current.rotation.x) * 0.06;
  });

  show(0, 1);

  return {
    next: () => show(wrap(index + 1), 1),
    prev: () => show(wrap(index - 1), -1),
    destroy() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      tweens.clear();
      for (const g of [current, leaving]) if (g) dispose(g);
      store.dispose();
      stage.dispose();
    },
  };
}
