// Nipah palm (Nypa fruticans), stylised, with two levels of detail.
//
// Sourced shape facts:
//   - Stemless: "The trunk or stem of the nipa palm is under the mud. Only the leaves project
//     upwards"; leaves up to 9 m; "long, feathery leaves".
//     https://en.wikipedia.org/wiki/Nypa_fruticans
//   - "clumping stemless palm with rhizomes"; leaves "large, erect ... about 4–10 m long, slightly
//     recurved, pinnate with up to 100 lanceolate leaflets arranged regularly on each side of the
//     rachis"; leaflets "60–130 by 5–8 cm, pointed, shiny green on the upper surface".
//     https://www.nparks.gov.sg/florafaunaweb/flora/2/6/2658
//
// Guesses (stylised choices, not sourced): fronds per clump (7–10), lengths used (5–8 m),
// lean and bend of each frond, bare petiole share (22%), 46 leaflets per side (fewer than the
// source's up-to-100, to keep the triangle count down), leaflet angle and droop, leaflets shorter
// at both ends of the rachis, leaflet width drawn about twice the real 5–8 cm so it reads at
// distance, rachis radius, all colours, and the far level's crossed strips.
//
// near: rachis tubes (one draw call) + real leaflet strips with a midrib fold, cel shaded (one).
// far:  thin rachis tubes (one) + per frond a folded strip in the leaflet plane and a narrow
//       crossed strip (one), same material and colours.

import * as THREE from 'three';
import { addTube, createMeshWriter } from '../tube.js';
import { CEL_RAMP_GLSL, FOLIAGE_SUN, toneUniforms } from '../cel-foliage.js';
import { mulberry32, range } from '../rng.js';

const NIPAH = {
  fronds: [7, 10], // (guess)
  length: [5, 8], // m; source gives 4–10 m
  lean: [0.18, 0.75], // rad from vertical at the base (guess)
  bend: [0.5, 1.0], // rad of recurve over the length; source says "slightly recurved" (guess amount)
  petiole: 0.22, // bare share of the rachis (guess)
  sections: 18,
  radius: [0.09, 0.012], // rachis base → tip, m (guess)
  leaflets: 46, // per side (guess; source: up to 100)
  leafletLength: [0.6, 1.3], // m (source)
  leafletWidth: 0.13, // m, drawn wider than the real 5–8 cm (guess)
  leafletAngle: [0.75, 0.95], // rad between leaflet and rachis tip direction (guess)
  droop: [0.15, 0.45], // rad down out of the frond plane (guess)
  tones: ['#1d4520', '#4c8a2c', '#b8d86a'], // cel ramp, shadow → mid → light (guess)
  rachis: ['#5f5a2a', '#7f8a3a'], // base → tip (guess)
};

const UP = new THREE.Vector3(0, 1, 0);

/** Cel material for plain (non-instanced) leaf geometry; normals blended with `proxyNormal`. */
function createNipahMaterial(tones, proxyWeight = 0.55) {
  return new THREE.ShaderMaterial({
    uniforms: { ...toneUniforms(tones), proxyWeight: { value: proxyWeight } },
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec3 proxyNormal;
      attribute float ao;
      uniform float proxyWeight;
      varying vec3 vNormal;
      varying vec3 vTint;
      varying float vAo;
      void main() {
        vec3 n = normalize(mix(normalize(normal), proxyNormal, proxyWeight));
        vNormal = normalize(normalMatrix * n);
        vTint = color;
        vAo = ao;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      ${CEL_RAMP_GLSL}
      varying vec3 vNormal;
      varying vec3 vTint;
      varying float vAo;
      void main() {
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float shade = max(dot(normalize(vNormal), L), 0.0) * vAo;
        gl_FragColor = vec4(celRamp(shade) * vTint, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

/** Leaf writer: positions, normals, proxy normals, colours, ao, indices. */
function createLeafWriter(crownCentre) {
  const w = { positions: [], normals: [], proxy: [], colors: [], ao: [], indices: [] };
  const _p = new THREE.Vector3();
  w.count = () => w.positions.length / 3;
  w.vertex = (p, n, tint, ao) => {
    w.positions.push(p.x, p.y, p.z);
    w.normals.push(n.x, n.y, n.z);
    // Proxy: away from the clump's centre, tipped up, so the clump shades as one mass.
    _p.subVectors(p, crownCentre);
    _p.y = Math.max(_p.y, 0) + 1.2;
    _p.normalize();
    w.proxy.push(_p.x, _p.y, _p.z);
    w.colors.push(tint.r, tint.g, tint.b);
    const away = _p.dot(FOLIAGE_SUN) * 0.5 + 0.5;
    w.ao.push(ao * (0.85 + 0.15 * away));
  };
  w.toGeometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(w.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(w.normals, 3));
    g.setAttribute('proxyNormal', new THREE.Float32BufferAttribute(w.proxy, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(w.colors, 3));
    g.setAttribute('ao', new THREE.Float32BufferAttribute(w.ao, 1));
    g.setIndex(w.indices);
    g.computeBoundingSphere();
    return g;
  };
  return w;
}

/** One frond's rachis: a curve that leans out and recurves downward. Frames per point. */
function growFrond(rand, S, index, count) {
  const az = ((index + range(rand, -0.3, 0.3)) / count) * Math.PI * 2;
  const out = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
  const lean = range(rand, ...S.lean);
  const bend = range(rand, ...S.bend) * (0.6 + lean); // outer fronds arch more (guess)
  const length = range(rand, ...S.length) * (1 - 0.25 * lean);
  const base = out.clone().multiplyScalar(range(rand, 0.05, 0.35));
  const side = new THREE.Vector3().crossVectors(UP, out).normalize();
  const twist = range(rand, -0.25, 0.25); // roll of the leaflet plane (guess)

  const points = [];
  const tangents = [];
  const p = base.clone();
  const step = length / S.sections;
  for (let i = 0; i <= S.sections; i++) {
    const u = i / S.sections;
    const a = lean + bend * u * u; // angle from vertical grows along the frond
    const t = UP.clone().multiplyScalar(Math.cos(a)).addScaledVector(out, Math.sin(a));
    points.push(p.clone());
    tangents.push(t);
    p.addScaledVector(t, step);
  }
  // Frames: side stays horizontal (the leaflet plane is the frond's own plane, rolled a little).
  const frames = tangents.map((t) => {
    const s = side.clone().applyAxisAngle(t, twist);
    const n = new THREE.Vector3().crossVectors(s, t).normalize(); // frond "up" (upper surface)
    return { t, s, n };
  });
  return { points, frames, length };
}

/** Point and frame at fraction u along a frond (linear between samples). */
function sampleFrond(f, u) {
  const x = u * (f.points.length - 1);
  const i = Math.min(Math.floor(x), f.points.length - 2);
  const k = x - i;
  const p = f.points[i].clone().lerp(f.points[i + 1], k);
  const a = f.frames[i];
  const b = f.frames[i + 1];
  const t = a.t.clone().lerp(b.t, k).normalize();
  const s = a.s.clone().lerp(b.s, k).normalize();
  const n = new THREE.Vector3().crossVectors(s, t).normalize();
  return { p, t, s, n };
}

/** Leaflet length at fraction q (0 first leaflet .. 1 tip): short at both ends (guess). */
function leafletLength(S, q) {
  const [lo, hi] = S.leafletLength;
  const bell = Math.sin(Math.PI * (0.12 + 0.82 * q));
  return lo * 0.5 + (hi - lo * 0.5) * bell;
}

function addRachis(stems, f, S, radial, sections) {
  const n = f.points.length - 1;
  const pts = [];
  const radii = [];
  for (let i = 0; i <= sections; i++) {
    const u = i / sections;
    pts.push(sampleFrond(f, u).p);
    radii.push(THREE.MathUtils.lerp(S.radius[0], S.radius[1], Math.pow(u, 0.7)));
  }
  const c0 = new THREE.Color(S.rachis[0]);
  const c1 = new THREE.Color(S.rachis[1]);
  const col = new THREE.Color();
  return n
    ? addTube(stems, pts, radii, { radial, colorAt: (v, k, t) => col.copy(c0).lerp(c1, Math.min(1, t * 1.6)) })
    : 0;
}

export function createNipah({ seed = 1, lod = 'near', species = NIPAH } = {}) {
  const S = species;
  const rand = mulberry32(seed);
  const far = lod === 'far';
  const count = Math.floor(range(rand, S.fronds[0], S.fronds[1] + 0.999));
  const fronds = [];
  for (let i = 0; i < count; i++) fronds.push(growFrond(rand, S, i, count));
  const height = Math.max(...fronds.flatMap((f) => f.points.map((p) => p.y)));
  const crownCentre = new THREE.Vector3(0, height * 0.35, 0);

  const stems = createMeshWriter();
  const leaves = createLeafWriter(crownCentre);
  const stats = { seed, lod, fronds: count, triangles: { stems: 0, leaves: 0 }, leaves: 0 };
  const tint = new THREE.Color();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const _nrm = new THREE.Vector3();

  for (const f of fronds) {
    // Per-frond tint: a few older fronds are yellower (guess).
    const old = rand() < 0.2;
    const frondTint = new THREE.Color(old ? '#e2e09a' : '#ffffff').multiplyScalar(range(rand, 0.9, 1.05));
    stats.triangles.stems += addRachis(stems, f, S, far ? 3 : 6, far ? 6 : S.sections);
    const droop = range(rand, ...S.droop);

    if (!far) {
      // ---- Leaflets: lanceolate strips with a midrib fold, both sides of the rachis.
      for (let side = -1; side <= 1; side += 2) {
        for (let j = 0; j < S.leaflets; j++) {
          const q = (j + 0.5 + range(rand, -0.25, 0.25)) / S.leaflets;
          const u = S.petiole + (1 - S.petiole) * q;
          const { p, t, s, n } = sampleFrond(f, u);
          const len = leafletLength(S, q) * range(rand, 0.9, 1.1);
          const ang = range(rand, ...S.leafletAngle) * (1 - 0.35 * q); // tip leaflets point forward
          const dr = droop * range(rand, 0.7, 1.3);
          // Leaflet direction: forward along the rachis, out to the side, tipped down.
          const dir0 = _d
            .copy(t)
            .multiplyScalar(Math.cos(ang))
            .addScaledVector(s, side * Math.sin(ang))
            .normalize();
          const width = S.leafletWidth * range(rand, 0.85, 1.1);
          tint.copy(frondTint).multiplyScalar(range(rand, 0.92, 1.06));
          const segs = 4;
          const base = leaves.count();
          for (let k = 0; k <= segs; k++) {
            const v = k / segs;
            // Droop grows along the leaflet, so it arches down.
            const down = dr * (0.4 + 1.2 * v);
            const dir = _a.copy(dir0).multiplyScalar(Math.cos(down)).addScaledVector(n, -Math.sin(down)).normalize();
            const centre = p.clone().addScaledVector(dir0, len * v * 0.35).addScaledVector(dir, len * v * 0.65);
            _w.crossVectors(dir, n).normalize(); // across the leaflet, in its plane
            _nrm.crossVectors(_w, dir).normalize();
            if (_nrm.dot(n) < 0) _nrm.negate();
            // Lanceolate width: widest near the base third, a point at the tip.
            const half = (width / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.85 + 0.08)), 0.8) * (1 - v * 0.6);
            const ao = 0.75 + 0.25 * v;
            const fold = half * 0.5; // midrib ridge (V fold)
            leaves.vertex(_b.copy(centre).addScaledVector(_w, -half), _nrm, tint, ao);
            leaves.vertex(_b.copy(centre).addScaledVector(_nrm, fold), _nrm, tint, ao);
            leaves.vertex(_b.copy(centre).addScaledVector(_w, half), _nrm, tint, ao);
          }
          for (let k = 0; k < segs; k++) {
            const a = base + k * 3;
            const b = a + 3;
            leaves.indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
          }
          stats.triangles.leaves += segs * 4;
          stats.leaves++;
        }
      }
    } else {
      // ---- Far: a folded strip in the leaflet plane (wings droop like the leaflets) and a
      // narrow crossed strip, along the leafy part of the rachis.
      const segs = 12;
      const base = leaves.count();
      tint.copy(frondTint).multiplyScalar(0.88);
      for (let k = 0; k <= segs; k++) {
        const q = k / segs;
        const u = S.petiole + (1 - S.petiole) * q;
        const { p, t, s, n } = sampleFrond(f, u);
        const ang = 0.85 * (1 - 0.35 * q);
        // Sawtooth edge: alternate long and short so the strip reads as separate leaflets.
        const reach = leafletLength(S, q) * Math.sin(ang) * (k === segs ? 0.15 : k % 2 ? 0.95 : 0.45);
        const down = droop * 1.0;
        const ao = 0.8;
        for (let side = -1; side <= 1; side += 2) {
          const edge = p
            .clone()
            .addScaledVector(t, leafletLength(S, q) * Math.cos(ang) * 0.5)
            .addScaledVector(s, side * reach * Math.cos(down))
            .addScaledVector(n, -reach * Math.sin(down));
          if (side < 0) leaves.vertex(edge, n, tint, ao);
          else {
            leaves.vertex(p, n, tint, ao);
            leaves.vertex(edge, n, tint, ao);
          }
        }
        // Crossed strip: below the rachis, as the drooping leaflets seen edge on.
        leaves.vertex(p, s, tint, ao * 0.9);
        leaves.vertex(p.clone().addScaledVector(n, -leafletLength(S, q) * 0.4), s, tint, ao * 0.9);
      }
      for (let k = 0; k < segs; k++) {
        const a = base + k * 5;
        const b = a + 5;
        leaves.indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
        leaves.indices.push(a + 3, b + 3, a + 4, a + 4, b + 3, b + 4);
      }
      stats.triangles.leaves += segs * 6;
      stats.leaves += 2;
    }
  }

  const group = new THREE.Group();
  group.name = `nipah ${lod}`;
  const stemGeometry = stems.toGeometry();
  const stemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const stemMesh = new THREE.Mesh(stemGeometry, stemMaterial);
  stemMesh.name = 'rachis';
  group.add(stemMesh);
  const leafGeometry = leaves.toGeometry();
  const leafMaterial = createNipahMaterial(S.tones);
  const leafMesh = new THREE.Mesh(leafGeometry, leafMaterial);
  leafMesh.name = far ? 'frond strips' : 'leaflets';
  group.add(leafMesh);

  stats.triangles.total = stats.triangles.stems + stats.triangles.leaves;
  stats.drawCalls = 2;
  stats.bounds = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));

  return {
    group,
    stats,
    dispose() {
      stemGeometry.dispose();
      stemMaterial.dispose();
      leafGeometry.dispose();
      leafMaterial.dispose();
    },
  };
}

export const plant = {
  id: 'nipah',
  label: 'Nipah palm',
  create: ({ seed, lod }) => createNipah({ seed, lod }),
  switchAt: 30, // m (guess; tune in the scene)
  target: [0, 3.2, 0],
  distance: 18,
  background: '#1d2a33',
};
