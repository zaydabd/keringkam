// Satin pothos (Scindapsus pictus): a stylised procedural houseplant for window-ledge troughs and
// a plant stand. A short mound of leaves at the pot top and strands that trail over the rim.
//
// Sourced facts (NC State Extension Gardener Plant Toolbox,
// https://plants.ces.ncsu.edu/plants/scindapsus-pictus):
//   - "tropical evergreen climbing vine"; indoors "1.5 to 3 feet tall", or it may "trail downward
//     from a hanging basket or pot" → trailing strands over the pot rim.
//   - juvenile leaves "ovate with entire margins and a heart-shaped base", "3 to 4 inches long"
//     (7.6–10 cm) → smooth ovate blade, heart base, blade ≈ 8–10 cm near the pot.
//   - "matte green to dark green" with a "satin texture" and "silver-grayish blotches"; the
//     underside is paler and unmarked → matte cel tones, silver blotches on the front only,
//     a paler, plain back.
// Guesses (stylistic, not sourced): pot rim radius 0.13 m; mound height 0.08–0.22 m; strand
// lengths 0.35–0.95 m; 7 strands; leaf spacing 4.8 cm; leaves alternate and shrink to the tips;
// the exact greens and silver; blotch size and coverage; stem colour; switchAt 8 m.
// Units: metres. Origin: centre of the soil surface. No pot (the scene supplies troughs / pots).
//
// Reuses growHanging/pointAt/taper (grow.js), addTube/createMeshWriter (tube.js),
// createLeafGeometry (leaf.js), createCelLeafMaterial/setCelLeafAttributes (cel-foliage.js) and
// rng.js. Two draw calls per level: stems, and instanced leaves.

import * as THREE from 'three';
import { mulberry32, range, shuffled, stratified } from '../rng.js';
import { addTube, createMeshWriter } from '../tube.js';
import { createLeafGeometry } from '../leaf.js';
import { createCelLeafMaterial, setCelLeafAttributes } from '../cel-foliage.js';
import { UP, growHanging, pointAt, taper } from '../grow.js';

// Ovate blade, heart-shaped base, entire margin, short pointed tip (shape table is a guess).
const SATIN_LEAF_SHAPE = {
  petiole: 0.16,
  lobes: [
    { angle: 0, reach: 1, width: 0.42 },
    { angle: 1.95, reach: 0.7, width: 0.85 },
    { angle: -1.95, reach: 0.7, width: 0.85 },
  ],
  body: 0.56,
  notch: 0.28,
  teeth: 0,
  toothDepth: 0,
  cup: 0.1,
  fold: 0.1,
  segments: 20,
};

// Colours are guesses after "matte green to dark green" with "silver-grayish blotches".
const PAINT = {
  edge: new THREE.Color('#1f4026'),
  blade: new THREE.Color('#27502e'),
  vein: new THREE.Color('#33603a'),
  petiole: new THREE.Color('#5c7a45'),
};
const GREEN_TONES = ['#10261a', '#1f4a2c', '#3a7048']; // shadow → mid → light
const SILVER_TONES = ['#3d4c48', '#7f918b', '#b9c8c2'];
const STEM = new THREE.Color('#5d7c46');

const SPEC = {
  rim: 0.13,
  mound: { stems: 11, height: [0.06, 0.2], leaves: 52, size: [0.11, 0.14] },
  strand: { count: 7, length: [0.35, 0.95], gravity: 0.3, wander: 0.1, step: 0.02, radius: 0.0032, tip: 0.0015 },
  leaf: { spacing: 0.048, size: [0.07, 0.13] },
  near: { radial: 5, stride: 1, segments: 20, leafScale: 1, spacing: 1, moundLeaves: 1 },
  // Far: coarse stems, few big low-poly leaves along the same strands.
  far: { radial: 3, stride: 12, segments: 7, leafScale: 1.6, spacing: 3.6, moundLeaves: 0.25 },
};

// Adds silver blotches (front faces only) and a paler, plain underside to the shared cel leaf
// material. Blotches come from value noise in leaf space, offset per leaf by `instanceSeed`, so
// every leaf differs without extra draw calls. The 3 silver tones use the same ramp steps.
function createSatinLeafMaterial() {
  const material = createCelLeafMaterial({ tones: GREEN_TONES, paintRef: PAINT.blade });
  const [s0, s1, s2] = SILVER_TONES.map((c) => new THREE.Color(c));
  Object.assign(material.uniforms, { silver0: { value: s0 }, silver1: { value: s1 }, silver2: { value: s2 } });
  material.vertexShader = material.vertexShader
    .replace('attribute float instanceAo;', 'attribute float instanceAo;\n      attribute float instanceSeed;\n      varying vec2 vLocal;\n      varying float vSeed;')
    .replace('vAo = instanceAo;', 'vAo = instanceAo;\n        vLocal = position.xy;\n        vSeed = instanceSeed;');
  material.fragmentShader = material.fragmentShader
    .replace(
      'varying float vAo;',
      /* glsl */ `varying float vAo;
      varying vec2 vLocal;
      varying float vSeed;
      uniform vec3 silver0;
      uniform vec3 silver1;
      uniform vec3 silver2;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      vec3 silverRamp(float shade) {
        float w = 0.04;
        vec3 col = mix(silver0, silver1, smoothstep(0.22 - w, 0.22 + w, shade));
        return mix(col, silver2, smoothstep(0.6 - w, 0.6 + w, shade));
      }`,
    )
    .replace(
      'gl_FragColor = vec4(celRamp(shade) * vPaint, 1.0);',
      /* glsl */ `vec3 col = celRamp(shade) * vPaint;
        if (gl_FrontFacing) {
          vec2 q = vLocal * vec2(9.0, 7.0) + vec2(vSeed * 17.0, vSeed * 31.0);
          float n = vnoise(q) * 0.65 + vnoise(q * 2.3) * 0.35;
          // No blotches on the petiole.
          float blot = smoothstep(0.6, 0.64, n) * step(0.22, vLocal.y);
          col = mix(col, silverRamp(shade) * vPaint, blot);
        } else {
          col = mix(col, silverRamp(shade) * vec3(0.75, 0.95, 0.8), 0.35);
        }
        gl_FragColor = vec4(col, 1.0);`,
    );
  return material;
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
  const writer = createMeshWriter();
  const stats = { seed, lod, triangles: { stems: 0, leaves: 0 }, leaves: 0, strands: 0 };

  for (const s of stemPaths) {
    const pts = s.points.filter((_, i) => i % Q.stride === 0 || i === s.points.length - 1);
    const radii = taper(pts.length, s.radii[0], s.radii[s.radii.length - 1]);
    stats.triangles.stems += addTube(writer, pts, radii, { radial: Q.radial, color: STEM });
    if (s.kind === 'strand') stats.strands++;
  }

  // ---- Leaves (placement after hanging-vine.js: blade along y, facing along z).
  const leaves = [];
  const basis = new THREE.Matrix4();
  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();
  const moundCentre = new THREE.Vector3(0, 0.1, 0);
  const place = (root, blade, facing, size, proxy, depth) => {
    y.copy(blade).normalize();
    z.copy(facing).addScaledVector(y, -facing.dot(y));
    if (z.lengthSq() < 1e-4) z.set(0, 0, 1);
    z.normalize();
    x.crossVectors(y, z);
    basis.makeBasis(x, y, z);
    const bright = range(rand, 0.85, 1.08);
    leaves.push({
      position: root.clone(),
      quaternion: new THREE.Quaternion().setFromRotationMatrix(basis),
      scale: size * Q.leafScale,
      tint: new THREE.Color(bright, bright, bright * range(rand, 0.94, 1.02)),
      proxy: proxy.normalize(),
      depth,
      seed: rand(),
    });
  };

  for (const s of stemPaths) {
    const pts = s.points;
    if (s.kind === 'mound') {
      // Leaves on the upper part of each mound stem, blades out and up, faces up and out.
      const n = Math.max(1, Math.round((SPEC.mound.leaves / SPEC.mound.stems) * Q.moundLeaves));
      for (let k = 0; k < n; k++) {
        const t = THREE.MathUtils.lerp(0.6, 1, (k + rand()) / n);
        const at = pointAt(pts, t);
        const side = new THREE.Vector3(range(rand, -0.6, 0.6), 0, range(rand, -0.6, 0.6));
        // Faces out and up, blade outward, so the mound reads as a dome.
        const facing = s.out.clone().addScaledVector(UP, range(rand, 0.5, 1.1));
        const blade = s.out.clone().multiplyScalar(range(rand, 0.7, 1)).add(side).addScaledVector(UP, range(rand, -0.35, 0.45));
        const proxy = at.point.clone().sub(moundCentre).addScaledVector(UP, 0.05);
        place(at.point, blade, facing, range(rand, ...SPEC.mound.size), proxy, Math.min(1, 0.4 + t * 0.6));
      }
      continue;
    }
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += pts[i].distanceTo(pts[i - 1]);
    const spacing = SPEC.leaf.spacing * Q.spacing;
    let side = rand() < 0.5 ? -1 : 1;
    for (let d = range(rand, 0.03, spacing); d < length * 0.98; d += spacing * range(rand, 0.8, 1.2)) {
      const t = d / length;
      side = -side; // alternate (guess)
      const at = pointAt(pts, t);
      const across = new THREE.Vector3().crossVectors(at.tangent, s.out).normalize();
      // Over the rim the blade points out; down the strand it hangs and fans to the sides.
      const hang = THREE.MathUtils.smoothstep(at.point.y, 0.05, -0.1);
      const blade = s.out.clone().multiplyScalar(0.7 - hang * 0.4).addScaledVector(across, side * range(rand, 0.4, 0.9)).addScaledVector(UP, -0.2 - hang * 0.8);
      const facing = s.out.clone().addScaledVector(UP, range(rand, 0.2, 0.6));
      const size = THREE.MathUtils.lerp(SPEC.leaf.size[1], SPEC.leaf.size[0], t ** 0.9) * range(rand, 0.88, 1.12);
      const proxy = s.out.clone().addScaledVector(across, side * 0.4).addScaledVector(UP, 0.3);
      place(at.point, blade, facing, size, proxy, 0.85);
    }
  }

  // ---- Meshes (2 draw calls).
  const group = new THREE.Group();
  group.name = `satin pothos (${lod})`;
  const stemGeometry = writer.toGeometry();
  const stemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const stemMesh = new THREE.Mesh(stemGeometry, stemMaterial);
  stemMesh.name = 'stems';
  group.add(stemMesh);

  const leafGeometry = createLeafGeometry({ ...SATIN_LEAF_SHAPE, segments: Q.segments }, PAINT);
  setCelLeafAttributes(leafGeometry, leaves);
  leafGeometry.setAttribute('instanceSeed', new THREE.InstancedBufferAttribute(Float32Array.from(leaves, (l) => l.seed), 1));
  const leafMaterial = createSatinLeafMaterial();
  const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, leaves.length);
  leafMesh.name = 'leaves';
  const m = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  leaves.forEach((leaf, i) => {
    leafMesh.setMatrixAt(i, m.compose(leaf.position, leaf.quaternion, sc.setScalar(leaf.scale)));
    leafMesh.setColorAt(i, leaf.tint);
  });
  leafMesh.computeBoundingSphere();
  group.add(leafMesh);

  stats.leaves = leaves.length;
  stats.triangles.leaves = (leafGeometry.index.count / 3) * leaves.length;
  stats.triangles.total = stats.triangles.stems + stats.triangles.leaves;
  stats.drawCalls = 2;
  stats.bounds = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));

  return {
    group,
    stats,
    dispose() {
      stemGeometry.dispose();
      stemMaterial.dispose();
      leafGeometry.dispose();
      leafMaterial.dispose();
      leafMesh.dispose();
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
