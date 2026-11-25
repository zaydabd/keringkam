// Cel-shaded bark for the stylised trees and shrubs: realistic in its marks, stylised in its light.
// Original procedural design: no texture is downloaded or copied. The bark is drawn in the shader
// from the tube UVs (u around, scaled by addTube's uRepeat so a cell keeps about the same width
// in metres; v in metres along):
//   - plates: a grid of staggered cells; furrows on some cell edges, wobbling like a drawn line,
//     each furrow with a lit rim on one side (a painted bevel, no normal map);
//   - tone: value noise at two scales, posterised a little so it reads as brushed patches;
//   - moss (green, on the upper side and low on the trunk) and lichen (pale spots), from noise;
//   - rings: horizontal scars (kapok), broken up by noise;
//   - the marks fade where a cell spans only a few pixels (no shimmer on twigs);
//   - light: N·L against the foliage sun in three bands (shadow, mid, light) like the leaves'
//     cel ramp, with a cool shadow tint and a faint rim; times the vertex colour (each
//     species' bark colour function).
// Every number in a pattern is a design choice.

import * as THREE from 'three';
import { FOLIAGE_SUN } from './cel-foliage.js';

/**
 * Bark patterns. cell: [around, along] cell size in metres; line: [around, along] furrow width as
 * a fraction of the cell (0: none on that edge); keep: share of cells that draw furrows;
 * dark: how dark a furrow is (0..1); wobble: sideways wander of furrows (fraction of a cell);
 * twist: turns of the pattern per metre; rough: tone noise amount; rim: lit edge beside furrows;
 * moss / lichen: [colour, amount]; rings: ring-scar amount and spacing [amount, metres].
 */
export const BARK_PATTERNS = {
  // Rain tree: dark grey bark "furrowed into long plates" (Little & Skolmen, see treeStudies.js);
  // moss and pale lichen as on the Taiping and Kuching photos (guess).
  plates: { cell: [0.12, 0.75], line: [0.24, 0.05], keep: 0.8, dark: 0.6, wobble: 0.32, twist: 0, rough: 0.28, rim: 0.22, moss: ['#55702c', 0.45], lichen: ['#b9bcae', 0.18], rings: [0, 1] },
  // Birch: short dark horizontal marks on white.
  lenticels: { cell: [0.09, 0.16], line: [0, 0.22], keep: 0.3, dark: 0.8, wobble: 0.05, twist: 0, rough: 0.12, rim: 0, moss: ['#6b7a3a', 0], lichen: ['#ffffff', 0], rings: [0, 1] },
  // Oak / trumpet tree: deep vertical ridges that twist slowly.
  ridges: { cell: [0.07, 0.8], line: [0.32, 0.04], keep: 1, dark: 0.55, wobble: 0.25, twist: 0.05, rough: 0.22, rim: 0.2, moss: ['#5d7232', 0.15], lichen: ['#c4c6b6', 0.12], rings: [0, 1] },
  // Kapok and pedada: pale smooth-ish bark, shallow cracks, ring scars, lichen spots (kapok
  // photos; pedada "flaky, slightly fissured", sources in pedada.js).
  flakes: { cell: [0.22, 0.3], line: [0.08, 0.1], keep: 0.45, dark: 0.3, wobble: 0.25, twist: 0, rough: 0.2, rim: 0.12, moss: ['#6f7d3c', 0.12], lichen: ['#e6e3d4', 0.35], rings: [0.4, 0.42] },
  // Bougainvillea canes: smooth, with faint lengthwise lines.
  smooth: { cell: [0.03, 0.3], line: [0.12, 0], keep: 0.5, dark: 0.25, wobble: 0.1, twist: 0, rough: 0.08, rim: 0, moss: ['#6b7a3a', 0], lichen: ['#ffffff', 0], rings: [0, 1] },
};

/** A cel bark material for `pattern` (a BARK_PATTERNS entry or its name). Vertex colours on. */
export function createBarkMaterial(pattern = 'plates') {
  const P = typeof pattern === 'string' ? BARK_PATTERNS[pattern] : pattern;
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: FOLIAGE_SUN },
      cell: { value: new THREE.Vector2(...P.cell) },
      line: { value: new THREE.Vector2(...P.line) },
      keep: { value: P.keep },
      dark: { value: P.dark },
      wobble: { value: P.wobble },
      twist: { value: P.twist },
      rough: { value: P.rough ?? 0.2 },
      rim: { value: P.rim ?? 0.15 },
      mossColor: { value: new THREE.Color(P.moss?.[0] ?? '#5d7232') },
      moss: { value: P.moss?.[1] ?? 0 },
      lichenColor: { value: new THREE.Color(P.lichen?.[0] ?? '#cccccc') },
      lichen: { value: P.lichen?.[1] ?? 0 },
      rings: { value: new THREE.Vector2(...(P.rings ?? [0, 1])) },
    },
    vertexColors: true,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vHeight;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vColor = color;
        vUv = uv;
        vHeight = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform vec2 cell;
      uniform vec2 line;
      uniform float keep;
      uniform float dark;
      uniform float wobble;
      uniform float twist;
      uniform float rough;
      uniform float rim;
      uniform vec3 mossColor;
      uniform float moss;
      uniform vec3 lichenColor;
      uniform float lichen;
      uniform vec2 rings;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vHeight;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 s = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), s.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), s.x), s.y);
      }
      float fbm(vec2 p) { return 0.55 * noise(p) + 0.3 * noise(p * 2.13 + 5.1) + 0.15 * noise(p * 4.37 + 1.7); }
      void main() {
        // Metre-ish surface coordinates: around (in cells) and along (metres).
        vec2 m = vec2(vUv.x * cell.x, vUv.y);
        // Cell space: x around (uRepeat cells per turn), y along in cells.
        vec2 q = vec2(vUv.x + vUv.y * twist, vUv.y / cell.y);
        float col = floor(q.x);
        q.y += hash(vec2(col, 3.1)); // stagger the columns
        // Hand-drawn wobble of the lengthwise furrows, plus a little noise.
        q.x += wobble * (sin(q.y * 5.6 + col * 1.7) * 0.5 + sin(q.y * 14.4 + col) * 0.25 + (noise(q * vec2(1.0, 3.0)) - 0.5) * 0.6);
        vec2 id = floor(q);
        vec2 f = fract(q);
        float on = step(hash(id + 0.37), keep);
        vec2 e = min(f, 1.0 - f);
        // Furrow widths taper towards cell corners, like a brush stroke.
        float wu = line.x * (0.55 + 0.45 * sin(3.1416 * f.y)) * 0.5;
        float wv = line.y * (0.55 + 0.45 * sin(3.1416 * f.x)) * 0.5;
        float furrowU = line.x > 0.001 ? 1.0 - smoothstep(wu * 0.6, wu, e.x) : 0.0;
        float furrowV = line.y > 0.001 ? 1.0 - smoothstep(wv * 0.6, wv, e.y) : 0.0;
        float ink = max(furrowU, furrowV) * on;
        // Lit rim on one side of each lengthwise furrow (the plate edge catching light).
        float side = step(0.5, f.x);
        float bevel = (1.0 - smoothstep(wu, wu * 2.4, e.x)) * (1.0 - furrowU) * on * mix(-0.6, 1.0, side);
        // Fade the small marks where a cell spans only a few pixels.
        vec2 w = fwidth(q);
        float fade = 1.0 - smoothstep(0.12, 0.3, max(w.x, w.y));
        float pattern = 1.0 - dark * ink * fade + rim * bevel * fade;
        // Ring scars (kapok): thin dark bands, broken up.
        if (rings.x > 0.0) {
          float rv = vUv.y / rings.y + (noise(vec2(m.x * 3.0, vUv.y)) - 0.5) * 0.25;
          float ring = 1.0 - smoothstep(0.0, 0.06, abs(fract(rv) - 0.5) - 0.44);
          ring *= step(0.35, noise(vec2(m.x * 6.0, floor(rv) * 3.7)));
          pattern -= rings.x * ring * fade * 0.5;
        }
        // Tone: big soft patches plus plate-to-plate change, posterised into brushed steps.
        float tone = fbm(m * vec2(2.2, 1.1)) - 0.5;
        tone = floor(tone * 5.0 + 0.5) / 5.0;
        pattern *= 1.0 + rough * tone + 0.1 * (hash(id + 1.9) - 0.5) * fade;
        vec3 base = vColor * pattern;
        // Moss: on upward faces and low on the trunk, in soft-edged clumps.
        float up = clamp(vWorldNormal.y * 0.8 + 0.35, 0.0, 1.0);
        float low = 1.0 - smoothstep(0.5, 3.0, vHeight);
        float mossMask = smoothstep(0.52, 0.6, fbm(m * vec2(1.4, 0.8) + 3.0) + 0.25 * (up + low) - 0.25);
        base = mix(base, mossColor * (0.8 + 0.4 * noise(m * 9.0)), mossMask * moss);
        // Lichen: pale round spots.
        float spots = smoothstep(0.74, 0.78, noise(m * vec2(9.0, 6.0) + 11.0)) * smoothstep(0.45, 0.6, noise(m * 1.3 + 4.0)) * fade;
        base = mix(base, lichenColor, spots * lichen);
        // Light: three bands as the leaves' cel ramp, a cool shadow, a faint rim.
        vec3 N = normalize(vNormal);
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float d = dot(N, L);
        float band = mix(0.5, 0.78, smoothstep(-0.14, -0.04, d));
        band = mix(band, 1.0, smoothstep(0.4, 0.5, d));
        vec3 shadowTint = mix(vec3(0.78, 0.84, 1.0), vec3(1.0), smoothstep(-0.14, 0.5, d));
        float rimLight = pow(1.0 - abs(N.z), 3.0) * 0.12;
        gl_FragColor = vec4(base * band * shadowTint + rimLight * base, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Cells around a stem of radius r for a pattern: a whole number, at least 1. */
export function barkRepeat(pattern, r) {
  const P = typeof pattern === 'string' ? BARK_PATTERNS[pattern] : pattern;
  return Math.max(1, Math.round((2 * Math.PI * r) / P.cell[0]));
}
