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
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * A three-band toon ramp: shadow, mid, light. Each band is an RGB colour, so the shadow band can
 * lean cool (blue-violet) instead of just going darker. Nearest filtering keeps the bands hard.
 */
export function toonGradient(bands = [[0.34, 0.4, 0.62], [0.8, 0.76, 0.8], [1.0, 0.97, 0.9]], { smooth = false } = {}) {
  const data = new Uint8Array(bands.length * 4);
  bands.forEach((c, i) => data.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], i * 4));
  const tex = new THREE.DataTexture(data, bands.length, 1, THREE.RGBAFormat);
  // smooth: blend between the bands (painted gradation) instead of hard cel steps.
  tex.minFilter = tex.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const EDGE_VERTEX = /* glsl */ `
  attribute vec3 color;
  varying vec3 vNormal;
  flat varying vec3 vColor; // flat: a part id must not pick up interpolation error on large triangles
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const EDGE_FRAGMENT = /* glsl */ `
  varying vec3 vNormal;
  flat varying vec3 vColor;
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
    tWobble: { value: null }, // the hand-wobble noise, drawn once per screen size (INK_FIELD_FRAGMENT)
    tGrain: { value: null }, // the paper grain, likewise
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.05 },
    cameraFar: { value: 400 },
    ink: { value: new THREE.Color('#000000') }, // the caller's theme sets the ink colour
    strength: { value: 0.9 },
    split: { value: 0.7 }, // how far dark tones lean blue (0 = not at all)
    splitTint: { value: new THREE.Vector3(1, 1, 1) }, // the tone they lean towards, times their value (the caller's theme sets it)
    exposure: { value: 1 }, // the scene's exposure, if it is not 1: the tone thresholds below are in exposed values
    seams: { value: 0.5 }, // ink between touching parts (planks), relative to silhouettes
    thickness: { value: 1 },
    fade: { value: new THREE.Vector2(7, 26) },
    farInk: { value: 0.7 }, // ink on the view outside, relative to the room's
    farDepth: { value: new THREE.Vector2(0.02, 0.07) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tEdge, tDepth, tWobble, tGrain;
    uniform vec2 resolution, fade, farDepth;
    uniform float cameraNear, cameraFar, strength, thickness, split, seams, exposure, farInk;
    uniform vec3 ink, splitTint;
    varying vec2 vUv;

    float depthAt(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return d >= 1.0 ? cameraFar : perspectiveDepthToViewZ(d, cameraNear, cameraFar) * -1.0;
    }
    vec4 edgeAt(vec2 uv) { return texture2D(tEdge, uv); }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      // Painted shadows: darker tones lean blue-violet (split toning) instead of going grey-brown.
      float lum = dot(base.rgb, vec3(0.299, 0.587, 0.114));
      float sh = 1.0 - smoothstep(0.03, 0.22, lum * exposure); // linear values: this is before the output pass
      vec3 cool = mix(base.rgb, vec3(lum) * splitTint, 0.45); // half-way to a blue-grey of the same value
      base.rgb = mix(base.rgb, cool, sh * split);
      // Hand wobble: nudge where we look for edges by a slow noise, so lines waver like ink.
      // The noise (wobble x, y, thickness, pressure) is precomputed: INK_FIELD_FRAGMENT.
      vec2 px = 1.0 / resolution;
      vec4 hand = texelFetch(tWobble, ivec2(gl_FragCoord.xy), 0);
      vec2 wob = (hand.xy - 0.5) * 2.2 * px;
      float t = thickness * (0.75 + 0.5 * hand.z);
      vec2 uv = vUv + wob;

      // A cut-out panel (the window lattice) is drawn into the edge buffer as "nothing" (alpha 0)
      // at its own depth. It counts as open air, and what lies beyond it makes no edge with it:
      // no ink from the view outside lands on the lattice.
      float dT = depthAt(uv);
      vec4 ec = edgeAt(uv);
      bool cm = ec.a == 0.0 && dT < cameraFar * 0.99;
      float dc = cm ? cameraFar : dT;
      float depthEdge = 0.0, normalEdge = 0.0, idEdge = 0.0, nearest = dT, pairs = 1.0;
      for (int k = 0; k < 4; k++) {
        vec2 o = k == 0 ? vec2(1, 0) : k == 1 ? vec2(-1, 0) : k == 2 ? vec2(0, 1) : vec2(0, -1);
        vec2 s = uv + o * px * t;
        float sT = depthAt(s);
        vec4 e = edgeAt(s);
        bool sm = e.a == 0.0 && sT < cameraFar * 0.99;
        float d = sm ? cameraFar : sT;
        float pair = (cm && !sm && sT > dT + 0.3) || (sm && !cm && dT > sT + 0.3) ? 0.0 : 1.0;
        nearest = min(nearest, sT);
        pairs = min(pairs, pair);
        depthEdge += pair * abs(d - dc) / max(dc, 0.001);
        normalEdge += pair * distance(e.rgb, ec.rgb);
        idEdge += pair * step(0.002, abs(e.a - ec.a));
      }
      float creases = smoothstep(0.35, 0.7, normalEdge);
      float edge = max(smoothstep(0.06, 0.16, depthEdge), creases);
      float seam = min(idEdge, 1.0) * seams; // seams between parts (planks): lighter than silhouettes and creases
      edge = max(edge, seam * 0.5);
      // Thinner and fainter with distance (the room is within fade.x metres).
      edge *= 1.0 - smoothstep(fade.x, fade.y, min(dc, cm ? cameraFar : depthAt(uv + vec2(px.x * t, 0.0))));
      // The view outside (everything beyond fade.y metres). The test above compares depths, which
      // on ground seen at a low angle differ from pixel to pixel and would ink the whole plain.
      // Out here the test is the second difference of 1/depth instead: zero on any flat surface,
      // large at a silhouette, small at a crease. It is taken at whole pixels, with no wobble.
      vec2 size = vec2(textureSize(tDepth, 0));
      vec2 c0 = (floor(vUv * size) + 0.5) / size;
      float i0 = 1.0 / depthAt(c0);
      float lap = abs(1.0 / depthAt(c0 + vec2(1, 0) / size) + 1.0 / depthAt(c0 - vec2(1, 0) / size) - 2.0 * i0)
                + abs(1.0 / depthAt(c0 + vec2(0, 1) / size) + 1.0 / depthAt(c0 - vec2(0, 1) / size) - 2.0 * i0);
      float outside = smoothstep(fade.x, fade.y, nearest) * pairs * (cm ? 0.0 : 1.0);
      float farEdge = max(max(smoothstep(farDepth.x, farDepth.y, lap / i0), creases), seam * 0.6);
      farEdge *= farInk * mix(1.0, 0.5, smoothstep(80.0, 800.0, nearest)); // fainter in the haze
      edge = max(edge, farEdge * outside);
      edge *= 0.5 + 0.5 * hand.w; // uneven pressure: the line thins and breaks
      vec3 col = mix(base.rgb, ink, edge * strength);
      col *= 1.0 - seam * 0.55 * (1.0 - smoothstep(fade.x, fade.y, dc)) * (cm ? 0.0 : 1.0); // seams darken whatever they cross, so they show on dark wood too
      // Paper grain: fine tooth plus a faint larger mottling, like watercolour paper (precomputed).
      col *= 0.935 + 0.11 * texelFetch(tGrain, ivec2(gl_FragCoord.xy), 0).r;
      gl_FragColor = vec4(col, base.a);
    }
  `,
};

// The ink pass's noise depends on the pixel's position only, never on the image, so it is drawn
// once per screen size instead of every frame (7 value-noise lookups, 28 sines, per pixel per
// frame saved). part 0: wobble x, wobble y, thickness, pressure (RGBA, 8 bits: a wobble step is
// 0.01 px); part 1: the paper grain (one channel). size = the buffer's size in pixels; resolution
// = the ink pass's resolution uniform, which can be a fraction of a pixel larger (dpr 1.5).
const INK_FIELD_FRAGMENT = /* glsl */ `
  uniform vec2 resolution, size;
  uniform float part;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    if (part < 0.5) {
      vec2 q = gl_FragCoord.xy / size * resolution / 9.0; // vUv * resolution / 9 in the ink pass
      gl_FragColor = vec4(noise(q), noise(q + 17.3), noise(q * 0.35 + 5.0), noise(q * 2.3));
    } else {
      vec2 fc = gl_FragCoord.xy;
      float tooth = noise(fc * 0.85) * 0.6 + noise(fc * 0.21 + 3.0) * 0.4;
      float mottle = noise(fc * 0.012 + 11.0);
      // 0.955 + 0.07 tooth + 0.04 (mottle - 0.5) = 0.935 + 0.11 g, with g in 0..1
      gl_FragColor = vec4((0.07 * tooth + 0.04 * mottle) / 0.11, 0.0, 0.0, 1.0);
    }
  }
`;

// A cut-out panel in the edge buffer: "nothing here" (alpha 0), but at the panel's own depth.
const MASK_VERTEX = /* glsl */ `
  uniform mat3 uvTransform;
  varying vec2 vUv;
  void main() {
    vUv = (uvTransform * vec3(uv, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const MASK_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  void main() {
    if (texture2D(map, vUv).a < 0.5) discard;
    gl_FragColor = vec4(0.0);
  }
`;

/**
 * Creates the outline pass. Call render() each frame before the composer renders; it draws the
 * edge buffer for objects on `layer` (default 0). `mask` = { layer, map }: objects on that layer
 * are panels cut out by `map` (alpha); they hide the ink of what is behind them and get none.
 */
export function createOutline(renderer, scene, camera, { layer = 0, ink = '#000000', lineWidth = 1.3, mask = null } = {}) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  target.depthTexture = new THREE.DepthTexture(1, 1);
  target.texture.minFilter = target.texture.magFilter = THREE.NearestFilter;
  const edgeMaterial = new THREE.ShaderMaterial({ vertexShader: EDGE_VERTEX, fragmentShader: EDGE_FRAGMENT, side: THREE.DoubleSide });
  const material = new THREE.ShaderMaterial({ ...OUTLINE_SHADER, uniforms: THREE.UniformsUtils.clone(OUTLINE_SHADER.uniforms) });
  let maskMaterial = null;
  if (mask) {
    mask.map.updateMatrix();
    maskMaterial = new THREE.ShaderMaterial({ uniforms: { map: { value: mask.map }, uvTransform: { value: mask.map.matrix } }, vertexShader: MASK_VERTEX, fragmentShader: MASK_FRAGMENT, side: THREE.DoubleSide });
  }
  material.uniforms.ink.value.set(ink);
  const clear = new THREE.Color();
  const fieldOptions = { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
  const wobble = new THREE.WebGLRenderTarget(1, 1, fieldOptions);
  const grain = new THREE.WebGLRenderTarget(1, 1, { ...fieldOptions, format: THREE.RedFormat });
  const fieldMaterial = new THREE.ShaderMaterial({
    uniforms: { resolution: { value: new THREE.Vector2() }, size: { value: new THREE.Vector2() }, part: { value: 0 } },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: INK_FIELD_FRAGMENT,
  });
  const fieldQuad = new FullScreenQuad(fieldMaterial);
  material.uniforms.tWobble.value = wobble.texture;
  material.uniforms.tGrain.value = grain.texture;

  return {
    material,
    setSize(w, h, pixelRatio) {
      target.setSize(Math.round(w * pixelRatio), Math.round(h * pixelRatio));
      material.uniforms.resolution.value.set(w * pixelRatio, h * pixelRatio);
      material.uniforms.thickness.value = Math.max(0.75, pixelRatio * 0.7) * lineWidth;
      // The fields, at the size of the composer's buffers (WebGL truncates w * pixelRatio).
      const size = fieldMaterial.uniforms.size.value.set(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio));
      fieldMaterial.uniforms.resolution.value.copy(material.uniforms.resolution.value);
      const previous = renderer.getRenderTarget();
      for (const [part, field] of [wobble, grain].entries()) {
        field.setSize(size.x, size.y);
        fieldMaterial.uniforms.part.value = part;
        renderer.setRenderTarget(field);
        fieldQuad.render(renderer);
      }
      renderer.setRenderTarget(previous);
    },
    render() {
      const background = scene.background;
      const override = scene.overrideMaterial;
      const layers = camera.layers.mask;
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
      if (maskMaterial) {
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        scene.overrideMaterial = maskMaterial;
        camera.layers.set(mask.layer);
        renderer.render(scene, camera);
        renderer.autoClear = autoClear;
      }
      renderer.setRenderTarget(null);
      renderer.setClearColor(clear, alpha);
      camera.layers.mask = layers;
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
      maskMaterial?.dispose();
      material.dispose();
      wobble.dispose();
      grain.dispose();
      fieldMaterial.dispose();
      fieldQuad.dispose();
    },
  };
}
