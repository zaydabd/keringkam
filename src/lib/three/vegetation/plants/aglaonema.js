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
//   - the look: leaves textured in code after Cyprien Witkowski's foliage study (see
//     aglaonema/leafTexture.js): a "sculpted" normal map and a painted albedo; hue-shifted
//     cel tones, a rim light and light through the undersides are our interpretation.
// Nothing is copied from any model, texture or image.
//
// create({ seed, lod, size }): size is 'floor' or 'table'. Without it, seeds divisible by 3 give
// the table size, so the seed alone covers both.
// Both levels use one merged mesh and one cel material (1 draw call each). The layout is grown
// once per seed and emitted at two detail levels, so near and far share silhouette and colours.

import * as THREE from 'three';
import { mulberry32, range, stratified } from '../../../utils/rng.js';
import { addTube, createMeshWriter } from '../tube.js';
import { UP } from '../grow.js';
import { FOLIAGE_SUN, toneUniforms } from '../celFoliage.js';
import { createLeafTextures } from './aglaonema/leafTexture.js';
import { sinHash } from '../../../utils/noise.js';

// Sizes in metres (guess except where noted above).
const SIZES = {
  floor: { stems: [5, 7], stemLen: [0.14, 0.42], stemR: 0.016, leaves: [7, 10], blade: [0.22, 0.32], spread: 0.08 },
  table: { stems: [3, 5], stemLen: [0.04, 0.14], stemR: 0.008, leaves: [5, 8], blade: [0.12, 0.18], spread: 0.035 },
};

// Variegation palettes, one picked per seed (all are colours the source lists; shades are guesses).
// deep: leaf base and margin, green: blade, tip: brighter tip, light: variegation, rib: midrib.
const PALETTES = [
  { name: 'silver', deep: '#103a1e', green: '#237a2e', tip: '#6cbf3a', light: '#d3e6c6', rib: '#c3dbad', petiole: '#c8d8b4' },
  { name: 'cream', deep: '#123c1c', green: '#2a7e2c', tip: '#78c23c', light: '#ece9a6', rib: '#e0e29a', petiole: '#e3e2c0' },
  { name: 'pink', deep: '#163c20', green: '#2d7a30', tip: '#74b840', light: '#f3a4b8', rib: '#e8728f', petiole: '#eeb4bf' },
];
const STEM = { base: '#71886a', blotch: '#c3cbb8', ring: '#46553f' };
const UNDERSIDE = '#9cc47f'; // paler underside (guess)

// Cel tones as multipliers on the painted texture: shadow, mid, light. Hue-shifted (cool shadow,
// warm light) for the vibrant look of the foliage study (guess).
const TONES = ['#2b4766', '#86ae9c', '#fff3d6'];

function createMaterial(map, normalMap) {
  return new THREE.ShaderMaterial({
    uniforms: { ...toneUniforms(TONES), map: { value: map }, normalMap: { value: normalMap }, underside: { value: new THREE.Color(UNDERSIDE) } },
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec3 tanU;
      attribute vec3 tanV;
      attribute vec3 face;
      attribute float leafMask;
      attribute float ao;
      varying vec3 vNormal;
      varying vec3 vTanU;
      varying vec3 vTanV;
      varying vec3 vFace;
      varying vec3 vColor;
      varying vec3 vViewPos;
      varying vec2 vUv;
      varying float vLeaf;
      varying float vAo;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vTanU = normalMatrix * tanU;
        vTanV = normalMatrix * tanV;
        vFace = normalMatrix * face;
        vColor = color;
        vUv = uv;
        vLeaf = leafMask;
        vAo = ao;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform sampler2D map;
      uniform sampler2D normalMap;
      uniform vec3 underside;
      uniform vec3 tone0;
      uniform vec3 tone1;
      uniform vec3 tone2;
      varying vec3 vNormal;
      varying vec3 vTanU;
      varying vec3 vTanV;
      varying vec3 vFace;
      varying vec3 vColor;
      varying vec3 vViewPos;
      varying vec2 vUv;
      varying float vLeaf;
      varying float vAo;
      void main() {
        vec3 V = normalize(-vViewPos);
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        vec3 N = normalize(vNormal);
        vec3 albedo = vColor;
        if (vLeaf > 0.5) {
          // Painted texture and "sculpted" relief (normal map in the blade's u/v frame).
          albedo = texture2D(map, vUv).rgb;
          vec3 nm = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
          N = normalize(N + normalize(vTanU) * nm.x + normalize(vTanV) * nm.y);
          // Seen from below: flip and use the paler underside.
          if (dot(normalize(vFace), V) < 0.0) {
            N = reflect(N, normalize(vFace));
            albedo = mix(albedo, underside, 0.6);
          }
        }
        float shade = max(dot(N, L), 0.0) * vAo;
        // Leaves let light through: a seen-from-below blade never drops to the darkest tone (guess).
        if (vLeaf > 0.5 && dot(normalize(vFace), V) < 0.0) shade = max(shade, 0.4 * vAo);
        // Hard cel steps (about one pixel wide), not the soft shared ramp.
        float aa = fwidth(shade) + 0.002;
        vec3 col = mix(tone0, tone1, smoothstep(0.3 - aa, 0.3 + aa, shade));
        col = mix(col, tone2, smoothstep(0.64 - aa, 0.64 + aa, shade)) * albedo;
        // Rim: one solid band on the lit side of the silhouette.
        float rim = (1.0 - abs(dot(N, V))) * (0.4 + 0.6 * max(dot(N, L), 0.0));
        float ra = fwidth(rim) + 0.002;
        col += smoothstep(0.62 - ra, 0.62 + ra, rim) * 0.22 * mix(albedo, vec3(1.0, 0.96, 0.85), 0.6);
        // Hard specular dab on the glossy upper side (leaves only).
        float sp = max(dot(reflect(-L, N), V), 0.0);
        float sa = fwidth(sp) + 0.002;
        col += vLeaf * smoothstep(0.93 - sa, 0.93 + sa, sp) * 0.18 * vAo;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

/** Extra per-vertex attributes beside the tube writer's. */
function createWriter() {
  const w = createMeshWriter();
  w.tanU = [];
  w.tanV = [];
  w.face = [];
  w.leafMask = [];
  w.ao = [];
  return w;
}

/** Pads the extra attributes for vertices written by addTube (not textured). */
function fillExtra(w, from, ao) {
  for (let i = from; i < w.vertexCount; i++) {
    w.tanU.push(0, 0, 0);
    w.tanV.push(0, 0, 0);
    w.face.push(w.normals[i * 3], w.normals[i * 3 + 1], w.normals[i * 3 + 2]);
    w.leafMask.push(0);
    w.ao.push(typeof ao === 'function' ? ao(i) : ao);
  }
}

/** One textured blade vertex. */
function pushLeafVertex(w, pos, nrm, u, v, tu, tv, face, ao) {
  w.positions.push(pos.x, pos.y, pos.z);
  w.normals.push(nrm.x, nrm.y, nrm.z);
  w.uvs.push(u, v);
  w.colors.push(1, 1, 1);
  w.tanU.push(tu.x, tu.y, tu.z);
  w.tanV.push(tv.x, tv.y, tv.z);
  w.face.push(face.x, face.y, face.z);
  w.leafMask.push(1);
  w.ao.push(ao);
}

const hash = sinHash;

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

function emitBlade(w, leaf, start, dir0, out, opts, centre, height) {
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
      // Fold normal, blended with the clump's sphere normal (normal transfer) so the plant
      // shades as one mass; the normal map adds the sculpted relief on top.
      nrm.copy(faceN).addScaledVector(sideT, -Math.sign(s) * opts.fold * 0.9).normalize();
      proxy.subVectors(pos, centre).normalize();
      nrm.lerp(proxy, 0.6).normalize();
      pushLeafVertex(w, pos, nrm, j / cols, t, sideT, f.dirs[i], faceN, aoAt(pos, centre, height, leaf.young));
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

/** Far blade: a folded lance of 8 triangles plus one sliver to the node standing in for the
 *  petiole. Same texture, so the colours match near. */
function emitFarLeaf(w, leaf, node, start, dir0, out, opts, centre, height) {
  const f = bladeFrame(leaf, start, dir0, out, 3);
  const W = f.L * leaf.width * 0.5;
  const pos = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const proxy = new THREE.Vector3();
  const base = w.vertexCount;
  const push = (p, n, u, v) => {
    proxy.subVectors(p, centre).normalize();
    nrm.copy(n).lerp(proxy, 0.6).normalize();
    pushLeafVertex(w, p, nrm, u, v, f.side, f.dirs[Math.min(3, Math.round(v * 3))], n, aoAt(p, centre, height, leaf.young));
  };
  const faceAt = (i) => {
    const n = new THREE.Vector3().crossVectors(f.side, f.dirs[i]).normalize();
    return n.y < 0 ? n.negate() : n;
  };
  const pw = W * 0.12;
  // The petiole sliver samples the pale midrib at the blade base.
  push(node, faceAt(0), 0.5, 0.02); // 0: node
  push(node.clone().addScaledVector(f.side, pw), faceAt(0), 0.5, 0.02); // 1: node, offset
  push(f.spine[0], faceAt(0), 0.5, 0); // 2: blade base
  for (const i of [1, 2]) {
    const n = faceAt(i);
    const half = W * widthAt(i / 3);
    for (const s of [-1, 0, 1]) {
      pos.copy(f.spine[i]).addScaledVector(f.side, s * half).addScaledVector(n, opts.fold * Math.abs(s) * half);
      push(pos, n, (s + 1) / 2, i / 3);
    }
  }
  push(f.spine[3], faceAt(3), 0.5, 1); // 9: tip
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
  const pattern = { veins: Math.round(range(rand, 5, 8)), phase: range(rand, 0, 1), amount: range(rand, 0.2, 0.5) };
  const { map, normalMap } = createLeafTextures(seed, pal, pattern);
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
    stats.triangles.stems += addTube(w, pts, rr, {
      radial: near ? 6 : 3,
      colorAt: (v, u, t) => {
        const ring = near && t < 0.45 && (v / internode) % 1 < 0.14;
        const blotch = near ? hash(Math.floor(v / (internode * 0.5)) + si * 7, Math.floor(u * 3)) : 0.3;
        return tmp.copy(stemBase).lerp(stemBlotch, blotch > 0.55 ? 0.8 : 0.15).lerp(stemRing, ring ? 0.85 : 0);
      },
    });
    fillExtra(w, from, (i) => 0.65 + 0.35 * THREE.MathUtils.clamp(w.positions[i * 3 + 1] / height, 0, 1));

    for (const leaf of st.leaves) {
      const path = petiolePath(st, leaf, near ? 4 : 2);
      stats.leaves++;
      if (near) {
        const pf = w.vertexCount;
        const pr = path.pts.map((_, i) => st.radius * (0.42 - 0.18 * (i / (path.pts.length - 1))));
        stats.triangles.stems += addTube(w, path.pts, pr, { radial: 3, color: pal.petiole });
        fillExtra(w, pf, 0.8);
        stats.triangles.leaves += emitBlade(w, leaf, path.end, path.dir, path.out, { rows: 14, cols: 6, fold: 0.14 }, centre, height);
      } else {
        stats.triangles.leaves += emitFarLeaf(w, leaf, path.pts[0], path.end, path.dir, path.out, { fold: 0.14 }, centre, height);
      }
    }
  }

  const geometry = w.toGeometry();
  geometry.setAttribute('tanU', new THREE.Float32BufferAttribute(w.tanU, 3));
  geometry.setAttribute('tanV', new THREE.Float32BufferAttribute(w.tanV, 3));
  geometry.setAttribute('face', new THREE.Float32BufferAttribute(w.face, 3));
  geometry.setAttribute('leafMask', new THREE.Float32BufferAttribute(w.leafMask, 1));
  geometry.setAttribute('ao', new THREE.Float32BufferAttribute(w.ao, 1));
  const material = createMaterial(map, normalMap);
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
      map.dispose();
      normalMap.dispose();
    },
  };
}

export const plant = {
  id: 'aglaonema',
  label: 'Chinese evergreen',
  create: createAglaonema,
  switchAt: 8, // guess; tune in the scene
  target: [0, 0.36, 0],
  distance: 2,
  background: '#e4e8e2',
};
