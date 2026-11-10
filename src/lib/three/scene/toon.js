// Hand-drawn look helpers: toon shading bands and an ink outline post-process.
//
// Outlines: the outlined objects are drawn a second time into a small "edge buffer" that holds
// their view-space normal (rgb) and a per-part id (alpha, from the vertex colour each part gets).
// A Sobel filter over depth, normals and ids finds every edge: silhouettes, creases and the
// seams between planks. Lines are drawn in warm ink, wobble slightly like a hand-drawn line,
// and fade with distance. Objects on other layers (the painted landscape) get no outlines.
// After Omar Shehata, "How to render full outlines as a post process" (three.js forum, 2021)
// and Maxime Heckel, "Moebius-style post-processing and other stylized shaders" (2024).

import * as THREE from 'three';

/**
 * A three-band toon ramp: shadow, mid, light. Each band is an RGB colour, so the shadow band can
 * lean cool (blue-violet) instead of just going darker. Nearest filtering keeps the bands hard.
 */
export function toonGradient(bands = [[0.34, 0.4, 0.62], [0.8, 0.76, 0.8], [1.0, 0.97, 0.9]]) {
  const data = new Uint8Array(bands.length * 4);
  bands.forEach((c, i) => data.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], i * 4));
  const tex = new THREE.DataTexture(data, bands.length, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const EDGE_VERTEX = /* glsl */ `
  attribute vec3 color;
  varying vec3 vNormal;
  varying vec3 vColor;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const EDGE_FRAGMENT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vColor;
  void main() {
    vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 c = floor(vColor * 255.0 + 0.5); // quantise: the colour is the same across a part, give or take rounding
    float id = fract(sin(dot(c, vec3(0.129898, 0.78233, 0.37719))) * 43758.5453);
    gl_FragColor = vec4(n * 0.5 + 0.5, 0.05 + id * 0.95);
  }
`;

const OUTLINE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tEdge: { value: null },
    tDepth: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.05 },
    cameraFar: { value: 400 },
    ink: { value: new THREE.Color('#3a2418') },
    strength: { value: 0.9 },
    split: { value: 0.7 }, // how far dark tones lean blue (0 = not at all)
    wash: { value: 0 }, // watercolour wash: slow blotches of lighter and darker pigment (0 = off)
    thickness: { value: 1 },
    fade: { value: new THREE.Vector2(7, 26) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tEdge, tDepth;
    uniform vec2 resolution, fade;
    uniform float cameraNear, cameraFar, strength, thickness, split, wash;
    uniform vec3 ink;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float depthAt(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return d >= 1.0 ? cameraFar : perspectiveDepthToViewZ(d, cameraNear, cameraFar) * -1.0;
    }
    vec4 edgeAt(vec2 uv) { return texture2D(tEdge, uv); }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      // Painted shadows: darker tones lean blue-violet (split toning) instead of going grey-brown.
      float lum = dot(base.rgb, vec3(0.299, 0.587, 0.114));
      float sh = 1.0 - smoothstep(0.03, 0.22, lum); // linear values: this is before the output pass
      vec3 cool = mix(base.rgb, vec3(lum) * vec3(0.7, 0.86, 1.5), 0.45); // half-way to a blue-grey of the same value
      base.rgb = mix(base.rgb, cool, sh * split);
      // Hand wobble: nudge where we look for edges by a slow noise, so lines waver like ink.
      vec2 px = 1.0 / resolution;
      vec2 q = vUv * resolution / 9.0;
      vec2 wob = (vec2(noise(q), noise(q + 17.3)) - 0.5) * 2.2 * px;
      float t = thickness * (0.75 + 0.5 * noise(q * 0.35 + 5.0));
      vec2 uv = vUv + wob;

      float dc = depthAt(uv);
      vec4 ec = edgeAt(uv);
      float depthEdge = 0.0, normalEdge = 0.0, idEdge = 0.0;
      for (int k = 0; k < 4; k++) {
        vec2 o = k == 0 ? vec2(1, 0) : k == 1 ? vec2(-1, 0) : k == 2 ? vec2(0, 1) : vec2(0, -1);
        vec2 s = uv + o * px * t;
        float d = depthAt(s);
        vec4 e = edgeAt(s);
        depthEdge += abs(d - dc) / max(dc, 0.001);
        normalEdge += distance(e.rgb, ec.rgb);
        idEdge += step(0.002, abs(e.a - ec.a));
      }
      float edge = max(smoothstep(0.06, 0.16, depthEdge), smoothstep(0.35, 0.7, normalEdge));
      edge = max(edge, min(idEdge, 1.0) * 0.5); // seams between parts: lighter than silhouettes and creases
      // Thinner and fainter with distance; nothing on the sky.
      edge *= 1.0 - smoothstep(fade.x, fade.y, min(dc, depthAt(uv + vec2(px.x * t, 0.0))));
      edge *= 0.8 + 0.2 * noise(q * 3.1);
      vec3 col = mix(base.rgb, ink, edge * strength);
      // Paper grain: fine tooth plus a faint larger mottling, like watercolour paper.
      vec2 fc = gl_FragCoord.xy;
      float tooth = noise(fc * 0.85) * 0.6 + noise(fc * 0.21 + 3.0) * 0.4;
      float mottle = noise(fc * 0.012 + 11.0);
      col *= 0.955 + 0.07 * tooth + 0.04 * (mottle - 0.5);
      // Watercolour wash: large soft blotches and a medium mottle, stronger in the mid tones,
      // and a little pigment pooling (darker) along the ink lines.
      float lumc = dot(col, vec3(0.299, 0.587, 0.114));
      float blot = (noise(fc / 170.0 + 2.3) - 0.5) * 0.22 + (noise(fc / 48.0 + 8.1) - 0.5) * 0.1;
      col *= 1.0 + wash * blot * (0.4 + 0.6 * smoothstep(0.02, 0.3, lumc));
      col *= 1.0 - wash * edge * 0.08;
      gl_FragColor = vec4(col, base.a);
    }
  `,
};

/**
 * Creates the outline pass. Call render() each frame before the composer renders; it draws the
 * edge buffer for objects on `layer` (default 0).
 */
export function createOutline(renderer, scene, camera, { layer = 0, ink = '#3a2418' } = {}) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  target.depthTexture = new THREE.DepthTexture(1, 1);
  target.texture.minFilter = target.texture.magFilter = THREE.NearestFilter;
  const edgeMaterial = new THREE.ShaderMaterial({ vertexShader: EDGE_VERTEX, fragmentShader: EDGE_FRAGMENT, side: THREE.DoubleSide });
  const material = new THREE.ShaderMaterial({ ...OUTLINE_SHADER, uniforms: THREE.UniformsUtils.clone(OUTLINE_SHADER.uniforms) });
  material.uniforms.ink.value.set(ink);
  const clear = new THREE.Color();

  return {
    material,
    setSize(w, h, pixelRatio) {
      target.setSize(Math.round(w * pixelRatio), Math.round(h * pixelRatio));
      material.uniforms.resolution.value.set(w * pixelRatio, h * pixelRatio);
      material.uniforms.thickness.value = Math.max(1, pixelRatio * 0.9);
    },
    render() {
      const background = scene.background;
      const override = scene.overrideMaterial;
      const mask = camera.layers.mask;
      const alpha = renderer.getClearAlpha();
      const shadows = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false; // the shadow map is already up to date for this frame
      renderer.getClearColor(clear);
      scene.background = null;
      scene.overrideMaterial = edgeMaterial;
      camera.layers.set(layer);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clear, alpha);
      camera.layers.mask = mask;
      renderer.shadowMap.autoUpdate = shadows;
      scene.overrideMaterial = override;
      scene.background = background;
      const u = material.uniforms;
      u.tEdge.value = target.texture;
      u.tDepth.value = target.depthTexture;
      u.cameraNear.value = camera.near;
      u.cameraFar.value = camera.far;
    },
    dispose() {
      target.depthTexture.dispose();
      target.dispose();
      edgeMaterial.dispose();
      material.dispose();
    },
  };
}
