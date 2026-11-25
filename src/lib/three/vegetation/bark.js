// Cel-shaded bark for the stylised trees: realistic in its marks, stylised in its light.
// Original procedural design: no texture is downloaded or copied. The bark is drawn in the shader
// from the tube UVs (u around, in cells: addTube's uRepeat cells per turn; v in metres along):
//   - plates: a Voronoi pattern stretched along the stem; furrows run along the cell borders, so
//     plates are irregular, interlock and vary in size. The pattern wraps around the stem with
//     no seam (cells hashed modulo the per-vertex `barkRep`, tube.js).
//   - depth: the plates are a height field; the normal is bumped from its screen derivatives, so
//     plate edges catch the sun and furrows fall into shadow in the same three light bands as the
//     leaves' cel ramp (a painted look, not a smooth one). Furrow insides are darkened too.
//   - tone: per-plate value, grain streaks along the stem and soft patches, posterised a little;
//   - moss (in furrows, on upper faces, low on the trunk), lichen (pale spots on plate tops),
//     lenticels (short horizontal dashes) and ring scars, per pattern;
//   - every mark fades where a cell spans only a few pixels (no shimmer on twigs);
//   - light: N·L against the foliage sun in three bands with a cool shadow tint and a faint rim,
//     times the vertex colour (each species' bark colour function).
// Every number in a pattern is a design choice (guess), set by eye.

import * as THREE from 'three';
import { FOLIAGE_SUN } from './celFoliage.js';

/**
 * Bark patterns. cell: [around, along] plate size in metres; jitter: how irregular the plates
 * are (0..1); furrow: furrow width (share of a plate); depth: furrow depth in metres (the bump);
 * keep: share of side borders (between plates side by side) that are furrows, cross: share of
 * cross borders (between plates one above the other), so furrows run mostly along; dark: how dark a furrow
 * is inside (0..1); twist: turns of the pattern per metre; patch: per-plate tone change;
 * streak: grain along the stem; rough: soft tone patches; moss / lichen: [colour, amount];
 * rings: ring scars [amount, spacing in metres]; dashes: lenticels [amount, cell around, cell along].
 */
export const BARK_PATTERNS = {
  // Rain tree: grey bark "furrowed into long plates" (Little & Skolmen, see treeStudies.js);
  // moss and pale lichen as on the user's roadside photos (guess).
  plates: { cell: [0.11, 0.5], jitter: 0.85, furrow: 0.42, depth: 0.06, keep: 0.95, cross: 0.3, dark: 0.6, twist: 0, patch: 0.14, streak: 0.12, rough: 0.2, moss: ['#55702c', 0.5], lichen: ['#b9bcae', 0.2], rings: [0, 1], dashes: [0, 1, 1] },
  // Trumpet tree: long narrow ridges that interlace and twist slowly (guess).
  ridges: { cell: [0.06, 0.75], jitter: 0.7, furrow: 0.36, depth: 0.03, keep: 0.95, cross: 0.15, dark: 0.5, twist: 0.04, patch: 0.08, streak: 0.18, rough: 0.16, moss: ['#5d7232', 0.2], lichen: ['#c4c6b6', 0.12], rings: [0, 1], dashes: [0, 1, 1] },
  // Kapok: pale smooth bark in big soft patches, a few shallow cracks, ring scars and lenticel
  // dashes, pale lichen (the user's Kuching kapok photos; guess).
  flakes: { cell: [0.34, 0.4], jitter: 0.95, furrow: 0.05, depth: 0.006, keep: 0.2, cross: 0.12, dark: 0.22, twist: 0, patch: 0.08, streak: 0.05, rough: 0.18, moss: ['#6f7d3c', 0.12], lichen: ['#e6e3d4', 0.28], rings: [0.35, 0.42], dashes: [0.35, 0.07, 0.11] },
  // Pedada: "flaky, slightly fissured", greyish pale brown (sources in pedada.js): small flakes
  // with shallow fissures (the sizes are a guess).
  scaly: { cell: [0.07, 0.25], jitter: 0.9, furrow: 0.18, depth: 0.012, keep: 0.7, cross: 0.2, dark: 0.2, twist: 0, patch: 0.2, streak: 0.08, rough: 0.14, moss: ['#5d7232', 0.15], lichen: ['#d6d4c4', 0.15], rings: [0, 1], dashes: [0, 1, 1] },
};

/** A cel bark material for `pattern` (a BARK_PATTERNS entry or its name). Vertex colours on. */
export function createBarkMaterial(pattern = 'plates') {
  const P = typeof pattern === 'string' ? BARK_PATTERNS[pattern] : pattern;
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: FOLIAGE_SUN },
      cellAlong: { value: P.cell[1] },
      cellAround: { value: P.cell[0] },
      jitter: { value: P.jitter },
      furrow: { value: P.furrow },
      depth: { value: P.depth },
      keep: { value: P.keep },
      crossKeep: { value: P.cross },
      dark: { value: P.dark },
      twist: { value: P.twist },
      plateTone: { value: P.patch },
      streak: { value: P.streak },
      rough: { value: P.rough },
      mossColor: { value: new THREE.Color(P.moss[0]) },
      moss: { value: P.moss[1] },
      lichenColor: { value: new THREE.Color(P.lichen[0]) },
      lichen: { value: P.lichen[1] },
      rings: { value: new THREE.Vector2(...P.rings) },
      dashes: { value: new THREE.Vector3(...P.dashes) },
    },
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute float barkRep;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vViewPos;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vHeight;
      varying float vRep;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vColor = color;
        vUv = uv;
        vRep = barkRep;
        vHeight = position.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform float cellAlong, cellAround, jitter, furrow, depth, keep, crossKeep, dark, twist, plateTone, streak, rough;
      uniform vec3 mossColor;
      uniform float moss;
      uniform vec3 lichenColor;
      uniform float lichen;
      uniform vec2 rings;
      uniform vec3 dashes;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vViewPos;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vHeight;
      varying float vRep;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 s = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), s.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), s.x), s.y);
      }
      float fbm(vec2 p) { return 0.55 * noise(p) + 0.3 * noise(p * 2.13 + 5.1) + 0.15 * noise(p * 4.37 + 1.7); }
      // Wrap a cell id around the stem (period rep cells), so the pattern has no seam.
      vec2 wrapId(vec2 id, float rep) { return vec2(rep > 0.5 ? mod(id.x, rep) : id.x, id.y); }
      // Voronoi: distance to the border between the nearest two plates (F2 - F1, approx.), and
      // the ids of those two plates.
      vec3 plates(vec2 q, float rep, out vec2 idA) {
        vec2 i = floor(q), f = fract(q);
        float d1 = 8.0, d2 = 8.0;
        vec2 idB = vec2(0.0);
        idA = vec2(0.0);
        for (int y = -1; y <= 1; y++)
          for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 id = wrapId(i + g, rep);
            vec2 o = 0.5 + (hash2(id) - 0.5) * jitter;
            float d = length(g + o - f);
            if (d < d1) { d2 = d1; idB = idA; d1 = d; idA = id; }
            else if (d < d2) { d2 = d; idB = id; }
          }
        return vec3(d2 - d1, idB);
      }
      void main() {
        float rep = floor(vRep + 0.5);
        // Plate space: x around in cells, y along in cells; a slow wobble so the furrows meander.
        vec2 q = vec2(vUv.x + vUv.y * twist * max(rep, 1.0), vUv.y / cellAlong);
        q.y += 0.35 * (noise(q * vec2(1.3, 0.4) + 7.0) - 0.5);
        // Metres on the surface, for the noise-based marks (around, along).
        vec2 m = vec2(vUv.x * cellAround, vUv.y);
        vec2 idA;
        vec3 vo = plates(q, rep, idA);
        float edge = vo.x;
        vec2 idB = vo.yz;
        // A border is a furrow unless the pair merges (symmetric pair hash). Side borders (plates
        // in different columns) are kept more often than cross borders, so furrows run along.
        float side = step(0.5, abs(idA.x - idB.x));
        float on = step(hash(idA + idB + 0.37), mix(crossKeep, keep, side));
        // Furrow width varies along its length, like a brushed line; cross cracks are narrower.
        float w = furrow * (0.6 + 0.8 * noise(vec2(q.x * 2.3, q.y * 2.3) + 1.1)) * mix(0.55, 1.0, side);
        // A rounded furrow: steepest at the bottom, easing onto the plate (no sharp crease, so
        // the bumped light has no dotted artefacts along the furrow).
        float s0 = smoothstep(0.0, w, edge);
        float h = mix(1.0, 1.0 - (1.0 - s0) * (1.0 - s0), on);
        // Bump only on the furrow shoulders: at the bottom the slope flips within a 2×2 pixel block
        // and the bumped light would break into dots; the cavity darkening covers it there.
        float shoulder = mix(1.0, smoothstep(0.08, 0.35, s0), on);
        // Plate tops are rounded off a little near their furrows (not across merged borders).
        h *= mix(1.0, 0.85 + 0.15 * smoothstep(0.0, w * 3.0, edge), on);
        // Fade the marks where a plate spans only a few pixels.
        vec2 fw = fwidth(q);
        float fade = 1.0 - smoothstep(0.15, 0.35, max(fw.x, fw.y));
        h = mix(1.0, h, fade);

        // Marks drawn in colour only (no bump, so no lit hard edges): lenticels and ring scars.
        float mark = 0.0;
        // Lenticels (kapok): short horizontal dashes, on a staggered grid.
        if (dashes.x > 0.0) {
          float around = cellAround / dashes.y;
          vec2 dq = vec2(vUv.x * around, vUv.y / dashes.z);
          dq.x += 0.5 * floor(dq.y);
          vec2 di = floor(dq);
          vec2 dj = wrapId(di, floor(rep * around + 0.5));
          vec2 df = fract(dq) - 0.5 - (hash2(dj + 2.7) - 0.5) * vec2(0.3, 0.5);
          float keepDash = step(0.72, hash(dj + 4.2));
          float dash = keepDash * (1.0 - smoothstep(0.12 + 0.2 * hash(dj + 8.3), 0.2 + 0.2 * hash(dj + 8.3), abs(df.x))) * (1.0 - smoothstep(0.06, 0.11, abs(df.y)));
          vec2 dw = fwidth(dq);
          dash *= 1.0 - smoothstep(0.2, 0.45, max(dw.x, dw.y));
          mark += dash * dashes.x;
        }
        // Ring scars (kapok): thin bands, broken up.
        if (rings.x > 0.0) {
          float rv = vUv.y / rings.y + (noise(vec2(m.x * 3.0, vUv.y)) - 0.5) * 0.25;
          float ring = smoothstep(0.43, 0.48, abs(fract(rv) - 0.5)); // a thin line where rows meet
          // Broken into segments that taper out (no square ends).
          ring *= smoothstep(0.3, 0.5, noise(vec2(m.x * 6.0, floor(rv) * 3.7)));
          mark += rings.x * ring * fade;
        }

        // Bump: the normal follows the height field (in metres) through its screen derivatives.
        vec3 N = normalize(vNormal);
        float H = h * depth;
        vec3 sx = dFdx(vViewPos), sy = dFdy(vViewPos);
        vec3 r1 = cross(sy, N), r2 = cross(N, sx);
        float det = dot(sx, r1);
        vec3 grad = sign(det) * (dFdx(H) * r1 + dFdy(H) * r2);
        vec3 Nb = normalize(abs(det) * N - grad);
        N = normalize(mix(N, Nb, fade * shoulder));

        // Tone: per plate, grain along the stem, soft patches; posterised into brushed steps.
        float tone = plateTone * (hash(idA + 9.1) - 0.5) * fade + rough * (fbm(m * vec2(2.2, 1.1)) - 0.5);
        tone = floor(tone * 8.0 + 0.5) / 8.0;
        tone += streak * (noise(m * vec2(28.0, 1.2)) - 0.5) * fade;
        vec3 base = vColor * (1.0 + tone);
        // Furrow insides darker and a little warmer; plate tops slightly weathered (lighter).
        float cavity = clamp(1.0 - h, 0.0, 1.0);
        base *= mix(vec3(1.0), vec3(0.78, 0.72, 0.68) * (1.0 - dark), clamp(cavity * 1.4, 0.0, 1.0));
        base *= 1.0 + 0.06 * smoothstep(0.9, 1.0, h) * fade;
        base *= 1.0 - 0.45 * clamp(mark, 0.0, 1.0);
        // Moss: in furrows, on upward faces and low on the trunk, in soft-edged clumps.
        float up = clamp(vWorldNormal.y * 0.8 + 0.35, 0.0, 1.0);
        float low = 1.0 - smoothstep(0.5, 3.0, vHeight);
        float mossMask = smoothstep(0.5, 0.6, fbm(m * vec2(1.4, 0.8) + 3.0) + 0.25 * (up + low) + 0.25 * cavity - 0.25);
        base = mix(base, mossColor * (0.8 + 0.4 * noise(m * 9.0)), mossMask * moss);
        // Lichen: pale round spots on the plate tops.
        // (Rotated, layered noise, so the spots come out round rather than square.)
        vec2 ml = mat2(0.8, -0.6, 0.6, 0.8) * m;
        float spots = smoothstep(0.68, 0.71, fbm(ml * vec2(10.0, 7.0) + 11.0)) * smoothstep(0.45, 0.6, noise(ml * 1.3 + 4.0)) * smoothstep(0.7, 1.0, h) * fade;
        base = mix(base, lichenColor, spots * lichen);

        // Light: three bands as the leaves' cel ramp, a cool shadow, a faint rim.
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float d = dot(N, L);
        float band = mix(0.5, 0.78, smoothstep(-0.14, -0.04, d));
        band = mix(band, 1.0, smoothstep(0.4, 0.5, d));
        vec3 shadowTint = mix(vec3(0.78, 0.84, 1.0), vec3(1.0), smoothstep(-0.14, 0.5, d));
        float rimLight = pow(1.0 - abs(normalize(vNormal).z), 3.0) * 0.12;
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
