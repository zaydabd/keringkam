// Chinese evergreen (Aglaonema), a stylised indoor plant with two levels of detail.
//
// Sourced (NC State Extension Gardener Plant Toolbox, https://plants.ces.ncsu.edu/plants/aglaonema/):
//   - "grows to 1.5 feet, is erect and bushy"; height 1 ft – 1 ft 8 in, width 1 ft – 1 ft 6 in.
//   - habit "Clumping, Dense, Erect, Multi-stemmed"; stem "becoming sugarcane-like with age",
//     "silver-gray blotches appear on upright stems".
//   - leaves "lance-shaped ... 4 to 8 inches long and 2 to 3 inches wide" (also "4-12" long and
//     2-4" wide"); "Alternate, simple, oblong-lanceolate, acute, cuneate, entire"; "variegated with
//     white, silver, pink and/or red", "banded ... along primary veins or spotted".
//   - "5–8 main lateral veins"; "Veins are curved".
//   - "Petioles are sometimes white and shorter than the leaf length".
//
// Guesses (not from the source):
//   - the 'floor' size, ~1 m tall with 20–30 cm leaves (the source gives ~0.5 m); the 'table' size
//     follows the source (~0.4 m, 10–18 cm leaves);
//   - stem count, leaves per stem, leaf angles, droop, the two-ranked leaf turn, petiole/blade
//     ratio, ring scars on the bare stem, the variegation layout and all colours;
//   - no pot, no flowers.
// Nothing is copied from any model, texture or image.
//
// create({ seed, lod, size }): size is 'floor' or 'table'. Without it, seeds divisible by 3 give
// the table size, so the seed alone covers both.
// Both levels use one merged mesh and one cel material (1 draw call each). The layout is grown
// once per seed and emitted at two detail levels, so near and far share silhouette and colours.

import * as THREE from 'three';
import { mulberry32, range, stratified } from '../rng.js';
import { addTube, createMeshWriter } from '../tube.js';
import { UP } from '../grow.js';
import { CEL_RAMP_GLSL, FOLIAGE_SUN, toneUniforms } from '../cel-foliage.js';

// Sizes in metres (guess except where noted above).
const SIZES = {
  floor: { stems: [5, 7], stemLen: [0.14, 0.42], stemR: 0.016, leaves: [7, 10], blade: [0.22, 0.32], spread: 0.08 },
  table: { stems: [3, 5], stemLen: [0.04, 0.14], stemR: 0.008, leaves: [5, 8], blade: [0.12, 0.18], spread: 0.035 },
};

// Variegation palettes, one picked per seed (all are colours the source lists; shades are guesses).
const PALETTES = [
  { name: 'silver', green: '#2f5a2c', light: '#c9d6c2', rib: '#a9c39a', petiole: '#c8d4b8' },
  { name: 'cream', green: '#33612a', light: '#dfe3b0', rib: '#d2d99a', petiole: '#e3e2c4' },
  { name: 'pink', green: '#3a6232', light: '#e6a3a8', rib: '#d9707c', petiole: '#e8b5b5' },
];
const STEM = { base: '#7f9476', blotch: '#c6cdbd', ring: '#4f5e45' };

// Cel tones as multipliers on the paint: shadow, mid, light (guess).
const TONES = ['#44505c', '#b4bdb6', '#ffffff'];

function createMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: toneUniforms(TONES),
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec3 paint2;
      attribute float vari;
      attribute float ao;
      varying vec3 vNormal;
      varying vec3 vPaint;
      varying vec3 vPaint2;
      varying float vVari;
      varying float vAo;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPaint = color;
        vPaint2 = paint2;
        vVari = vari;
        vAo = ao;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      ${CEL_RAMP_GLSL}
      varying vec3 vNormal;
      varying vec3 vPaint;
      varying vec3 vPaint2;
      varying float vVari;
      varying float vAo;
      void main() {
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float shade = max(dot(normalize(vNormal), L), 0.0) * vAo;
        // The variegation is a scalar per vertex, cut sharply here, so the pattern has crisp
        // feathered edges like the cel bands.
        float w = fwidth(vVari) * 0.75 + 0.01;
        vec3 paint = mix(vPaint, vPaint2, smoothstep(0.5 - w, 0.5 + w, vVari));
        gl_FragColor = vec4(celRamp(shade) * paint, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

/** Extra per-vertex attributes beside the tube writer's. */
function createWriter() {
  const w = createMeshWriter();
  w.paint2 = [];
  w.vari = [];
  w.ao = [];
  return w;
}

/** Pads paint2/vari/ao for vertices written by addTube. */
function fillExtra(w, from, paint2, vari, ao) {
  for (let i = from; i < w.vertexCount; i++) {
    w.paint2.push(paint2.r, paint2.g, paint2.b);
    w.vari.push(typeof vari === 'function' ? vari(i) : vari);
    w.ao.push(typeof ao === 'function' ? ao(i) : ao);
  }
}

const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Grows the layout: stems and, per leaf, node, petiole curve and blade frame. */
function layout(rand, S) {
  const stems = [];
  const nStems = Math.round(range(rand, S.stems[0], S.stems[1] + 0.99) - 0.49);
  const turn = range(rand, 0, Math.PI * 2);
  for (let i = 0; i < nStems; i++) {
    // Clumping: bases in a small disc, stems leaning outward a little (erect).
    const az = turn + (i / nStems) * Math.PI * 2 + range(rand, -0.4, 0.4);
    const r = S.spread * Math.sqrt(range(rand, 0.05, 1));
    const base = new THREE.Vector3(Math.cos(az) * r, -0.01, Math.sin(az) * r);
    const lean = range(rand, 0.06, 0.22);
    const dir = new THREE.Vector3(Math.cos(az) * lean, 1, Math.sin(az) * lean).normalize();
    const length = range(rand, ...S.stemLen);
    const points = [];
    for (let k = 0; k <= 6; k++) {
      // A slight curve inward at the top keeps the clump erect (guess).
      const t = k / 6;
      points.push(base.clone().addScaledVector(dir, length * t).addScaledVector(UP, length * 0.04 * t * t));
    }
    const nLeaves = Math.round(range(rand, S.leaves[0], S.leaves[1] + 0.99) - 0.49);
    // Leaves on the upper part; the lower stem is bare with ring scars ("sugarcane-like").
    const nodes = stratified(rand, nLeaves, 0.12, 1, 0.5).sort((a, b) => a - b);
    let leafAz = range(rand, 0, Math.PI * 2);
    const leaves = nodes.map((t, j) => {
      leafAz += Math.PI + range(rand, -0.5, 0.5) + 0.35; // alternate, two-ranked with a drift (guess)
      const young = j / Math.max(1, nLeaves - 1); // 0 lowest/oldest .. 1 top/youngest
      return {
        t,
        az: leafAz,
        young,
        rise: THREE.MathUtils.lerp(1.0, 0.3, young) + range(rand, -0.12, 0.12), // angle from vertical
        blade: range(rand, ...S.blade) * THREE.MathUtils.lerp(1, 0.8, young),
        width: range(rand, 0.34, 0.44), // 2–3 in wide on 4–8 in (source) ≈ 0.25–0.5
        petiole: range(rand, 0.55, 0.8), // shorter than the blade (source); share is a guess
        droop: THREE.MathUtils.lerp(0.75, 0.3, young) + range(rand, -0.15, 0.15),
        twist: range(rand, -0.25, 0.25),
        tilt: range(rand, -0.1, 0.1),
      };
    });
    stems.push({ base, dir, length, points, leaves, radius: S.stemR * range(rand, 0.85, 1.15) });
  }
  return stems;
}

const _side = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Petiole polyline from the node, arching outward; returns points and the end direction. */
function petiolePath(stem, leaf, steps) {
  const node = stem.points[0].clone().addScaledVector(stem.dir, stem.length * leaf.t).addScaledVector(UP, stem.length * 0.04 * leaf.t * leaf.t);
  const out = new THREE.Vector3(Math.cos(leaf.az), 0, Math.sin(leaf.az));
  const len = leaf.blade * leaf.petiole;
  const pts = [node.clone()];
  const p = node.clone();
  const d = new THREE.Vector3();
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    // Starts close to the stem, opens to `rise` (radians from vertical).
    const a = leaf.rise * (0.55 + 0.45 * t);
    d.copy(UP).multiplyScalar(Math.cos(a)).addScaledVector(out, Math.sin(a)).normalize();
    p.addScaledVector(d, len / steps);
    pts.push(p.clone());
  }
  return { pts, end: p.clone(), dir: d.clone(), out };
}

/** Blade sample (t along 0..1, s across -1..1): position, normal, width factor. */
function bladeFrame(leaf, start, dir0, out, rows) {
  // Spine bends down by `droop` over the length; the blade's side is horizontal-ish.
  _side.crossVectors(dir0, UP);
  if (_side.lengthSq() < 1e-6) _side.crossVectors(dir0, out);
  _side.normalize();
  _q.setFromAxisAngle(dir0, leaf.tilt);
  const side = _side.clone().applyQuaternion(_q);
  const L = leaf.blade;
  const spine = [start.clone()];
  const dirs = [];
  const d = dir0.clone();
  const p = start.clone();
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const dd = dir0.clone().applyAxisAngle(side, -leaf.droop * t * t * 1.2 - leaf.droop * 0.25 * t);
    dirs.push(dd);
    if (i > 0) {
      d.copy(dirs[i - 1]).add(dd).normalize();
      p.addScaledVector(d, L / rows);
      spine.push(p.clone());
    }
  }
  return { spine, dirs, side, L };
}

// Oblong-lanceolate: cuneate base, widest a bit below the middle, acute tip.
const widthAt = (t) => Math.sin(Math.PI * Math.pow(t, 0.72)) ** 0.85 * (1 - 0.15 * t * t);

/** Variegation scalar (>0.5 = light paint) at blade (t, s). Guess pattern after the source's
 *  "banded ... along primary veins": light feathers along curved lateral veins, a light midrib,
 *  green margin and tip. */
function variegation(t, s, veins, phase, amount) {
  const a = Math.abs(s);
  const vein = Math.cos(Math.PI * 2 * ((t - 0.32 * a) * veins + phase));
  // Edge of the light core, in |s|: it swings out along each vein, so the boundary feathers.
  const edge = coreEdge(amount) + 0.12 * vein;
  const ends = THREE.MathUtils.smoothstep(t, 0.03, 0.14) * (1 - THREE.MathUtils.smoothstep(t, 0.72, 0.95));
  let v = (0.5 + (edge - a) * 3) * ends;
  if (a < 0.06 && t > 0.03 && t < 0.92) v = Math.max(v, 0.8);
  return THREE.MathUtils.clamp(v, 0, 1);
}

// AO after the anime-foliage guide: dark low and inside, plus a gradient darkening the side away
// from the sun (weights are guesses).
const _a = new THREE.Vector3();
function aoAt(p, centre, height, young) {
  const h = THREE.MathUtils.clamp(p.y / height, 0, 1);
  _a.subVectors(p, centre).setY(0);
  const out = Math.min(1, _a.length() / (height * 0.5));
  const toward = _a.lengthSq() > 1e-8 ? _a.normalize().dot(FOLIAGE_SUN) * 0.5 + 0.5 : 0.5;
  return 0.45 + 0.3 * h + 0.15 * out + 0.12 * toward + 0.05 * young;
}

const coreEdge = (amount) => 0.15 + 0.4 * amount;

function emitBlade(w, leaf, start, dir0, out, pal, opts, centre, height) {
  const { rows, cols } = opts;
  const f = bladeFrame(leaf, start, dir0, out, rows);
  const W = f.L * leaf.width * 0.5;
  const nrm = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const proxy = new THREE.Vector3();
  const base = w.vertexCount;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const half = W * widthAt(t);
    const faceN = new THREE.Vector3().crossVectors(f.side, f.dirs[i]).normalize();
    if (faceN.y < 0) faceN.negate();
    _q.setFromAxisAngle(f.dirs[i], leaf.twist * t);
    faceN.applyQuaternion(_q);
    const sideT = f.side.clone().applyQuaternion(_q);
    for (let j = 0; j <= cols; j++) {
      const s = (j / cols) * 2 - 1;
      // V fold along the midrib (edges lift) and a soft wave along the margin (guess).
      const lift = opts.fold * Math.abs(s) * half + 0.06 * half * Math.sin(t * 9 + s * 2) * Math.abs(s);
      pos.copy(f.spine[i]).addScaledVector(sideT, s * half).addScaledVector(faceN, lift);
      w.positions.push(pos.x, pos.y, pos.z);
      // Fold normal, then blended with the clump's sphere normal so the plant shades as one mass.
      nrm.copy(faceN).addScaledVector(sideT, -Math.sign(s) * opts.fold * 0.9).normalize();
      proxy.subVectors(pos, centre).normalize();
      nrm.lerp(proxy, 0.7).normalize();
      w.normals.push(nrm.x, nrm.y, nrm.z);
      w.uvs.push(j / cols, t);
      const v = variegation(t, s, opts.veins, opts.phase, opts.amount);
      const g = pal.green;
      w.colors.push(g.r, g.g, g.b);
      const l = Math.abs(s) < 0.08 ? pal.rib : pal.light;
      w.paint2.push(l.r, l.g, l.b);
      w.vari.push(v);
      w.ao.push(aoAt(pos, centre, height, leaf.young));
    }
  }
  const ring = cols + 1;
  let tris = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = base + i * ring + j;
      w.indices.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1);
      tris += 2;
    }
  }
  return tris;
}

/** Far blade: a folded lance of 8 triangles plus one sliver to the node standing in for the petiole. */
function emitFarLeaf(w, leaf, node, start, dir0, out, pal, opts, centre, height) {
  const f = bladeFrame(leaf, start, dir0, out, 3);
  const W = f.L * leaf.width * 0.5;
  const pos = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const proxy = new THREE.Vector3();
  const base = w.vertexCount;
  const push = (p, n, v, light) => {
    w.positions.push(p.x, p.y, p.z);
    proxy.subVectors(p, centre).normalize();
    nrm.copy(n).lerp(proxy, 0.45).normalize();
    w.normals.push(nrm.x, nrm.y, nrm.z);
    w.uvs.push(0, 0);
    w.colors.push(pal.green.r, pal.green.g, pal.green.b);
    w.paint2.push(light.r, light.g, light.b);
    w.vari.push(v);
    w.ao.push(aoAt(p, centre, height, leaf.young));
  };
  const faceAt = (i) => {
    const n = new THREE.Vector3().crossVectors(f.side, f.dirs[i]).normalize();
    return n.y < 0 ? n.negate() : n;
  };
  const pw = W * 0.12;
  push(node, faceAt(0), 0, pal.light); // 0: node
  push(node.clone().addScaledVector(f.side, pw), faceAt(0), 0, pal.light); // 1: node, offset
  push(f.spine[0], faceAt(0), 0.7, pal.rib); // 2: blade base
  for (const i of [1, 2]) {
    const n = faceAt(i);
    const half = W * widthAt(i / 3);
    for (const s of [-1, 0, 1]) {
      pos.copy(f.spine[i]).addScaledVector(f.side, s * half).addScaledVector(n, opts.fold * Math.abs(s) * half);
      // Far colour: the light core of the near pattern, on the midrib only.
      push(pos, n, s === 0 ? opts.farLight : 0, pal.light);
    }
  }
  push(f.spine[3], faceAt(3), 0, pal.light); // 9: tip
  const b = base;
  // Petiole sliver, then rows [3,4,5] (t=1/3) and [6,7,8] (t=2/3).
  w.indices.push(b, b + 1, b + 2);
  w.indices.push(b + 2, b + 3, b + 4, b + 2, b + 4, b + 5);
  w.indices.push(b + 3, b + 6, b + 4, b + 4, b + 6, b + 7, b + 4, b + 7, b + 5, b + 5, b + 7, b + 8);
  w.indices.push(b + 6, b + 9, b + 7, b + 7, b + 9, b + 8);
  return 9;
}

export function createAglaonema({ seed = 1, lod = 'near', size } = {}) {
  const sizeName = size ?? (seed % 3 === 0 ? 'table' : 'floor');
  const S = SIZES[sizeName] ?? SIZES.floor;
  const rand = mulberry32(seed * 7919 + 13);
  const palRaw = PALETTES[Math.floor(rand() * PALETTES.length)];
  const pal = Object.fromEntries(Object.entries(palRaw).map(([k, v]) => [k, k === 'name' ? v : new THREE.Color(v)]));
  const pattern = { veins: Math.round(range(rand, 5, 8)), phase: range(rand, 0, 1), amount: range(rand, 0.35, 0.75) };
  const stems = layout(rand, S);
  const near = lod !== 'far';

  // Clump size for the proxy normals and AO.
  let height = 0;
  for (const st of stems) height = Math.max(height, st.length + S.blade[1] * 0.9);
  const centre = new THREE.Vector3(0, height * 0.45, 0);

  const w = createWriter();
  const stats = { seed, size: sizeName, palette: pal.name, lod: near ? 'near' : 'far', stems: stems.length, leaves: 0, triangles: { stems: 0, leaves: 0 } };
  const stemBase = new THREE.Color(STEM.base);
  const stemBlotch = new THREE.Color(STEM.blotch);
  const stemRing = new THREE.Color(STEM.ring);
  const tmp = new THREE.Color();

  for (const [si, st] of stems.entries()) {
    // Stem: grey-green with silver blotches (source), darker leaf-scar rings low down (guess).
    const from = w.vertexCount;
    const internode = st.length * 0.09;
    const radii = st.points.map((_, k) => st.radius * (1 - 0.35 * (k / (st.points.length - 1))));
    const pts = near ? st.points : [st.points[0], st.points[3], st.points[6]];
    const rr = near ? radii : [radii[0], radii[3], radii[6]];
    const vVals = [];
    stats.triangles.stems += addTube(w, pts, rr, {
      radial: near ? 6 : 3,
      colorAt: (v, u, t) => {
        const ring = near && t < 0.45 && (v / internode) % 1 < 0.14;
        vVals.push(near ? hash(Math.floor(v / (internode * 0.5)) + si * 7, Math.floor(u * 3)) * 0.9 : 0);
        return tmp.copy(ring ? stemRing : stemBase);
      },
    });
    let k = 0;
    fillExtra(w, from, stemBlotch, () => vVals[k++] ?? 0, (i) => 0.4 + 0.4 * THREE.MathUtils.clamp(w.positions[i * 3 + 1] / height, 0, 1));

    for (const leaf of st.leaves) {
      const path = petiolePath(st, leaf, near ? 4 : 2);
      stats.leaves++;
      if (near) {
        const pf = w.vertexCount;
        const pr = path.pts.map((_, i) => st.radius * (0.42 - 0.18 * (i / (path.pts.length - 1))));
        stats.triangles.stems += addTube(w, path.pts, pr, { radial: 3, color: pal.petiole });
        fillExtra(w, pf, pal.petiole, 0, 0.8);
        stats.triangles.leaves += emitBlade(w, leaf, path.end, path.dir, path.out, pal, { rows: 18, cols: 8, fold: 0.14, ...pattern }, centre, height);
      } else {
        stats.triangles.leaves += emitFarLeaf(w, leaf, path.pts[0], path.end, path.dir, path.out, pal, { fold: 0.14, farLight: 0.5 / (1 - coreEdge(pattern.amount)) }, centre, height);
      }
    }
  }

  const geometry = w.toGeometry();
  geometry.setAttribute('paint2', new THREE.Float32BufferAttribute(w.paint2, 3));
  geometry.setAttribute('vari', new THREE.Float32BufferAttribute(w.vari, 1));
  geometry.setAttribute('ao', new THREE.Float32BufferAttribute(w.ao, 1));
  const material = createMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `aglaonema ${near ? 'near' : 'far'}`;
  const group = new THREE.Group();
  group.name = 'aglaonema';
  group.add(mesh);

  stats.triangles.total = geometry.index.count / 3;
  stats.drawCalls = 1;
  stats.bounds = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));

  return {
    group,
    stats,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export const plant = {
  id: 'aglaonema',
  label: 'Chinese evergreen',
  create: createAglaonema,
  switchAt: 8, // guess; tune in the scene
  target: [0, 0.45, 0],
  distance: 2,
  background: '#e4e8e2',
};
