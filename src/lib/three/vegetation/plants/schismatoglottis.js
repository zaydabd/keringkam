// Schismatoglottis 'Sarawak' in a plastic nursery pot. Original procedural design: geometry and
// textures are generated here; nothing is copied from any model or image. The user's reference
// photo was looked at for proportions only.
//
// Sourced facts (few exist for this cultivar):
//   - "The paddle-like leaves show a mottled silver throughout"; "The silver variegation sits
//     atop a very distinct silvery green leaf that grows in a compact fashion"; sold in a 4" pot.
//     https://thegardenerschoice.net/products/schismatoglottis-sarawak
//     https://www.greenthumb.com/?p=144392
//   - Genus: "similar in appearance and growth habit to those of the genus Homalomena".
//     https://en.wikipedia.org/wiki/Schismatoglottis
//
// From the reference photo (estimates, not measurements): a low mound of ~15–25 leaves from the
// soil centre; ovate blades with a short point, roughly 10–16 cm long; thick, pale green,
// arching petioles; satin shine; black plastic nursery pot.
//
// Stylisation (method only; the guides are for trees and foliage, so only parts apply):
//   - Anime foliage pipeline: normals pulled towards one crown volume so light and shadow fall
//     in big grouped shapes, then the shared 3-tone cel ramp (cel-foliage.js). Its clumps of
//     leaf cards do not apply: here each leaf keeps its own curved geometry.
//     https://trungduyng.substack.com/p/tutorial-blender-anime-foliage-pipeline
//   - Sven Mrđen, foliage study: leaves that are not flat, darker "near the stem and along the
//     middle", brightness "right at the border", small per-leaf hue shifts.
//     https://www.exp-points.com/sven-mren-foliage-study
//   - Muted colours work better in stylised foliage.
//     https://80.lv/articles/setting-up-trees-bushes-and-flowers-for-a-stylized-3d-environment
//   Our additions: crisp, posterised texture shapes instead of photo-like noise; a painted
//   highlight stroke per leaf; cool shadow and warm light tones; a crisp rim light and glint.
//
// Guesses: 2–3 crowns; petiole length and angles; blade fold, curl, arch, twist and thickness;
// the mottling pattern; underside colour; pot size (15 cm) and its ribs; soil and specks; all
// colours; switchAt.
// Units: metres. Two draw calls per level: pot + soil + petioles (one textured mesh), leaves.

import * as THREE from 'three';
import { mulberry32, range } from '../rng.js';
import { addTube, createMeshWriter } from '../tube.js';
import { UP } from '../grow.js';
import { CEL_RAMP_GLSL, toneUniforms } from '../cel-foliage.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const LEAF = { length: [0.12, 0.17], width: 0.68, thick: 0.02 };
const VARIANTS = 4; // mottling patterns in the leaf texture

// Nursery pot profile (radius, height): base, foot, tapered wall, rolled rim, inside to soil.
const POT_PROFILE = [
  [0.0, 0.006], [0.054, 0.006], [0.058, 0.0], [0.064, 0.0], [0.066, 0.005], [0.074, 0.116],
  [0.0755, 0.121], [0.079, 0.123], [0.0815, 0.127], [0.0815, 0.135], [0.0795, 0.138],
  [0.0745, 0.138], [0.073, 0.131], [0.0715, 0.12],
];
const SOIL_Y = 0.12;
const SOIL_R = 0.0715;

// ---------------------------------------------------------------- noise and texture painting

function hash2(x, y, s) {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s = 0, oct = 4) {
  let sum = 0;
  let amp = 0.5;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x, y, s + i * 13);
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / (1 - 0.5 ** oct);
}
const sstep = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};

/** Colour texture from fn(u, v) → [r, g, b] (linear 0..1, v up). */
function paintTexture(w, h, fn) {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const toSrgb = (x) => {
    x = Math.min(1, Math.max(0, x));
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  };
  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn((x + 0.5) / w, v);
      const i = (y * w + x) * 4;
      img.data[i] = toSrgb(r);
      img.data[i + 1] = toSrgb(g);
      img.data[i + 2] = toSrgb(b);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

// Leaf texture: VARIANTS upper sides side by side, then one underside. Each slot: u across the
// blade (s = −1..1), v along it. Simplified graphic shapes: silver over most of the blade,
// green along the veins and in a few patches, a darker green margin band, a pale midrib.
const GREEN_DARK = hex('#24573a');
const GREEN = hex('#2f6a42');
const SILVER = hex('#8ea291');
const SILVER_LIGHT = hex('#a5b5a3');
const MIDRIB = hex('#9cc07f');
const EDGE_LIGHT = hex('#5d9a62');
const UNDER = hex('#a3c092');
const SLOT = 1 / (VARIANTS + 1);

function leafPaint(u, v) {
  const slot = Math.min(VARIANTS, Math.floor(u / SLOT));
  const s = ((u - slot * SLOT) / SLOT) * 2 - 1;
  const t = v;
  const as = Math.abs(s);
  const mw = 0.03 * (1 - 0.6 * t) + 0.012;
  const mid = 1 - sstep(mw * 0.6, mw, as);
  // Lateral veins arch out and up towards the tip (guess); q is constant along one vein.
  const q = (t - 0.3 * as ** 1.2) * 7 + (fbm(s * 1.5, t * 2, 50) - 0.5) * 0.8;
  const f = q - Math.floor(q);
  if (slot === VARIANTS) {
    const vein = (1 - sstep(0.04, 0.12, Math.abs(f - 0.5))) * sstep(mw, mw + 0.05, as);
    return mix3(UNDER, hex('#c3d6b2'), Math.max(mid * 0.8, vein * 0.35));
  }
  const seed = slot * 31 + 3;
  // Silver covers most of the blade; green shows as thin, feathered lines along the veins and
  // as a few irregular patches (from the reference photo; the shapes are a stylised guess).
  const wob = fbm(s * 6 + seed, t * 12, seed) - 0.5;
  const toVein = Math.min(f, 1 - f) + wob * 0.18;
  let silver = sstep(0.08, 0.1, toVein);
  silver *= sstep(0.42, 0.45, fbm(s * 3.2 + 7, t * 5.5, seed + 1) + wob * 0.3);
  // Fine green dashes inside the silver, along the vein direction (stylised mottling).
  silver *= 1 - 0.5 * sstep(0.7, 0.73, vnoise(s * 10 + seed, q * 4, seed + 9));
  silver *= (1 - sstep(0.74, 0.88, as)) * (1 - mid) * sstep(0.04, 0.16, t) * (1 - sstep(0.9, 0.99, t));
  // A few round flecks inside the green, as in the photo's speckling (stylised, sparse).
  const cx = Math.floor(s * 14);
  const cy = Math.floor(t * 20);
  const r = Math.hypot(s * 14 - cx - 0.5, t * 20 - cy - 0.5);
  const fleck = hash2(cx, cy, seed) > 0.9 ? 1 - sstep(0.18, 0.3, r) : 0;
  silver = Math.max(silver, fleck * 0.8 * (1 - sstep(0.75, 0.88, as)) * (1 - mid));
  let col = mix3(GREEN, GREEN_DARK, sstep(0.8, 0.83, as));
  col = mix3(col, mix3(SILVER, SILVER_LIGHT, sstep(0.3, 0.8, t)), silver);
  col = mix3(col, MIDRIB, mid * 0.8);
  col = mix3(col, EDGE_LIGHT, sstep(0.94, 0.99, as) * 0.8); // bright rim
  // Hand-painted light: a crisp lighter stroke on one half of the blade (baked highlight, a
  // common stylised-texture trick), lighter towards the tip, darker by the petiole.
  const stroke = sstep(0.1, 0.13, s) * (1 - sstep(0.52, 0.55, s + wob * 0.15)) * sstep(0.18, 0.22, t) * (1 - sstep(0.68, 0.72, t + wob * 0.1));
  const value = (0.7 + 0.3 * sstep(0, 0.25, t)) * (1 + 0.1 * sstep(0.5, 1, t)) * (1 + 0.16 * stroke);
  return col.map((c) => c * value);
}

// Atlas for the pot mesh. Regions (u, v): pot [0, .5]×[.25, 1], soil [0, .5]×[0, .25],
// petiole [.5, .875]×[0, 1], plain white [.875, 1]×[0, 1].
const ATLAS = { pot: [0, 0.25, 0.5, 1], soil: [0, 0, 0.5, 0.25], petiole: [0.5, 0, 0.875, 1], white: [0.875, 0, 1, 1] };
const PLASTIC = hex('#3b3f44');
const SOIL = hex('#5a4231');

const potArc = (() => {
  const d = [0];
  for (let i = 1; i < POT_PROFILE.length; i++) d.push(d[i - 1] + Math.hypot(POT_PROFILE[i][0] - POT_PROFILE[i - 1][0], POT_PROFILE[i][1] - POT_PROFILE[i - 1][1]));
  return d.map((x) => x / d[d.length - 1]);
})();
const WALL = [potArc[4], potArc[5]];
const INSIDE = potArc[11];

function atlasPaint(u, v) {
  if (u < 0.5 && v >= 0.25) {
    const pv = (v - 0.25) / 0.75;
    // Painted value gradient: lighter towards the rim, darker at the base; a light rim edge.
    let col = PLASTIC.map((c) => c * (0.7 + 0.45 * sstep(WALL[0], WALL[1], pv)));
    if (pv > potArc[8] && pv < potArc[10]) col = mix3(col, hex('#7d848c'), 0.6);
    // Ribs under the rim as light lines (guess), darker inside, a soft lighter band low down.
    const wallT = (pv - WALL[0]) / (WALL[1] - WALL[0]);
    if (wallT > 0.84 && wallT < 1 && Math.sin(wallT * 230) > 0.6) col = col.map((c) => c * 1.35);
    if (pv > INSIDE) col = col.map((c) => c * 0.55);
    return col;
  }
  if (u < 0.5) {
    // Soil with a few big perlite dots (guess).
    const x = (u / 0.5) * 2 - 1;
    const y = (v / 0.25) * 2 - 1;
    const cx = Math.floor(x * 16);
    const cy = Math.floor(y * 16);
    const r = Math.hypot(x * 16 - cx - 0.5, y * 16 - cy - 0.5);
    const dot = hash2(cx, cy, 9) > 0.78 ? 1 - sstep(0.22, 0.32, r) : 0;
    const clump = fbm(x * 5, y * 5, 8);
    return mix3(SOIL.map((c) => c * (0.75 + 0.4 * clump)), hex('#ece8dd'), dot);
  }
  if (u < 0.875) {
    // Petiole: paler at the base, mid green towards the blade.
    const pu = (u - 0.5) / 0.375;
    const stripe = 1 - sstep(0.06, 0.09, Math.abs(pu - 0.25));
    return mix3(mix3(hex('#a9c486'), hex('#6f9a52'), sstep(0.0, 0.8, v)), hex('#d2e4b4'), stripe * 0.6);
  }
  return [1, 1, 1];
}

/**
 * Stylised cel material for a merged mesh (map × vertex colour): normals pulled towards the
 * crown volume, the shared 3-tone ramp (cel-foliage.js) used as a light multiplier with a cool
 * shadow tone, AO deep in the crown, a crisp rim light and a small highlight band.
 */
function createCelMaterial({ map, tones, crown = null, crownPull = 0, rim = 0.25, spec = [0.93, 0.96, 0.15], backLift = 1.1 }) {
  const centre = crown ? crown.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const half = crown ? crown.getSize(new THREE.Vector3()).multiplyScalar(0.5) : new THREE.Vector3(1, 1, 1);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...toneUniforms(tones),
      map: { value: map },
      crownCentre: { value: centre },
      crownHalf: { value: half },
      crownPull: { value: crownPull },
      rimStrength: { value: rim },
      spec: { value: new THREE.Vector3(...spec) },
      backLift: { value: backLift },
    },
    vertexColors: true,
    vertexShader: /* glsl */ `
      uniform vec3 crownCentre;
      uniform vec3 crownHalf;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vCrown;
      varying vec3 vView;
      varying float vDepth;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * world;
        vNormal = normalize(normalMatrix * normal);
        vec3 q = (world.xyz - crownCentre) / crownHalf;
        vDepth = clamp(length(q), 0.0, 1.0);
        vCrown = normalize(mat3(viewMatrix) * normalize(q + vec3(0.0, 0.35, 0.0)));
        vView = -mv.xyz;
        vUv = uv;
        vColor = color;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 sunDir;
      uniform float crownPull;
      uniform float rimStrength;
      uniform vec3 spec;
      uniform float backLift;
      ${CEL_RAMP_GLSL}
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vCrown;
      varying vec3 vView;
      varying float vDepth;
      void main() {
        vec3 albedo = texture2D(map, vUv).rgb * vColor;
        vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 Nc = normalize(mix(N, vCrown, crownPull));
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        vec3 V = normalize(vView);
        float ao = mix(1.0, 0.68 + 0.32 * vDepth, step(0.001, crownPull));
        float lit = max(dot(Nc, L), 0.0);
        vec3 col = albedo * celRamp((lit * 0.85 + 0.15) * ao);
        if (!gl_FrontFacing) col *= backLift;
        // Rim: a crisp light edge on the silhouette, stronger on the sunny side.
        float fres = 1.0 - max(dot(N, V), 0.0);
        col += albedo * rimStrength * smoothstep(0.55, 0.75, fres) * (0.4 + 0.6 * lit);
        if (gl_FrontFacing) {
          vec3 H = normalize(L + V);
          col += spec.z * vec3(1.0, 1.0, 0.94) * smoothstep(spec.x, spec.y, dot(N, H));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

function toRegion(w, from, to, region, fn = (u, v) => [u, v]) {
  const [u0, v0, u1, v1] = region;
  for (let i = from; i < to; i++) {
    const [u, v] = fn(w.uvs[i * 2], w.uvs[i * 2 + 1]);
    w.uvs[i * 2] = u0 + (u1 - u0) * THREE.MathUtils.clamp(u, 0, 1);
    w.uvs[i * 2 + 1] = v0 + (v1 - v0) * THREE.MathUtils.clamp(v, 0, 1);
  }
}

// ---------------------------------------------------------------- layout

/** Seeded layout shared by both levels, so near and far are the same plant. */
function layout(seed) {
  const rand = mulberry32(seed);
  const crownCount = 2 + Math.floor(rand() * 2);
  const crowns = Array.from({ length: crownCount }, (_, i) => {
    const az = (i / crownCount) * Math.PI * 2 + range(rand, -0.4, 0.4);
    const r = range(rand, 0.012, 0.03);
    return new THREE.Vector3(Math.cos(az) * r, SOIL_Y, Math.sin(az) * r);
  });
  const n = Math.round(range(rand, 22, 28));
  const leaves = [];
  let phase = range(rand, 0, Math.PI * 2);
  for (let k = 0; k < n; k++) {
    // k = 0 oldest (outer, low) … n−1 youngest (inner, upright, small).
    const age = 1 - k / (n - 1);
    const crown = crowns[k % crowns.length];
    phase += GOLDEN + range(rand, -0.25, 0.25);
    const out = new THREE.Vector3(Math.cos(phase), 0, Math.sin(phase));
    // Petiole elevation from horizontal: outer leaves low, inner ones upright.
    const elev = THREE.MathUtils.lerp(1.3, 0.55, age) + range(rand, -0.12, 0.12);
    const plen = range(rand, 0.06, 0.1) * THREE.MathUtils.lerp(0.7, 1, age);
    const root = crown.clone().addScaledVector(out, 0.004);
    // Petiole arches: leaves the soil steeper, then bends out.
    const d0 = out.clone().multiplyScalar(Math.cos(elev + 0.25)).addScaledVector(UP, Math.sin(elev + 0.25));
    const d1 = out.clone().multiplyScalar(Math.cos(elev - 0.35)).addScaledVector(UP, Math.sin(elev - 0.35));
    const pts = [];
    const p = root.clone();
    const seg = 6;
    for (let i = 0; i <= seg; i++) {
      pts.push(p.clone());
      const d = d0.clone().lerp(d1, i / seg).normalize();
      p.addScaledVector(d, plen / seg);
    }
    const tip = pts[seg];
    // Blade: continues outward, held near horizontal, tip dipping (outer leaves more).
    const pitch = THREE.MathUtils.lerp(-0.35, 0.35, 1 - age) + range(rand, -0.15, 0.15);
    const fwd = out.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP, Math.sin(pitch)).normalize();
    const size = range(rand, ...LEAF.length) * THREE.MathUtils.lerp(0.65, 1, Math.min(1, age * 1.6));
    leaves.push({
      petiole: pts,
      blade: tip.clone().addScaledVector(fwd, -0.004),
      fwd,
      size,
      roll: range(rand, -0.3, 0.3),
      fold: range(rand, 0.08, 0.18) + (1 - age) * 0.2,
      curl: range(rand, 0.08, 0.2),
      arch: range(rand, 0.04, 0.14) + age * 0.08,
      twist: range(rand, -0.25, 0.25),
      wave: range(rand, 0.003, 0.01),
      wavePhase: range(rand, 0, Math.PI * 2),
      variant: Math.floor(rand() * VARIANTS),
      tint: [range(rand, 0.92, 1.06), range(rand, 0.95, 1.06), range(rand, 0.92, 1.04)],
    });
  }
  return { leaves };
}

// ---------------------------------------------------------------- leaves

const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _s = new THREE.Vector3();

function leafMatrix(l, scale) {
  _y.copy(l.fwd);
  _x.crossVectors(_y, UP).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m).multiply(_r.setFromAxisAngle(UP, l.roll));
  return _m.compose(l.blade, _q, _s.set(scale, scale, scale));
}

/** Half-width at t: rounded base, broadest about a third up, tapering to a short point. */
function leafWidth(t) {
  return (LEAF.width / 2) * Math.sin(Math.PI * Math.min(1, t ** 0.8)) ** 0.5 * (1 - 0.3 * THREE.MathUtils.smoothstep(t, 0.8, 1));
}

function leafPoint(l, s, t, side, out) {
  const w = leafWidth(t);
  const x = s * w;
  const as = Math.abs(s);
  let z = l.fold * Math.abs(x) - l.curl * as ** 2.5 * w - l.arch * t * t;
  z += l.wave * Math.sin(t * 8 + l.wavePhase) * as ** 2;
  z -= 0.01 * Math.exp(-((s / 0.12) ** 2)) * Math.sin(Math.PI * t); // midrib groove
  z += side * LEAF.thick * 0.5 * (1 - as ** 2) * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.5;
  const a = l.twist * t;
  return out.set(x * Math.cos(a) - z * Math.sin(a), t, x * Math.sin(a) + z * Math.cos(a));
}

function addLeaf(w, l, rows, cols) {
  const M = leafMatrix(l, l.size);
  const base = w.vertexCount;
  const row = cols + 1;
  for (const side of [1, -1]) {
    const off = w.vertexCount;
    const slot = side > 0 ? l.variant : VARIANTS;
    for (let r = 0; r <= rows; r++) {
      const t = (r / rows) ** 0.9;
      for (let c = 0; c <= cols; c++) {
        const s = (c / cols) * 2 - 1;
        leafPoint(l, s, t, side, _p).applyMatrix4(M);
        w.positions.push(_p.x, _p.y, _p.z);
        w.normals.push(0, 0, 0);
        w.uvs.push((slot + (s * 0.5 + 0.5) * 0.98 + 0.01) * SLOT, t);
        w.colors.push(...l.tint);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = off + r * row + c;
        if (side > 0) w.indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
        else w.indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
  }
  // Edge band joining the two margins.
  const bot = base + (rows + 1) * row;
  for (const c of [0, cols]) {
    for (let r = 0; r < rows; r++) {
      const a = base + r * row + c;
      const b = bot + r * row + c;
      if (c === 0) w.indices.push(a, a + row, b, b, a + row, b + row);
      else w.indices.push(a, b, a + row, b, b + row, a + row);
    }
  }
}

function addFarLeaf(w, l) {
  const M = leafMatrix(l, l.size * 1.05);
  // A rounded octagon (6 triangles) so the far leaf keeps the near leaf's paddle outline.
  const pts = [[0, 0.02], [0.85, 0.2], [1, 0.45], [0.75, 0.78], [0, 1], [-0.75, 0.78], [-1, 0.45], [-0.85, 0.2]];
  const base = w.vertexCount;
  for (const [s, t] of pts) {
    leafPoint(l, s, t, 1, _p).applyMatrix4(M);
    w.positions.push(_p.x, _p.y, _p.z);
    w.normals.push(0, 0, 0);
    w.uvs.push((l.variant + 0.5 + s * 0.4) * SLOT, t * 0.9 + 0.05);
    w.colors.push(...l.tint);
  }
  for (let i = 1; i < pts.length - 1; i++) w.indices.push(base, base + i, base + i + 1);
}

// ---------------------------------------------------------------- pot

function addPot(w, radial) {
  const lathe = new THREE.LatheGeometry(POT_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), radial);
  const off = w.vertexCount;
  const pos = lathe.attributes.position;
  const nrm = lathe.attributes.normal;
  const uv = lathe.attributes.uv;
  const nPts = POT_PROFILE.length;
  for (let i = 0; i < pos.count; i++) {
    w.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    w.normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    w.uvs.push(uv.getX(i), potArc[Math.round(uv.getY(i) * (nPts - 1))]);
    w.colors.push(1, 1, 1);
  }
  const idx = lathe.index.array;
  for (let i = 0; i < idx.length; i++) w.indices.push(idx[i] + off);
  toRegion(w, off, w.vertexCount, ATLAS.pot);
  lathe.dispose();
  let tris = idx.length / 3;

  const soilOff = w.vertexCount;
  const rings = radial > 12 ? 4 : 1;
  w.positions.push(0, SOIL_Y + 0.006, 0);
  w.normals.push(0, 1, 0);
  w.uvs.push(0.5, 0.5);
  w.colors.push(1, 1, 1);
  for (let r = 1; r <= rings; r++) {
    const f = r / rings;
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      w.positions.push(Math.cos(a) * f * SOIL_R, SOIL_Y + 0.006 * (1 - f * f), Math.sin(a) * f * SOIL_R);
      w.normals.push(0, 1, 0);
      w.uvs.push(0.5 + 0.5 * Math.cos(a) * f, 0.5 + 0.5 * Math.sin(a) * f);
      w.colors.push(1, 1, 1);
    }
  }
  const ring = radial + 1;
  for (let k = 0; k < radial; k++) {
    w.indices.push(soilOff, soilOff + 2 + k, soilOff + 1 + k);
    tris++;
  }
  for (let r = 1; r < rings; r++) {
    for (let k = 0; k < radial; k++) {
      const a = soilOff + 1 + (r - 1) * ring + k;
      const b = a + ring;
      w.indices.push(a, a + 1, b, a + 1, b + 1, b);
      tris += 2;
    }
  }
  toRegion(w, soilOff, w.vertexCount, ATLAS.soil);
  return tris;
}

// ---------------------------------------------------------------- plant

function createSchismatoglottis({ seed = 1, lod = 'near' } = {}) {
  const near = lod !== 'far';
  const { leaves } = layout(seed);

  const sw = createMeshWriter();
  let potTris = addPot(sw, near ? 40 : 10);
  for (const l of leaves) {
    // Thick, fleshy petiole with a wider sheathing base.
    const pts = near ? l.petiole : [l.petiole[0], l.petiole[3], l.petiole[6]];
    const radii = pts.map((_, i) => THREE.MathUtils.lerp(0.009, 0.005, (i / (pts.length - 1)) ** 0.6) * (0.7 + 0.3 * l.size / LEAF.length[1]));
    const f0 = sw.vertexCount;
    potTris += addTube(sw, pts, radii, { radial: near ? 7 : 3, color: new THREE.Color(1, 1, 1), closeStart: false });
    toRegion(sw, f0, sw.vertexCount, ATLAS.petiole, (u, v) => [u, v / 0.15]);
  }

  const lw = createMeshWriter();
  for (const l of leaves) {
    if (near) addLeaf(lw, l, 14, 10);
    else addFarLeaf(lw, l);
  }
  const leafGeometry = lw.toGeometry();
  leafGeometry.computeVertexNormals();
  const leafTris = leafGeometry.index.count / 3;

  const atlas = paintTexture(near ? 1024 : 256, near ? 1024 : 256, atlasPaint);
  const leafTex = near ? paintTexture(1280, 512, leafPaint) : paintTexture(320, 128, leafPaint);
  leafGeometry.computeBoundingBox();
  const crown = leafGeometry.boundingBox.clone();

  const group = new THREE.Group();
  group.name = `schismatoglottis (${near ? 'near' : 'far'})`;
  const potGeometry = sw.toGeometry();
  // Plastic pot: cool shadows, a crisp highlight band and rim light (stylised).
  const potMaterial = createCelMaterial({ map: atlas, tones: ['#46536a', '#c2c6cc', '#fff6e6'], rim: 0.6, spec: [0.9, 0.905, 0.25], backLift: 1 });
  const potMesh = new THREE.Mesh(potGeometry, potMaterial);
  potMesh.name = 'pot and petioles';
  group.add(potMesh);

  const leafMaterial = createCelMaterial({ map: leafTex, tones: ['#3b5568', '#b7c4b5', '#fff3dc'], crown, crownPull: 0.6, rim: 0.35, spec: [0.955, 0.96, 0.12], backLift: 1.12 });
  const leafMesh = new THREE.Mesh(leafGeometry, leafMaterial);
  leafMesh.name = 'leaves';
  group.add(leafMesh);

  potGeometry.computeBoundingBox();
  const box = potGeometry.boundingBox.clone().union(leafGeometry.boundingBox);
  const stats = {
    seed,
    lod: near ? 'near' : 'far',
    leaves: leaves.length,
    drawCalls: 2,
    triangles: { pot: potTris, leaves: leafTris, total: potTris + leafTris },
    bounds: box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)),
  };

  return {
    group,
    stats,
    dispose() {
      potGeometry.dispose();
      potMaterial.dispose();
      leafGeometry.dispose();
      leafMaterial.dispose();
      atlas.dispose();
      leafTex.dispose();
    },
  };
}

export const plant = {
  id: 'schismatoglottis',
  label: "Schismatoglottis 'Sarawak'",
  create: createSchismatoglottis,
  switchAt: 4, // guess: a small pot plant
  target: [0, 0.17, 0],
  distance: 1.1,
  // background: unset, so the preview's default light grey is used.
};
