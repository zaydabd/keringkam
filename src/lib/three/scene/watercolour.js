import * as THREE from 'three';
import { VIEW_FIELD, setViewField, FIELD_NOISE, fieldNoiseTexture } from './toon.js';

// Watercolour look, after R2 (a painting of the room supplied by the user; not in the repo).
// Two passes, kept apart as the image-pipeline / colour-grading skills ask:
//   1. pigment (linear, before tone mapping): one shared pigment field drives the wash, the
//      granulation, the wet-edge darkening and the bleed, so the effects agree with each other.
//   2. finish: exposure, the one tone map, sRGB encoding, then the grade (lifted warm blacks,
//      lower saturation, cream highlights).
// Debug: ?debug=paint-pigment | paint-edge | paint-bleed shows a field in grey; ?off=pigment or
// ?off=grade switches a stage off. The wash blotches and the paper tooth are read at each pixel's
// direction in the world, so they stay on the room when the view turns instead of the room sliding
// under them. Their noise (toon.js FIELD_NOISE) does not repeat within a screen.

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const PIGMENT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tNoise: { value: null }, // the random lattice of the wash and tooth noise (toon.js fieldNoiseTexture)
    viewRotation: { value: new THREE.Matrix3() }, // the camera's rotation and focal length (createPigmentField.setView):
    focal: { value: 1000 }, // the wash is read at each pixel's direction in the world (VIEW_FIELD)
    fieldShift: { value: new THREE.Vector2() }, // ?seed: moves the wash, in field units
    detail: { value: 1 }, // field units per screen pixel / scale (the theme's paint.detail)
    resolution: { value: new THREE.Vector2(1, 1) },
    scale: { value: 1 }, // device pixel ratio: keeps the field the same size on screen
    // Perceptual controls, off by default (0); the room sets them from its theme (themes/interior.js paint).
    washVariation: { value: 0 }, // large soft blotches of lighter and darker pigment
    granulation: { value: 0 }, // pigment settling in the paper's tooth, more in dark washes
    edgeDarkening: { value: 0 }, // pigment pooling where a wash meets a different value
    bleed: { value: 0 }, // wet-in-wet: edges softened where the pigment is wet
    bleedRadius: { value: 3 }, // px (CSS): the ring the bleed reads from
    edgeRadius: { value: 2.5 }, // px (CSS): how far apart the wet edge compares the value
    shadowTint: { value: new THREE.Color('#ffffff') }, // the hue shadows lean towards
    shadowTintAmount: { value: 0 },
    exposure: { value: 1.85 }, // set from the meter: tone thresholds are judged on exposed values
    fabricKeep: { value: 0 }, // on the fabrics (alpha 0): how much of the colour is kept unpainted
    view: { value: 0 }, // 0 final, 1 pigment field, 2 edge field, 3 bleed field
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution, fieldShift;
    uniform mat3 viewRotation;
    uniform float focal, detail, scale, washVariation, granulation, edgeDarkening, bleed, bleedRadius, edgeRadius, shadowTintAmount, view, exposure, fabricKeep;
    uniform vec3 shadowTint;
    varying vec2 vUv;
    // Luminance as it will be shown, relative to the exposure the thresholds were tuned at (1.85).
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)) * exposure / 1.85; }
    ${VIEW_FIELD}
    ${FIELD_NOISE}
    // Three octaves, four independent channels at once.
    vec4 fbm4(vec2 p) { return noise4(p) * 0.55 + noise4(p * 2.0 + 7.1) * 0.3 + noise4(p * 4.0 + 3.7) * 0.15; }

    void main() {
      vec2 px = 1.0 / resolution;
      // Field 1, pigment density: domain-warped, two bands (~192 px blotches, ~48 px mottle at
      // detail 1, in CSS px; detail 2 halves them). And the paper tooth, 0.875 and 0.328 cells a
      // CSS px, read at whole drawing-buffer pixels so the fine grain does not blur and sharpen as
      // it moves. Both kept on the world as the view turns.
      vec2 at = viewField(gl_FragCoord.xy, resolution, viewRotation, focal);
      vec2 d = at / scale * detail + fieldShift;
      vec2 w = fbm4(d / 256.0).xy - 0.5;
      float pigment = fbm4(d / 192.0 + w * 1.6).x * 0.7 + fbm4(d / 48.0 + w).y * 0.3;
      vec2 g = (floor(at) + 0.5) / scale;
      vec2 field = vec2(0.0, noise4(g * 0.875).z * 0.6 + noise4(g * 0.328125 + 4.3).w * 0.4);

      vec4 scene = texture2D(tDiffuse, vUv);
      vec3 base = scene.rgb;
      // Field 2, wet edge: how much the value changes across a few pixels (log luma, so dark
      // and light areas are treated alike).
      vec2 r = px * edgeRadius * scale;
      float l0 = log2(luma(base) + 0.02);
      float lx = log2(luma(texture2D(tDiffuse, vUv + vec2(r.x, 0.0)).rgb) + 0.02) - log2(luma(texture2D(tDiffuse, vUv - vec2(r.x, 0.0)).rgb) + 0.02);
      float ly = log2(luma(texture2D(tDiffuse, vUv + vec2(0.0, r.y)).rgb) + 0.02) - log2(luma(texture2D(tDiffuse, vUv - vec2(0.0, r.y)).rgb) + 0.02);
      float wetEdge = smoothstep(0.25, 1.4, length(vec2(lx, ly)));

      // Field 3, bleed: where the pigment is dense, the paint was wet and edges soften.
      float wet = smoothstep(0.45, 0.75, pigment);
      vec3 col = base;
      if (wet > 0.0) { // dry paper (about half the screen) keeps the base: skip the 8 samples
        // 8 samples on a ring, starting at angle pigment * 3 and stepping 0.785 rad: one sin and
        // cos, then a fixed rotation per step.
        vec2 dir = vec2(cos(pigment * 3.0), sin(pigment * 3.0)) * px * bleedRadius * scale;
        const mat2 STEP = mat2(0.7073882691671998, 0.706825181105366, -0.706825181105366, 0.7073882691671998); // rotate by 0.785 rad
        vec3 soft = vec3(0.0);
        for (int k = 0; k < 8; k++) {
          soft += textureLod(tDiffuse, vUv + dir, 0.0).rgb; // explicit level: inside a branch
          dir = STEP * dir;
        }
        col = mix(base, soft / 8.0, bleed * wet);
      }

      float lum = luma(col);
      // Shadows lean lavender-grey; lights keep their warm colour.
      float sh = 1.0 - smoothstep(0.02, 0.3, lum);
      col = mix(col, lum * shadowTint / luma(shadowTint), sh * shadowTintAmount);
      // Wash: lighter and darker blotches, mostly in the mid tones.
      col *= 1.0 + washVariation * (pigment - 0.5) * (0.5 + 0.5 * smoothstep(0.02, 0.25, lum));
      // Edge darkening: pigment pools along the edge of a wash, more where it is dense.
      col *= 1.0 - edgeDarkening * wetEdge * (0.5 + 0.5 * pigment);
      // Granulation: fine tooth, stronger in dark, dense washes.
      float tooth = field.y;
      col *= 1.0 + granulation * (tooth - 0.5) * (0.4 + pigment) * (1.0 - smoothstep(0.1, 0.8, lum) * 0.6);

      // The fabrics (alpha 0, set by their material) keep most of their photo: no wash on them.
      col = mix(col, base, (1.0 - scene.a) * fabricKeep);

      if (view > 0.5) col = vec3(view < 1.5 ? pigment : view < 2.5 ? wetEdge : wet) * 0.6;
      gl_FragColor = vec4(col, scene.a); // the fabric mask goes on to the finish
    }
  `,
};

/** Wires the pigment pass's noise into its uniforms. Call setView() each frame; seed moves the wash
 * (?seed=n), for seed sweeps. detail scales how fine the wash blotches are (the theme's
 * paint.detail: 1 as drawn, 2 twice as fine). */
export function createPigmentField(renderer, uniforms, { detail = 1 } = {}) {
  uniforms.tNoise.value = fieldNoiseTexture();
  uniforms.detail.value = detail;
  return {
    /** seed moves the wash (?seed=n). */
    update(seed) {
      uniforms.fieldShift.value.set((613 * seed * detail) % 4096, (271 * seed * detail) % 4096);
    },
    /** Keeps the wash on the world: call each frame after the camera moves. */
    setView(camera) {
      setViewField(uniforms, camera, uniforms.resolution.value.y);
    },
    dispose() {},
  };
}

// The last pass, and the only owner of exposure, tone mapping and output conversion:
//   linear HDR -> x exposure -> Neutral tone map -> sRGB encode -> grade -> screen.
// The grade works on the encoded (screen) values, where its numbers were measured against R2.
// view: 0 final, 1 no grade (tone-mapped and encoded only).
// The material must have toneMapped = false, so three.js does not add its own copy of the tone
// mapping functions (it always adds the colour space ones).
export const FINISH_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    toneMappingExposure: { value: 1 }, // set from the meter (meter.js); read by NeutralToneMapping
    // The grade, neutral by default; the room sets it from its theme (themes/interior.js grade).
    blackLift: { value: new THREE.Color('#000000') }, // what black maps to
    paper: { value: new THREE.Color('#ffffff') }, // what white maps to
    saturation: { value: 1 },
    contrast: { value: 1 },
    midLift: { value: 1 }, // gamma: under 1 lifts the mid tones
    // Clarity (local contrast, the HDR-photo look): each pixel's value is pushed away from the
    // average around it, so detail shows in the darks and the lights alike. 0 is off.
    clarity: { value: 0 },
    clarityRadius: { value: 14 }, // px (CSS): the size of the neighbourhood
    texel: { value: new THREE.Vector2(1, 1) }, // one CSS pixel in uv, set on resize
    fabricKeep: { value: 0 }, // on the fabrics (alpha 0): how much of the plain colour is kept, ungraded
    // A hue-keyed secondary (a "keep the blues" key, as in an HSL qualifier): pixels that are
    // clearly blue before the grade keep this much of their plain colour. The grade's low
    // saturation and cream paper turned the sky grey-green (pass e10). 0 is off.
    blueKeep: { value: 0 },
    view: { value: 0 },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    #include <tonemapping_pars_fragment>
    uniform sampler2D tDiffuse;
    uniform vec3 blackLift, paper;
    uniform float saturation, contrast, midLift, view, clarity, clarityRadius, fabricKeep, blueKeep;
    uniform vec2 texel;
    varying vec2 vUv;
    // Tone map (multiplies by toneMappingExposure) and encode one linear sample.
    vec3 encoded(vec2 uv) {
      vec3 c = NeutralToneMapping(texture2D(tDiffuse, uv).rgb);
      return sRGBTransferOETF(vec4(clamp(c, 0.0, 1.0), 1.0)).rgb;
    }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec3 c = encoded(vUv);
      vec3 plain = c; // tone mapped and encoded, not graded
      float fabric = 1.0 - texture2D(tDiffuse, vUv).a; // 1 on the fabrics (their material writes alpha 0)
      if (view < 0.5) {
        if (clarity > 0.0) {
          // The average value around the pixel: 8 samples on each of two rings (r and r / 2),
          // the inner ring weighted twice, which keeps halos round the ink lines soft.
          float around = 0.0;
          for (int k = 0; k < 8; k++) {
            float a = float(k) * 0.785398 + 0.39;
            vec2 d = vec2(cos(a), sin(a)) * texel * clarityRadius;
            around += luma(encoded(vUv + d)) + 2.0 * luma(encoded(vUv + 0.5 * d));
          }
          c = clamp(c + clarity * (luma(c) - around / 24.0), 0.0, 1.0);
        }
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, saturation);
        c = pow(max(c, 0.0), vec3(midLift));
        c = (c - 0.5) * contrast + 0.5;
        c = mix(blackLift, paper, clamp(c, 0.0, 1.0)); // maps 0 → blackLift, 1 → paper
        c = mix(c, plain, fabric * fabricKeep); // the fabrics keep most of their photo's colour
        // How sky-blue the plain colour is: green clearly above red and blue above green (the sky
        // and its reflection in the river). 0 on wood, cream and greens (blue under green), and
        // on the clouds' lavender undersides (red about green), which a plain "blue above red and
        // green" key tinted lilac (pass e10).
        float blue = smoothstep(0.05, 0.11, plain.g - plain.r) * smoothstep(0.0, 0.04, plain.b - plain.g);
        c = mix(c, plain, blue * blueKeep * (1.0 - fabric * fabricKeep));
      }
      if (view > 1.5) c = vec3(fabric); // ?debug=fabric-mask
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
