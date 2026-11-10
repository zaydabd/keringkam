// Style: Dither. Each keringkam floats on a dithered, water-like field. A light slider moves
// the scene from day through golden hour to night (with a moonlight reflection), bright
// threads catch a slow sweeping glint, and tapping sends real 3D ripples through fabric and
// field. Hold anywhere to see the true, undithered colours.
// Lessons: "Sinking into dither" (dither texture, ripples, sun/moon slider),
// "directed" motion (anticipation, one moment, perfect 8 s glint loop).

import * as THREE from 'three';
import {
  wrap, loopDistance, fitSize, createStage, createTextureStore, createTweens,
  pieceInfo, viewSize, easeOutBack, easeInOutCubic,
} from '../common.js';
import { GLSL_NOISE } from '../shaders.js';
import { el } from '../overlay.js';

const DISTANCE = 5;
const RIPPLES = 6;
const LOOP_S = 8;

// Background colours (sRGB) for day, golden hour and night: flat, no gradients.
const FIELD = ['#d9dccb', '#6b4a22', '#0b1430'].map((c) => new THREE.Color(c));

const RIPPLE_GLSL = /* glsl */ `
  uniform vec4 ripples[${RIPPLES}];
  uniform float time;
  float rippleHeight(vec2 p) {
    float h = 0.0;
    for (int k = 0; k < ${RIPPLES}; k++) {
      vec4 r = ripples[k];
      float age = time - r.z;
      if (age < 0.0 || r.w <= 0.0) continue;
      float d = length(p - r.xy);
      float front = age * 0.9;
      float envelope = exp(-age * 0.6) * exp(-pow((d - front) * 2.2, 2.0));
      h += r.w * envelope * sin((d - front) * 16.0);
    }
    return h;
  }
`;

function createDitherMaterial({ isFabric }) {
  return new THREE.ShaderMaterial({
    transparent: isFabric,
    uniforms: {
      map: { value: null },
      ripples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) },
      time: { value: 0 },
      light: { value: 0 },
      truth: { value: 0 },
      fade: { value: isFabric ? 0 : 1 },
      field: { value: new THREE.Color() },
      dotPx: { value: 2 * Math.min(window.devicePixelRatio, 2) },
    },
    defines: isFabric ? { FABRIC: '' } : {},
    vertexShader: /* glsl */ `
      ${RIPPLE_GLSL}
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.z += rippleHeight(w.xy) * 0.04;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      ${RIPPLE_GLSL}
      ${GLSL_NOISE}
      uniform sampler2D map;
      uniform float light, truth, fade, dotPx;
      uniform vec3 field;
      varying vec2 vUv;
      varying vec3 vWorld;

      void main() {
        float th = bayer4(gl_FragCoord.xy / dotPx);
        #ifdef FABRIC
          vec4 c = texture2D(map, vUv);
          if (c.a < mix(th, 0.5, truth) || fade < th) discard; // dithered edges and dissolve
        #else
          vec4 c = vec4(field, 1.0);
        #endif

        // Surface normal from the ripples.
        float e = 0.01;
        float hx = rippleHeight(vWorld.xy + vec2(e, 0.0)) - rippleHeight(vWorld.xy - vec2(e, 0.0));
        float hy = rippleHeight(vWorld.xy + vec2(0.0, e)) - rippleHeight(vWorld.xy - vec2(0.0, e));
        vec3 n = normalize(vec3(-hx * 1.6, -hy * 1.6, 1.0));

        // Day → golden hour → night.
        float golden = 1.0 - abs(light - 0.5) * 2.0;
        float night = smoothstep(0.5, 1.0, light);
        vec3 tint = mix(mix(vec3(1.0), vec3(1.25, 0.92, 0.6), golden), vec3(0.42, 0.52, 1.0), night);
        float exposure = mix(mix(1.0, 0.85, golden), 0.68, night);
        vec3 L = normalize(mix(vec3(-0.5, 0.6, 0.8), vec3(-0.9, 0.2, 0.4), golden));
        L = normalize(mix(L, vec3(0.0, 0.8, 0.6), night));
        float diffuse = 0.75 + 0.45 * dot(n, L);
        float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 30.0);

        vec3 col = c.rgb * tint * exposure * diffuse + spec * tint * 0.5;

        #ifdef FABRIC
          // Bright threads catch a slow glint that sweeps across, once every ${LOOP_S} s.
          float lum = dot(c.rgb, vec3(0.3, 0.59, 0.11));
          float sweep = fract(time / ${LOOP_S.toFixed(1)}) * 8.0 - 4.0;
          float glint = exp(-pow((vWorld.x + vWorld.y * 0.6 - sweep) / 0.25, 2.0));
          col += tint * glint * smoothstep(0.25, 0.7, lum) * 0.7;
        #else
          // Water-like grain and, at night, a moonlight column broken into streaks.
          col *= 0.9 + 0.2 * noise(vWorld.xy * vec2(6.0, 40.0) + vec2(0.0, time * 0.3));
          float column = exp(-pow(vWorld.x / 0.3, 2.0)) * step(0.62, noise(vec2(vWorld.x * 6.0, vWorld.y * 28.0 + time * 0.8)));
          col += vec3(0.85, 0.9, 1.0) * column * night * 0.35;
        #endif

        // Ordered dither in sRGB, unless the viewer is holding to see the true colours.
        vec3 s = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
        float levels = 5.0;
        vec3 d = floor(s * levels + th) / levels;
        gl_FragColor = vec4(mix(d, s, truth), 1.0);
      }
    `,
  });
}

const CSS = `
  .dt-head { position: absolute; top: 18px; left: 64px; color: var(--ink); transition: color .4s; }
  .dt-head .kk-serif { font-size: clamp(22px, 3vw, 34px); line-height: 1; letter-spacing: 0; text-transform: none; }
  .dt-hint { position: absolute; top: 22px; right: 72px; color: var(--ink); text-align: right; opacity: .75; transition: color .4s; }
  .dt-slider { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); width: min(340px, 72vw);
    display: flex; align-items: center; gap: 12px; color: var(--ink); transition: color .4s; }
  .dt-slider input { flex: 1; accent-color: var(--ink); height: 28px; cursor: pointer; }
  .dt-slider svg { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; }
  .dt-mode { position: absolute; left: 50%; bottom: 62px; transform: translateX(-50%); color: var(--ink); transition: color .4s; }
  @media (max-width: 700px) { .dt-hint { display: none; } }
`;
const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>';
const MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

export function create(canvas, { root, front }) {
  const stage = createStage(canvas, { fov: 35, onResize: () => relayout() });
  const { scene, camera, renderer } = stage;
  camera.position.set(0, 0, DISTANCE);
  const store = createTextureStore(renderer);
  const tweens = createTweens();

  // ---- scene: a large field and the fabric above it ----
  const fieldMaterial = createDitherMaterial({ isFabric: false });
  const fieldMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 160, 160), fieldMaterial);
  fieldMesh.position.z = -0.02;
  scene.add(fieldMesh);
  const fabricGeometry = new THREE.PlaneGeometry(1, 1, 120, 120);

  // ---- overlay ----
  el('style', null, front, CSS);
  const head = el('div', 'dt-head', front);
  el('div', 'dt-hint kk-mono', front).innerHTML = 'Tap for ripples<br>Hold for true colour';
  const mode = el('div', 'dt-mode kk-mono', front, 'Day');
  const slider = el('label', 'dt-slider kk-interactive', front);
  slider.innerHTML = `${SUN}<input type="range" min="0" max="1" step="0.001" value="0" aria-label="Light: day to night">${MOON}`;
  const input = slider.querySelector('input');

  let light = 0;
  let lightTarget = 0;
  input.addEventListener('input', () => (lightTarget = Number(input.value)));

  // ---- ripples ----
  let nextRipple = 0;
  const materials = () => [fieldMaterial, ...(current ? [current.material] : []), ...(leaving ? [leaving.material] : [])];
  function ripple(x, y, strength = 1) {
    const now = performance.now() / 1000;
    const slot = nextRipple++ % RIPPLES;
    for (const m of materials()) m.uniforms.ripples.value[slot].set(x, y, now, strength);
    rippleState[slot] = [x, y, now, strength];
  }
  const rippleState = Array.from({ length: RIPPLES }, () => [0, 0, -99, 0]);

  // ---- pieces ----
  let index = 0;
  let current = null;
  let leaving = null;

  function makeFabric(i) {
    const material = createDitherMaterial({ isFabric: true });
    rippleState.forEach((r, k) => material.uniforms.ripples.value[k].set(...r));
    const mesh = new THREE.Mesh(fabricGeometry, material);
    mesh.userData.i = i;
    scene.add(mesh);
    fit(mesh);
    return mesh;
  }

  function fit(mesh) {
    const view = viewSize(camera, DISTANCE);
    const { w, h } = fitSize(mesh.userData.i);
    const scale = Math.min((view.w * 0.62) / w, (view.h * 0.66) / h);
    mesh.scale.set(w * scale, h * scale, 1);
  }

  function show(i, direction) {
    index = i;
    const old = current;
    if (old) {
      if (leaving) dispose(leaving);
      leaving = old;
      // Anticipation: lift a little, then sink and dissolve into the field.
      tweens.add({ duration: 160, ease: easeInOutCubic, update: (p) => (old.position.z = 0.08 * p) });
      tweens.add({
        delay: 160, duration: 600, ease: easeInOutCubic,
        update: (p) => {
          old.position.z = 0.08 - 0.5 * p;
          old.position.x = -direction * 0.3 * p;
          old.material.uniforms.fade.value = 1 - p;
        },
        done: () => {
          if (leaving === old) leaving = null;
          dispose(old);
        },
      });
    }
    const mesh = makeFabric(i);
    current = mesh;
    mesh.position.set(direction * 0.3, 0, -0.5);
    let started = false;
    store.progressive(i, (texture) => {
      mesh.material.uniforms.map.value = texture;
      if (started) return;
      started = true;
      const delay = old ? 450 : 0;
      // The moment: it surfaces with a ripple burst and settles.
      tweens.add({
        delay, duration: 900, ease: easeOutBack,
        update: (p) => {
          mesh.position.z = -0.5 + 0.5 * p;
          mesh.position.x = direction * 0.3 * (1 - p);
        },
      });
      tweens.add({ delay, duration: 700, update: (p) => (mesh.material.uniforms.fade.value = p) });
      setTimeout(() => current === mesh && ripple(0, 0, 1.2), delay + 250);
    });
    const info = pieceInfo(i);
    head.innerHTML = `<div class="kk-serif">${info.title}</div><div class="kk-mono">No. ${info.number} · ${info.index} / ${info.total}</div>`;
    for (const d of [1, -1]) store.get(wrap(i + d), 'preview').then(() => store.get(wrap(i + d), 'full'));
    store.keep((n) => loopDistance(n, i) <= 1 || n === old?.userData.i);
  }

  function dispose(mesh) {
    scene.remove(mesh);
    mesh.material.dispose();
  }

  function relayout() {
    const view = viewSize(camera, DISTANCE);
    fieldMesh.scale.set(view.w * 1.6, view.h * 1.6, 1);
    for (const m of [current, leaving]) if (m) fit(m);
  }

  // ---- input: tap for a ripple, hold for true colour, pointer tilts the view ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let holding = false;
  let holdTimer = 0;
  let truth = 0;
  const onDown = (e) => {
    const ndc = new THREE.Vector2((e.clientX / stage.width) * 2 - 1, -(e.clientY / stage.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(fieldMesh)[0];
    if (hit) ripple(hit.point.x, hit.point.y, 0.9);
    holdTimer = setTimeout(() => (holding = true), 250);
  };
  const onUp = () => {
    clearTimeout(holdTimer);
    holding = false;
  };
  const onMove = (e) => pointer.set((e.clientX / stage.width) * 2 - 1, -(e.clientY / stage.height) * 2 + 1);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointermove', onMove);

  // ---- every frame ----
  const ink = new THREE.Color();
  let lastAuto = -1;
  stage.start((t) => {
    tweens.tick();
    const now = performance.now() / 1000;
    light += (lightTarget - light) * 0.08;
    truth += ((holding ? 1 : 0) - truth) * 0.12;

    for (const m of materials()) {
      m.uniforms.time.value = now;
      m.uniforms.light.value = light;
      m.uniforms.truth.value = truth;
    }
    // Field colour: day → golden → night.
    const field = light < 0.5 ? FIELD[0].clone().lerp(FIELD[1], light * 2) : FIELD[1].clone().lerp(FIELD[2], (light - 0.5) * 2);
    fieldMaterial.uniforms.field.value.copy(field);

    // Text colour follows the light.
    ink.set(light > 0.35 ? '#f2efe8' : '#141414');
    root.style.setProperty('--ui', `#${ink.getHexString()}`);
    root.style.setProperty('--ink', `#${ink.getHexString()}`);
    mode.textContent = light < 0.25 ? 'Day' : light < 0.7 ? 'Golden hour' : 'Night';

    // Idle: a gentle ripple from the centre every LOOP_S seconds.
    const beat = Math.floor(t / LOOP_S);
    if (beat !== lastAuto) {
      if (lastAuto >= 0 && current) ripple(0, 0, 0.6);
      lastAuto = beat;
    }

    // Slight parallax tilt towards the pointer.
    camera.position.x += (pointer.x * 0.35 - camera.position.x) * 0.05;
    camera.position.y += (pointer.y * 0.25 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
  });

  relayout();
  show(0, 1);

  return {
    next: () => show(wrap(index + 1), 1),
    prev: () => show(wrap(index - 1), -1),
    destroy() {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointermove', onMove);
      clearTimeout(holdTimer);
      tweens.clear();
      for (const m of [current, leaving]) if (m) dispose(m);
      fabricGeometry.dispose();
      store.dispose();
      stage.dispose();
    },
  };
}
