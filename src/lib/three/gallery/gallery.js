// The main gallery: one keringkam at a time, simulated as soft cloth hanging from a thin brass
// rod in front of a warm wall. A light breeze moves it, the pointer stirs it, and it can be
// grabbed and pulled. Changing piece slides the rod away and the next one swings in and settles.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ClothSim } from './clothSim.js';
import { fabrics, wrap, loopDistance, createTextureStore } from '../common.js';

const easeInOutSine = (p) => -(Math.cos(Math.PI * Math.min(1, Math.max(0, p))) - 1) / 2;

const WALL_COLOUR = '#ece5da';
const ROD_COLOUR = '#b08a52';
const ROD_Y = 0.5; // the cloth hangs down from here
const WALL_Z = -0.42;
const PARTICLES = 46; // along the longer side of each cloth
const GATHER = 0.9; // the top edge is pinned slightly narrower than the cloth, so it falls in soft folds
const SLIDE_S = 2.1;
const SLIDE_DISTANCE = 1.5;
const STEP = 1 / 60;

/** Cloth size in world units: at most 1 tall and 1.35 wide. */
function clothSize(i) {
  const { width, height } = fabrics[i];
  const aspect = width / height;
  const h = Math.min(1, 1.35 / aspect);
  return { w: h * aspect, h };
}

/**
 * Gold-looking threads: where the texture colour is a bright, warm yellow, make the surface
 * more metallic and smoother so it catches the light. This is estimated from colour only.
 */
function addThreadShine(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      /* glsl */ `#include <metalnessmap_fragment>
      {
        vec3 c = diffuseColor.rgb;
        float hi = max(max(c.r, c.g), c.b);
        float lo = min(min(c.r, c.g), c.b);
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float warm = step(c.b, c.g) * step(c.g, c.r + 0.02);
        float gold = smoothstep(0.1, 0.3, lum) * smoothstep(0.3, 0.6, (hi - lo) / max(hi, 1e-3)) * warm;
        metalnessFactor = mix(metalnessFactor, 0.8, gold);
        roughnessFactor = mix(roughnessFactor, 0.34, gold);
      }`,
    );
  };
}

export function createGallery(canvas, { onChange, onReady } = {}) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- renderer, light and room ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps the textile colours true
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap; // blurred, very soft shadow edges

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WALL_COLOUR);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

  scene.add(new THREE.HemisphereLight('#fffaf2', '#d8cdbf', 0.7));
  const key = new THREE.DirectionalLight('#fff3e2', 2.2);
  key.position.set(-1.4, 2.4, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 8 });
  key.shadow.radius = 12;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 20),
    new THREE.MeshStandardMaterial({ color: WALL_COLOUR, roughness: 1 }),
  );
  wall.position.z = WALL_Z - 0.03;
  wall.receiveShadow = true;
  scene.add(wall);

  const rodGeometry = new THREE.CylinderGeometry(0.006, 0.006, 1, 20).rotateZ(Math.PI / 2);
  const capGeometry = new THREE.SphereGeometry(0.013, 20, 12);

  const store = createTextureStore(renderer);

  // ---- a hanging piece ----
  function makePiece(i) {
    const { w, h } = clothSize(i);
    const cols = w >= h ? PARTICLES : Math.max(10, Math.round((PARTICLES * w) / h));
    const rows = w >= h ? Math.max(10, Math.round((PARTICLES * h) / w)) : PARTICLES;
    const sim = new ClothSim(w, h, cols, rows);
    sim.translate(0, ROD_Y, 0);
    // A whisper of depth so the folds have a direction to fall.
    for (let k = 0; k < sim.count; k++) sim.pos[k * 3 + 2] = sim.prev[k * 3 + 2] = Math.sin(k * 12.9898) * 0.002;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(sim.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(sim.count * 2);
    const index = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        uv[(r * cols + c) * 2] = c / (cols - 1);
        uv[(r * cols + c) * 2 + 1] = 1 - r / (rows - 1);
        if (r < rows - 1 && c < cols - 1) {
          const a = r * cols + c;
          index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        }
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
      side: THREE.DoubleSide,
      // Only discard empty pixels; the soft edge of the cut-out blends into the wall.
      // (Shadows use the same threshold, so they follow the shape of the piece.)
      alphaTest: 0.1,
      transparent: true,
      opacity: 0,
      roughness: 0.8,
      sheen: 0.8, // the soft, velvety glow fabric has at grazing angles
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color('#fff0dc'),
    });
    addThreadShine(material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;

    const rodMaterial = new THREE.MeshStandardMaterial({ color: ROD_COLOUR, metalness: 1, roughness: 0.32, transparent: true, opacity: 0 });
    const rod = new THREE.Group();
    const bar = new THREE.Mesh(rodGeometry, rodMaterial);
    bar.scale.x = w * GATHER + 0.1;
    const capL = new THREE.Mesh(capGeometry, rodMaterial);
    const capR = new THREE.Mesh(capGeometry, rodMaterial);
    capL.position.x = -(w * GATHER + 0.1) / 2;
    capR.position.x = (w * GATHER + 0.1) / 2;
    rod.add(bar, capL, capR);
    rod.position.y = ROD_Y + 0.004;
    rod.visible = false;
    scene.add(mesh, rod);

    // Pin every second particle of the top edge (and the corners) to the rod.
    const pins = [];
    for (let c = 0; c < cols; c += 2) pins.push(c);
    if (pins[pins.length - 1] !== cols - 1) pins.push(cols - 1);
    sim.setTethers(pins);

    return { i, w, h, sim, mesh, rod, material, rodMaterial, pins, x: 0, opacity: 0, wind: Math.random() * 100 };
  }

  /** Loads the piece's texture (preview, then full size); onFirst runs once it is visible. */
  function load(p, onFirst) {
    let first = true;
    store.progressive(p.i, (texture) => {
      p.material.map = texture;
      p.material.needsUpdate = true;
      p.mesh.visible = true;
      p.rod.visible = true;
      if (first) {
        first = false;
        onFirst();
      }
    });
  }

  function pinToRod(p) {
    for (const c of p.pins) {
      const restX = (c / (p.sim.cols - 1) - 0.5) * p.w;
      p.sim.pin(c, p.x + restX * GATHER, ROD_Y, 0);
    }
    p.rod.position.x = p.x;
    p.material.opacity = p.opacity;
    p.rodMaterial.opacity = p.opacity;
    // Shadows ignore opacity, so only cast one once the piece is mostly visible.
    p.mesh.castShadow = p.opacity > 0.4;
    p.rod.children.forEach((m) => (m.castShadow = p.opacity > 0.4));
  }

  function disposePiece(p) {
    scene.remove(p.mesh, p.rod);
    p.mesh.geometry.dispose();
    p.material.dispose();
    p.rodMaterial.dispose();
  }

  // ---- state ----
  let index = 0;
  let current = null;
  const leaving = [];
  const slides = []; // { piece, from, to, fade, start, duration, done } — times in simulation seconds
  let time = 0; // simulation clock
  let ready = false;

  function show(i, direction) {
    index = wrap(i);
    onChange?.(index);
    const old = current;
    if (old) {
      leaving.push(old);
      // It drifts aside and fades; the cloth trails behind the rod on its own.
      slides.push({ piece: old, from: old.x, to: old.x - direction * SLIDE_DISTANCE, fade: -1, start: time, duration: SLIDE_S, done: () => {
        leaving.splice(leaving.indexOf(old), 1);
        disposePiece(old);
      } });
    }
    const p = makePiece(index);
    current = p;
    p.x = old ? direction * SLIDE_DISTANCE : 0;
    p.sim.translate(p.x, 0, 0);
    pinToRod(p);
    load(p, () => {
      if (!ready) {
        ready = true;
        onReady?.();
      }
      if (old) slides.push({ piece: p, from: p.x, to: 0, fade: 1, start: time + 0.25, duration: SLIDE_S });
      else slides.push({ piece: p, from: 0, to: 0, fade: 1, start: time, duration: 1.6 });
    });
    for (const d of [1, -1]) store.get(wrap(index + d), 'preview').then(() => store.get(wrap(index + d), 'full'));
    store.keep((n) => loopDistance(n, index) <= 1 || leaving.some((l) => l.i === n));
  }

  // ---- camera framing ----
  const lookTarget = new THREE.Vector3(0, 0, 0);
  const cameraGoal = new THREE.Vector3(0, 0, 4);
  /**
   * Places the camera so the cloth fills a set share of the screen, between the header and the
   * caption: on wide screens 70% of the height, centred 46% down; on tall phone screens 56%,
   * centred 41% down (the caption and controls need more room there).
   */
  function frame(p, instant = false) {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const portrait = camera.aspect < 0.8;
    const fillH = portrait ? 0.56 : 0.7;
    const fillW = portrait ? 0.8 : 0.62;
    const centre = portrait ? 0.41 : 0.46;
    const dist = Math.max(p.h / fillH / (2 * tan), p.w / fillW / (2 * tan * camera.aspect));
    const visibleH = 2 * dist * tan;
    const clothCentre = ROD_Y - p.h / 2;
    const y = clothCentre - (0.5 - centre) * visibleH;
    lookTarget.set(0, y, 0);
    cameraGoal.set(0, y + 0.03, dist);
    if (instant) camera.position.copy(cameraGoal);
  }

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (current) frame(current, true);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  // ---- pointer: stir, grab and pull, swipe ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(9, 9);
  const pointerWorld = new THREE.Vector3();
  const pointerVel = new THREE.Vector3();
  const lastPointerWorld = new THREE.Vector3();
  let pointerInside = false;
  let grab = null; // { piece, i, wasPinned, plane }
  let swipe = null;

  const setNdc = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const planeAt = (z) => new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);

  const onMove = (e) => {
    setNdc(e);
    pointerInside = true;
    raycaster.setFromCamera(ndc, camera);
    if (grab) {
      const target = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(grab.plane, target)) {
        const { sim } = grab.piece;
        sim.pin(grab.i, target.x, target.y, Math.max(target.z, WALL_Z + 0.02));
      }
      return;
    }
    if (!swipe && current?.mesh.visible) {
      canvas.style.cursor = raycaster.intersectObject(current.mesh)[0] ? 'grab' : '';
    }
  };

  const onDown = (e) => {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    const hit = current?.mesh.visible && raycaster.intersectObject(current.mesh)[0];
    if (hit) {
      // Grab the nearest particle of the face that was hit.
      const { sim } = current;
      const face = [hit.face.a, hit.face.b, hit.face.c];
      let best = face[0];
      let bestD = Infinity;
      for (const v of face) {
        const d = hit.point.distanceToSquared(new THREE.Vector3(sim.pos[v * 3], sim.pos[v * 3 + 1], sim.pos[v * 3 + 2]));
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      grab = { piece: current, i: best, wasPinned: sim.pinned[best] === 1, plane: planeAt(hit.point.z) };
      canvas.style.cursor = 'grabbing';
    } else {
      swipe = { x: e.clientX, y: e.clientY };
    }
    canvas.setPointerCapture(e.pointerId);
  };

  const onUp = (e) => {
    if (grab) {
      if (!grab.wasPinned) grab.piece.sim.unpin(grab.i);
      grab = null;
      canvas.style.cursor = 'grab';
    }
    if (swipe) {
      const dx = e.clientX - swipe.x;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - swipe.y)) show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      swipe = null;
    }
  };
  const onLeave = () => {
    pointerInside = false;
  };

  let wheelSum = 0;
  let wheelLock = 0;
  const onWheel = (e) => {
    e.preventDefault();
    if (performance.now() < wheelLock) return;
    wheelSum += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(wheelSum) > 60) {
      const d = Math.sign(wheelSum);
      show(index + d, d);
      wheelSum = 0;
      wheelLock = performance.now() + 1100;
    }
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ---- forces ----
  function applyForces(p, t) {
    const { sim } = p;
    const normals = p.mesh.geometry.attributes.normal.array;
    // A slow, uneven breeze from in front: it pushes on the cloth along its surface normal,
    // so the fabric billows instead of sliding.
    const strength = reducedMotion ? 0.35 : 1;
    const gust = (0.55 + 0.3 * Math.sin(t * 0.5 + p.wind) + 0.15 * Math.sin(t * 1.7 + p.wind * 2)) * 1.6 * strength;
    // The breeze slowly changes side, so the cloth sways towards the wall and back.
    const wx = Math.sin(t * 0.23 + p.wind) * 0.35;
    const wz = Math.sin(t * 0.37 + p.wind);
    const near = pointerInside && !grab;
    const radius2 = 0.09;
    for (let k = 0; k < sim.count; k++) {
      const x = k * 3;
      const nx = normals[x];
      const ny = normals[x + 1];
      const nz = normals[x + 2];
      const ripple = 0.7 + 0.3 * Math.sin(sim.pos[x] * 4 + sim.pos[x + 1] * 3 + t * 1.3);
      const push = (nx * wx + nz * wz) * gust * ripple;
      sim.force[x] += nx * push;
      sim.force[x + 1] += ny * push;
      sim.force[x + 2] += nz * push;
      if (near) {
        // The pointer stirs the air around it.
        const dx = sim.pos[x] - pointerWorld.x;
        const dy = sim.pos[x + 1] - pointerWorld.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < radius2) {
          const f = (1 - d2 / radius2) * 5;
          sim.force[x] += pointerVel.x * f;
          sim.force[x + 1] += pointerVel.y * f;
          sim.force[x + 2] += -Math.hypot(pointerVel.x, pointerVel.y) * f * 0.8;
        }
      }
    }
  }

  /**
   * Slides move the rods, once per simulation step so the motion is smooth at any frame rate;
   * the cloth follows through its pins and swings on its own.
   */
  function advanceSlides() {
    for (let k = slides.length - 1; k >= 0; k--) {
      const s = slides[k];
      if (time < s.start) continue;
      const p = Math.min(1, (time - s.start) / s.duration);
      s.piece.x = THREE.MathUtils.lerp(s.from, s.to, easeInOutSine(p));
      // Fade in over the first 60%, or out between 15% and 75%.
      if (s.fade > 0) s.piece.opacity = easeInOutSine(p / 0.6);
      else s.piece.opacity = 1 - easeInOutSine((p - 0.15) / 0.6);
      if (p >= 1) {
        slides.splice(k, 1);
        s.done?.();
      }
    }
  }

  // ---- loop ----
  let last = performance.now();
  let accumulator = 0;
  const parallax = new THREE.Vector2();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    accumulator += Math.min(0.1, (now - last) / 1000);
    last = now;

    // Pointer position on the cloth plane, and how fast it moves.
    if (pointerInside) {
      raycaster.setFromCamera(ndc, camera);
      raycaster.ray.intersectPlane(planeAt(0), pointerWorld);
    }

    while (accumulator >= STEP) {
      accumulator -= STEP;
      time += STEP;
      advanceSlides();
      pointerVel.subVectors(pointerWorld, lastPointerWorld).divideScalar(STEP).clampLength(0, 3);
      lastPointerWorld.copy(pointerWorld);
      for (const p of [current, ...leaving]) {
        if (!p) continue;
        pinToRod(p);
        if (grab?.piece === p) p.sim.pinned[grab.i] = 1;
        applyForces(p, time);
        p.sim.step(STEP, { wallZ: WALL_Z, iterations: 10 });
      }
    }
    for (const p of [current, ...leaving]) {
      if (!p) continue;
      const g = p.mesh.geometry;
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    }

    // Camera: ease towards the framing of the current piece, with a little parallax.
    if (current) frame(current);
    const target = ndc.x > 1 ? new THREE.Vector2() : ndc;
    parallax.lerp(target, 0.04);
    const goal = cameraGoal.clone().add(new THREE.Vector3(parallax.x * 0.12, parallax.y * 0.06, 0));
    camera.position.lerp(goal, 0.05);
    camera.lookAt(lookTarget);

    renderer.render(scene, camera);
  });

  resize();
  show(0, 1);
  frame(current, true);

  return {
    get index() {
      return index;
    },
    next: () => show(index + 1, 1),
    prev: () => show(index - 1, -1),
    go(i) {
      if (i === index) return;
      let d = wrap(i - index);
      if (d > fabrics.length / 2) d -= fabrics.length;
      show(i, Math.sign(d));
    },
    destroy() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      for (const p of [current, ...leaving]) if (p) disposePiece(p);
      rodGeometry.dispose();
      capGeometry.dispose();
      wall.geometry.dispose();
      wall.material.dispose();
      environment.dispose();
      pmrem.dispose();
      store.dispose();
      renderer.dispose();
    },
  };
}
