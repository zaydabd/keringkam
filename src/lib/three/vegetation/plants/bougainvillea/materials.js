// Cel materials for the bougainvillea: one shader draws both leaf cards and bract cards
// (one draw call), choosing the green or the magenta 3-tone ramp per card (`kind`).
// The ramp is CEL_RAMP_GLSL from cel-foliage.js; the bract ramp is the same steps on a second
// set of tones. Card normals follow tree.js: per corner from the clump centre, blended with
// the crown normal. All colours are design choices (guess); magenta is the sourced common colour.

import * as THREE from 'three';
import { CEL_RAMP_GLSL, toneUniforms } from '../../cel-foliage.js';

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

/**
 * Atlas, two cells side by side (original procedural shapes, no downloaded texture):
 *   left:  one leaf, broadly ovate with a short point (VT: "broadly ovate to nearly round");
 *   right: one cluster of 3 papery bracts at 120° (VT: "subtended by 3 very showy papery
 *          bracts") with small pale flowers in the middle (VT: "small and white").
 * R = tone (lighter centre, darker vein), G = flower flag, A = cut-out.
 */
export function createAtlas(size = 128) {
  const W = size * 2;
  const data = new Uint8Array(W * size * 4);
  const put = (x, y, tone, flower, a) => {
    const i = (y * W + x) * 4;
    data[i] = Math.max(0, Math.min(255, 255 * tone));
    data[i + 1] = flower ? 255 : 0;
    data[i + 2] = 0;
    data[i + 3] = a ? 255 : 0;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Leaf: v from base (-) to tip (+); widest below the middle; slight acuminate tip.
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;
      const t = (v + 0.44) / 0.88;
      let inside = false;
      let tone = 0;
      if (t > 0 && t < 1) {
        const width = 0.34 * Math.sin(Math.PI * t ** 0.75) ** 0.9 * (1 - 0.35 * t ** 3);
        const d = Math.abs(u);
        inside = d < width;
        const vein = d < 0.012 && t < 0.9 ? 0.82 : 1;
        tone = (0.88 + 0.12 * (1 - d / Math.max(width, 1e-3))) * vein;
      }
      put(x, y, tone, false, inside);

      // Bract cluster: three ovate petal-like bracts around the centre, with a vein each.
      const r = Math.hypot(u, v);
      const ang = Math.atan2(v, u);
      let bin = false;
      let btone = 0;
      for (let k = 0; k < 3; k++) {
        const a = ang - (Math.PI / 2 + (k * 2 * Math.PI) / 3);
        const lu = r * Math.cos(a); // along the bract
        const lv = r * Math.sin(a);
        const s = lu / 0.46;
        if (s <= 0 || s >= 1) continue;
        const half = 0.2 * Math.sin(Math.PI * s ** 0.8) ** 0.8;
        if (Math.abs(lv) < half) {
          bin = true;
          const vein = Math.abs(lv) < 0.01 ? 0.85 : 1;
          btone = Math.max(btone, (0.8 + 0.2 * s) * vein);
        }
      }
      const flower = r < 0.06;
      put(x + size, y, btone, flower, bin || flower);
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
        vUv = vec2((uv.x + kind) * 0.5, uv.y);
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
        vec3 col = (vKind > 0.5 ? bractRamp(shade) : celRamp(shade)) * vTint * tex.r;
        if (tex.g > 0.5) col = ${FLOWER} * (0.6 + 0.4 * shade);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

/** Low-poly crown blobs (far level): mesh normals, per-vertex `kind` blended to crisp patches. */
export function createBlobMaterial(leafTones, bractTones) {
  return new THREE.ShaderMaterial({
    uniforms: uniforms(leafTones, bractTones),
    vertexShader: /* glsl */ `
      attribute float kind;
      attribute float ao;
      varying vec3 vNormal;
      varying float vKind;
      varying float vAo;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vKind = kind;
        vAo = ao;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      ${CEL_RAMP_GLSL}
      ${BRACT_RAMP_GLSL}
      varying vec3 vNormal;
      varying float vKind;
      varying float vAo;
      void main() {
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float shade = max(dot(normalize(vNormal), L), 0.0) * vAo;
        float k = smoothstep(0.42, 0.58, vKind);
        gl_FragColor = vec4(mix(celRamp(shade), bractRamp(shade), k), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
