// Stylised trees and bushes, original procedural designs in the style of references V3 (birch
// pack) and V4 (oak pack); see research/CREDITS.md. Those models have no licence for reuse, so
// nothing is copied: no geometry, no texture, no measurement. Only the general style is followed:
//   birch: a slim white trunk with dark marks, light upward branches, small toothed yellow-green leaves;
//   oak:   a thick, curved brown trunk that forks low, long twisting limbs, lobed blue-green leaves.
//
// After .claude/skills/threejs-procedural-vegetation:
//   - a species table per level (TREE_SPECIES, below): length, radius, taper, child count,
//     emergence range, angle, gnarl, upward pull, sections, radial segments;
//   - growth from a queue, so jobs and triangles are counted per level;
//   - children in stratified slots along the parent with independently shuffled angular slots;
//   - each section turns by inherited direction + smooth gnarl + tropism (upward pull);
//   - foliage only after the branches are final: round clumps of leaf-size alpha-cut cards at the
//     twig ends, with normals from each clump's sphere and the crown volume (stylised style);
//   - no wind: the references do not move.
// Units: metres. Every size is a design choice.

import * as THREE from 'three';
import { mulberry32, range, shuffled, stratified } from './rng.js';
import { addTube, createMeshWriter } from './tube.js';
import { UP } from './grow.js';
import { CEL_RAMP_GLSL, FOLIAGE_SUN, toneUniforms } from './cel-foliage.js';
import { barkRepeat, createBarkMaterial } from './bark.js';

const birchBark = (() => {
  const white = new THREE.Color('#e9e6dd');
  const dark = new THREE.Color('#2b2925');
  const grey = new THREE.Color('#b9b5aa');
  const out = new THREE.Color();
  // Dark horizontal marks (lenticels) in bands, a darker base. Hash, so it is stable per vertex.
  const hash = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  return (v, u, t, level) => {
    const band = Math.floor(v * 9);
    const mark = hash(band, Math.floor(u * 5)) > 0.72 && level < 2;
    out.copy(white).lerp(grey, hash(band, 1.3) * 0.35);
    if (mark) out.lerp(dark, 0.85);
    if (level === 0 && v < 0.5) out.lerp(dark, (1 - v / 0.5) * 0.55);
    return out;
  };
})();

const oakBark = (() => {
  const light = new THREE.Color('#7a5537');
  const dark = new THREE.Color('#3c2616');
  const out = new THREE.Color();
  // Vertical ridges that twist slowly up the trunk.
  return (v, u) => {
    const ridge = 0.5 + 0.5 * Math.sin((u * 7 + v * 0.35) * Math.PI * 2);
    return out.copy(dark).lerp(light, ridge ** 1.5);
  };
})();

// `foliage`: stylised leaf clumps at the twig ends.
//   radius: clump radius (m); merge: clumps closer than radius*merge become one;
//   density: how many times the clump's surface is covered by cards (count = density·4πr²/card²);
//   card: card size (m), about one leaf, as the Substack guide states;
//   mask: bend of the leaf-stroke cut-out; tones: cel ramp colours, shadow → mid → light.
// The numbers are design choices.
export const TREE_SPECIES = {
  birch: {
    bark: birchBark,
    levels: [
      { length: [5.2, 6.2], radius: 0.12, tip: 0.025, sections: 22, radial: 10, gnarl: 0.02, up: 0.08, lean: 0.03 },
      { count: 10, emerge: [0.35, 0.9], angle: [0.85, 1.15], length: [0.4, 0.52], radius: 0.38, tip: 0.012, sections: 9, radial: 6, gnarl: 0.16, up: 0.07, shorten: 0.6 },
      { count: 5, emerge: [0.3, 0.95], angle: [0.5, 0.85], length: [0.4, 0.55], radius: 0.5, tip: 0.006, sections: 5, radial: 4, gnarl: 0.2, up: 0.08, shorten: 0.3 },
      { count: 5, emerge: [0.2, 1], angle: [0.6, 1.0], length: [0.45, 0.65], radius: 0.6, tip: 0.003, sections: 4, radial: 3, gnarl: 0.25, up: 0.02, shorten: 0.3 },
    ],
    foliage: { radius: 0.75, merge: 1.1, density: 1.5, card: 0.16, mask: { curve: 0.06 }, tones: ['#3d6418', '#7fa72a', '#d2e35e'] },
  },
  oak: {
    bark: oakBark,
    levels: [
      { length: [2.2, 2.8], radius: 0.3, tip: 0.17, sections: 16, radial: 12, gnarl: 0.05, up: 0.15, lean: 0.05 },
      { count: 4, emerge: [0.65, 1], angle: [0.8, 1.1], length: [1.1, 1.4], radius: 0.62, tip: 0.04, sections: 14, radial: 8, gnarl: 0.12, up: 0.05, shorten: 0.2 },
      { count: 6, emerge: [0.3, 0.95], angle: [0.7, 1.0], length: [0.45, 0.6], radius: 0.5, tip: 0.012, sections: 7, radial: 5, gnarl: 0.22, up: 0.1, shorten: 0.3 },
      { count: 6, emerge: [0.15, 1], angle: [0.6, 1.0], length: [0.4, 0.6], radius: 0.6, tip: 0.004, sections: 4, radial: 3, gnarl: 0.25, up: 0.05, shorten: 0.3 },
    ],
    foliage: { radius: 0.95, merge: 1.1, density: 1.5, card: 0.18, mask: { curve: 0.04 }, tones: ['#1c4a3c', '#3f8656', '#a3dca0'] },
  },
  birchBush: {
    bark: birchBark,
    levels: [
      { length: [0.25, 0.3], radius: 0.05, tip: 0.035, sections: 3, radial: 8, gnarl: 0.05, up: 0.05, lean: 0.05 },
      { count: 6, emerge: [0.2, 1], angle: [0.4, 0.9], length: [3.0, 4.0], radius: 0.6, tip: 0.008, sections: 7, radial: 5, gnarl: 0.18, up: 0.12, shorten: 0.2 },
      { count: 5, emerge: [0.3, 0.95], angle: [0.5, 0.9], length: [0.35, 0.5], radius: 0.6, tip: 0.003, sections: 4, radial: 3, gnarl: 0.22, up: 0.06, shorten: 0.2 },
    ],
    foliage: { radius: 0.4, merge: 1.0, density: 1.0, card: 0.09, mask: { curve: 0.06 }, tones: ['#3d6418', '#7fa72a', '#d2e35e'] },
  },
  oakBush: {
    bark: oakBark,
    levels: [
      { length: [0.25, 0.3], radius: 0.07, tip: 0.05, sections: 3, radial: 8, gnarl: 0.05, up: 0.05, lean: 0.05 },
      { count: 5, emerge: [0.2, 1], angle: [0.5, 0.95], length: [2.6, 3.4], radius: 0.6, tip: 0.012, sections: 7, radial: 5, gnarl: 0.22, up: 0.1, shorten: 0.2 },
      { count: 5, emerge: [0.3, 0.95], angle: [0.5, 0.9], length: [0.35, 0.5], radius: 0.6, tip: 0.004, sections: 4, radial: 3, gnarl: 0.22, up: 0.06, shorten: 0.2 },
    ],
    foliage: { radius: 0.42, merge: 1.0, density: 1.0, card: 0.1, mask: { curve: 0.04 }, tones: ['#1c4a3c', '#3f8656', '#a3dca0'] },
  },
};

const _n = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Any unit vector perpendicular to `t`, and its partner, into _n and _b. */
function perpendiculars(t) {
  _n.set(0, 0, 1);
  if (Math.abs(t.z) > 0.9) _n.set(1, 0, 0);
  _n.addScaledVector(t, -t.dot(_n)).normalize();
  _b.crossVectors(t, _n);
}

/**
 * Grows one branch as a polyline. Gnarl is a curvature that persists, so bends stay smooth.
 * `elbow` (0..1, optional per level): the branch leaves that much closer to its parent's
 * direction `from`, then turns to its own direction over the first `elbowLen` of its sections,
 * so it curves out of the fork instead of leaving at a hard angle. No extra random numbers.
 * `kink` (radians-ish, optional): sharp sideways turns at a `kinkRate` share of the sections.
 */
function growBranch(rand, origin, dir, length, spec, from) {
  const points = [origin.clone()];
  const target = dir.clone().normalize();
  const d = target.clone();
  const k = spec.elbow && from ? Math.max(1, Math.round(spec.sections * (spec.elbowLen ?? 0.35))) : 0;
  if (k) d.lerp(from, spec.elbow).normalize();
  const bend = new THREE.Vector3();
  const kick = new THREE.Vector3();
  const p = origin.clone();
  const step = length / spec.sections;
  for (let i = 0; i < spec.sections; i++) {
    kick.set(range(rand, -1, 1), range(rand, -1, 1), range(rand, -1, 1));
    bend.multiplyScalar(0.6).addScaledVector(kick, spec.gnarl);
    if (i < k) d.lerp(target, 1 / (k - i)).normalize();
    // Kinks (optional per level): now and then the branch turns sharply sideways, the zigzag
    // of an old rain tree limb. Extra random numbers only for levels that set `kink`.
    if (spec.kink && i >= Math.max(1, Math.round(spec.sections * 0.25)) && rand() < (spec.kinkRate ?? 0.35)) {
      kick.set(range(rand, -1, 1), range(rand, -0.5, 0.5), range(rand, -1, 1));
      kick.addScaledVector(d, -kick.dot(d));
      if (kick.lengthSq() > 1e-6) d.addScaledVector(kick.normalize(), spec.kink).normalize();
    }
    d.add(bend).addScaledVector(UP, spec.up).normalize();
    p.addScaledVector(d, step);
    points.push(p.clone());
  }
  return points;
}

function pointAndRadius(points, radii, t) {
  const f = THREE.MathUtils.clamp(t, 0, 1) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(f));
  return {
    point: points[i].clone().lerp(points[i + 1], f - i),
    tangent: points[i + 1].clone().sub(points[i]).normalize(),
    radius: THREE.MathUtils.lerp(radii[i], radii[i + 1], f - i),
  };
}

/**
 * An original procedural cut-out (no downloaded texture): one tapered, slightly curved brush
 * stroke about the shape of a leaf, with a ragged edge, after the Substack guide's single
 * "brush stroke on a canvas" alpha. RGB is a faint stroke tone, A the cut-out.
 */
function createLeafStrokeMask({ curve = 0.05 } = {}, size = 128) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;
      // t runs base → tip along the stroke; the centre line bows sideways by `curve`.
      const t = (v + 0.46) / 0.92;
      const i = (y * size + x) * 4;
      let inside = false;
      let tone = 0;
      if (t > 0 && t < 1) {
        const mid = curve * Math.sin(Math.PI * t);
        // Widest a little below the middle, pointed tip, rounder base; ragged rim.
        const width = 0.24 * Math.sin(Math.PI * t ** 0.85) ** 0.75;
        const rag = 0.018 * Math.sin(t * 47 + 0.4) + 0.01 * Math.sin(t * 91 + 2.1);
        const d = Math.abs(u - mid);
        inside = d < width + rag;
        tone = 0.86 + 0.14 * (1 - d / Math.max(width, 1e-3));
      }
      data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, 255 * tone));
      data[i + 3] = inside ? 255 : 0;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Sun direction used by the cel ramp (shared with the vines; see cel-foliage.js). */
export const TREE_SUN = FOLIAGE_SUN;

/**
 * Leaf-card material, after the Substack anime-foliage pipeline: camera-facing cards (Douges'
 * view-space corner offset), per-corner normals from the clump sphere (their normal transfer),
 * diffuse N·L run through a 3-tone colour ramp (their Shader to RGB → Color Ramp), multiplied
 * by AO and a darkening on the crown side away from the sun. No translucency. Not tone mapped.
 */
function createClumpMaterial(map, tones) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, ...toneUniforms(tones) },
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
      ${CEL_RAMP_GLSL}
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vTint;
      varying float vAo;
      void main() {
        vec4 tex = texture2D(map, vUv);
        if (tex.a < 0.5) discard;
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float shade = max(dot(normalize(vNormal), L), 0.0) * vAo;
        gl_FragColor = vec4(celRamp(shade) * vTint * tex.rgb, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

const radiiFor = (n, r0, r1) => Array.from({ length: n }, (_, i) => r0 + (r1 - r0) * (i / (n - 1)) ** 0.8);

/**
 * Grows the branch skeleton of a species: [{ level, points, radii, length, parent, t }], where
 * `parent` is the index of the parent branch and `t` (0..1) where along it this one leaves.
 * The near and far levels of a plant both call this, so they grow the same limbs for a seed.
 * `rand` is a mulberry32 stream for the seed; it is left where the growth stopped.
 * The radii are the plain taper; `shapeBranches` adds the flares.
 */
export function growBranches(rand, species) {
  const L = species.levels;
  // ---- Level 0: the trunk, leaning a little in a seeded direction.
  const T = L[0];
  const leanAz = range(rand, 0, Math.PI * 2);
  const trunkDir = new THREE.Vector3(Math.cos(leanAz) * T.lean, 1, Math.sin(leanAz) * T.lean);
  const trunkLen = range(rand, ...T.length);
  const trunkPts = growBranch(rand, new THREE.Vector3(0, -0.05, 0), trunkDir, trunkLen, T);
  const queue = [{ level: 0, points: trunkPts, radii: radiiFor(trunkPts.length, T.radius, T.tip), length: trunkLen, parent: -1, t: 0 }];
  const branches = [];

  while (queue.length) {
    const job = queue.shift();
    const index = branches.length;
    branches.push(job);
    const spec = L[job.level + 1];
    if (!spec) continue;
    // Stratified heights; angular slots spread around the parent then shuffled.
    let heights = stratified(rand, spec.count, ...spec.emerge);
    const turn = range(rand, 0, Math.PI * 2);
    let azimuths = shuffled(rand, heights.map((_, i) => turn + (i / spec.count) * Math.PI * 2 + range(rand, -0.3, 0.3)));
    if (spec.whorl) {
      // Whorls (optional): `whorl` children at each of count/whorl heights, evenly spaced round
      // the parent, each tier turned from the last (the kapok's tiers of horizontal branches).
      const tiers = Math.max(1, Math.round(spec.count / spec.whorl));
      const tierT = stratified(rand, tiers, ...spec.emerge);
      heights = [];
      azimuths = [];
      tierT.forEach((t, j) => {
        const spin = range(rand, 0, Math.PI * 2);
        for (let w = 0; w < spec.whorl; w++) {
          heights.push(t);
          azimuths.push(spin + (w / spec.whorl) * Math.PI * 2 + range(rand, -0.25, 0.25));
        }
      });
    }
    heights.forEach((t, i) => {
      const at = pointAndRadius(job.points, job.radii, t);
      perpendiculars(at.tangent);
      const az = azimuths[i];
      const ang = range(rand, ...spec.angle);
      const side = _n.clone().multiplyScalar(Math.cos(az)).addScaledVector(_b, Math.sin(az));
      const dir = at.tangent.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
      // Children near the top of their parent are shorter, which rounds the crown.
      const length = job.length * range(rand, ...spec.length) * (1 - spec.shorten * t);
      const r0 = Math.max(spec.tip * 1.5, at.radius * spec.radius);
      const points = growBranch(rand, at.point, dir, length, spec, at.tangent);
      queue.push({ level: job.level + 1, points, radii: radiiFor(points.length, r0, spec.tip), length, parent: index, t });
    });
  }
  if (species.pipe) pipeRadii(branches, species.pipe, T.radius);
  return branches;
}

/**
 * Optional (species.pipe): replaces the plain taper with Leonardo's rule. At any point a branch's
 * cross-section is the sum of the cross-sections it still has to carry: its own tip plus every
 * child that leaves further up, so `r^e = tip^e + sum(child^e)` with e about 2.
 * See Eloy 2011, https://doi.org/10.1103/PhysRevLett.107.258101.
 * A branch therefore steps down from thick to medium to thin. It stays thick while most of its
 * children are still above, and ends about as thick as one of its children.
 * Children are later in `branches` than their parents, so one pass from the end works.
 * The whole tree is then scaled so the trunk keeps its designed base radius.
 *   pipe: { twig, end, hold, exponent, fade }
 *   twig: base radius of a branch with no children, in metres before scaling.
 *   end: tip radius as a fraction of twig. hold: how long a childless twig keeps its thickness.
 *   fade: how far below a fork, as a fraction of the parent, the child's share starts to fade.
 */
function pipeRadii(branches, P, trunkRadius) {
  const e = P.exponent ?? 2;
  const fade = P.fade ?? 0.12;
  const tipR = P.twig * (P.end ?? 0.45);
  const kids = branches.map(() => []);
  branches.forEach((b, i) => { if (b.parent >= 0) kids[b.parent].push(i); });
  const base = new Array(branches.length);
  for (let i = branches.length - 1; i >= 0; i--) {
    const b = branches[i];
    const n = b.points.length;
    if (!kids[i].length) {
      b.radii = Array.from({ length: n }, (_, j) => P.twig * THREE.MathUtils.lerp(1, P.end ?? 0.45, (j / (n - 1)) ** (P.hold ?? 1.6)));
    } else {
      b.radii = Array.from({ length: n }, (_, j) => {
        const u = j / (n - 1);
        // Above its last fork the branch carries on as one more stream about its children's size,
        // so it ends at medium thickness instead of a point.
        let a = Math.max(tipR ** e, kids[i].reduce((sum, k) => sum + base[k] ** e, 0) / kids[i].length);
        // Each child's share fades out smoothly just below the point where it leaves.
        for (const k of kids[i]) a += base[k] ** e * THREE.MathUtils.smoothstep(branches[k].t - u, -0.02, fade);
        return a ** (1 / e);
      });
    }
    base[i] = b.radii[0];
  }
  const s = trunkRadius / base[0];
  for (const b of branches) b.radii = b.radii.map((r) => r * s);
}

/** Inserts points (and linearly interpolated radii) so spacing is at most `step` up to `upTo` metres from the start. */
function densify(b, upTo, step) {
  const pts = [b.points[0]];
  const rad = [b.radii[0]];
  let along = 0;
  for (let i = 1; i < b.points.length; i++) {
    const a = b.points[i - 1];
    const seg = a.distanceTo(b.points[i]);
    if (along < upTo && seg > step) {
      const m = Math.ceil(Math.min(seg, upTo - along + step) / step);
      const parts = Math.min(m, Math.ceil(seg / step));
      for (let k = 1; k < parts; k++) {
        const f = k / parts;
        pts.push(a.clone().lerp(b.points[i], f));
        rad.push(THREE.MathUtils.lerp(b.radii[i - 1], b.radii[i], f));
      }
    }
    pts.push(b.points[i]);
    rad.push(b.radii[i]);
    along += seg;
  }
  b.points = pts;
  b.radii = rad;
}

/** Distance in metres from the start of a polyline to each of its points. */
function distances(points) {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + points[i].distanceTo(points[i - 1]));
  return out;
}

/**
 * Shapes the skeleton's radii after growth (in place), so joins read as grown, not glued:
 *   - collar: a parent swells a little where a child leaves it (wood thickens at a fork);
 *   - flare: a child is wider at its base, out to about its parent's radius, then narrows to
 *     its own taper, so it blends into the parent instead of meeting it at a hard seam;
 *   - root flare: the trunk widens towards the ground, with `lobes` low buttresses;
 *   - dome: a thick trunk top is rounded off above its last limbs instead of cut flat.
 * Extra rings are added only where a flare needs them. Per-level options (species levels):
 * `flare` (0..1, default 0.6 on levels ≥ 1 except the last), `collar` (default 0.35); trunk `base`:
 * { flare, height, lobes, lobe, sharp }. All the amounts are design choices.
 * `detail` (default 1): 0 skips the extra rings (the far levels).
 */
export function shapeBranches(branches, species, { detail = 1 } = {}) {
  const L = species.levels;
  const orig = branches.map((b) => ({ points: b.points, radii: b.radii.slice() }));
  // Collars on the parent, from the children's plain base radii (before any flare).
  branches.forEach((c) => {
    if (c.parent < 0) return;
    const P = branches[c.parent];
    const collar = L[c.level].collar ?? 0.35;
    if (!collar) return;
    const n = P.points.length;
    const width = Math.max(c.radii[0] * 2.5, P.length / (n - 1));
    for (let j = 0; j < n; j++) {
      const dist = (Math.abs(j / (n - 1) - c.t) * P.length) / width;
      P.radii[j] += c.radii[0] * collar * Math.exp(-dist * dist);
    }
  });
  // Cap the collars so many children at one height do not balloon the parent.
  branches.forEach((b, i) => {
    b.radii = b.radii.map((r, j) => Math.min(r, orig[i].radii[j] * 1.35));
  });
  // Each child's parent radius where it leaves, on the parent as it is now (before densify).
  const parentR = branches.map((b) => (b.parent < 0 ? 0 : pointAndRadius(branches[b.parent].points, branches[b.parent].radii, b.t).radius));

  branches.forEach((b, bi) => {
    const spec = L[b.level];
    if (b.level === 0) {
      const B = spec.base;
      if (B) {
        if (detail) densify(b, B.height, B.height / (B.sharp ? 10 : 4));
        const d = distances(b.points);
        b.radii = b.radii.map((r, i) => r * (1 + B.flare * Math.exp(-d[i] / (B.height * 0.45))));
        b.baseLobes = { ...B, d };
      }
      if (spec.dome && b.radii.at(-1) > 0.05) {
        const n = b.points.length;
        const tip = b.points[n - 1];
        const tan = tip.clone().sub(b.points[n - 2]).normalize();
        const r = b.radii[n - 1];
        for (const a of [0.45, 0.85, 1.25]) {
          b.points.push(tip.clone().addScaledVector(tan, r * Math.sin(a) * 0.7));
          b.radii.push(r * Math.max(0.12, Math.cos(a)));
        }
      }
      return;
    }
    const R = parentR[bi];
    // Default: flare every level but the twigs (too thin to see; they would cost the most rings).
    const flare = spec.flare ?? (b.level < L.length - 1 ? 0.6 : 0);
    if (!flare) return;
    const r0 = b.radii[0];
    if (detail) densify(b, R * 2.4, Math.max(R * 0.8, 0.01));
    const d = distances(b.points);
    const fall = Math.max(R, r0) * 0.8;
    b.radii = b.radii.map((r, i) => {
      const f = r * (1 + flare * Math.exp(-d[i] / fall));
      // The base ring sits on the parent's axis: keep it inside the parent.
      return i === 0 ? Math.min(f, Math.max(r0, R * 0.95)) : Math.min(f, Math.max(r, R * 1.05));
    });
  });
  return branches;
}

/** Leaf-clump centres at the outer twig ends (close ones merge), as createTree places them. */
export function clumpCentres(branches, species) {
  const F = species.foliage;
  const last = species.levels.length - 1;
  const centres = [];
  for (const b of branches) {
    if (b.level !== last) continue;
    const n = b.points.length;
    const tip = b.points[n - 1];
    const dir = tip.clone().sub(b.points[n - 2]).normalize();
    const c = tip.clone().addScaledVector(dir, F.radius * 0.3);
    if (centres.every((o) => o.distanceTo(c) > F.radius * F.merge)) centres.push(c);
  }
  return centres;
}

/**
 * Writes the branches as tubes into `writer` with the species' bark colours; UVs scaled for its
 * bark pattern. `radial(level)` overrides the sides per level. Returns the triangle count.
 */
export function writeBranches(writer, branches, species, { radial } = {}) {
  const pattern = species.barkPattern ?? 'plates';
  let tris = 0;
  for (const b of branches) {
    const spec = species.levels[b.level];
    const lobes = b.baseLobes;
    const shape = lobes && lobes.lobes
      ? (i, ang) => {
          // Buttress fins: `sharp` narrows each lobe into a plank (kapok); each fin its own size.
          const fin = Math.max(0, Math.cos(lobes.lobes * ang + 0.7)) ** (lobes.sharp ?? 2);
          const size = 0.65 + 0.35 * Math.sin(Math.round((lobes.lobes * ang + 0.7) / (2 * Math.PI)) * 2.4 + 1.3);
          // Height profile: plank fins run up the trunk and die out at `height`; round lobes fade fast.
          const h = lobes.d[i] / lobes.height;
          const rise = lobes.sharp ? Math.max(0, 1 - h) ** 2.2 : Math.exp(-h / 0.35);
          return 1 + lobes.lobe * rise * (fin * size - 0.3 / (lobes.sharp ?? 2));
        }
      : undefined;
    tris += addTube(writer, b.points, b.radii, {
      radial: radial ? radial(b.level) : spec.radial,
      colorAt: (v, u, t) => species.bark(v, u, t, b.level),
      closeStart: b.level === 0,
      uRepeat: barkRepeat(pattern, b.radii[Math.min(b.radii.length - 1, 2)]),
      shape: lobes && lobes.d.length === b.points.length ? shape : undefined,
    });
  }
  return tris;
}

export function createTree({ seed = 1, kind = 'birch', species = TREE_SPECIES[kind] } = {}) {
  // One random stream: the branches, then the leaf cards.
  const rand = mulberry32(seed);
  const stems = createMeshWriter();
  const L = species.levels;
  const stats = { seed, kind, levels: L.map(() => 0), triangles: { stems: 0, leaves: 0 }, leaves: 0 };
  const branches = growBranches(rand, species);
  for (const b of branches) stats.levels[b.level]++;
  const centres = clumpCentres(branches, species);
  shapeBranches(branches, species);
  stats.triangles.stems += writeBranches(stems, branches, species);

  // ---- Foliage, after the branches are final (method: research/CREDITS.md, "Stylised foliage").
  // A few large clumps sit at the ends of the outer twigs; close ones merge. Each clump is a
  // "bush" of camera-facing leaf cards, varied in size, with card count growing with its area.
  // The shader takes each corner's normal from the clump centre, so a clump shades as one ball.
  const F = species.foliage;
  const crown = new THREE.Box3().setFromPoints(centres);
  crown.expandByScalar(F.radius);
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
  const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  let cards = 0;
  for (const c of centres) {
    // Scale randomness 0.2, as in the guide; leaves per clump follow its surface area.
    const scale = range(rand, 0.8, 1.2);
    const r = F.radius * scale;
    const count = Math.max(24, Math.round((F.density * 4 * Math.PI * r * r) / (F.card * F.card)));
    const hue = range(rand, 0.92, 1.06);
    // Crown position of this clump: deep clumps get AO; the side away from the sun is darker.
    cn.copy(c).sub(crownCentre).divide(half);
    const depth = Math.min(1, cn.length());
    const away = cn.lengthSq() > 1e-6 ? cn.normalize().dot(TREE_SUN) * 0.5 + 0.5 : 0.5;
    const clumpAo = 0.6 + 0.25 * depth + 0.15 * away;
    for (let k = 0; k < count; k++) {
      // Uniform direction, radius biased towards the shell.
      const zz = range(rand, -1, 1);
      const az = range(rand, 0, Math.PI * 2);
      const sn = Math.sqrt(1 - zz * zz);
      n.set(sn * Math.cos(az), zz, sn * Math.sin(az));
      // Most leaves on the shell (a closed silhouette), a sparse fill inside so it never shows through.
      const shell = rand() < 0.85 ? range(rand, 0.82, 1) : range(rand, 0.3, 0.82);
      p.copy(c).addScaledVector(n, r * shell);
      const roll = range(rand, 0, Math.PI * 2);
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      const size = F.card * range(rand, 0.8, 1.2);
      // Small per-leaf value jitter so neighbours differ (not in the guide; our addition).
      const tint = hue * range(rand, 0.93, 1.07);
      // AO: cards deep inside a clump are darker.
      const ao = clumpAo * (0.7 + 0.3 * shell);
      const base = positions.length / 3;
      for (const [u, v] of CORNERS) {
        positions.push(p.x, p.y, p.z);
        corners.push((u * cr - v * sr) * size, (u * sr + v * cr) * size);
        centreAttr.push(c.x, c.y, c.z);
        // Crown normal (blended in the shader with the per-corner clump normal).
        const q = p.clone().sub(crownCentre).divide(half).normalize();
        normals.push(q.x, q.y, q.z);
        uvs.push(u + 0.5, v + 0.5);
        colors.push(tint, tint, tint);
        aos.push(ao);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      cards++;
    }
  }

  // ---- Meshes: stems and leaf cards (two draw calls).
  const group = new THREE.Group();
  group.name = `${kind} tree`;
  const stemGeometry = stems.toGeometry();
  const stemMaterial = createBarkMaterial(species.barkPattern);
  const stemMesh = new THREE.Mesh(stemGeometry, stemMaterial);
  stemMesh.name = 'branches';
  group.add(stemMesh);

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
  leafGeometry.boundingSphere.radius += F.card * 1.7;
  const leafMask = createLeafStrokeMask(F.mask);
  const leafMaterial = createClumpMaterial(leafMask, F.tones);
  const leafMesh = new THREE.Mesh(leafGeometry, leafMaterial);
  leafMesh.name = 'leaves';
  group.add(leafMesh);
  const leaves = { length: cards };

  stats.leaves = leaves.length;
  stats.triangles.leaves = leafGeometry.index.count / 3;
  stats.clumps = centres.length;
  stats.triangles.total = stats.triangles.stems + stats.triangles.leaves;
  stats.bounds = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));

  return {
    group,
    stats,
    dispose() {
      stemGeometry.dispose();
      stemMaterial.dispose();
      leafGeometry.dispose();
      leafMaterial.dispose();
      leafMask.dispose();
    },
  };
}
