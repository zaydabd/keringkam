// Rubber plant (Ficus elastica), indoor potted form. Original procedural design, stylised to
// match tree.js (cel-ramp foliage). No model, texture or measurement is copied.
//
// Sourced shape facts:
//   - "broad shiny oval leaves 10–35 cm long and 5–15 cm broad"; 'Robusta' has "broader, stiffer
//     and more upright leaves"; "Small versions of the trees can be grown as houseplants";
//     new leaves grow "inside a sheath at the apical meristem ... the sheath drops off".
//     https://en.wikipedia.org/wiki/Ficus_elastica
//   - leaves "Alternate", "Elliptical", "glossy ... stiff and leathery", "dark green with pink or
//     purple stipules", "Midrib is pale to reddish"; indoors "usually kept to 2 to 10 feet".
//     https://plants.ces.ncsu.edu/plants/ficus-elastica/common-name/indian-rubber-plant/
//
// Stylisation guides followed (method, not shapes):
//   - Sven Mrđen, foliage study: edge gradients so a leaf is not flat, veins as borders between
//     volumes, occlusion near the stem and midrib, a brighter rim, small per-leaf hue shifts.
//     https://www.exp-points.com/sven-mren-foliage-study
//   - Anime foliage pipeline (already used by tree.js): normals from a shared volume, 3-tone ramp.
//     https://trungduyng.substack.com/p/tutorial-blender-anime-foliage-pipeline
//   - Muted colours read better in stylised foliage.
//     https://80.lv/articles/setting-up-trees-bushes-and-flowers-for-a-stylized-3d-environment
//
// Guesses (stylistic or unsourced): 1–3 stems per pot; ~1.5 m total height; the pot and soil;
// leaf length 20–30 cm and width/length 0.46; spiral at the golden angle (sources say only
// "alternate"); short petioles (4–6 cm); lower stem bare; upper leaves more upright, lower ones
// near horizontal; leaves smaller near the tip; stem colours; cel tones; the specular band.
// Units: metres.

import * as THREE from 'three';
import { mulberry32, range } from '../rng.js';
import { addTube, createMeshWriter } from '../tube.js';
import { UP } from '../grow.js';
import { CEL_RAMP_GLSL, toneUniforms } from '../cel-foliage.js';

const POT = { height: 0.26, base: 0.12, top: 0.165 }; // guess
const LEAF = {
  length: [0.22, 0.3], // inside the sourced 10–35 cm
  width: 0.5, // width / length; 0.3 m × 0.5 = 15 cm, the sourced maximum breadth (guess within range)
  petiole: [0.04, 0.06], // guess
  tones: ['#1b3826', '#2f6340', '#5f9a5c'], // guess: muted dark green, no near-black
  midrib: '#a9b98a', // "pale" midrib
};
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const potColor = new THREE.Color('#b5673f');
const potDark = new THREE.Color('#8a4a2c');
const soilColor = new THREE.Color('#3b2a1e');
const sheathColor = new THREE.Color('#c8435e');
const petioleColor = new THREE.Color('#5d7a3a');
const stemLow = new THREE.Color('#6b5a44');
const stemHigh = new THREE.Color('#4f7a3a');
const _c = new THREE.Color();

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
    const base = new THREE.Vector3(main ? 0 : Math.cos(az) * 0.05, POT.height - 0.03, main ? 0 : Math.sin(az) * 0.05);
    const dir = new THREE.Vector3(Math.cos(az) * lean, 1, Math.sin(az) * lean).normalize();
    // A gently bent stem: persistent curvature plus upward pull.
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
    const r0 = main ? 0.024 : 0.018;
    const radii = pts.map((_, i) => r0 + (0.008 - r0) * (i / sections) ** 0.9);
    const tipDir = pts[sections].clone().sub(pts[sections - 1]).normalize();
    stems.push({ pts, radii, tipDir });

    // Leaves: alternate, spiralling up the upper part of the stem.
    const n = Math.round(main ? range(rand, 17, 21) : range(rand, 8, 11));
    const start = range(rand, 0.15, 0.25); // bare lower stem (guess)
    let phase = range(rand, 0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1); // 0 lowest .. 1 at the tip
      const t = start + (0.97 - start) * (1 - (1 - u) ** 1.3); // a little denser near the tip
      const f = t * sections;
      const i = Math.min(sections - 1, Math.floor(f));
      const at = pts[i].clone().lerp(pts[i + 1], f - i);
      const tan = pts[i + 1].clone().sub(pts[i]).normalize();
      phase += GOLDEN + range(rand, -0.15, 0.15);
      // Pitch from the stem axis: upright near the tip, about 50–60° low down, so most blades
      // show their face at eye level instead of an edge ('Robusta': "more upright leaves").
      const pitch = THREE.MathUtils.lerp(1.0, 0.4, u ** 1.2) + range(rand, -0.12, 0.12);
      const side = new THREE.Vector3(Math.cos(phase), 0, Math.sin(phase));
      side.addScaledVector(tan, -side.dot(tan)).normalize();
      const out = tan.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(side, Math.sin(pitch)).normalize();
      const size = range(rand, ...LEAF.length) * (main ? 1 : 0.9) * (u > 0.8 ? THREE.MathUtils.lerp(1, 0.45, (u - 0.8) / 0.2) : 1);
      const petiole = range(rand, ...LEAF.petiole) * (0.6 + 0.4 * size / LEAF.length[1]);
      const radius = THREE.MathUtils.lerp(radii[i], radii[i + 1], f - i);
      const root = at.clone().addScaledVector(side, radius * 0.8);
      const blade = root.clone().addScaledVector(out, petiole);
      // The blade droops a little further than its petiole.
      const fwd = out.clone().addScaledVector(UP, -0.2 * (1 - u)).normalize();
      // Per-leaf hue shift, kept small so the leaves still work together (Mrđen, see top).
      leaves.push({ root, blade, fwd, size, roll: range(rand, -0.45, 0.45), tint: new THREE.Color().setRGB(range(rand, 0.92, 1.06), range(rand, 0.95, 1.06), range(rand, 0.9, 1.02)) });
    }
  }
  return { stems, leaves };
}

/**
 * Leaf as real geometry: base at the origin, along +Y, facing +Z; length 1.
 * `paint` = (midrib weight, edge weight, t along the leaf). Normals are bent outwards across the
 * width so each half of the blade reads as a curved volume with a gradient, not a flat card
 * (Mrđen: a leaf with no gradient "ends up looking flat"; veins are "borders between volumes").
 */
function createRubberLeaf(rows, cols) {
  const pos = [];
  const paint = [];
  const nrm = [];
  const idx = [];
  const half = LEAF.width / 2;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    // Elliptic blade, round base, short point at the tip.
    const w = half * Math.sin(Math.PI * Math.min(1, t * 1.02)) ** 0.62 * (1 - 0.3 * THREE.MathUtils.smoothstep(t, 0.78, 1));
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const x = s * w;
      // Mid column = the midrib. Slight V along it, edges a little down, tip arching down.
      const z = 0.06 * Math.abs(s) * w - 0.2 * s * s * w - 0.16 * t * t;
      pos.push(x, t, z);
      paint.push(c * 2 === cols && t < 0.96 ? 1 : 0, Math.abs(s) ** 3, t);
      // Pillow normal: each half domes from the midrib to its edge; the tip tilts forward.
      const side = Math.sign(s) * Math.min(1, Math.abs(s) * 1.4) ** 0.8;
      nrm.push(side * 0.75, 0.25 * t, 1);
    }
  }
  const row = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * row + c;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('paint', new THREE.Float32BufferAttribute(paint, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.normalizeNormals();
  g.setIndex(idx);
  return g;
}

/** Far leaf: a hexagon outline (4 triangles), same frame and normals as createRubberLeaf. */
function createFarLeaf() {
  const h = LEAF.width / 2;
  const pos = [0, 0, 0, h * 0.85, 0.3, -0.03, h * 0.8, 0.68, -0.1, 0, 1, -0.16, -h * 0.8, 0.68, -0.1, -h * 0.85, 0.3, -0.03];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('paint', new THREE.Float32BufferAttribute([0.3, 0, 0, 0, 1, 0.3, 0, 1, 0.68, 0.3, 0, 1, 0, 1, 0.68, 0, 1, 0.3], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0.75, 0.1, 1, 0.75, 0.2, 1, 0, 0.25, 1, -0.75, 0.2, 1, -0.75, 0.1, 1], 3));
  g.normalizeNormals();
  g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
  return g;
}

/**
 * Cel leaf material for an InstancedMesh: the leaf's own normal through the shared 3-tone ramp,
 * a pale midrib, and a hard-edged specular band for the glossy look (the band is a stylistic
 * choice, not in cel-foliage.js). Back faces are a little lighter and matte.
 */
function createGlossyLeafMaterial(crownCentre, crownHalf) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...toneUniforms(LEAF.tones),
      midTone: { value: new THREE.Color(LEAF.midrib) },
      crownCentre: { value: crownCentre },
      crownHalf: { value: crownHalf },
    },
    vertexShader: /* glsl */ `
      attribute vec3 paint;
      uniform vec3 crownCentre;
      uniform vec3 crownHalf;
      varying vec3 vNormal;
      varying vec3 vCrown;
      varying vec3 vView;
      varying vec3 vTint;
      varying vec3 vPaint;
      varying float vDepth;
      void main() {
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * world;
        vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        // Crown-volume normal (as tree.js): leaves on the sunny side of the plant light up as
        // one shape, leaves inside and behind fall into the shadow tone.
        vec3 q = (world.xyz - crownCentre) / crownHalf;
        vDepth = clamp(length(q), 0.0, 1.0);
        vCrown = normalize(mat3(viewMatrix) * normalize(q + vec3(0.0, 0.25, 0.0)));
        vView = -mv.xyz;
        vTint = instanceColor;
        vPaint = paint;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform vec3 midTone;
      ${CEL_RAMP_GLSL}
      varying vec3 vNormal;
      varying vec3 vCrown;
      varying vec3 vView;
      varying vec3 vTint;
      varying vec3 vPaint;
      varying float vDepth;
      void main() {
        vec3 leafN = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 N = normalize(mix(leafN, vCrown, 0.45));
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        // AO: darker deep in the plant and at the blade base by the stem (Mrđen: occlusion
        // "near the stem and along the middle").
        float ao = (0.72 + 0.28 * vDepth) * (0.8 + 0.2 * smoothstep(0.0, 0.3, vPaint.z));
        float shade = (max(dot(N, L), 0.0) * 0.8 + 0.12) * ao;
        vec3 col = celRamp(shade) * vTint;
        // Light catching the rim ("brightness right at the border").
        col *= 1.0 + 0.18 * vPaint.y;
        col = mix(col, midTone * (0.5 + 0.5 * shade), smoothstep(0.55, 0.95, vPaint.x) * 0.7);
        if (gl_FrontFacing) {
          vec3 H = normalize(L + normalize(vView));
          float spec = smoothstep(0.93, 0.95, dot(leafN, H));
          col += vec3(0.2, 0.24, 0.2) * spec;
        } else {
          col *= vec3(1.12, 1.16, 1.04);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

function potAndSoil(writer, radial) {
  // Built top → bottom so the end cap closes the base and the top stays open over the soil.
  const h = POT.height;
  const pts = [new THREE.Vector3(0, h, 0), new THREE.Vector3(0, h - 0.035, 0), new THREE.Vector3(0, 0, 0)];
  const radii = [POT.top + 0.012, POT.top + 0.012, POT.base];
  let tris = addTube(writer, pts, radii, { radial, colorAt: (v) => (v < 0.04 ? potDark : potColor) });
  const soil = [new THREE.Vector3(0, h - 0.06, 0), new THREE.Vector3(0, h - 0.03, 0)];
  tris += addTube(writer, soil, [POT.top - 0.01, POT.top - 0.005], { radial, color: soilColor });
  return tris;
}

const stemColor = (v, u, t) => _c.copy(stemLow).lerp(stemHigh, THREE.MathUtils.smoothstep(t, 0.3, 0.9));

function createRubberPlant({ seed = 1, lod = 'near' } = {}) {
  const near = lod !== 'far';
  const { stems, leaves } = layout(seed);
  const writer = createMeshWriter();
  let stemTris = potAndSoil(writer, near ? 20 : 8);

  for (const s of stems) {
    if (near) {
      stemTris += addTube(writer, s.pts, s.radii, { radial: 8, colorAt: stemColor });
      // The pink-red sheath (stipule) around the next leaf at the growing tip.
      const tip = s.pts[s.pts.length - 1];
      const r = s.radii[s.radii.length - 1];
      const sheath = [0, 0.35, 0.7, 1].map((k) => tip.clone().addScaledVector(s.tipDir, k * 0.08));
      stemTris += addTube(writer, sheath, [r * 1.1, r * 1.25, r * 0.8, 0.0005], { radial: 6, color: sheathColor });
    } else {
      // Every fourth point, three sides.
      const keep = s.pts.map((_, i) => i).filter((i) => i % 4 === 0 || i === s.pts.length - 1);
      stemTris += addTube(writer, keep.map((i) => s.pts[i]), keep.map((i) => s.radii[i] * 1.3), { radial: 3, colorAt: stemColor });
    }
  }
  if (near) {
    for (const l of leaves) {
      stemTris += addTube(writer, [l.root, l.root.clone().lerp(l.blade, 0.5), l.blade], [0.0045, 0.004, 0.0035], { radial: 3, color: petioleColor });
    }
  }

  const group = new THREE.Group();
  group.name = `rubber plant (${near ? 'near' : 'far'})`;
  const stemGeometry = writer.toGeometry();
  const stemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const stemMesh = new THREE.Mesh(stemGeometry, stemMaterial);
  stemMesh.name = 'stems';
  group.add(stemMesh);

  const leafGeometry = near ? createRubberLeaf(12, 6) : createFarLeaf();
  // Crown volume from the leaves alone (the same for both levels, so they shade alike).
  const crown = new THREE.Box3();
  for (const l of leaves) crown.expandByPoint(l.blade).expandByPoint(l.blade.clone().addScaledVector(l.fwd, l.size));
  const crownHalf = crown.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const leafMaterial = createGlossyLeafMaterial(crown.getCenter(new THREE.Vector3()), crownHalf);
  const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, leaves.length);
  leafMesh.name = 'leaves';
  const m = new THREE.Matrix4();
  const x = new THREE.Vector3();
  const z = new THREE.Vector3();
  const y = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const box = new THREE.Box3();
  leaves.forEach((l, i) => {
    y.copy(l.fwd);
    x.crossVectors(y, UP).normalize();
    z.crossVectors(x, y).normalize();
    m.makeBasis(x, y, z);
    q.setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.roll));
    // Far leaves a touch larger so the thinner outline keeps the same mass.
    const s = l.size * (near ? 1 : 1.08);
    m.compose(l.blade, q, sc.set(s, s, s));
    leafMesh.setMatrixAt(i, m);
    leafMesh.setColorAt(i, l.tint);
    box.expandByPoint(l.blade.clone().addScaledVector(y, s));
  });
  leafMesh.computeBoundingSphere();
  group.add(leafMesh);

  stemGeometry.computeBoundingBox();
  box.union(stemGeometry.boundingBox);
  const leafTris = (leafGeometry.index.count / 3) * leaves.length;
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
      leafMesh.dispose();
    },
  };
}

export const plant = {
  id: 'rubberPlant',
  label: 'Rubber plant',
  create: createRubberPlant,
  switchAt: 8, // guess, tuned on the preview
  target: [0, 0.8, 0],
  distance: 3,
  // background: unset, so the preview's default light grey is used (light UI text stays readable).
};
