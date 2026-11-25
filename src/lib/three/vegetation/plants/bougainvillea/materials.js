// Cel materials for the bougainvillea: one shader draws leaf and bract cards, near and far
// (one draw call per level), choosing the green or the magenta 3-tone ramp per card (`kind`).
// The ramp is CEL_RAMP_GLSL from celFoliage.js; the bract ramp is the same steps on a second
// set of tones. Card normals follow tree.js: per corner from the clump centre, blended with
// the crown normal. All colours are design choices (guess); magenta is the sourced common colour.

import * as THREE from 'three';
import { CEL_RAMP_GLSL, toneUniforms } from '../../celFoliage.js';

const BRACT_RAMP_GLSL = /* glsl */ `
  uniform vec3 bract0;
  uniform vec3 bract1;
  uniform vec3 bract2;
  vec3 bractRamp(float shade) {
    float w = 0.04;
    vec3 col = mix(bract0, bract1, smoothstep(0.22 - w, 0.22 + w, shade));
    return mix(col, bract2, smoothstep(0.6 - w, 0.6 + w, shade));
  }`;

function uniforms(leafTones, bractTones) {
  const [b0, b1, b2] = bractTones.map((c) => new THREE.Color(c));
  return { ...toneUniforms(leafTones), bract0: { value: b0 }, bract1: { value: b1 }, bract2: { value: b2 } };
}

const FLOWER = 'vec3(0.96, 0.94, 0.82)';

// Unit shapes in cell coordinates (-0.5..0.5). Each returns a tone (0..1) or -1 outside.
function leafAt(u, v) {
  // Broadly ovate, widest below the middle, short point (VT: "broadly ovate to nearly round").
  const t = (v + 0.44) / 0.88;
  if (t <= 0 || t >= 1) return -1;
  const width = 0.34 * Math.sin(Math.PI * t ** 0.75) ** 0.9 * (1 - 0.35 * t ** 3);
  const d = Math.abs(u);
  if (d >= width) return -1;
  const vein = d < 0.012 && t < 0.9 ? 0.82 : 1;
  return (0.88 + 0.12 * (1 - d / Math.max(width, 1e-3))) * vein;
}

/** Three papery bracts at 120° with pale flowers in the middle (VT: 3 bracts, small white flowers). */
function bractAt(u, v) {
  const r = Math.hypot(u, v);
  if (r < 0.06) return { tone: 1, flower: true };
  const ang = Math.atan2(v, u);
  let tone = -1;
  for (let k = 0; k < 3; k++) {
    const a = ang - (Math.PI / 2 + (k * 2 * Math.PI) / 3);
    const s = (r * Math.cos(a)) / 0.46;
    const lv = r * Math.sin(a);
    if (s <= 0 || s >= 1) continue;
    const half = 0.2 * Math.sin(Math.PI * s ** 0.8) ** 0.8;
    if (Math.abs(lv) < half) tone = Math.max(tone, (0.8 + 0.2 * s) * (Math.abs(lv) < 0.01 ? 0.85 : 1));
  }
  return { tone, flower: false };
}

/** A fixed spray of small shapes in a disc, for the far cards (layout is a design choice). */
function spray(count, scale, seed) {
  let a = seed;
  const rnd = () => ((a = (a * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: count }, () => {
    const r = 0.36 * Math.sqrt(rnd());
    const t = rnd() * Math.PI * 2;
    return { x: r * Math.cos(t), y: r * Math.sin(t), rot: rnd() * Math.PI * 2, s: scale * (0.8 + 0.4 * rnd()) };
  });
}

/**
 * Atlas of four cells side by side (original procedural shapes, no downloaded texture):
 *   0 one leaf, 1 one bract cluster   (near cards);
 *   2 a spray of leaves, 3 a spray of bract clusters   (far cards: one card stands for many).
 * Odd cells use the magenta ramp. R = tone, G = flower flag, A = cut-out.
 */
export const CELLS = 4;
export function createAtlas(size = 128) {
  const W = size * CELLS;
  const data = new Uint8Array(W * size * 4);
  const put = (x, y, tone, flower) => {
    const i = (y * W + x) * 4;
    const on = tone >= 0;
    data[i] = on ? Math.min(255, 255 * tone) : 0;
    data[i + 1] = flower ? 255 : 0;
    data[i + 3] = on ? 255 : 0;
  };
  const leaves = spray(14, 0.3, 11);
  const bracts = spray(9, 0.34, 23);
  const inSpray = (els, u, v, shape) => {
    let best = { tone: -1, flower: false };
    for (const e of els) {
      const c = Math.cos(e.rot);
      const s = Math.sin(e.rot);
      const du = (u - e.x) / e.s;
      const dv = (v - e.y) / e.s;
      const res = shape(du * c + dv * s, -du * s + dv * c);
      const r = typeof res === 'number' ? { tone: res, flower: false } : res;
      if (r.tone >= 0) best = r; // later elements draw on top
    }
    return best;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;
      put(x, y, leafAt(u, v), false);
      const b = bractAt(u, v);
      put(x + size, y, b.tone, b.flower);
      const ls = inSpray(leaves, u, v, leafAt);
      put(x + size * 2, y, ls.tone, false);
      const bs = inSpray(bracts, u, v, bractAt);
      put(x + size * 3, y, bs.tone, bs.flower);
    }
  }
  const tex = new THREE.DataTexture(data, W, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Camera-facing leaf and bract cards (near level). */
export function createCardMaterial(map, leafTones, bractTones) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, ...uniforms(leafTones, bractTones) },
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute vec3 centre;
      attribute vec3 color;
      attribute float ao;
      attribute float kind;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vTint;
      varying float vAo;
      varying float vKind;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xy += corner;
        gl_Position = projectionMatrix * mv;
        vec3 c = (modelViewMatrix * vec4(centre, 1.0)).xyz;
        vNormal = normalize(normalize(mv.xyz - c) * 0.75 + normalize(normalMatrix * normal) * 0.25);
        vUv = vec2((uv.x + kind) / ${CELLS}.0, uv.y);
        vTint = color;
        vAo = ao;
        vKind = kind;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 sunDir;
      ${CEL_RAMP_GLSL}
      ${BRACT_RAMP_GLSL}
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vTint;
      varying float vAo;
      varying float vKind;
      void main() {
        vec4 tex = texture2D(map, vUv);
        if (tex.a < 0.5) discard;
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float shade = max(dot(normalize(vNormal), L), 0.0) * vAo;
        vec3 col = (mod(vKind + 0.5, 2.0) > 1.0 ? bractRamp(shade) : celRamp(shade)) * vTint * tex.r;
        if (tex.g > 0.5) col = ${FLOWER} * (0.6 + 0.4 * shade);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}
