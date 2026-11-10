// A kampung veranda in 3D: wooden floor, bamboo roof on rafters, carved posts, a slatted
// railing and a bench. A keringkam is folded over the railing as simulated cloth, and the view
// outside is a photograph of Sarawak. The sunlight colour and floor shadows follow the view.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ClothSim } from '../gallery/clothSim.js';
import { fabrics, wrap, loopDistance, createTextureStore } from '../common.js';
import riverSunset from '../../../assets/scenes/river-sunset.webp';
import kampungBako from '../../../assets/scenes/kampung-bako.webp';
import kampungMedong from '../../../assets/scenes/kampung-medong.webp';

/** Views outside the veranda. horizon: height of the horizon in the photo, from the top (0..1). */
export const VIEWS = [
  {
    name: 'Sarawak River at sunset',
    url: riverSunset,
    horizon: 0.5,
    sun: '#ffb877',
    sunIntensity: 3.2,
    sky: '#ffd8b4',
    ground: '#5a4030',
    fill: 0.55,
    credit: { author: 'Marufish', license: 'CC BY-SA 2.0', page: 'https://commons.wikimedia.org/wiki/File:Kuching_-_Sarawak_River_Sunset_Cruise_(17156114044).jpg' },
  },
  {
    name: 'Kampung Bako',
    url: kampungBako,
    horizon: 0.42,
    sun: '#fff3e0',
    sunIntensity: 3.0,
    sky: '#e8f0ff',
    ground: '#6a5a48',
    fill: 0.7,
    credit: { author: 'diego_cue', license: 'CC BY-SA 3.0', page: 'https://commons.wikimedia.org/wiki/File:Bako_village_-_Sarawak_-_Borneo_-_Malaysia_-_panoramio.jpg' },
  },
  {
    name: 'Kampung Medong at dusk',
    url: kampungMedong,
    horizon: 0.55,
    sun: '#ffc98f',
    sunIntensity: 2.2,
    sky: '#c9d4ff',
    ground: '#4a3a32',
    fill: 0.5,
    credit: { author: 'Benjy8769', license: 'CC0', page: 'https://commons.wikimedia.org/wiki/File:Kampung_Medong_at_dusk.jpg' },
  },
];

// ---- dimensions (metres) ----
const RAIL_Y = 0.95; // top of the railing
const RAIL_Z = -2.05; // the railing line, between the veranda and the outside
const RAIL_R = 0.035;
const WRAP_R = RAIL_R + 0.006;
const EAVE_Y = 2.55;
const BACKDROP_Z = -18;
const EYE = new THREE.Vector3(0, 1.15, 1.9); // seated eye height
const LOOK = new THREE.Vector3(0, 1.12, -2.4);
const BACK = 0.47; // share of the cloth that falls outside the railing
const PARTICLES = 40;
const STEP = 1 / 60;

// ---- procedural textures ----
function canvasTexture(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}
const rand = (() => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

/** Floor planks running towards the railing, with grain. */
const planks = () =>
  canvasTexture(1024, 1024, (g, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const tone = 0.85 + rand() * 0.25;
      g.fillStyle = `rgb(${118 * tone | 0},${84 * tone | 0},${58 * tone | 0})`;
      g.fillRect((i * w) / n, 0, w / n, h);
      for (let k = 0; k < 60; k++) {
        g.strokeStyle = `rgba(40,25,15,${0.05 + rand() * 0.12})`;
        g.lineWidth = 0.5 + rand() * 1.5;
        const x = (i * w) / n + rand() * (w / n);
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + rand() * 6 - 3, h / 3, x + rand() * 6 - 3, (2 * h) / 3, x + rand() * 4 - 2, h);
        g.stroke();
      }
      g.fillStyle = 'rgba(25,15,8,0.8)';
      g.fillRect((i * w) / n, 0, 3, h);
      const joint = rand() * h;
      g.fillRect((i * w) / n, joint, w / n, 2);
    }
  }, [2.5, 2.5]);

/** Split bamboo for the underside of the roof. */
const bamboo = () =>
  canvasTexture(512, 512, (g, w, h) => {
    const n = 24;
    for (let i = 0; i < n; i++) {
      const tone = 0.85 + rand() * 0.25;
      g.fillStyle = `rgb(${190 * tone | 0},${160 * tone | 0},${112 * tone | 0})`;
      g.fillRect(0, (i * h) / n, w, h / n - 2);
      g.fillStyle = 'rgba(70,45,25,0.5)';
      g.fillRect(0, ((i + 1) * h) / n - 2, w, 2);
      for (let k = 0; k < 3; k++) {
        g.fillStyle = 'rgba(110,80,45,0.6)';
        g.fillRect(rand() * w, (i * h) / n, 3, h / n - 2);
      }
    }
  }, [6, 3]);

/** Pale posts with dark painted swirls, after the carved veranda posts. */
const carvedPost = () =>
  canvasTexture(256, 1024, (g, w, h) => {
    g.fillStyle = '#cfc2a8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5a3a26';
    g.lineCap = 'round';
    for (let y = 30; y < h; y += 120) {
      g.lineWidth = 10;
      g.beginPath();
      g.arc(w * 0.5, y + 40, 46, Math.PI * 0.2, Math.PI * 1.7);
      g.stroke();
      g.lineWidth = 7;
      g.beginPath();
      g.arc(w * 0.5, y + 40, 22, Math.PI * 1.1, Math.PI * 2.6);
      g.stroke();
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(10, y + 95);
      g.bezierCurveTo(w * 0.3, y + 70, w * 0.7, y + 120, w - 10, y + 95);
      g.stroke();
    }
  });

// ---- the veranda ----
function buildVeranda(scene) {
  const disposables = [];
  const mat = (opts) => {
    const m = new THREE.MeshStandardMaterial(opts);
    disposables.push(m);
    if (opts.map) disposables.push(opts.map);
    return m;
  };
  const wood = mat({ color: '#6b4a33', roughness: 0.75 });
  const darkWood = mat({ color: '#4a3324', roughness: 0.8 });
  const add = (geometry, material, x, y, z, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    scene.add(m);
    disposables.push(geometry);
    return m;
  };

  // Floor
  const floor = add(new THREE.PlaneGeometry(12, 7), mat({ map: planks(), roughness: 0.55 }), 0, 0, RAIL_Z + 3.4, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  // Floor edge beam, outside the railing
  add(new THREE.BoxGeometry(12, 0.22, 0.2), darkWood, 0, -0.11, RAIL_Z - 0.05);

  // Roof: eave beam, rafters and bamboo underside, sloping up towards the viewer
  add(new THREE.BoxGeometry(12, 0.2, 0.18), darkWood, 0, EAVE_Y, RAIL_Z);
  const rise = 1.0;
  const run = 6.2;
  const slope = Math.atan2(rise, run);
  const roof = add(new THREE.PlaneGeometry(12, Math.hypot(rise, run)), mat({ map: bamboo(), roughness: 0.9, side: THREE.DoubleSide }), 0, EAVE_Y + 0.16 + rise / 2, RAIL_Z + run / 2);
  roof.rotation.x = Math.PI / 2 - slope;
  for (let x = -5.6; x <= 5.6; x += 0.7) {
    const rafter = add(new THREE.BoxGeometry(0.09, 0.12, Math.hypot(rise, run)), wood, x, EAVE_Y + 0.08 + rise / 2, RAIL_Z + run / 2);
    rafter.rotation.x = -slope;
  }
  for (let k = 1; k <= 4; k++) add(new THREE.BoxGeometry(12, 0.1, 0.1), darkWood, 0, EAVE_Y + 0.1 + (rise * k) / 5, RAIL_Z + (run * k) / 5);

  // Posts
  const postMat = mat({ map: carvedPost(), roughness: 0.7 });
  for (const x of [-2.3, 2.3, -5.2, 5.2]) add(new THREE.BoxGeometry(0.26, EAVE_Y, 0.26), postMat, x, EAVE_Y / 2, RAIL_Z + 0.02);

  // Railing: top rail, bottom rail and slats
  const rail = add(new THREE.CylinderGeometry(RAIL_R, RAIL_R, 12, 16), wood, 0, RAIL_Y, RAIL_Z);
  rail.rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(12, 0.06, 0.05), wood, 0, 0.12, RAIL_Z);
  const slat = new THREE.BoxGeometry(0.075, RAIL_Y - 0.12, 0.022);
  disposables.push(slat);
  const count = Math.floor(12 / 0.17);
  const slats = new THREE.InstancedMesh(slat, wood, count);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m4.makeRotationZ((rand() - 0.5) * 0.02);
    m4.setPosition(-6 + i * 0.17 + 0.08, (RAIL_Y + 0.12) / 2, RAIL_Z - 0.03);
    slats.setMatrixAt(i, m4);
  }
  slats.castShadow = true;
  slats.receiveShadow = true;
  scene.add(slats);

  // Bench along the railing, left and right of the keringkam
  for (const [x0, x1] of [[-5.8, -1.5], [1.5, 5.8]]) {
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    add(new THREE.BoxGeometry(len, 0.05, 0.34), wood, cx, 0.44, RAIL_Z + 0.32);
    for (const lx of [x0 + 0.2, cx, x1 - 0.2]) add(new THREE.BoxGeometry(0.06, 0.42, 0.28), darkWood, lx, 0.21, RAIL_Z + 0.32);
  }

  return () => disposables.forEach((d) => d.dispose());
}

/** Cloth size in metres: 1.8 long, or up to 2.2 wide for wide pieces. (Not to real scale.) */
function clothSize(i) {
  const { width, height } = fabrics[i];
  const aspect = width / height;
  return aspect >= 1 ? { w: Math.min(2.2, 1.8 * aspect), h: Math.min(2.2, 1.8 * aspect) / aspect } : { w: 1.8 * aspect, h: 1.8 };
}

export function createVeranda(canvas, { onChange, onReady } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.25;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
  camera.position.copy(EYE);

  // Light: the sun outside, low and behind-left, throws railing shadows across the floor.
  const hemi = new THREE.HemisphereLight('#ffffff', '#4a3a30', 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  sun.position.set(-5, 5.5, -12);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  // Soft bounce from the bright floor area near the railing.
  const bounce = new THREE.PointLight('#ffd9b0', 0.9, 6, 2);
  bounce.position.set(0, 0.9, RAIL_Z + 1.4);
  scene.add(bounce);

  const disposeVeranda = buildVeranda(scene);

  // ---- backdrops: a photo outside, crossfaded when the view changes ----
  const loader = new THREE.TextureLoader();
  const backdropGeometry = new THREE.PlaneGeometry(1, 1);
  const backdrops = VIEWS.map((view) => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false, depthWrite: false, fog: false });
    const mesh = new THREE.Mesh(backdropGeometry, material);
    mesh.renderOrder = -1;
    scene.add(mesh);
    const b = { view, mesh, material, opacity: 0, loaded: false, aspect: 4 / 3 };
    loader.load(view.url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      material.map = t;
      material.needsUpdate = true;
      b.aspect = t.image.width / t.image.height;
      b.loaded = true;
      placeBackdrop(b);
    });
    return b;
  });

  /** Size the photo to cover the view through the veranda, with its horizon near eye level. */
  function placeBackdrop(b) {
    const d = EYE.z - BACKDROP_Z;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const needH = 2 * d * tan * 1.25;
    const needW = needH * Math.max(camera.aspect, 1) * 1.1;
    const h = Math.max(needH, needW / b.aspect);
    b.mesh.scale.set(h * b.aspect, h, 1);
    const horizonY = EYE.y - 0.4;
    b.mesh.position.set(0, horizonY - (0.5 - b.view.horizon) * h, BACKDROP_Z);
  }

  let viewIndex = 0;
  const sunColour = new THREE.Color();
  const skyColour = new THREE.Color();
  const groundColour = new THREE.Color();
  function setView(i) {
    viewIndex = i;
  }

  // ---- the keringkam on the railing ----
  const store = createTextureStore(renderer);
  let index = 0;
  let current = null;
  const leaving = [];
  let time = 0;
  let ready = false;

  function makePiece(i) {
    const { w, h } = clothSize(i);
    const cols = w >= h ? PARTICLES : Math.max(10, Math.round((PARTICLES * w) / h));
    const rows = w >= h ? Math.max(10, Math.round((PARTICLES * h) / w)) : PARTICLES;
    const sim = new ClothSim(w, h, cols, rows);
    sim.floorY = 0.01;

    // Folded over the rail: the top of the picture falls outside, the rest hangs inside.
    const foldRow = Math.round(BACK * (rows - 1));
    const spacing = h / (rows - 1);
    const arc = (Math.PI * WRAP_R) / 2;
    for (let r = 0; r < rows; r++) {
      const u = (r - foldRow) * spacing;
      let y;
      let z;
      if (u > arc) [y, z] = [RAIL_Y - (u - arc), WRAP_R];
      else if (u < -arc) [y, z] = [RAIL_Y - (-u - arc), -WRAP_R];
      else [y, z] = [RAIL_Y + WRAP_R * Math.cos(u / WRAP_R), WRAP_R * Math.sin(u / WRAP_R)];
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        sim.pos[k * 3 + 1] = sim.prev[k * 3 + 1] = Math.max(0.012, y);
        sim.pos[k * 3 + 2] = sim.prev[k * 3 + 2] = RAIL_Z + z + Math.sin(k * 12.9898) * 0.001;
        if (r > foldRow + 1) {
          sim.zMin[k] = RAIL_Z + 0.006; // inside layer stays inside the slats…
          sim.zMax[k] = RAIL_Z + 0.2; // …and clear of the bench
        }
        if (r < foldRow - 1) sim.zMax[k] = RAIL_Z - 0.035; // outside layer stays outside the slats
      }
    }
    const pins = Array.from({ length: cols }, (_, c) => foldRow * cols + c);
    for (const k of pins) {
      const x = ((k % cols) / (cols - 1) - 0.5) * w;
      sim.pin(k, x, RAIL_Y + WRAP_R, RAIL_Z);
    }
    sim.setTethers(pins);
    sim.cylinders.push({ y: RAIL_Y, z: RAIL_Z, r: WRAP_R, x0: -6, x1: 6 });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(sim.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(sim.count * 2);
    const indices = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        uv[(r * cols + c) * 2] = c / (cols - 1);
        uv[(r * cols + c) * 2 + 1] = 1 - r / (rows - 1);
        if (r < rows - 1 && c < cols - 1) {
          const a = r * cols + c;
          indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        }
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhysicalMaterial({
      side: THREE.DoubleSide,
      alphaTest: 0.1,
      transparent: true,
      opacity: 0,
      roughness: 0.8,
      sheen: 0.8,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color('#fff0dc'),
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    const p = { i, sim, mesh, material, opacity: 0, target: 0, wind: Math.random() * 100 };
    let first = true;
    store.progressive(i, (texture) => {
      material.map = texture;
      material.needsUpdate = true;
      mesh.visible = true;
      if (!first) return;
      first = false;
      p.target = 1;
      if (!ready) {
        ready = true;
        onReady?.();
      }
    });
    return p;
  }

  function show(i) {
    index = wrap(i);
    onChange?.(index);
    if (current) {
      current.target = 0;
      leaving.push(current);
    }
    current = makePiece(index);
    for (const d of [1, -1]) store.get(wrap(index + d), 'preview');
    store.keep((n) => loopDistance(n, index) <= 1 || leaving.some((l) => l.i === n));
  }

  function disposePiece(p) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.material.dispose();
  }

  // ---- pointer: look around a little, stir the cloth, grab and pull it ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(9, 9);
  const parallax = new THREE.Vector2();
  let grab = null;
  const setNdc = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const onMove = (e) => {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    if (grab) {
      const target = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(grab.plane, target)) {
        grab.piece.sim.pin(grab.i, target.x, Math.max(0.02, target.y), THREE.MathUtils.clamp(target.z, RAIL_Z + 0.01, RAIL_Z + 1.2));
      }
    } else if (current?.mesh.visible) {
      canvas.style.cursor = raycaster.intersectObject(current.mesh)[0] ? 'grab' : '';
    }
  };
  const onDown = (e) => {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    const hit = current?.mesh.visible && raycaster.intersectObject(current.mesh)[0];
    if (!hit) return;
    const { sim } = current;
    const best = [hit.face.a, hit.face.b, hit.face.c].reduce((a, b) => {
      const d = (v) => hit.point.distanceToSquared(new THREE.Vector3(sim.pos[v * 3], sim.pos[v * 3 + 1], sim.pos[v * 3 + 2]));
      return d(a) < d(b) ? a : b;
    });
    grab = { piece: current, i: best, wasPinned: sim.pinned[best] === 1, plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -hit.point.z) };
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  };
  const onUp = () => {
    if (!grab) return;
    if (!grab.wasPinned) grab.piece.sim.unpin(grab.i);
    grab = null;
    canvas.style.cursor = 'grab';
  };
  const onLeave = () => ndc.set(9, 9);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  // ---- breeze from outside ----
  function applyWind(p, t) {
    const { sim } = p;
    const normals = p.mesh.geometry.attributes.normal.array;
    const gust = (0.6 + 0.3 * Math.sin(t * 0.45 + p.wind) + 0.2 * Math.sin(t * 1.6 + p.wind * 2)) * 2.2;
    const wx = Math.sin(t * 0.21 + p.wind) * 0.3;
    for (let k = 0; k < sim.count; k++) {
      const x = k * 3;
      const ripple = 0.7 + 0.3 * Math.sin(sim.pos[x] * 5 + sim.pos[x + 1] * 4 + t * 1.4);
      const push = (normals[x] * wx + normals[x + 2]) * gust * ripple;
      sim.force[x] += normals[x] * push;
      sim.force[x + 1] += normals[x + 1] * push;
      sim.force[x + 2] += normals[x + 2] * push;
    }
  }

  // ---- size ----
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // On narrow screens, step back so the railing and cloth still fit.
    camera.fov = camera.aspect < 0.8 ? 64 : 50;
    camera.updateProjectionMatrix();
    backdrops.forEach((b) => b.loaded && placeBackdrop(b));
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  // ---- loop ----
  let last = performance.now();
  let accumulator = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    accumulator += dt;
    last = now;

    // Crossfade views and ease the light towards the current one.
    backdrops.forEach((b, k) => {
      b.opacity += ((k === viewIndex && b.loaded ? 1 : 0) - b.opacity) * Math.min(1, dt * 2.5);
      b.material.opacity = b.opacity;
      b.mesh.visible = b.opacity > 0.002;
    });
    const v = VIEWS[viewIndex];
    const ease = Math.min(1, dt * 2);
    sun.color.lerp(sunColour.set(v.sun), ease);
    sun.intensity += (v.sunIntensity - sun.intensity) * ease;
    hemi.color.lerp(skyColour.set(v.sky), ease);
    hemi.groundColor.lerp(groundColour.set(v.ground), ease);
    hemi.intensity += (v.fill - hemi.intensity) * ease;
    bounce.color.copy(sun.color);

    while (accumulator >= STEP) {
      accumulator -= STEP;
      time += STEP;
      for (const p of [current, ...leaving]) {
        if (!p) continue;
        if (grab?.piece === p) p.sim.pinned[grab.i] = 1;
        applyWind(p, time);
        p.sim.step(STEP, { iterations: 10 });
      }
    }
    for (const p of [current, ...leaving]) {
      if (!p) continue;
      p.mesh.geometry.attributes.position.needsUpdate = true;
      p.mesh.geometry.computeVertexNormals();
      p.opacity += (p.target - p.opacity) * Math.min(1, dt * 3);
      p.material.opacity = p.opacity;
      p.mesh.castShadow = p.opacity > 0.5;
    }
    for (let k = leaving.length - 1; k >= 0; k--) {
      if (leaving[k].opacity < 0.01) {
        disposePiece(leaving[k]);
        leaving.splice(k, 1);
      }
    }

    const target = Math.abs(ndc.x) > 1 ? new THREE.Vector2() : ndc;
    if (!grab) parallax.lerp(target, 0.03);
    camera.position.set(EYE.x + parallax.x * 0.35, EYE.y + parallax.y * 0.12, EYE.z);
    camera.lookAt(LOOK.x + parallax.x * 0.6, LOOK.y + parallax.y * 0.25, LOOK.z);

    renderer.render(scene, camera);
  });

  resize();
  show(0);

  return {
    next: () => show(index + 1),
    prev: () => show(index - 1),
    setView,
    destroy() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      for (const p of [current, ...leaving]) if (p) disposePiece(p);
      backdrops.forEach((b) => {
        b.material.map?.dispose();
        b.material.dispose();
      });
      backdropGeometry.dispose();
      disposeVeranda();
      envMap.dispose();
      pmrem.dispose();
      store.dispose();
      renderer.dispose();
    },
  };
}
