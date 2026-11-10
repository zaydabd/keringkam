import * as THREE from 'three';

// Watercolour look, after R2 (a painting of the room supplied by the user; not in the repo).
// Two passes, kept apart as the image-pipeline / colour-grading skills ask:
//   1. pigment (linear, before tone mapping): one shared pigment field drives the wash, the
//      granulation, the wet-edge darkening and the bleed, so the effects agree with each other.
//   2. grade (display values, after OutputPass): lifted warm blacks, lower saturation, cream
//      highlights. Tone mapping happens once, in OutputPass.
// Debug: ?debug=paint-pigment | paint-edge | paint-bleed shows a field in grey; ?debug=paint-off
// skips both passes. Coordinates are screen pixels: the "paper" is the screen, as in a painting.

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
    resolution: { value: new THREE.Vector2(1, 1) },
    scale: { value: 1 }, // device pixel ratio: keeps the field the same size on screen
    // Perceptual controls (0 = off).
    washVariation: { value: 0.22 }, // large soft blotches of lighter and darker pigment
    granulation: { value: 0.1 }, // pigment settling in the paper's tooth, more in dark washes
    edgeDarkening: { value: 0.35 }, // pigment pooling where a wash meets a different value
    bleed: { value: 0.45 }, // wet-in-wet: edges softened where the pigment is wet
    shadowTint: { value: new THREE.Color('#8c88a4') }, // R2's shadows lean lavender-grey
    shadowTintAmount: { value: 0.2 },
    view: { value: 0 }, // 0 final, 1 pigment field, 2 edge field, 3 bleed field
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float scale, washVariation, granulation, edgeDarkening, bleed, shadowTintAmount, view;
    uniform vec3 shadowTint;
    varying vec2 vUv;
    ${NOISE}
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    void main() {
      vec2 fc = gl_FragCoord.xy / scale;
      vec2 px = 1.0 / resolution;
      // Field 1, pigment density: domain-warped, two bands (~180 px blotches, ~45 px mottle).
      vec2 w = vec2(fbm(fc / 260.0), fbm(fc / 260.0 + 9.2)) - 0.5;
      float pigment = fbm(fc / 180.0 + w * 1.6) * 0.7 + fbm(fc / 45.0 + w) * 0.3;

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
      vec3 soft = vec3(0.0);
      for (int k = 0; k < 8; k++) {
        float a = float(k) * 0.785 + pigment * 3.0;
        soft += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * px * 3.0 * scale).rgb;
      }
      soft /= 8.0;
      vec3 col = mix(base, soft, bleed * wet);

      float lum = luma(col);
      // Shadows lean lavender-grey; lights keep their warm colour.
      float sh = 1.0 - smoothstep(0.02, 0.3, lum);
      col = mix(col, lum * shadowTint / luma(shadowTint), sh * shadowTintAmount);
      // Wash: lighter and darker blotches, mostly in the mid tones.
      col *= 1.0 + washVariation * (pigment - 0.5) * (0.5 + 0.5 * smoothstep(0.02, 0.25, lum));
      // Edge darkening: pigment pools along the edge of a wash, more where it is dense.
      col *= 1.0 - edgeDarkening * wetEdge * (0.5 + 0.5 * pigment);
      // Granulation: fine tooth, stronger in dark, dense washes.
      float tooth = noise(fc * 0.9) * 0.6 + noise(fc * 0.33 + 4.0) * 0.4;
      col *= 1.0 + granulation * (tooth - 0.5) * (0.4 + pigment) * (1.0 - smoothstep(0.1, 0.8, lum) * 0.6);

      if (view > 0.5) col = vec3(view < 1.5 ? pigment : view < 2.5 ? wetEdge : wet) * 0.6;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    blackLift: { value: new THREE.Color('#2e2420') }, // R2's darkest darks are warm brown, not black
    paper: { value: new THREE.Color('#fbf3e4') }, // and its lights are cream paper
    saturation: { value: 0.82 },
    contrast: { value: 0.9 },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 blackLift, paper;
    uniform float saturation, contrast;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb; // display values (after OutputPass)
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c = mix(blackLift, paper, clamp(c, 0.0, 1.0)); // maps 0 → warm brown, 1 → cream
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
