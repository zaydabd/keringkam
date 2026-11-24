// Cel-shaded bark for the stylised trees and shrubs. Original procedural design: no texture is
// downloaded or copied. The bark is drawn in the shader from the tube UVs (u around, scaled by
// addTube's uRepeat so a cell keeps about the same width in metres; v in metres along):
//   - a grid of staggered cells (plates); dark lines on some cell edges are the furrows or marks;
//   - the lines wobble along their length, so they read as drawn by hand, not ruled;
//   - the pattern fades out where its cells get smaller than a few pixels (no shimmer on twigs);
//   - light: N·L against the foliage sun, in three flat bands (shadow, mid, light) like the
//     leaves' cel ramp, times the vertex colour (each species' bark colour function).
// Every number in a pattern is a design choice.

import * as THREE from 'three';
import { FOLIAGE_SUN } from './cel-foliage.js';

/**
 * Bark patterns. cell: [around, along] cell size in metres; line: [around, along] line width as a
 * fraction of the cell (0: no line on that edge); keep: share of cells that draw their lines;
 * dark: how dark a line is (0..1); wobble: sideways wander of the lines (fraction of a cell);
 * twist: turns of the pattern per metre (oak's ridges).
 */
export const BARK_PATTERNS = {
  // Rain tree: grey bark "furrowed into long plates" (Little & Skolmen, see rainTree.js).
  plates: { cell: [0.11, 0.55], line: [0.2, 0.07], keep: 0.9, dark: 0.55, wobble: 0.18, twist: 0 },
  // Birch: short dark horizontal marks on white.
  lenticels: { cell: [0.09, 0.16], line: [0, 0.22], keep: 0.3, dark: 0.8, wobble: 0.05, twist: 0 },
  // Oak: deep vertical ridges that twist slowly.
  ridges: { cell: [0.08, 0.9], line: [0.3, 0.04], keep: 1, dark: 0.55, wobble: 0.25, twist: 0.06 },
  // Pedada: bark "flaky", "slightly fissured" (sources in pedada.js): small patches, open edges.
  flakes: { cell: [0.12, 0.18], line: [0.12, 0.12], keep: 0.55, dark: 0.4, wobble: 0.2, twist: 0 },
  // Bougainvillea canes: smooth, with faint lengthwise lines.
  smooth: { cell: [0.03, 0.3], line: [0.12, 0], keep: 0.5, dark: 0.25, wobble: 0.1, twist: 0 },
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
    },
    vertexColors: true,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vColor;
      varying vec2 vUv;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vColor = color;
        vUv = uv;
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
      varying vec3 vNormal;
      varying vec3 vColor;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        // Cell space: x around (uRepeat cells per turn), y along in cells.
        vec2 q = vec2(vUv.x + vUv.y * twist, vUv.y / cell.y);
        float col = floor(q.x);
        q.y += hash(vec2(col, 3.1)); // stagger the columns
        // Hand-drawn wobble of the lengthwise lines.
        q.x += wobble * (sin(q.y * 6.2832 * 0.9 + col * 1.7) * 0.6 + sin(q.y * 6.2832 * 2.3 + col) * 0.4);
        vec2 id = floor(q);
        vec2 f = fract(q);
        float on = step(hash(id + 0.37), keep);
        // Distance to the nearest cell edge, per axis, in cell fractions.
        vec2 e = min(f, 1.0 - f);
        // Lines taper towards the cell corners a little, like a brush stroke.
        float wu = line.x * (0.6 + 0.4 * sin(3.1416 * f.y));
        float wv = line.y * (0.6 + 0.4 * sin(3.1416 * f.x));
        float ink = max(step(e.x, wu * 0.5) * step(0.001, line.x), step(e.y, wv * 0.5) * step(0.001, line.y)) * on;
        // Fade the pattern where a cell spans only a few pixels.
        vec2 w = fwidth(q);
        float fade = 1.0 - smoothstep(0.12, 0.3, max(w.x, w.y));
        float pattern = 1.0 - dark * ink * fade;
        // Plate-to-plate value change, faint.
        pattern *= 0.92 + 0.16 * hash(id + 1.9) * fade;
        // Three flat light bands, as the leaves' cel ramp.
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float d = dot(normalize(vNormal), L);
        float band = mix(0.52, 0.8, smoothstep(-0.12, -0.04, d));
        band = mix(band, 1.0, smoothstep(0.42, 0.5, d));
        vec3 shadowTint = mix(vec3(0.82, 0.86, 1.0), vec3(1.0), smoothstep(-0.12, 0.5, d));
        gl_FragColor = vec4(vColor * pattern * band * shadowTint, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Cells around a stem of radius r for a pattern: a whole number, at least 1. */
export function barkRepeat(pattern, r) {
  const P = typeof pattern === 'string' ? BARK_PATTERNS[pattern] : pattern;
  return Math.max(1, Math.round((2 * Math.PI * r) / P.cell[0]));
}
