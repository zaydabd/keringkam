// Satin pothos (Scindapsus pictus): a stylised procedural houseplant for window-ledge troughs and
// a plant stand. A short mound of leaves at the pot top and strands that trail over the rim.
//
// Sourced facts (NC State Extension Gardener Plant Toolbox,
// https://plants.ces.ncsu.edu/plants/scindapsus-pictus):
//   - "tropical evergreen climbing vine"; indoors "1.5 to 3 feet tall", or it may "trail downward
//     from a hanging basket or pot" → trailing strands over the pot rim.
//   - juvenile leaves "ovate with entire margins and a heart-shaped base", "3 to 4 inches long"
//     (7.6–10 cm) → smooth ovate leaf cut-out with a heart base; card ≈ 9 cm.
//   - "matte green to dark green" with a "satin texture" and "silver-grayish blotches" → matte
//     dark-green cel tones with silver blotches in the leaf cut-out.
//
// Foliage follows the same stylised method as tree.js (research/CREDITS.md, "Stylised foliage
// method", the Substack anime-foliage pipeline), copied here because tree.js does not export it:
//   - foliage is round clumps of camera-facing leaf cards (card ≈ one leaf);
//   - card count per clump = density · 4πr² / card²; most cards on the shell, a sparse fill inside;
//   - per-corner normals from the clump centre, blended with the crown normal (normal transfer);
//   - diffuse N·L → 3-tone colour ramp, × AO (deep clumps and the side away from the sun darker);
//   - a single alpha cut-out (here: an ovate, heart-based leaf with silver blotches); no translucency.
// Guesses (stylistic, not sourced): pot rim radius 0.13 m; mound height 0.06–0.2 m; 7 strands of
// 0.35–0.95 m; clump sizes and spacing; the greens and silver; blotch size; switchAt 8 m.
// Units: metres. Origin: centre of the soil surface. No pot (the scene supplies troughs / pots).
// Near: stems + cards (2 draw calls). Far: bigger, fewer cards on fewer clumps, no stems (1 call).

import * as THREE from 'three';
import { mulberry32, range, shuffled, stratified } from '../rng.js';
import { addTube, createMeshWriter } from '../tube.js';
import { bladeRadius } from '../leaf.js';
import { CEL_RAMP_GLSL, FOLIAGE_SUN, toneUniforms } from '../cel-foliage.js';
import { UP, growHanging, pointAt, taper } from '../grow.js';

// Ovate blade, heart-shaped base, entire margin (shape table: guess, in leaf.js's format).
const SATIN_LEAF_SHAPE = {
  lobes: [
    { angle: 0, reach: 1, width: 0.5 },
    { angle: 2.0, reach: 0.72, width: 0.9 },
    { angle: -2.0, reach: 0.72, width: 0.9 },
  ],
  body: 0.6,
  notch: 0.3,
  teeth: 0,
  toothDepth: 0,
};

const TONES = ['#12301e', '#2e6a3f', '#74ad7c']; // shadow → mid → light (guess)
const SILVER = ['#45574f', '#8ea79c', '#d3e2da']; // silver blotches, same ramp steps (guess)
const STEM = new THREE.Color('#4f7440');

const SPEC = {
  rim: 0.13,
  mound: { stems: 11, height: [0.06, 0.2] },
  strand: { count: 7, length: [0.35, 0.95], gravity: 0.3, wander: 0.1, step: 0.02, radius: 0.0032, tip: 0.0015 },
  // mound: dome clumps at the mound stem tips (tree.js's clump rule: count = density·4πr²/card²).
  // strand: one small clump per leaf node, `spacing` metres apart, `cards` leaves per node from the
  // top to the tip, card size from the top to the tip. All values: guesses.
  near: {
    stems: true,
    mound: { radius: 0.09, merge: 0.9, density: 1.6, card: 0.11, minCards: 10 },
    strand: { radius: 0.02, spacing: 0.065, cards: [3, 1.5], card: [0.1, 0.055] },
  },
  far: {
    stems: false,
    mound: { radius: 0.11, merge: 1.6, density: 0.8, card: 0.17, minCards: 6 },
    strand: { radius: 0.025, spacing: 0.1, cards: [2.2, 1.2], card: [0.14, 0.09] },
  },
};

// ---- Leaf cut-out atlas (2×2 variants). R: tone, G: silver blotch, A: cut-out. Original and
// procedural, like tree.js's stroke mask: no downloaded texture.
function createLeafAtlas(seed, cell = 128) {
  const size = cell * 2;
  const data = new Uint8Array(size * size * 4);
  const rand = mulberry32(seed * 31 + 5);
  const hash = (x, y, k) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x, y, k) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let fx = x - ix;
    let fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = THREE.MathUtils.lerp(hash(ix, iy, k), hash(ix + 1, iy, k), fx);
    const b = THREE.MathUtils.lerp(hash(ix, iy + 1, k), hash(ix + 1, iy + 1, k), fx);
    return THREE.MathUtils.lerp(a, b, fy);
  };
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * cell;
    const oy = Math.floor(k / 2) * cell;
    const shift = [range(rand, 0, 50), range(rand, 0, 50)];
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        // Leaf space: tip towards +v, blade centre a little below the cell centre.
        const u = ((x + 0.5) / cell - 0.5) / 0.44;
        const v = ((y + 0.5) / cell - 0.46) / 0.44;
        const r = Math.hypot(u, v);
        const phi = Math.atan2(u, v);
        const rb = bladeRadius(phi, SATIN_LEAF_SHAPE).r;
        const inside = r < rb;
        const edge = r / Math.max(rb, 1e-3);
        const midrib = Math.abs(u) < 0.025 && v > -0.6 ? 0.1 : 0;
        const tone = 0.84 + 0.16 * (1 - edge) + midrib;
        const n = noise(u * 4.5 + shift[0], v * 4.5 + shift[1], k) * 0.65 + noise(u * 10 + shift[1], v * 10 + shift[0], k) * 0.35;
        const blot = inside && edge < 0.9 && Math.abs(u) > 0.04 && n > 0.66;
        const i = ((oy + y) * size + ox + x) * 4;
        data[i] = Math.min(255, 255 * tone);
        data[i + 1] = blot ? 255 : 0;
        data[i + 2] = 0;
        data[i + 3] = inside ? 255 : 0;
      }
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ---- Clump card material: tree.js's createClumpMaterial plus the silver ramp for the blotches.
function createClumpMaterial(map) {
  const [s0, s1, s2] = SILVER.map((c) => new THREE.Color(c));
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, ...toneUniforms(TONES), silver0: { value: s0 }, silver1: { value: s1 }, silver2: { value: s2 } },
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute vec3 centre;
      attribute vec3 color;
      attribute float ao;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vTint;
      varying float vAo;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xy += corner;
        gl_Position = projectionMatrix * mv;
        // Per-corner normal: from the clump centre to this corner, blended with the crown normal.
        vec3 c = (modelViewMatrix * vec4(centre, 1.0)).xyz;
        vNormal = normalize(normalize(mv.xyz - c) * 0.75 + normalize(normalMatrix * normal) * 0.25);
        vUv = uv;
        vTint = color;
        vAo = ao;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 sunDir;
      uniform vec3 silver0;
      uniform vec3 silver1;
      uniform vec3 silver2;
      ${CEL_RAMP_GLSL}
      vec3 silverRamp(float shade) {
        float w = 0.04;
        vec3 col = mix(silver0, silver1, smoothstep(0.22 - w, 0.22 + w, shade));
        return mix(col, silver2, smoothstep(0.6 - w, 0.6 + w, shade));
      }
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vTint;
      varying float vAo;
      void main() {
        vec4 tex = texture2D(map, vUv);
        if (tex.a < 0.5) discard;
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float shade = max(dot(normalize(vNormal), L), 0.0) * vAo;
        vec3 col = mix(celRamp(shade), silverRamp(shade), step(0.5, tex.g));
        gl_FragColor = vec4(col * vTint * tex.r, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

/** Stem paths, shared by both levels so far keeps near's silhouette. */
function growStems(seed) {
  const rand = mulberry32(seed);
  const S = SPEC.strand;
  const stems = [];

  // Mound: short stems that rise from the soil and lean out (guess: heights, lean).
  const M = SPEC.mound;
  const moundAz = shuffled(rand, Array.from({ length: M.stems }, (_, i) => (i / M.stems) * Math.PI * 2 + range(rand, -0.3, 0.3)));
  for (const az of moundAz) {
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const base = out.clone().multiplyScalar(range(rand, 0, 0.05));
    const h = range(rand, ...M.height);
    const lean = range(rand, 0.25, 0.8);
    const curve = new THREE.QuadraticBezierCurve3(base, base.clone().addScaledVector(UP, h * 0.6), base.clone().addScaledVector(UP, h).addScaledVector(out, h * lean));
    const points = curve.getSpacedPoints(Math.max(4, Math.ceil(curve.getLength() / S.step)));
    stems.push({ kind: 'mound', points, out, radii: taper(points.length, S.radius * 1.2, S.tip) });
  }

  // Trailing strands: arch from the soil over the rim, then hang (growHanging).
  const turn = range(rand, 0, Math.PI * 2);
  const slots = stratified(rand, S.count, 0, 1);
  for (let i = 0; i < S.count; i++) {
    const az = turn + slots[i] * Math.PI * 2;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const base = out.clone().multiplyScalar(range(rand, 0.02, 0.06));
    const rimPt = out.clone().multiplyScalar(SPEC.rim + range(rand, 0, 0.02)).setY(range(rand, 0.02, 0.05));
    const arch = new THREE.QuadraticBezierCurve3(base, base.clone().lerp(rimPt, 0.5).setY(range(rand, 0.06, 0.1)), rimPt);
    const head = arch.getSpacedPoints(Math.max(4, Math.ceil(arch.getLength() / S.step)));
    const dir = out.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, -0.4, 0));
    const tail = growHanging(rand, rimPt, dir, { step: S.step, gravity: S.gravity, wander: S.wander, length: range(rand, ...S.length) });
    const points = head.concat(tail.slice(1));
    stems.push({ kind: 'strand', points, out, radii: taper(points.length, S.radius, S.tip) });
  }
  return stems;
}

function build({ seed = 1, lod = 'near' } = {}) {
  const Q = SPEC[lod] ?? SPEC.near;
  const stemPaths = growStems(seed);
  const rand = mulberry32(seed * 7919 + 13);
  const stats = { seed, lod, triangles: { stems: 0, leaves: 0 }, leaves: 0, clumps: 0 };
  const group = new THREE.Group();
  group.name = `satin pothos (${lod})`;
  const disposables = [];

  // ---- Stems (near only: at far they are under a pixel wide).
  if (Q.stems) {
    const writer = createMeshWriter();
    for (const s of stemPaths) {
      stats.triangles.stems += addTube(writer, s.points, s.radii, { radial: 4, color: STEM });
    }
    const geometry = writer.toGeometry();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'stems';
    group.add(mesh);
    disposables.push(geometry, material);
  }

  // ---- Clump centres: one at each mound stem tip (close ones merge), and a chain down each
  // strand that shrinks towards the tip, pushed a little outward (leaves face away from the pot).
  const clumps = [];
  const M = Q.mound;
  for (const s of stemPaths) {
    if (s.kind !== 'mound') continue;
    const c = s.points[s.points.length - 1].clone().addScaledVector(UP, M.radius * 0.2);
    const r = M.radius * range(rand, 0.85, 1.15);
    if (clumps.some((o) => o.c.distanceTo(c) < (o.r + r) * 0.5 * M.merge)) continue;
    const count = Math.max(M.minCards, Math.round((M.density * 4 * Math.PI * r * r) / (M.card * M.card)));
    clumps.push({ c, r, count, card: M.card, hang: false });
  }
  for (const s of stemPaths) {
    if (s.kind !== 'strand') continue;
    const pts = s.points;
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += pts[i].distanceTo(pts[i - 1]);
    const N = Q.strand;
    for (let d = range(rand, 0.02, N.spacing); d < length; d += N.spacing * range(rand, 0.8, 1.2)) {
      const t = d / length;
      const at = pointAt(pts, t);
      const count = Math.max(1, Math.round(THREE.MathUtils.lerp(N.cards[0], N.cards[1], t) + range(rand, -0.5, 0.5)));
      const card = THREE.MathUtils.lerp(N.card[0], N.card[1], t ** 0.8);
      // Leaves sit a little outward of the strand (they face away from the pot).
      clumps.push({ c: at.point.clone().addScaledVector(s.out, card * 0.25), r: N.radius, count, card, hang: true });
    }
  }

  // ---- Cards (tree.js method).
  const crown = new THREE.Box3();
  for (const { c, r } of clumps) crown.expandByPoint(c.clone().addScalar(r)).expandByPoint(c.clone().subScalar(r));
  const crownCentre = crown.getCenter(new THREE.Vector3());
  const half = crown.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const positions = [];
  const normals = [];
  const uvs = [];
  const corners = [];
  const centreAttr = [];
  const colors = [];
  const aos = [];
  const indices = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const cn = new THREE.Vector3();
  const q = new THREE.Vector3();
  const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  let cards = 0;
  for (const { c, r, count, card, hang } of clumps) {
    const hue = range(rand, 0.92, 1.06);
    cn.copy(c).sub(crownCentre).divide(half);
    const depth = Math.min(1, cn.length());
    const away = cn.lengthSq() > 1e-6 ? cn.normalize().dot(FOLIAGE_SUN) * 0.5 + 0.5 : 0.5;
    const clumpAo = 0.6 + 0.25 * depth + 0.15 * away;
    for (let k = 0; k < count; k++) {
      const zz = range(rand, -1, 1);
      const az = range(rand, 0, Math.PI * 2);
      const sn = Math.sqrt(1 - zz * zz);
      n.set(sn * Math.cos(az), zz, sn * Math.sin(az));
      const shell = rand() < 0.85 ? range(rand, 0.82, 1) : range(rand, 0.3, 0.82);
      p.copy(c).addScaledVector(n, r * shell);
      // Strand leaves hang tip-down (roll ≈ π); mound leaves point any way but mostly up and out.
      const roll = hang ? Math.PI + range(rand, -0.9, 0.9) : range(rand, -1.6, 1.6);
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      const size = card * range(rand, 0.8, 1.2);
      const tint = hue * range(rand, 0.93, 1.07);
      const ao = clumpAo * (0.7 + 0.3 * shell);
      const variant = Math.floor(rand() * 4);
      const u0 = (variant % 2) * 0.5;
      const v0 = Math.floor(variant / 2) * 0.5;
      const base = positions.length / 3;
      q.copy(p).sub(crownCentre).divide(half).normalize();
      for (const [u, v] of CORNERS) {
        positions.push(p.x, p.y, p.z);
        corners.push((u * cr - v * sr) * size, (u * sr + v * cr) * size);
        centreAttr.push(c.x, c.y, c.z);
        normals.push(q.x, q.y, q.z);
        uvs.push(u0 + (u + 0.5) * 0.5, v0 + (v + 0.5) * 0.5);
        colors.push(tint, tint, tint);
        aos.push(ao);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      cards++;
    }
  }

  const leafGeometry = new THREE.BufferGeometry();
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  leafGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  leafGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  leafGeometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
  leafGeometry.setAttribute('centre', new THREE.Float32BufferAttribute(centreAttr, 3));
  leafGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  leafGeometry.setAttribute('ao', new THREE.Float32BufferAttribute(aos, 1));
  leafGeometry.setIndex(indices);
  leafGeometry.computeBoundingSphere();
  leafGeometry.boundingSphere.radius += M.card * 1.7;
  const atlas = createLeafAtlas(seed);
  const leafMaterial = createClumpMaterial(atlas);
  const leafMesh = new THREE.Mesh(leafGeometry, leafMaterial);
  leafMesh.name = 'leaves';
  group.add(leafMesh);
  disposables.push(leafGeometry, leafMaterial, atlas);

  stats.leaves = cards;
  stats.clumps = clumps.length;
  stats.triangles.leaves = indices.length / 3;
  stats.triangles.total = stats.triangles.stems + stats.triangles.leaves;
  stats.drawCalls = group.children.length;
  stats.bounds = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));

  return {
    group,
    stats,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

export const plant = {
  id: 'satinPothos',
  label: 'Satin pothos',
  create: build,
  switchAt: 8, // guess; tune in the scene
  target: [0, -0.25, 0],
  distance: 2.5,
  background: '#dcdcdc',
};
