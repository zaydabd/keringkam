// Shared GLSL and the pixel-block reveal material used by several styles.

import * as THREE from 'three';

export const GLSL_NOISE = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
               mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  // 4×4 ordered-dither (Bayer) threshold in [0, 1).
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
`;

export const BASIC_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Shows a texture (or a crop of it, via uvRect) that appears and disappears in square
 * screen-space blocks, with a band of accent-coloured blocks at the moving edge.
 * reveal: 0 = hidden, 1 = fully shown. Blocks line up across meshes that share a seed,
 * so one piece can dissolve into another.
 */
export function createBlockMaterial({ accent = '#c8102e', blockPx = 18, seed = 7 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      map: { value: null },
      uvRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      reveal: { value: 0 },
      blockSize: { value: blockPx * Math.min(window.devicePixelRatio, 2) },
      seed: { value: seed },
      accent: { value: new THREE.Color(accent) },
      dim: { value: 1 },
    },
    vertexShader: BASIC_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec4 uvRect;
      uniform float reveal, blockSize, seed, dim;
      uniform vec3 accent;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        vec4 c = texture2D(map, uvRect.xy + vUv * uvRect.zw);
        if (c.a < 0.02) discard;
        float r = hash12(floor(gl_FragCoord.xy / blockSize) + seed);
        float edge = 0.14;
        float p = reveal * (1.0 + edge);
        if (r > p) discard;
        c.rgb *= dim;
        if (r > p - edge) c = vec4(accent, 1.0);
        gl_FragColor = c;
        #include <colorspace_fragment>
      }
    `,
  });
}

/** uvRect (offset.xy, scale.zw) for a square crop of a w×h image centred on (u, v). */
export function cropRect(width, height, { u, v, size }, zoom = 1) {
  const side = (size * Math.min(width, height)) / zoom;
  const su = side / width;
  const sv = side / height;
  const ou = THREE.MathUtils.clamp(u - su / 2, 0, 1 - su);
  const ov = THREE.MathUtils.clamp(v - sv / 2, 0, 1 - sv);
  return new THREE.Vector4(ou, ov, su, sv);
}
