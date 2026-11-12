import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Watercolour look, after R2 (a painting of the room supplied by the user; not in the repo).
// Two passes, kept apart as the image-pipeline / colour-grading skills ask:
//   1. pigment (linear, before tone mapping): one shared pigment field drives the wash, the
//      granulation, the wet-edge darkening and the bleed, so the effects agree with each other.
//   2. finish: exposure, the one tone map, sRGB encoding, then the grade (lifted warm blacks,
//      lower saturation, cream highlights).
// Debug: ?debug=paint-pigment | paint-edge | paint-bleed shows a field in grey; ?off=pigment or
// ?off=grade switches a stage off. Coordinates are screen pixels: the "paper" is the screen, as in a painting.

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.03 + 7.1) * 0.3 + noise(p * 4.1 + 3.7) * 0.15; }
`;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const PIGMENT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tField: { value: null }, // the pigment field and the paper tooth, drawn once per screen size (createPigmentField)
    resolution: { value: new THREE.Vector2(1, 1) },
    scale: { value: 1 }, // device pixel ratio: keeps the field the same size on screen
    // Perceptual controls, off by default (0); the room sets them from its theme (themes/interior.js paint).
    washVariation: { value: 0 }, // large soft blotches of lighter and darker pigment
    granulation: { value: 0 }, // pigment settling in the paper's tooth, more in dark washes
    edgeDarkening: { value: 0 }, // pigment pooling where a wash meets a different value
    bleed: { value: 0 }, // wet-in-wet: edges softened where the pigment is wet
    shadowTint: { value: new THREE.Color('#ffffff') }, // the hue shadows lean towards
    shadowTintAmount: { value: 0 },
    exposure: { value: 1.85 }, // set from the meter: tone thresholds are judged on exposed values
    view: { value: 0 }, // 0 final, 1 pigment field, 2 edge field, 3 bleed field
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tField;
    uniform vec2 resolution;
    uniform float scale, washVariation, granulation, edgeDarkening, bleed, shadowTintAmount, view, exposure;
    uniform vec3 shadowTint;
    varying vec2 vUv;
    // Luminance as it will be shown, relative to the exposure the thresholds were tuned at (1.85).
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)) * exposure / 1.85; }

    void main() {
      vec2 px = 1.0 / resolution;
      // Field 1, pigment density, and the paper tooth: precomputed (PIGMENT_FIELD_SHADER).
      vec2 field = texelFetch(tField, ivec2(gl_FragCoord.xy), 0).rg;
      float pigment = field.x;

      vec3 base = texture2D(tDiffuse, vUv).rgb;
      // Field 2, wet edge: how much the value changes across a few pixels (log luma, so dark
      // and light areas are treated alike).
      vec2 r = px * 2.5 * scale;
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
        vec2 dir = vec2(cos(pigment * 3.0), sin(pigment * 3.0)) * px * 3.0 * scale;
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

      if (view > 0.5) col = vec3(view < 1.5 ? pigment : view < 2.5 ? wetEdge : wet) * 0.6;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// The pigment field and the paper tooth depend on the pixel's position (and the seed) only, never
// on the image, so they are drawn once per screen size instead of every frame: this saves 14
// value-noise lookups (56 sines) per pixel per frame. 8 bits per channel is enough: one step is
// 0.4% of the field's range. ?debug=paint-pigment shows the field.
const PIGMENT_FIELD_SHADER = {
  uniforms: { scale: { value: 1 }, seed: { value: 0 } },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform float scale, seed;
    ${NOISE}
    void main() {
      vec2 fc = gl_FragCoord.xy / scale + seed * vec2(613.0, 271.0);
      // Pigment density: domain-warped, two bands (~180 px blotches, ~45 px mottle).
      vec2 w = vec2(fbm(fc / 260.0), fbm(fc / 260.0 + 9.2)) - 0.5;
      float pigment = fbm(fc / 180.0 + w * 1.6) * 0.7 + fbm(fc / 45.0 + w) * 0.3;
      // Paper tooth for the granulation.
      float tooth = noise(fc * 0.9) * 0.6 + noise(fc * 0.33 + 4.0) * 0.4;
      gl_FragColor = vec4(pigment, tooth, 0.0, 1.0);
    }
  `,
};

/** The pigment pass's field texture. Call update() when the drawing buffer's size changes; seed
 * moves the field (?seed=n), for seed sweeps. */
export function createPigmentField(renderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
  target.texture.minFilter = target.texture.magFilter = THREE.NearestFilter;
  target.texture.generateMipmaps = false;
  const material = new THREE.ShaderMaterial({ ...PIGMENT_FIELD_SHADER, uniforms: THREE.UniformsUtils.clone(PIGMENT_FIELD_SHADER.uniforms) });
  const quad = new FullScreenQuad(material);
  return {
    texture: target.texture,
    /** Size in drawing-buffer pixels (rounded up, so it covers the composer's buffers). */
    update(width, height, scale, seed) {
      target.setSize(Math.ceil(width), Math.ceil(height));
      material.uniforms.scale.value = scale;
      material.uniforms.seed.value = seed;
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      quad.render(renderer);
      renderer.setRenderTarget(previous);
    },
    dispose() {
      target.dispose();
      material.dispose();
      quad.dispose();
    },
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
    view: { value: 0 },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    #include <tonemapping_pars_fragment>
    uniform sampler2D tDiffuse;
    uniform vec3 blackLift, paper;
    uniform float saturation, contrast, midLift, view;
    varying vec2 vUv;
    void main() {
      vec3 c = NeutralToneMapping(texture2D(tDiffuse, vUv).rgb); // multiplies by toneMappingExposure
      c = sRGBTransferOETF(vec4(clamp(c, 0.0, 1.0), 1.0)).rgb;
      if (view < 0.5) {
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, saturation);
        c = pow(max(c, 0.0), vec3(midLift));
        c = (c - 0.5) * contrast + 0.5;
        c = mix(blackLift, paper, clamp(c, 0.0, 1.0)); // maps 0 → blackLift, 1 → paper
      }
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
