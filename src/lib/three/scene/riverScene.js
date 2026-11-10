// A 3D rendition (not a photo) of the scene in the mockups: a kampung veranda on stilts over the
// Sarawak River. Across the water: a bank of trees, a row of kampung stilt houses, a pink mosque
// with a golden dome after Masjid Bandaraya, and Mount Santubong in the haze. Boats drift on the
// river. Three moods (sunset, day, night) blend the sky, sun, water and lights.

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

export const MOODS = [
  {
    name: 'Sunset',
    sunElevation: 4, sunAzimuth: -9, // degrees; azimuth 0 = straight ahead, negative = left
    zenith: '#3b4f86', horizon: '#ffb27a', glow: '#ff8a3d', cloud: '#ff9e6b', cloudShadow: '#5b4a6e',
    sun: '#ffab6b', sunIntensity: 3.4, hemiSky: '#ffcf9e', hemiGround: '#3a2a22', hemi: 0.55,
    water: '#2c3a3c', haze: '#d99a78', exposure: 1.0, lights: 0.25, stars: 0,
  },
  {
    name: 'Day',
    sunElevation: 38, sunAzimuth: -55,
    zenith: '#4f8fd6', horizon: '#cfe3f2', glow: '#ffffff', cloud: '#ffffff', cloudShadow: '#a9b6c8',
    sun: '#fff4e2', sunIntensity: 3.2, hemiSky: '#dbeaff', hemiGround: '#6a5a46', hemi: 0.9,
    water: '#3d4a38', haze: '#b9cddd', exposure: 1.0, lights: 0, stars: 0,
  },
  {
    name: 'Night',
    sunElevation: -7, sunAzimuth: -10,
    zenith: '#0b1330', horizon: '#3a3f6e', glow: '#6a5a9a', cloud: '#323a66', cloudShadow: '#121733',
    sun: '#9fb2ff', sunIntensity: 0.5, hemiSky: '#4a5a9a', hemiGround: '#120e14', hemi: 0.35,
    water: '#0e1622', haze: '#2a3058', exposure: 1.05, lights: 1, stars: 1,
  },
];

const WATER_Y = -2.4;
export const RAIL_Y = 0.95;
export const RAIL_Z = -2.05;
const EAVE_Y = 2.55;

// ---- small helpers ----
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const range = (a, b) => a + rand() * (b - a);

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

/** A tileable normal map for the water, from sums of waves with whole-number frequencies. */
function waterNormals(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const waves = Array.from({ length: 14 }, () => ({
    fx: Math.round(range(-9, 9)), fy: Math.round(range(-9, 9)), a: range(0.3, 1), p: range(0, 6.28),
  })).filter((w) => w.fx || w.fy);
  const height = (x, y) => waves.reduce((h, w) => h + w.a * Math.sin(((w.fx * x + w.fy * y) / size) * Math.PI * 2 + w.p) / Math.hypot(w.fx, w.fy), 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height(x + 1, y) - height(x - 1, y);
      const dy = height(x, y + 1) - height(x, y - 1);
      const n = new THREE.Vector3(-dx * 6, -dy * 6, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// ---- sky: gradient, sun glow and drifting clouds ----
const SKY_GLSL = /* glsl */ `
  uniform vec3 sunDir, zenith, horizon, glow, cloud, cloudShadow;
  uniform float time, stars;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  vec3 skyColour(vec3 d) {
    float h = max(d.y, 0.0);
    vec3 c = mix(horizon, zenith, smoothstep(0.0, 0.55, pow(h, 0.7)));
    float s = max(dot(d, sunDir), 0.0);
    c += glow * exp(-h * 14.0) * 0.35; // a bright band along the horizon
    c += glow * (pow(s, 5.0) * 0.6 + pow(s, 48.0) * 0.8);
    c += vec3(1.0, 0.92, 0.8) * smoothstep(0.9993, 0.9997, s) * 6.0; // the sun disc
    // Clouds: long horizontal streaks near the horizon, lit from the sun's side.
    vec2 uv = d.xz / (d.y + 0.08);
    float n = fbm(uv * vec2(0.9, 2.6) + vec2(time * 0.004, 0.0));
    float cover = smoothstep(0.44, 0.72, n) * smoothstep(0.015, 0.06, d.y) * (1.0 - smoothstep(0.3, 0.6, d.y));
    vec3 lit = mix(cloudShadow, cloud, clamp(0.25 + 1.1 * pow(s, 2.5) + 0.45 * (n - 0.5), 0.0, 1.0));
    c = mix(c, lit, cover * 0.9);
    // Stars at night.
    float st = step(0.9975, hash(floor(d.xz / (d.y + 0.2) * 220.0))) * smoothstep(0.08, 0.3, d.y);
    c += vec3(st) * stars * 0.9;
    return c;
  }
`;

function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      sunDir: { value: new THREE.Vector3() }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      glow: { value: new THREE.Color() }, cloud: { value: new THREE.Color() }, cloudShadow: { value: new THREE.Color() },
      time: { value: 0 }, stars: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // always at the far plane
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${SKY_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        gl_FragColor = vec4(skyColour(d), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), material);
  mesh.frustumCulled = false;
  return mesh;
}

// ---- the far bank ----
/** A gabled kampung house on stilts: body, roof and windows. Built at the origin, facing +z. */
function houseGeometry() {
  const body = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roofShape = new THREE.Shape([new THREE.Vector2(-0.62, 0), new THREE.Vector2(0.62, 0), new THREE.Vector2(0, 0.55)]);
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 1.15, bevelEnabled: false }).translate(0, 1, -0.575);
  return { body, roof };
}

function createFarBank(add) {
  const BANK_Z = -150;
  const group = new THREE.Group();

  // Muddy bank and ground behind it.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 260), new THREE.MeshStandardMaterial({ color: '#3a3a26', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, WATER_Y + 0.6, BANK_Z - 130);
  group.add(ground);

  // Trees: rounded clumps and palms of dark green, a few rows deep.
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const treeMat = new THREE.MeshStandardMaterial({ color: '#2f4a2a', roughness: 1, flatShading: true });
  const trees = new THREE.InstancedMesh(blob, treeMat, 900);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  for (let i = 0; i < 900; i++) {
    let x = range(-700, 700);
    const z = BANK_Z - range(6, 120);
    // Keep the mosque's grounds clear so it stands out against the trees behind.
    if (Math.abs(x - 48) < 40 && z > BANK_Z - 70) x += x > 48 ? 40 : -40;
    const s = range(5, 13) * (1 + (BANK_Z - z) / 180);
    m.compose(new THREE.Vector3(x, WATER_Y + s * 0.55 + range(0, 4), z), q.setFromEuler(new THREE.Euler(0, range(0, 6), 0)), new THREE.Vector3(s * range(0.9, 1.5), s * range(0.6, 0.9), s));
    trees.setMatrixAt(i, m);
    trees.setColorAt(i, col.setHSL(range(0.22, 0.32), range(0.25, 0.4), range(0.14, 0.24)));
  }
  group.add(trees);

  // A row of kampung houses on stilts at the waterline, in the usual soft colours.
  const { body, roof } = houseGeometry();
  const palette = ['#e8d9b0', '#9cc3c9', '#d7a5a0', '#c9d6a3', '#f0ede4', '#a8b8d8', '#e0b98a'];
  const roofPalette = ['#7a3b2e', '#4c5d6a', '#8a4a32', '#3f5a52'];
  const count = 30;
  const bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
  const roofs = new THREE.InstancedMesh(roof, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
  const stilts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 5), new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 1 }), count * 4);
  const winGeo = new THREE.PlaneGeometry(0.9, 0.7);
  const windowMat = new THREE.MeshBasicMaterial({ color: '#ffc77a', transparent: true, opacity: 0, toneMapped: false });
  const windows = new THREE.InstancedMesh(winGeo, windowMat, count * 2);
  let x = -300;
  for (let i = 0; i < count; i++) {
    const w = range(8, 14);
    const h = range(5, 6.5);
    const d = range(8, 12);
    const lift = range(2.5, 4.5);
    const z = BANK_Z + range(-3, 4);
    const y = WATER_Y + lift;
    const rot = range(-0.12, 0.12);
    q.setFromEuler(new THREE.Euler(0, rot, 0));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d));
    bodies.setMatrixAt(i, m);
    bodies.setColorAt(i, col.set(palette[i % palette.length]).multiplyScalar(range(0.8, 1)));
    roofs.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y + h - 1, z), q, new THREE.Vector3(w, range(2.2, 3.2), d)));
    roofs.setColorAt(i, col.set(roofPalette[i % roofPalette.length]));
    for (let k = 0; k < 4; k++) {
      const sx = x + (k % 2 ? 1 : -1) * w * 0.4;
      const sz = z + (k < 2 ? 1 : -1) * d * 0.4;
      stilts.setMatrixAt(i * 4 + k, new THREE.Matrix4().compose(new THREE.Vector3(sx, WATER_Y + lift / 2 - 0.3, sz), new THREE.Quaternion(), new THREE.Vector3(1, lift + 0.6, 1)));
    }
    for (let k = 0; k < 2; k++) {
      windows.setMatrixAt(i * 2 + k, new THREE.Matrix4().compose(new THREE.Vector3(x + (k ? 1 : -1) * w * 0.22, y + h * 0.5, z + d / 2 + 0.05), q, new THREE.Vector3(w * 0.18, h * 0.3, 1)));
    }
    x += w + range(2, 9);
    if (i === 14) x += 60; // a gap in front of the mosque
  }
  group.add(bodies, roofs, stilts, windows);

  // A jetty in front of the houses.
  const jetty = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 2.5), new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 }));
  jetty.position.set(-20, WATER_Y + 1.1, BANK_Z + 8);
  group.add(jetty);

  // The mosque, after Masjid Bandaraya: pink hall, golden onion dome, four minarets.
  const mosque = new THREE.Group();
  const pink = new THREE.MeshStandardMaterial({ color: '#e9b6b8', roughness: 0.75 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d9a640', metalness: 0.85, roughness: 0.3 });
  const hall = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 26), pink);
  hall.position.y = 7;
  const onion = (r) =>
    new THREE.LatheGeometry(
      Array.from({ length: 20 }, (_, k) => {
        const t = k / 19;
        const rr = r * (Math.sin(Math.PI * Math.min(1, t * 1.15)) * 1.05 + 0.15) * (1 - t * 0.85);
        return new THREE.Vector2(Math.max(0.02, rr), t * r * 2.4);
      }),
      28,
    );
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 4, 28), pink);
  drum.position.y = 16;
  const dome = new THREE.Mesh(onion(8.5), gold);
  dome.position.y = 18;
  mosque.add(hall, drum, dome);
  for (const [mx, mz] of [[-19, 15], [19, 15], [-19, -15], [19, -15]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 30, 12), pink);
    tower.position.set(mx, 15, mz);
    const cap = new THREE.Mesh(onion(2), gold);
    cap.position.set(mx, 30, mz);
    mosque.add(tower, cap);
  }
  for (const s of [-1, 1]) {
    const small = new THREE.Mesh(onion(3.5), gold);
    small.position.set(s * 11, 14, 8);
    mosque.add(small);
  }
  mosque.position.set(48, WATER_Y + 5, BANK_Z - 60);
  mosque.scale.setScalar(0.72);
  mosque.rotation.y = -0.15;
  group.add(mosque);

  add(group);
  return { windowMat };
}

/** Mount Santubong and lower ridges, far away in the haze. */
function createMountains(add) {
  const group = new THREE.Group();
  const ridge = (width, height, peaks, z, x, colour) => {
    const geo = new THREE.PlaneGeometry(width, height * 1.6, 160, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0) continue;
      const u = pos.getX(i) / width + 0.5;
      let h = 0;
      for (const p of peaks) h = Math.max(h, p.h * Math.exp(-Math.pow((u - p.u) / p.w, 2)));
      h *= 0.92 + 0.08 * Math.sin(u * 90) * Math.sin(u * 37);
      pos.setY(i, h * height);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour, fog: true }));
    mesh.position.set(x, WATER_Y, z);
    group.add(mesh);
    return mesh;
  };
  // Santubong: a steep peak with a shoulder, to the left of the view.
  const santubong = ridge(2600, 520, [{ u: 0.5, h: 1, w: 0.07 }, { u: 0.42, h: 0.62, w: 0.12 }, { u: 0.62, h: 0.45, w: 0.16 }, { u: 0.3, h: 0.25, w: 0.2 }], -2600, -900, '#5d6a8a');
  const ridges = ridge(4200, 160, [{ u: 0.2, h: 0.7, w: 0.15 }, { u: 0.55, h: 0.5, w: 0.2 }, { u: 0.8, h: 0.8, w: 0.12 }], -1500, 500, '#4a5a6a');
  add(group);
  return { materials: [santubong.material, ridges.material] };
}

/** A penambang-style river boat: narrow hull and a small canopy. */
function createBoat(colour) {
  const g = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-3, 0.6);
  hullShape.quadraticCurveTo(-2.6, 0, -1.5, 0);
  hullShape.lineTo(1.6, 0);
  hullShape.quadraticCurveTo(2.9, 0.1, 3.2, 0.75);
  hullShape.lineTo(-3, 0.6);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 1.3, bevelEnabled: false }).translate(0, 0, -0.65), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.7 }));
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 1.4), new THREE.MeshStandardMaterial({ color: '#2e5d6e', roughness: 0.8 }));
  canopy.position.set(-0.4, 1.6, 0);
  for (const sx of [-1.4, 0.6]) for (const sz of [-0.6, 0.6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 5), canopy.material);
    post.position.set(sx, 1.05, sz);
    g.add(post);
  }
  g.add(hull, canopy);
  return g;
}

// ---- the veranda in the foreground ----
const planks = () =>
  canvasTexture(1024, 1024, (g, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const tone = 0.85 + rand() * 0.25;
      g.fillStyle = `rgb(${(118 * tone) | 0},${(84 * tone) | 0},${(58 * tone) | 0})`;
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
    }
  }, [2.5, 2.5]);

const bamboo = () =>
  canvasTexture(512, 512, (g, w, h) => {
    const n = 24;
    for (let i = 0; i < n; i++) {
      const tone = 0.85 + rand() * 0.25;
      g.fillStyle = `rgb(${(190 * tone) | 0},${(160 * tone) | 0},${(112 * tone) | 0})`;
      g.fillRect(0, (i * h) / n, w, h / n - 2);
      g.fillStyle = 'rgba(70,45,25,0.5)';
      g.fillRect(0, ((i + 1) * h) / n - 2, w, 2);
    }
  }, [6, 3]);

/** Pale posts with dark painted spirals and bands, after the carved veranda posts. */
const carvedPost = () =>
  canvasTexture(256, 1024, (g, w, h) => {
    g.fillStyle = '#d3c6ab';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#4e3220';
    g.lineCap = 'round';
    for (let y = 30; y < h; y += 150) {
      g.lineWidth = 9;
      g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.1) {
        const r = 6 + a * 7;
        const px = w * 0.5 + Math.cos(a) * r;
        const py = y + 60 + Math.sin(a) * r * 0.8;
        a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.stroke();
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(8, y + 140);
      g.bezierCurveTo(w * 0.3, y + 115, w * 0.7, y + 165, w - 8, y + 140);
      g.stroke();
    }
  });

/** A woven basket lamp, after the ones in the mockup. */
function basketLamp() {
  const weave = canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(160,120,70,1)';
    g.lineWidth = 5;
    for (let k = -w; k < w * 2; k += 22) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke();
      g.beginPath(); g.moveTo(k, h); g.lineTo(k + h, 0); g.stroke();
    }
    g.lineWidth = 7;
    for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }, [4, 2]);
  const profile = Array.from({ length: 16 }, (_, k) => {
    const t = k / 15;
    return new THREE.Vector2(0.06 + 0.26 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.55) * (1 - t * 0.2), 1 - t);
  });
  const lamp = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 24),
    new THREE.MeshStandardMaterial({ map: weave, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }),
  );
  return lamp;
}

function createVerandaGeometry(add) {
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  const wood = mat({ color: '#6b4a33', roughness: 0.75 });
  const darkWood = mat({ color: '#4a3324', roughness: 0.8 });
  const box = (sx, sy, sz, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    add(mesh);
    return mesh;
  };

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), mat({ map: planks(), roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, RAIL_Z + 3.4);
  floor.receiveShadow = true;
  add(floor);
  box(12, 0.25, 0.22, darkWood, 0, -0.13, RAIL_Z - 0.05);
  // Stilts under the house, down into the water.
  for (const x of [-5, -2.3, 0.4, 3, 5.4]) box(0.22, 2.6, 0.22, darkWood, x, WATER_Y / 2 - 0.2, RAIL_Z - 0.1);

  box(12, 0.2, 0.18, darkWood, 0, EAVE_Y, RAIL_Z);
  const rise = 1.0;
  const run = 6.2;
  const slope = Math.atan2(rise, run);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(12, Math.hypot(rise, run)), mat({ map: bamboo(), roughness: 0.9, side: THREE.DoubleSide }));
  roof.position.set(0, EAVE_Y + 0.16 + rise / 2, RAIL_Z + run / 2);
  roof.rotation.x = Math.PI / 2 - slope;
  roof.castShadow = roof.receiveShadow = true;
  add(roof);
  for (let x = -5.6; x <= 5.6; x += 0.7) box(0.09, 0.12, Math.hypot(rise, run), wood, x, EAVE_Y + 0.08 + rise / 2, RAIL_Z + run / 2).rotation.x = -slope;
  for (let k = 1; k <= 4; k++) box(12, 0.1, 0.1, darkWood, 0, EAVE_Y + 0.1 + (rise * k) / 5, RAIL_Z + (run * k) / 5);

  const postMat = mat({ map: carvedPost(), roughness: 0.7 });
  for (const x of [-2.3, 2.3, -5.2, 5.2]) box(0.26, EAVE_Y, 0.26, postMat, x, EAVE_Y / 2, RAIL_Z + 0.02);

  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 12, 16), wood);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, RAIL_Y, RAIL_Z);
  rail.castShadow = true;
  add(rail);
  box(12, 0.06, 0.05, wood, 0, 0.12, RAIL_Z);
  const slatGeo = new THREE.BoxGeometry(0.075, RAIL_Y - 0.12, 0.022);
  const count = Math.floor(12 / 0.17);
  const slats = new THREE.InstancedMesh(slatGeo, wood, count);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Matrix4().makeRotationZ((rand() - 0.5) * 0.02);
    m.setPosition(-6 + i * 0.17 + 0.08, (RAIL_Y + 0.12) / 2, RAIL_Z - 0.03);
    slats.setMatrixAt(i, m);
  }
  slats.castShadow = slats.receiveShadow = true;
  add(slats);
  for (const [x0, x1] of [[-5.8, -1.5], [1.5, 5.8]]) {
    const cx = (x0 + x1) / 2;
    box(x1 - x0, 0.05, 0.34, wood, cx, 0.44, RAIL_Z + 0.32);
    for (const lx of [x0 + 0.2, cx, x1 - 0.2]) box(0.06, 0.42, 0.28, darkWood, lx, 0.21, RAIL_Z + 0.32);
  }

  // Two basket lamps hanging from the eave, with a warm light inside each.
  const lamps = [];
  for (const x of [-1.3, 1.3]) {
    const lamp = basketLamp();
    lamp.scale.setScalar(0.75);
    lamp.position.set(x, EAVE_Y - 0.82, RAIL_Z + 0.9);
    lamp.castShadow = true;
    add(lamp);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 4), darkWood);
    cord.position.set(x, EAVE_Y - 0.2 + 0.25, RAIL_Z + 0.9);
    add(cord);
    const light = new THREE.PointLight('#ffb15c', 0, 6, 1.8);
    light.position.set(x, EAVE_Y - 0.45, RAIL_Z + 0.9);
    add(light);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffcf8a', toneMapped: false, transparent: true, opacity: 0 }));
    bulb.position.copy(light.position);
    add(bulb);
    lamps.push({ light, bulb });
  }
  return { lamps };
}

/**
 * Builds the whole background into `scene`. Returns update(time, dt, renderer) and setMood(i).
 */
export function createRiverScene(scene, renderer) {
  const objects = [];
  const add = (o) => {
    scene.add(o);
    objects.push(o);
  };

  const sky = createSky();
  add(sky);
  scene.fog = new THREE.Fog('#d99a78', 120, 2800);

  // Light
  const hemi = new THREE.HemisphereLight('#ffffff', '#3a2a22', 0.6);
  add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  add(sun);
  add(sun.target);

  // Water with real reflections of the sky, bank and boats.
  const normals = waterNormals();
  const water = new Water(new THREE.PlaneGeometry(4000, 4000), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: normals,
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffffff,
    waterColor: 0x2c3a3c,
    distortionScale: 2.2,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  water.material.uniforms.size.value = 6;
  add(water);

  const { windowMat } = createFarBank(add);
  const mountains = createMountains(add);
  const { lamps } = createVerandaGeometry(add);

  const boats = [
    { boat: createBoat('#c9b48a'), x: -40, z: -60, speed: 1.6, phase: 0 },
    { boat: createBoat('#7c9c8a'), x: 70, z: -105, speed: -1.1, phase: 2 },
    { boat: createBoat('#b05a3a'), x: -90, z: -128, speed: 0, phase: 4 },
  ];
  boats.forEach((b) => {
    b.boat.scale.setScalar(1.1);
    add(b.boat);
  });

  // ---- moods ----
  let moodIndex = 0;
  const current = {}; // the blended values, eased towards the chosen mood
  const toColor = (v) => new THREE.Color(v);
  for (const [k, v] of Object.entries(MOODS[0])) current[k] = typeof v === 'string' && v.startsWith('#') ? toColor(v) : v;
  const sunDir = new THREE.Vector3();

  function apply(dt) {
    const target = MOODS[moodIndex];
    const e = Math.min(1, dt * 1.6);
    for (const [k, v] of Object.entries(target)) {
      if (current[k] instanceof THREE.Color) current[k].lerp(toColor(v), e);
      else if (typeof v === 'number') current[k] += (v - current[k]) * e;
    }
    const el = THREE.MathUtils.degToRad(current.sunElevation);
    const az = THREE.MathUtils.degToRad(current.sunAzimuth);
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();

    const u = sky.material.uniforms;
    u.sunDir.value.copy(sunDir);
    for (const k of ['zenith', 'horizon', 'glow', 'cloud', 'cloudShadow']) u[k].value.copy(current[k]);
    u.stars.value = current.stars;

    // Sun light comes from the sun's side; keep it a little above the horizon so shadows stay.
    const lightDir = sunDir.clone();
    lightDir.y = Math.max(lightDir.y, 0.12);
    sun.position.copy(lightDir.normalize().multiplyScalar(20));
    sun.color.copy(current.sun);
    sun.intensity = current.sunIntensity;
    hemi.color.copy(current.hemiSky);
    hemi.groundColor.copy(current.hemiGround);
    hemi.intensity = current.hemi;

    water.material.uniforms.sunDirection.value.copy(sunDir.y > 0 ? sunDir : lightDir);
    water.material.uniforms.sunColor.value.copy(current.sun);
    water.material.uniforms.waterColor.value.copy(current.water);
    scene.fog.color.copy(current.haze);
    for (const m of mountains.materials) m.color.copy(current.haze).lerp(current.zenith, 0.35).multiplyScalar(0.85);

    windowMat.opacity = current.lights;
    for (const { light, bulb } of lamps) {
      light.intensity = current.lights * 2.2 + 0.1;
      bulb.material.opacity = Math.max(0.1, current.lights * 0.7);
    }
    renderer.toneMappingExposure = current.exposure;
  }

  function update(time, dt) {
    apply(dt);
    sky.material.uniforms.time.value = time;
    water.material.uniforms.time.value = time * 0.35;
    for (const b of boats) {
      b.x += b.speed * dt;
      if (b.x > 260) b.x = -260;
      if (b.x < -260) b.x = 260;
      b.boat.position.set(b.x, WATER_Y + 0.05 + Math.sin(time * 1.3 + b.phase) * 0.06, b.z);
      b.boat.rotation.set(Math.sin(time * 1.1 + b.phase) * 0.03, b.speed < 0 ? Math.PI : 0, Math.sin(time * 0.9 + b.phase) * 0.02);
    }
  }

  return {
    update,
    setMood: (i) => (moodIndex = i),
    dispose() {
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const mm of [].concat(o.material ?? [])) {
          mm.map?.dispose();
          mm.dispose();
        }
      });
      normals.dispose();
      water.material.uniforms.mirrorSampler.value?.dispose?.();
      objects.forEach((o) => scene.remove(o));
    },
  };
}
