import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { VIEW_FIELD, setViewField } from './toon.js';

// Watercolour look, after R2 (a painting of the room supplied by the user; not in the repo).
// Two passes, kept apart as the image-pipeline / colour-grading skills ask:
//   1. pigment (linear, before tone mapping): one shared pigment field drives the wash, the
//      granulation, the wet-edge darkening and the bleed, so the effects agree with each other.
//   2. finish: exposure, the one tone map, sRGB encoding, then the grade (lifted warm blacks,
//      lower saturation, cream highlights).
// Debug: ?debug=paint-pigment | paint-edge | paint-bleed shows a field in grey; ?off=pigment or
// ?off=grade switches a stage off. The wash blotches and the paper tooth are repeating tiles read at
// each pixel's direction in the world, so they stay on the room when the view turns instead of the
// room sliding under them.

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  // The same noise, repeating every n cells, and an fbm of it that repeats every n.
  float noise(vec2 p, float n) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec2 a = mod(i, n), b = mod(i + 1.0, n);
    return mix(mix(hash(a), hash(vec2(b.x, a.y)), f.x), mix(hash(vec2(a.x, b.y)), hash(b), f.x), f.y);
  }
  float fbm(vec2 p, float n) { return noise(p, n) * 0.55 + noise(p * 2.0 + 7.1, n * 2.0) * 0.3 + noise(p * 4.0 + 3.7, n * 4.0) * 0.15; }
`;

// The wash tile, in field units (screen pixels / scale * detail): its bands (256, 192 and 48) fit
// it a whole number of times (3, 4 and 16), so it repeats without a seam.
const PIGMENT_TILE = 768;
const TOOTH_TILE = 256;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const PIGMENT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tField: { value: null }, // the paper tooth, a tile drawn once (createPigmentField)
    tPigment: { value: null }, // the wash tile, drawn once (createPigmentField)
    viewRotation: { value: new THREE.Matrix3() }, // the camera's rotation and focal length (createPigmentField.setView):
    focal: { value: 1000 }, // the wash is read at each pixel's direction in the world (VIEW_FIELD)
    fieldShift: { value: new THREE.Vector2() }, // ?seed: where in the tile the screen starts, in field units
    detail: { value: 1 }, // field units per screen pixel / scale (the theme's paint.detail)
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
    uniform sampler2D tDiffuse, tField, tPigment;
    uniform vec2 resolution, fieldShift;
    uniform mat3 viewRotation;
    uniform float focal, detail, scale, washVariation, granulation, edgeDarkening, bleed, shadowTintAmount, view, exposure;
    uniform vec3 shadowTint;
    varying vec2 vUv;
    // Luminance as it will be shown, relative to the exposure the thresholds were tuned at (1.85).
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)) * exposure / 1.85; }
    ${VIEW_FIELD}

    void main() {
      vec2 px = 1.0 / resolution;
      // Field 1, pigment density (PIGMENT_TILE_SHADER), and the paper tooth (TOOTH_SHADER, read at
      // the nearest whole texel so the fine grain does not blur and sharpen as it moves), both kept
      // on the world as the view turns.
      vec2 at = viewField(gl_FragCoord.xy, resolution, viewRotation, focal);
      float pigment = texture2D(tPigment, (at / scale * detail + fieldShift) / ${PIGMENT_TILE}.0).r;
      vec2 field = vec2(0.0, texture2D(tField, (floor(at / scale) + 0.5) / ${TOOTH_TILE}.0).r);

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

// The pigment field and the paper tooth depend on position (and the seed) only, never on the
// image, so they are drawn once instead of every frame: this saves 14 value-noise lookups (56
// sines) per pixel per frame. 8 bits per channel is enough: one step is 0.4% of the field's
// range. ?debug=paint-pigment shows the field.
// The wash: one tile of PIGMENT_TILE field units, drawn once, read through the camera's turn.
const PIGMENT_TILE_SHADER = {
  uniforms: {},
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    ${NOISE}
    void main() {
      // Pigment density: domain-warped, two bands (~192 px blotches, ~48 px mottle at detail 1;
      // detail 2 halves them, so twice as many across the screen). The counts a tile: 3, 4, 16.
      vec2 d = gl_FragCoord.xy;
      vec2 w = vec2(fbm(d / 256.0, 3.0), fbm(d / 256.0 + 9.2, 3.0)) - 0.5;
      float pigment = fbm(d / 192.0 + w * 1.6, 4.0) * 0.7 + fbm(d / 48.0 + w, 16.0) * 0.3;
      gl_FragColor = vec4(pigment, 0.0, 0.0, 1.0);
    }
  `,
};
// The paper tooth for the granulation: a tile of TOOTH_TILE px (CSS), 0.875 cells a px (224 a
// tile) and 0.328 (84).
const TOOTH_SHADER = {
  uniforms: {},
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    ${NOISE}
    void main() {
      vec2 fc = gl_FragCoord.xy;
      float tooth = noise(fc * 0.875, 224.0) * 0.6 + noise(fc * 0.328125 + 4.0, 84.0) * 0.4;
      gl_FragColor = vec4(tooth, 0.0, 0.0, 1.0);
    }
  `,
};

/** The pigment pass's field textures, wired into its uniforms. Call setView() each frame; seed moves the field (?seed=n), for seed sweeps.
 * detail scales how fine the wash blotches are (the theme's paint.detail: 1 as drawn, 2 twice as fine). */
export function createPigmentField(renderer, uniforms, { detail = 1 } = {}) {
  const options = { type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, generateMipmaps: false };
  const tile = new THREE.WebGLRenderTarget(PIGMENT_TILE, PIGMENT_TILE, { ...options, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const tooth = new THREE.WebGLRenderTarget(TOOTH_TILE, TOOTH_TILE, { ...options, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const material = new THREE.ShaderMaterial(TOOTH_SHADER);
  const tileMaterial = new THREE.ShaderMaterial(PIGMENT_TILE_SHADER);
  const quad = new FullScreenQuad(tileMaterial);
  const draw = (into) => {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(into);
    quad.render(renderer);
    renderer.setRenderTarget(previous);
  };
  draw(tile);
  quad.material = material;
  draw(tooth);
  uniforms.tField.value = tooth.texture;
  uniforms.tPigment.value = tile.texture;
  uniforms.detail.value = detail;
  return {
    /** seed moves the wash within its tile (?seed=n). */
    update(seed) {
      uniforms.fieldShift.value.set((613 * seed * detail) % PIGMENT_TILE, (271 * seed * detail) % PIGMENT_TILE);
    },
    /** Keeps the wash on the world: call each frame after the camera moves. */
    setView(camera) {
      setViewField(uniforms, camera, uniforms.resolution.value.y);
    },
    dispose() {
      tooth.dispose();
      tile.dispose();
      material.dispose();
      tileMaterial.dispose();
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
    // Clarity (local contrast, the HDR-photo look): each pixel's value is pushed away from the
    // average around it, so detail shows in the darks and the lights alike. 0 is off.
    clarity: { value: 0 },
    clarityRadius: { value: 14 }, // px (CSS): the size of the neighbourhood
    texel: { value: new THREE.Vector2(1, 1) }, // one CSS pixel in uv, set on resize
    view: { value: 0 },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    #include <tonemapping_pars_fragment>
    uniform sampler2D tDiffuse;
    uniform vec3 blackLift, paper;
    uniform float saturation, contrast, midLift, view, clarity, clarityRadius;
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
      }
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
