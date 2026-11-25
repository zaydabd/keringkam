// Rubber plant (Ficus elastica), indoor potted form. Original procedural design: geometry and
// textures are generated here; nothing is copied from any model or image.
//
// Sourced shape facts:
//   - "broad shiny oval leaves 10–35 cm long and 5–15 cm broad"; 'Robusta' has "broader, stiffer
//     and more upright leaves"; "Small versions of the trees can be grown as houseplants";
//     new leaves grow "inside a sheath at the apical meristem ... the sheath drops off".
//     https://en.wikipedia.org/wiki/Ficus_elastica
//   - leaves "Alternate", "Elliptical", "glossy ... stiff and leathery", "dark green with pink or
//     purple stipules", "Midrib is pale to reddish and raised underneath"; indoors "usually kept
//     to 2 to 10 feet".
//     https://plants.ces.ncsu.edu/plants/ficus-elastica/common-name/indian-rubber-plant/
//
// Look (method only): Sven Mrđen's foliage study — leaves that are not flat (curved, thick
// edges), darker "near the stem and along the middle", brighter "right at the border", small
// per-leaf hue shifts, veins as borders between volumes.
//   https://www.exp-points.com/sven-mren-foliage-study
//
// Guesses (stylistic or unsourced): 1–3 stems; ~1.5 m total height; terracotta pot, its profile,
// texture and mineral bloom; soil; spiral at the golden angle (sources say only "alternate");
// petiole 4–6 cm; leaf fold, edge curl, wave, twist and arch; young top leaves more folded; fine
// lateral vein lines; all colours; leaf thickness (exaggerated so edges read).
// Units: metres. Two draw calls per level: stems + pot + soil (one textured mesh), leaves.

import * as THREE from 'three';
import { mulberry32, range } from '../rng.js';
import { addTube, createMeshWriter } from '../tube.js';
import { UP } from '../grow.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const LEAF = { length: [0.22, 0.32], width: 0.5, petiole: [0.04, 0.06], thick: 0.012 };
// Pot profile (radius, height), outside bottom → foot → wall → rolled lip → inside → soil line.
const POT_PROFILE = [
  [0.0, 0.0], [0.108, 0.0], [0.116, 0.004], [0.12, 0.014], [0.14, 0.12], [0.157, 0.2],
  [0.16, 0.206], [0.171, 0.209], [0.178, 0.216], [0.18, 0.232], [0.178, 0.248], [0.172, 0.257],
  [0.163, 0.26], [0.156, 0.256], [0.153, 0.245], [0.149, 0.228],
];
const SOIL_Y = 0.228;
const SOIL_R = 0.149;
const STEM_BASE = SOIL_Y - 0.01;

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

/**
 * Paints a colour texture and a bump texture from fn(u, v) → [r, g, b, height] (linear 0..1,
 * v up). Returns sRGB colour + linear bump as THREE textures.
 */
function paintTextures(size, fn) {
  const make = () => {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
    return c;
  };
  const colorCanvas = make();
  const bumpCanvas = make();
  const cctx = colorCanvas.getContext('2d');
  const bctx = bumpCanvas.getContext('2d');
  const cimg = cctx.createImageData(size, size);
  const bimg = bctx.createImageData(size, size);
  const toSrgb = (x) => {
    x = Math.min(1, Math.max(0, x));
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  };
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const [r, g, b, h] = fn(u, v);
      const i = (y * size + x) * 4;
      cimg.data[i] = toSrgb(r);
      cimg.data[i + 1] = toSrgb(g);
      cimg.data[i + 2] = toSrgb(b);
      cimg.data[i + 3] = 255;
      const hb = Math.min(255, Math.max(0, h * 255));
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = hb;
      bimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(bumpCanvas);
  return { map, bump };
}

// Leaf texture: left half the upper side, right half the underside. u across (s = −1..1), v along.
const LEAF_TOP = hex('#1f5428');
const LEAF_TOP_EDGE = hex('#367a36');
const LEAF_BASE_DARK = hex('#163820');
const MIDRIB_TOP = hex('#b9c98e');
const LEAF_UNDER = hex('#6f9a5c');
const MIDRIB_UNDER = hex('#c79a7c'); // "pale to reddish ... raised underneath"
const MARGIN = hex('#8fae62');

function leafPaint(u, v) {
  const under = u >= 0.5;
  const s = ((under ? u - 0.5 : u) / 0.5) * 2 - 1;
  const t = v;
  const as = Math.abs(s);
  const n = fbm(s * 3 + (under ? 9 : 0), t * 6, 3);
  // Midrib: wide at the base, thin at the tip.
  const mw = 0.05 * (1 - 0.75 * t) + 0.012;
  const mid = 1 - sstep(mw * 0.6, mw, as);
  // Lateral veins: many fine, nearly parallel lines leaving the midrib at a wide angle (guess).
  const vl = Math.abs(((t + as * 0.22) * 34) % 1 - 0.5);
  const vein = (1 - sstep(0.04, 0.12, vl)) * sstep(mw, mw + 0.06, as) * (1 - sstep(0.88, 0.97, as));
  const margin = sstep(0.93, 0.985, as);
  let col;
  let h;
  if (!under) {
    col = mix3(LEAF_TOP, LEAF_TOP_EDGE, sstep(0.25, 1, as) * 0.7);
    col = mix3(col, LEAF_BASE_DARK, (1 - sstep(0.0, 0.25, t)) * 0.6 + (1 - sstep(0, 0.35, as)) * 0.25);
    col = col.map((c) => c * (0.9 + 0.2 * n));
    col = mix3(col, MIDRIB_TOP, mid * 0.85);
    col = mix3(col, MIDRIB_TOP, vein * 0.12);
    col = mix3(col, MARGIN, margin * 0.55);
    h = 0.55 - mid * 0.35 + vein * 0.08 + n * 0.08;
  } else {
    col = mix3(LEAF_UNDER, hex('#5b8450'), sstep(0.3, 1, as) * 0.4).map((c) => c * (0.92 + 0.16 * n));
    col = mix3(col, MIDRIB_UNDER, mid * 0.9);
    col = mix3(col, hex('#a8c48a'), vein * 0.35);
    h = 0.45 + mid * 0.45 + vein * 0.15 + n * 0.05;
  }
  return [...col, h];
}

// Atlas for the stem mesh. Regions (u, v): pot [0, .5]×[.25, 1], soil [0, .5]×[0, .25],
// bark [.5, .875]×[0, 1], plain white [.875, 1]×[0, 1] (for vertex-coloured parts).
const ATLAS = { pot: [0, 0.25, 0.5, 1], soil: [0, 0, 0.5, 0.25], bark: [0.5, 0, 0.875, 1], white: [0.875, 0, 1, 1] };
const CLAY = hex('#b8643a');
const CLAY_LIGHT = hex('#cf7f52');
const CLAY_DARK = hex('#8a4527');
const BLOOM = hex('#d9c7b0'); // mineral bloom on terracotta (guess)
const SOIL = hex('#2e2018');
const BARK = hex('#e6e0d2');

// Pot texture rows follow the profile: v along the profile arc (0 bottom centre → 1 soil line).
const potArc = (() => {
  const d = [0];
  for (let i = 1; i < POT_PROFILE.length; i++) d.push(d[i - 1] + Math.hypot(POT_PROFILE[i][0] - POT_PROFILE[i - 1][0], POT_PROFILE[i][1] - POT_PROFILE[i - 1][1]));
  return d.map((x) => x / d[d.length - 1]);
})();
const LIP_START = potArc[6];
const INSIDE_START = potArc[12];

function atlasPaint(u, v) {
  if (u < 0.5 && v >= 0.25) {
    const pu = u / 0.5;
    const pv = (v - 0.25) / 0.75;
    const ang = pu * 40;
    const n = fbm(ang, pv * 30, 1);
    const fine = vnoise(ang * 8, pv * 240, 2);
    // Throwing rings: faint horizontal ridges up the wall.
    const rings = 0.5 + 0.5 * Math.sin(pv * 260 + n * 3);
    let col = mix3(CLAY, CLAY_LIGHT, n * 0.6);
    col = mix3(col, CLAY_DARK, (fine > 0.86 ? 0.5 : 0) + (1 - sstep(0.05, 0.2, pv)) * 0.35);
    // Mineral bloom: chalky patches, more just under the lip.
    const bloomMask = sstep(0.62, 0.8, fbm(ang * 0.6, pv * 6, 5)) * (0.4 + 0.6 * sstep(LIP_START - 0.25, LIP_START, pv));
    col = mix3(col, BLOOM, bloomMask * 0.4 * (pv < LIP_START + 0.02 ? 1 : 0.6));
    // Shadow line under the lip; inside darker, damp near the soil.
    col = col.map((c) => c * (1 - 0.35 * (sstep(LIP_START - 0.04, LIP_START, pv) - sstep(LIP_START, LIP_START + 0.02, pv))));
    if (pv > INSIDE_START) col = mix3(col, CLAY_DARK, 0.45 + 0.4 * sstep(INSIDE_START, 1, pv)).map((c) => c * 0.8);
    const h = 0.5 + 0.12 * rings * (pv < LIP_START ? 1 : 0.3) + 0.2 * (fine - 0.5) + 0.15 * bloomMask;
    return [...col, h];
  }
  if (u < 0.5) {
    // Soil: planar disc coords.
    const x = (u / 0.5) * 2 - 1;
    const y = (v / 0.25) * 2 - 1;
    const g = vnoise(x * 60, y * 60, 7);
    const clump = fbm(x * 8, y * 8, 8);
    let col = SOIL.map((c) => c * (0.6 + 0.6 * clump));
    if (g > 0.82) col = mix3(col, hex('#7a6550'), 0.6); // grit and perlite-like specks (guess)
    if (g < 0.1) col = col.map((c) => c * 0.5);
    return [...col, 0.3 + 0.5 * clump + (g > 0.82 ? 0.25 : 0)];
  }
  if (u < 0.875) {
    // Bark: fine vertical streaks and small lenticel dots on a light base (vertex colour tints it).
    const bu = (u - 0.5) / 0.375;
    const streak = fbm(bu * 24, v * 2, 11);
    const dots = vnoise(bu * 60, v * 200, 12) > 0.9 ? 1 : 0;
    const col = BARK.map((c) => c * (0.78 + 0.3 * streak - 0.25 * dots));
    return [...col, 0.4 + 0.4 * streak - 0.2 * dots];
  }
  return [1, 1, 1, 0.5];
}

/** Moves uvs of vertices [from, to) of a writer into an atlas region. */
function toRegion(writer, from, to, region, fn = (u, v) => [u, v]) {
  const [u0, v0, u1, v1] = region;
  for (let i = from; i < to; i++) {
    const [u, v] = fn(writer.uvs[i * 2], writer.uvs[i * 2 + 1]);
    writer.uvs[i * 2] = u0 + (u1 - u0) * THREE.MathUtils.clamp(u, 0, 1);
    writer.uvs[i * 2 + 1] = v0 + (v1 - v0) * THREE.MathUtils.clamp(v, 0, 1);
  }
}

// ---------------------------------------------------------------- layout

/** Seeded layout shared by both levels, so near and far are the same plant. */
function layout(seed) {
  const rand = mulberry32(seed);
  const stemCount = 1 + Math.floor(rand() * 3); // 1–3 (guess)
  const stems = [];
  const leaves = [];
  for (let s = 0; s < stemCount; s++) {
    const main = s === 0;
    const height = main ? range(rand, 1.05, 1.2) : range(rand, 0.55, 0.9);
    const az = main ? range(rand, 0, Math.PI * 2) : (s / stemCount) * Math.PI * 2 + range(rand, -0.5, 0.5);
    const lean = main ? range(rand, 0.02, 0.08) : range(rand, 0.12, 0.22);
    const base = new THREE.Vector3(main ? 0 : Math.cos(az) * 0.045, STEM_BASE, main ? 0 : Math.sin(az) * 0.045);
    const dir = new THREE.Vector3(Math.cos(az) * lean, 1, Math.sin(az) * lean).normalize();
    const sections = 14;
    const pts = [base.clone()];
    const p = base.clone();
    const bend = new THREE.Vector3();
    for (let i = 0; i < sections; i++) {
      bend.multiplyScalar(0.7).add(new THREE.Vector3(range(rand, -1, 1), 0, range(rand, -1, 1)).multiplyScalar(0.025));
      dir.add(bend).addScaledVector(UP, 0.04).normalize();
      p.addScaledVector(dir, height / sections);
      pts.push(p.clone());
    }
    const r0 = main ? 0.026 : 0.019;
    const radii = pts.map((_, i) => r0 + (0.008 - r0) * (i / sections) ** 0.8);
    const tipDir = pts[sections].clone().sub(pts[sections - 1]).normalize();
    stems.push({ pts, radii, tipDir, height });

    const n = Math.round(main ? range(rand, 14, 18) : range(rand, 7, 10));
    const start = range(rand, 0.15, 0.25); // bare lower stem (guess)
    let phase = range(rand, 0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1);
      const t = start + (0.97 - start) * (1 - (1 - u) ** 1.3);
      const f = t * sections;
      const i = Math.min(sections - 1, Math.floor(f));
      const at = pts[i].clone().lerp(pts[i + 1], f - i);
      const tan = pts[i + 1].clone().sub(pts[i]).normalize();
      phase += GOLDEN + range(rand, -0.15, 0.15);
      const pitch = THREE.MathUtils.lerp(1.05, 0.35, u ** 1.2) + range(rand, -0.12, 0.12);
      const side = new THREE.Vector3(Math.cos(phase), 0, Math.sin(phase));
      side.addScaledVector(tan, -side.dot(tan)).normalize();
      const out = tan.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(side, Math.sin(pitch)).normalize();
      const young = THREE.MathUtils.smoothstep(u, 0.75, 1);
      const size = range(rand, ...LEAF.length) * (main ? 1 : 0.9) * THREE.MathUtils.lerp(1, 0.45, young);
      const petiole = range(rand, ...LEAF.petiole) * (0.6 + 0.4 * size / LEAF.length[1]);
      const radius = THREE.MathUtils.lerp(radii[i], radii[i + 1], f - i);
      const root = at.clone().addScaledVector(side, radius * 0.8);
      const blade = root.clone().addScaledVector(out, petiole);
      const fwd = out.clone().addScaledVector(UP, -0.15 * (1 - u)).normalize();
      leaves.push({
        root,
        blade,
        fwd,
        size,
        roll: range(rand, -0.4, 0.4),
        // Shape: young leaves fold more (guess).
        fold: range(rand, 0.1, 0.2) + young * 0.5,
        curl: range(rand, 0.12, 0.28),
        arch: range(rand, 0.06, 0.2) * (1 - young * 0.6),
        twist: range(rand, -0.35, 0.35),
        wave: range(rand, 0.004, 0.014),
        wavePhase: range(rand, 0, Math.PI * 2),
        tint: [range(rand, 0.9, 1.08), range(rand, 0.94, 1.08), range(rand, 0.88, 1.02)],
      });
    }
  }
  return { stems, leaves };
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

/** Leaf half-width at t (relative to length 1). Round base, broad middle, short point. */
function leafWidth(t) {
  return (LEAF.width / 2) * Math.sin(Math.PI * Math.min(1, t ** 0.92)) ** 0.55 * (1 - 0.35 * THREE.MathUtils.smoothstep(t, 0.8, 1));
}

/** Surface point of a leaf in its local frame (length 1). side +1 top, −1 underside. */
function leafPoint(l, s, t, side, out) {
  const w = leafWidth(t);
  const x = s * w;
  const as = Math.abs(s);
  // V-fold along the midrib, edges curling down, a slow wave along the margin, arch and twist.
  let z = l.fold * Math.abs(x) - l.curl * as ** 2.5 * w - l.arch * t * t;
  z += l.wave * Math.sin(t * 9 + l.wavePhase) * as ** 2;
  z -= 0.012 * Math.exp(-((s / 0.12) ** 2)) * Math.sin(Math.PI * t); // midrib groove
  // Thickness: domed between the surfaces, thin at the margin.
  z += side * LEAF.thick * 0.5 * (1 - as ** 2) * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.5;
  const a = l.twist * t;
  return out.set(x * Math.cos(a) - z * Math.sin(a), t, x * Math.sin(a) + z * Math.cos(a));
}

function addLeaf(w, l, rows, cols, far) {
  const M = leafMatrix(l, l.size);
  const tint = l.tint;
  const base = w.vertexCount;
  const row = cols + 1;
  const sides = far ? [1] : [1, -1];
  const tsFor = (r) => (r / rows) ** 0.9; // a little denser at the base
  for (const side of sides) {
    const off = w.vertexCount;
    for (let r = 0; r <= rows; r++) {
      const t = tsFor(r);
      for (let c = 0; c <= cols; c++) {
        const s = (c / cols) * 2 - 1;
        leafPoint(l, s, t, side, _p).applyMatrix4(M);
        w.positions.push(_p.x, _p.y, _p.z);
        w.normals.push(0, 0, 0);
        // Upper side in the left half of the texture, underside in the right.
        w.uvs.push((side > 0 ? 0 : 0.5) + 0.5 * (s * 0.5 + 0.5), t);
        // Vertex AO: darker at the blade base by the stem.
        const ao = 0.7 + 0.3 * THREE.MathUtils.smoothstep(t, 0, 0.35);
        w.colors.push(tint[0] * ao, tint[1] * ao, tint[2] * ao);
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
  if (!far) {
    // Edge band joining the two margins, so the leaf has a visible thickness.
    const top = base;
    const bot = base + (rows + 1) * row;
    for (const c of [0, cols]) {
      for (let r = 0; r < rows; r++) {
        const a = top + r * row + c;
        const b = bot + r * row + c;
        if (c === 0) w.indices.push(a, a + row, b, b, a + row, b + row);
        else w.indices.push(a, b, a + row, b, b + row, a + row);
      }
    }
  }
}

/** Far leaf: one hexagon fan (4 triangles) on the same curved surface. */
function addFarLeaf(w, l) {
  const M = leafMatrix(l, l.size * 1.05);
  const pts = [[0, 0.02], [0.9, 0.3], [0.85, 0.68], [0, 1], [-0.85, 0.68], [-0.9, 0.3]];
  const base = w.vertexCount;
  for (const [s, t] of pts) {
    leafPoint(l, s, t, 1, _p).applyMatrix4(M);
    w.positions.push(_p.x, _p.y, _p.z);
    w.normals.push(0, 0, 0);
    w.uvs.push(0.5 * (s * 0.5 + 0.5), t);
    w.colors.push(...l.tint);
  }
  w.indices.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 3, base + 4, base, base + 4, base + 5);
}

// ---------------------------------------------------------------- pot

function addPot(w, radial) {
  const lathe = new THREE.LatheGeometry(POT_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), radial);
  const off = w.vertexCount;
  const pos = lathe.attributes.position;
  const nrm = lathe.attributes.normal;
  const uv = lathe.attributes.uv;
  // Lathe v runs by point index; re-space it by arc length so the texture rows match.
  const nPts = POT_PROFILE.length;
  for (let i = 0; i < pos.count; i++) {
    w.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    w.normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    const j = Math.round(uv.getY(i) * (nPts - 1));
    w.uvs.push(uv.getX(i), potArc[j]);
    w.colors.push(1, 1, 1);
  }
  const idx = lathe.index.array;
  for (let i = 0; i < idx.length; i++) w.indices.push(idx[i] + off);
  toRegion(w, off, w.vertexCount, ATLAS.pot);
  lathe.dispose();
  let tris = idx.length / 3;

  // Soil: a slightly domed disc.
  const soilOff = w.vertexCount;
  const rings = radial > 12 ? 4 : 1;
  w.positions.push(0, SOIL_Y + 0.008, 0);
  w.normals.push(0, 1, 0);
  w.uvs.push(0.5, 0.5);
  w.colors.push(1, 1, 1);
  for (let r = 1; r <= rings; r++) {
    const rr = (r / rings) * SOIL_R;
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      w.positions.push(Math.cos(a) * rr, SOIL_Y + 0.008 * (1 - (r / rings) ** 2), Math.sin(a) * rr);
      w.normals.push(0, 1, 0);
      w.uvs.push(0.5 + 0.5 * Math.cos(a) * (r / rings), 0.5 + 0.5 * Math.sin(a) * (r / rings));
      w.colors.push(1, 1, 1);
    }
  }
  const ring = radial + 1;
  for (let k = 0; k < radial; k++) {
    w.indices.push(soilOff, soilOff + 1 + k + 1, soilOff + 1 + k);
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

const sheathColor = new THREE.Color('#c8435e');
const petioleColor = new THREE.Color('#5f7d3c');
const stemLow = new THREE.Color('#7a6a55');
const stemHigh = new THREE.Color('#5d8443');
const _c = new THREE.Color();
const stemColor = (v, u, t) => _c.copy(stemLow).lerp(stemHigh, THREE.MathUtils.smoothstep(t, 0.25, 0.9));

function createRubberPlant({ seed = 1, lod = 'near' } = {}) {
  const near = lod !== 'far';
  const { stems, leaves } = layout(seed);

  // Stems, pot and soil: one mesh, one atlas.
  const sw = createMeshWriter();
  let stemTris = addPot(sw, near ? 40 : 10);
  for (const s of stems) {
    const from = sw.vertexCount;
    if (near) {
      stemTris += addTube(sw, s.pts, s.radii, { radial: 10, colorAt: stemColor });
    } else {
      const keep = s.pts.map((_, i) => i).filter((i) => i % 4 === 0 || i === s.pts.length - 1);
      stemTris += addTube(sw, keep.map((i) => s.pts[i]), keep.map((i) => s.radii[i] * 1.2), { radial: 3, colorAt: stemColor });
    }
    toRegion(sw, from, sw.vertexCount, ATLAS.bark, (u, v) => [u, v / s.height]);
    if (near) {
      // The pink-red sheath (stipule) around the next leaf at the growing tip.
      const f2 = sw.vertexCount;
      const tip = s.pts[s.pts.length - 1];
      const r = s.radii[s.radii.length - 1];
      const sheath = [0, 0.3, 0.65, 1].map((k) => tip.clone().addScaledVector(s.tipDir, k * 0.085));
      stemTris += addTube(sw, sheath, [r * 1.05, r * 1.3, r * 0.85, 0.0005], { radial: 8, color: sheathColor });
      toRegion(sw, f2, sw.vertexCount, ATLAS.white, () => [0.5, 0.5]);
    }
  }
  if (near) {
    const f3 = sw.vertexCount;
    for (const l of leaves) {
      stemTris += addTube(sw, [l.root, l.root.clone().lerp(l.blade, 0.5), l.blade], [0.005, 0.0045, 0.004], { radial: 5, color: petioleColor });
    }
    toRegion(sw, f3, sw.vertexCount, ATLAS.white, () => [0.5, 0.5]);
  }

  // Leaves: one merged mesh.
  const lw = createMeshWriter();
  for (const l of leaves) {
    if (near) addLeaf(lw, l, 16, 10, false);
    else addFarLeaf(lw, l);
  }
  const leafGeometry = lw.toGeometry();
  leafGeometry.computeVertexNormals();
  const leafTris = leafGeometry.index.count / 3;

  const texSize = near ? 1024 : 256;
  const atlas = paintTextures(texSize, atlasPaint);
  const leafTex = paintTextures(near ? 512 : 128, leafPaint);

  const group = new THREE.Group();
  group.name = `rubber plant (${near ? 'near' : 'far'})`;
  const stemGeometry = sw.toGeometry();
  const stemMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: atlas.map,
    bumpMap: atlas.bump,
    bumpScale: 2,
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
  const stemMesh = new THREE.Mesh(stemGeometry, stemMaterial);
  stemMesh.name = 'pot and stems';
  group.add(stemMesh);

  // Glossy, leathery leaves: a clearcoat over a satin base.
  const leafMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    map: leafTex.map,
    bumpMap: leafTex.bump,
    bumpScale: 1.5,
    roughness: 0.55,
    clearcoat: 0.8,
    clearcoatRoughness: 0.22,
    sheen: 0.08,
    sheenColor: new THREE.Color('#9fd08a'),
    sheenRoughness: 0.6,
    side: THREE.DoubleSide,
  });
  const leafMesh = new THREE.Mesh(leafGeometry, leafMaterial);
  leafMesh.name = 'leaves';
  group.add(leafMesh);

  stemGeometry.computeBoundingBox();
  leafGeometry.computeBoundingBox();
  const box = stemGeometry.boundingBox.clone().union(leafGeometry.boundingBox);
  const stats = {
    seed,
    lod: near ? 'near' : 'far',
    stems: stems.length,
    leaves: leaves.length,
    drawCalls: 2,
    triangles: { stems: stemTris, leaves: leafTris, total: stemTris + leafTris },
    bounds: box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)),
  };

  return {
    group,
    stats,
    dispose() {
      stemGeometry.dispose();
      stemMaterial.dispose();
      leafGeometry.dispose();
      leafMaterial.dispose();
      for (const t of [atlas.map, atlas.bump, leafTex.map, leafTex.bump]) t.dispose();
    },
  };
}

export const plant = {
  id: 'rubberPlant',
  label: 'Rubber plant',
  create: createRubberPlant,
  switchAt: 8, // guess, tuned on the preview
  target: [0, 0.75, 0],
  distance: 3,
  // background: unset, so the preview's default light grey is used (light UI text stays readable).
};
