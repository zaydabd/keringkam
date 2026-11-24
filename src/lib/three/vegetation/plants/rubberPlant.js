// Rubber plant (Ficus elastica), indoor potted form. Original procedural design. No model,
// texture or measurement is copied from anywhere. Two looks for review, picked with `style`
// (or `&style=` in the preview URL): 'chunky' and 'painterly'.
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
// Looks (general method only, nothing copied):
//   - chunky: after the finished image of Polygon Runway's stylised plant tutorial: few, big,
//     puffy, smooth-shaded leaves, bright green, a large soft highlight.
//     https://www.blendernation.com/2024/08/21/stylized-plant-tutorial/
//   - painterly: after Sven Mrđen's foliage study: edge gradients so a leaf is not flat, veins
//     as "borders between individual volumes", darker "near the stem and along the middle",
//     brightness "right at the border", per-leaf hue shifts, darker base with lighter details.
//     https://www.exp-points.com/sven-mren-foliage-study
//   - both: normals pulled towards one crown volume so light and shadow group into big shapes,
//     as in the anime foliage pipeline used by tree.js.
//     https://trungduyng.substack.com/p/tutorial-blender-anime-foliage-pipeline
//
// Guesses (stylistic or unsourced): 1–3 stems per pot; ~1.5 m total height; the pot and soil;
// spiral at the golden angle (sources say only "alternate"); short petioles (4–6 cm); bare lower
// stem; leaf angles; smaller leaves near the tip; lateral vein lines (painterly); all colours;
// the highlight; chunky leaves up to 19 cm broad (exaggerated past the sourced 15 cm on purpose).
// Units: metres.

import * as THREE from 'three';
import { mulberry32, range } from '../rng.js';
import { addTube, createMeshWriter } from '../tube.js';
import { UP } from '../grow.js';
import { toneUniforms } from '../cel-foliage.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Per-look settings. All design choices except where the header cites a source.
const STYLES = {
  chunky: {
    leaves: { main: [10, 13], side: [5, 7] },
    length: [0.27, 0.34],
    width: 0.56,
    puff: 0.09, // dome height of the blade, share of its length
    tones: ['#17583f', '#2a8f5c', '#5cc47c'],
    midrib: '#bfe6b0',
    soft: 0.16, // ramp step softness
    crown: 0.35, // pull towards the crown normal
    spec: [0.8, 0.93, 0.22], // highlight: smoothstep edges, strength
    rim: 0.12,
    veins: 0,
    brush: 0,
    hue: 0.05,
    stem: 1.35, // stem radius scale
    pot: { color: '#d17d4d', dark: '#a85d34', radial: 28 },
  },
  painterly: {
    leaves: { main: [17, 21], side: [8, 11] },
    length: [0.22, 0.3],
    width: 0.5,
    puff: 0.035,
    tones: ['#22381f', '#47672f', '#86a650'],
    midrib: '#dcd79c',
    soft: 0.07,
    crown: 0.5,
    spec: [0.94, 0.965, 0.14],
    rim: 0.3,
    veins: 0.22,
    brush: 0.16,
    hue: 0.1,
    stem: 1,
    pot: { color: '#b5673f', dark: '#8a4a2c', radial: 20 },
  },
};

const POT = { height: 0.26, base: 0.12, top: 0.165 }; // guess
const PETIOLE = [0.04, 0.06]; // guess
const soilColor = new THREE.Color('#3b2a1e');
const sheathColor = new THREE.Color('#c8435e');
const petioleColor = new THREE.Color('#5d7a3a');
const stemLow = new THREE.Color('#6b5a44');
const stemHigh = new THREE.Color('#4f7a3a');
const _c = new THREE.Color();

/** Seeded layout shared by both levels, so near and far are the same plant. */
function layout(seed, S) {
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
    const r0 = (main ? 0.024 : 0.018) * S.stem;
    const r1 = 0.008 * S.stem;
    const radii = pts.map((_, i) => r0 + (r1 - r0) * (i / sections) ** 0.9);
    const tipDir = pts[sections].clone().sub(pts[sections - 1]).normalize();
    stems.push({ pts, radii, tipDir });

    // Leaves: alternate, spiralling up the upper part of the stem.
    const n = Math.round(range(rand, ...(main ? S.leaves.main : S.leaves.side)));
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
      // show their face at eye level ('Robusta': "more upright leaves").
      const pitch = THREE.MathUtils.lerp(1.0, 0.4, u ** 1.2) + range(rand, -0.12, 0.12);
      const side = new THREE.Vector3(Math.cos(phase), 0, Math.sin(phase));
      side.addScaledVector(tan, -side.dot(tan)).normalize();
      const out = tan.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(side, Math.sin(pitch)).normalize();
      const size = range(rand, ...S.length) * (main ? 1 : 0.9) * (u > 0.8 ? THREE.MathUtils.lerp(1, 0.45, (u - 0.8) / 0.2) : 1);
      const petiole = range(rand, ...PETIOLE) * (0.6 + 0.4 * size / S.length[1]);
      const radius = THREE.MathUtils.lerp(radii[i], radii[i + 1], f - i);
      const root = at.clone().addScaledVector(side, radius * 0.8);
      const blade = root.clone().addScaledVector(out, petiole);
      const fwd = out.clone().addScaledVector(UP, -0.2 * (1 - u)).normalize();
      const h = S.hue;
      const tint = new THREE.Color().setRGB(range(rand, 1 - h, 1 + h * 0.6), range(rand, 1 - h * 0.5, 1 + h * 0.6), range(rand, 1 - h, 1 + h * 0.2));
      leaves.push({ root, blade, fwd, size, roll: range(rand, -0.45, 0.45), tint });
    }
  }
  return { stems, leaves };
}

/**
 * Leaf as real geometry: base at the origin, along +Y, facing +Z; length 1.
 * A domed top surface and a flatter underside, so the blade has thickness edge-on.
 * `paint` = (midrib weight, edge weight, t along the leaf, s across it −1..1).
 */
function createRubberLeaf(S, rows, cols) {
  const pos = [];
  const paint = [];
  const nrm = [];
  const idx = [];
  const half = S.width / 2;
  const row = cols + 1;
  for (const face of [1, -1]) {
    const base = pos.length / 3;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      // Elliptic blade, round base, short point at the tip.
      const w = half * Math.sin(Math.PI * Math.min(1, t * 1.02)) ** 0.62 * (1 - 0.3 * THREE.MathUtils.smoothstep(t, 0.78, 1));
      const along = Math.sin(Math.PI * t) ** 0.7;
      for (let c = 0; c <= cols; c++) {
        const s = (c / cols) * 2 - 1;
        const x = s * w;
        const dome = S.puff * (1 - s * s) * along * (face > 0 ? 1 : 0.35);
        // Edges a little down, tip arching down; the dome above (or below) the mid surface.
        const z = -0.2 * s * s * w - 0.16 * t * t + face * dome;
        pos.push(x, t, z);
        paint.push(c * 2 === cols && t < 0.96 ? 1 : 0, Math.abs(s) ** 3, t, s);
        // Pillow normal: each half domes from the midrib to its edge; the tip tilts forward.
        const sideN = Math.sign(s) * Math.min(1, Math.abs(s) * 1.4) ** 0.8;
        nrm.push(sideN * (0.6 + 4 * S.puff), 0.25 * t, face);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = base + r * row + c;
        if (face > 0) idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
        else idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('paint', new THREE.Float32BufferAttribute(paint, 4));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.normalizeNormals();
  g.setIndex(idx);
  return g;
}

/** Far leaf: a hexagon outline (4 triangles), same frame and normals as createRubberLeaf. */
function createFarLeaf(S) {
  const h = S.width / 2;
  const pos = [0, 0, 0, h * 0.85, 0.3, -0.03, h * 0.8, 0.68, -0.1, 0, 1, -0.16, -h * 0.8, 0.68, -0.1, -h * 0.85, 0.3, -0.03];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('paint', new THREE.Float32BufferAttribute([0.3, 0, 0, 0, 0, 1, 0.3, 1, 0, 1, 0.68, 1, 0.3, 0, 1, 0, 0, 1, 0.68, -1, 0, 1, 0.3, -1], 4));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0.75, 0.1, 1, 0.75, 0.2, 1, 0, 0.25, 1, -0.75, 0.2, 1, -0.75, 0.1, 1], 3));
  g.normalizeNormals();
  g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
  return g;
}

/**
 * Leaf material for an InstancedMesh: a 3-tone ramp (softness per look), normals pulled towards
 * the crown volume, AO, a bright rim, a pale midrib, a highlight, and for the painterly look
 * lateral vein lines and brush-like value noise. Back faces lighter and matte.
 */
function createLeafMaterial(S, crownCentre, crownHalf, far) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...toneUniforms(S.tones),
      midTone: { value: new THREE.Color(S.midrib) },
      crownCentre: { value: crownCentre },
      crownHalf: { value: crownHalf },
      soft: { value: S.soft },
      crownPull: { value: S.crown },
      spec: { value: new THREE.Vector3(...S.spec) },
      rim: { value: S.rim },
      veins: { value: far ? 0 : S.veins },
      brush: { value: far ? 0 : S.brush },
    },
    vertexShader: /* glsl */ `
      attribute vec4 paint;
      uniform vec3 crownCentre;
      uniform vec3 crownHalf;
      varying vec3 vNormal;
      varying vec3 vCrown;
      varying vec3 vView;
      varying vec3 vTint;
      varying vec4 vPaint;
      varying float vDepth;
      void main() {
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * world;
        vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
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
      uniform vec3 tone0;
      uniform vec3 tone1;
      uniform vec3 tone2;
      uniform vec3 midTone;
      uniform float soft;
      uniform float crownPull;
      uniform vec3 spec;
      uniform float rim;
      uniform float veins;
      uniform float brush;
      varying vec3 vNormal;
      varying vec3 vCrown;
      varying vec3 vView;
      varying vec3 vTint;
      varying vec4 vPaint;
      varying float vDepth;
      vec3 ramp(float x) {
        vec3 col = mix(tone0, tone1, smoothstep(0.22 - soft, 0.22 + soft, x));
        return mix(col, tone2, smoothstep(0.6 - soft, 0.6 + soft, x));
      }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec3 leafN = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 N = normalize(mix(leafN, vCrown, crownPull));
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float t = vPaint.z;
        float s = vPaint.w;
        float ao = (0.72 + 0.28 * vDepth) * (0.78 + 0.22 * smoothstep(0.0, 0.3, t));
        // Painterly: brush-stroke value noise stretched along the lateral veins.
        float seed = vTint.r * 53.0 + vTint.b * 17.0;
        float strokes = noise(vec2((t - abs(s) * 0.3) * 18.0, abs(s) * 3.0) + seed) - 0.5;
        float shade = (max(dot(N, L), 0.0) * 0.8 + 0.12) * ao + strokes * brush;
        vec3 col = ramp(shade) * vTint;
        col *= 1.0 + rim * vPaint.y;
        // Lateral veins: thin darker lines from the midrib out towards the edge.
        float v = abs(fract((t - abs(s) * 0.32) * 9.0) - 0.5);
        col *= 1.0 - veins * (1.0 - smoothstep(0.02, 0.06, v)) * smoothstep(0.08, 0.2, abs(s)) * (1.0 - smoothstep(0.85, 0.98, abs(s)));
        col = mix(col, midTone * (0.5 + 0.5 * shade), smoothstep(0.55, 0.95, vPaint.x) * 0.7);
        if (gl_FrontFacing) {
          vec3 H = normalize(L + normalize(vView));
          col += vec3(1.0, 1.0, 0.95) * spec.z * smoothstep(spec.x, spec.y, dot(leafN, H));
        } else {
          col *= vec3(1.12, 1.16, 1.04);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

function potAndSoil(writer, radial, P) {
  // Built top → bottom so the end cap closes the base and the top stays open over the soil.
  const color = new THREE.Color(P.color);
  const dark = new THREE.Color(P.dark);
  const h = POT.height;
  const pts = [new THREE.Vector3(0, h, 0), new THREE.Vector3(0, h - 0.035, 0), new THREE.Vector3(0, 0, 0)];
  const radii = [POT.top + 0.012, POT.top + 0.012, POT.base];
  let tris = addTube(writer, pts, radii, { radial, colorAt: (v) => (v < 0.04 ? dark : color) });
  const soil = [new THREE.Vector3(0, h - 0.06, 0), new THREE.Vector3(0, h - 0.03, 0)];
  tris += addTube(writer, soil, [POT.top - 0.01, POT.top - 0.005], { radial, color: soilColor });
  return tris;
}

const stemColor = (v, u, t) => _c.copy(stemLow).lerp(stemHigh, THREE.MathUtils.smoothstep(t, 0.3, 0.9));

/** Style from the argument, else from the preview URL (`&style=`), else chunky. */
function pickStyle(style) {
  if (!style && typeof location !== 'undefined') style = new URLSearchParams(location.hash.split('?')[1] ?? '').get('style');
  return STYLES[style] ? style : 'chunky';
}

function createRubberPlant({ seed = 1, lod = 'near', style } = {}) {
  const near = lod !== 'far';
  const styleName = pickStyle(style);
  const S = STYLES[styleName];
  const { stems, leaves } = layout(seed, S);
  const writer = createMeshWriter();
  let stemTris = potAndSoil(writer, near ? S.pot.radial : 8, S.pot);

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
      const r = 0.0045 * S.stem;
      stemTris += addTube(writer, [l.root, l.root.clone().lerp(l.blade, 0.5), l.blade], [r, r * 0.9, r * 0.8], { radial: 3, color: petioleColor });
    }
  }

  const group = new THREE.Group();
  group.name = `rubber plant (${styleName}, ${near ? 'near' : 'far'})`;
  const stemGeometry = writer.toGeometry();
  const stemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const stemMesh = new THREE.Mesh(stemGeometry, stemMaterial);
  stemMesh.name = 'stems';
  group.add(stemMesh);

  // Crown volume from the leaves alone (the same for both levels, so they shade alike).
  const crown = new THREE.Box3();
  for (const l of leaves) crown.expandByPoint(l.blade).expandByPoint(l.blade.clone().addScaledVector(l.fwd, l.size));
  const crownHalf = crown.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const leafGeometry = near ? createRubberLeaf(S, 12, 6) : createFarLeaf(S);
  const leafMaterial = createLeafMaterial(S, crown.getCenter(new THREE.Vector3()), crownHalf, !near);
  const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, leaves.length);
  leafMesh.name = 'leaves';
  const m = new THREE.Matrix4();
  const x = new THREE.Vector3();
  const z = new THREE.Vector3();
  const y = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const box = new THREE.Box3();
  leaves.forEach((l, i) => {
    y.copy(l.fwd);
    x.crossVectors(y, UP).normalize();
    z.crossVectors(x, y).normalize();
    m.makeBasis(x, y, z);
    q.setFromRotationMatrix(m).multiply(roll.setFromAxisAngle(UP, l.roll));
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
    style: styleName,
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
