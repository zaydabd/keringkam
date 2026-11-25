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
    // Instanced meshes (the vines' leaves): three defines USE_INSTANCING and supplies instanceMatrix
    // even under scene.overrideMaterial; without this every instance was inked at the mesh origin,
    // stacked into a "web of thin lines" in the window shot.
    #ifdef USE_INSTANCING
      vec4 p = instanceMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    #else
      vec4 p = vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
    #endif
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * p;
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

// The noise the ink's hand, the paper grain and the wash are made of: value noise whose lattice
// values come from a texture of random bytes (four independent noises, one per channel). One
// filtered read gives the smoothed noise: the read lands at the cell plus its smoothstep-eased
// fraction, so the hardware's bilinear blend does the interpolation.
// The lattice repeats every NOISE_SIZE cells, so a pattern repeats only every 512 cells (4096 px
// for the hand's 8 px cells): never within a screen. The 256 px tiles the fields were drawn into
// before repeated every 256 px, and every line's wiggle with them: a bump every few centimetres.
const NOISE_SIZE = 512;
let noiseTexture = null;
/** The shared random-lattice texture (made once; deterministic). */
export function fieldNoiseTexture() {
  if (noiseTexture) return noiseTexture;
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
  let s = 0x9e3779b9; // mulberry32, a fixed seed: the same paper on every load
  for (let i = 0; i < data.length; i++) {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    data[i] = ((t ^ (t >>> 14)) >>> 0) & 255;
  }
  noiseTexture = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat);
  noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
  noiseTexture.minFilter = noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.generateMipmaps = false;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}
/** GLSL: noise4(p) = four independent smooth value noises at p (1 cell = 1 unit), 0..1. Needs the
 * uniform tNoise = fieldNoiseTexture(). */
export const FIELD_NOISE = /* glsl */ `
  uniform sampler2D tNoise;
  vec4 noise4(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return textureLod(tNoise, (i + f + 0.5) / ${NOISE_SIZE}.0, 0.0);
  }
`;

/** GLSL: where a pixel reads a field that stays on the world when the camera turns: the pixel's
 * ray turned into the world (rotation = the camera's world rotation), as azimuth and elevation
 * times the focal length (in pixels). At the frame's centre one pixel is one field unit; towards
 * the edges the field is stretched a little (16% at the edge of a 47° view), the same on every
 * frame. The camera's position is not used: during a move between shots the field still slides
 * by the parallax. */
export const VIEW_FIELD = /* glsl */ `
  vec2 viewField(vec2 frag, vec2 resolution, mat3 rotation, float focal) {
    vec3 r = rotation * vec3((frag - 0.5 * resolution) / focal, -1.0);
    return focal * vec2(atan(r.x, -r.z), asin(clamp(r.y / length(r), -1.0, 1.0)));
  }
`;
/** Sets a pass's viewRotation and focal uniforms from the camera (focal: drawing-buffer pixels). */
export function setViewField(uniforms, camera, bufferHeight) {
  uniforms.viewRotation.value.setFromMatrix4(camera.matrixWorld);
  uniforms.focal.value = bufferHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
}
const OUTLINE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tEdge: { value: null },
    tDepth: { value: null },
    tNoise: { value: null }, // the random lattice of the hand and grain noise (fieldNoiseTexture)
    pixelRatio: { value: 1 }, // the hand and the grain are sized in CSS pixels, the same at any ratio
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
    wobble: { value: 2.2 }, // px (CSS): how far the hand moves where a line is looked for
    lines: { value: 1 }, // 0: no lines at all (the split tone and the paper grain stay); setLines
    creases: { value: 1 }, // lines where the surface turns (from the normals), relative to silhouettes
    pressure: { value: 1 }, // how much the uneven pressure thins and breaks the lines (0 = even lines)
    fade: { value: new THREE.Vector2(7, 26) },
    farInk: { value: 0.7 }, // ink on the view outside, relative to the room's
    fabricKeep: { value: 0 }, // on the fabrics (alpha 0): how much of the scene colour is kept unpainted
    fabricInk: { value: 0 }, // and how much ink they still get
    farDepth: { value: new THREE.Vector2(0.02, 0.07) },
    // Where the hand field is read: each pixel's direction in the world (setView), so the wobble,
    // thickness and breaks stay on the room when the view turns instead of on the screen (no "boiling").
    viewRotation: { value: new THREE.Matrix3() },
    focal: { value: 1000 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tEdge, tDepth;
    uniform vec2 resolution, fade, farDepth;
    uniform mat3 viewRotation;
    uniform float focal, pixelRatio;
    ${VIEW_FIELD}
    ${FIELD_NOISE}
    uniform float cameraNear, cameraFar, strength, thickness, split, seams, exposure, farInk, fabricKeep, fabricInk, wobble, lines, creases, pressure;
    uniform vec3 ink, splitTint;
    varying vec2 vUv;

    float depthAt(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return d >= 1.0 ? cameraFar : perspectiveDepthToViewZ(d, cameraNear, cameraFar) * -1.0;
    }
    vec4 edgeAt(vec2 uv) { return texture2D(tEdge, uv); }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 photo = base.rgb; // the scene's colour before any ink: the fabrics keep most of it
      // Painted shadows: darker tones lean blue-violet (split toning) instead of going grey-brown.
      float lum = dot(base.rgb, vec3(0.299, 0.587, 0.114));
      float sh = 1.0 - smoothstep(0.03, 0.22, lum * exposure); // linear values: this is before the output pass
      vec3 cool = mix(base.rgb, vec3(lum) * splitTint, 0.45); // half-way to a blue-grey of the same value
      base.rgb = mix(base.rgb, cool, sh * split);
      // Hand wobble: nudge where we look for edges by a slow noise, so lines waver like ink.
      // The noise (wobble x, y on 8 px cells; thickness on 21 px; pressure on 3.6 px, all CSS px)
      // is read at the pixel's direction in the world (VIEW_FIELD), so it stays on the room as
      // the view turns, and never repeats within a screen (FIELD_NOISE).
      vec2 px = 1.0 / resolution;
      vec2 atBuffer = viewField(gl_FragCoord.xy, resolution, viewRotation, focal);
      vec2 q = atBuffer / pixelRatio / 8.0;
      vec4 hand = vec4(noise4(q).xy, noise4(q * 0.375 + 5.3).z, noise4(q * 2.25 + 11.7).w);
      vec2 wob = (hand.xy - 0.5) * wobble * pixelRatio * px;
      float t = thickness * (0.75 + 0.5 * hand.z);
      vec2 uv = vUv + wob;
      vec3 col = base.rgb;
      float edge = 0.0, seam = 0.0, dc = cameraFar;
      bool cm = false;
      if (lines > 0.0) {
      // A cut-out panel (the window lattice) is drawn into the edge buffer as "nothing" (alpha 0)
      // at its own depth. It counts as open air, and what lies beyond it makes no edge with it:
      // no ink from the view outside lands on the lattice.
      float dT = depthAt(uv);
      vec4 ec = edgeAt(uv);
      cm = ec.a == 0.0 && dT < cameraFar * 0.99;
      dc = cm ? cameraFar : dT;
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
      float creaseLine = smoothstep(0.35, 0.7, normalEdge) * creases;
      edge = max(smoothstep(0.06, 0.16, depthEdge), creaseLine);
      seam = min(idEdge, 1.0) * seams; // seams between parts (planks): lighter than silhouettes and creases
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
      float farEdge = max(max(smoothstep(farDepth.x, farDepth.y, lap / i0), creaseLine), seam * 0.6);
      farEdge *= farInk * mix(1.0, 0.5, smoothstep(80.0, 800.0, nearest)); // fainter in the haze
      edge = max(edge, farEdge * outside);
      edge *= 1.0 - pressure * 0.5 * (1.0 - hand.w); // uneven pressure: the line thins and breaks
      edge *= lines;
      col = mix(base.rgb, ink, edge * strength);
      col *= 1.0 - lines * seam * 0.55 * (1.0 - smoothstep(fade.x, fade.y, dc)) * (cm ? 0.0 : 1.0); // seams darken whatever they cross, so they show on dark wood too
      }
      // Paper grain: fine tooth plus a faint larger mottling, like watercolour paper. It stays on
      // the room too, read at whole drawing-buffer pixels: a fine grain resampled between pixels
      // would blur and sharpen as the view turns, so it moves in whole-pixel steps instead.
      // Tooth 0.875 and 0.203 cells a CSS px, mottling 0.0117.
      vec2 g = (floor(atBuffer) + 0.5) / pixelRatio;
      float tooth = noise4(g * 0.875).x * 0.6 + noise4(g * 0.203125 + 3.1).y * 0.4;
      float mottle = noise4(g * 0.01171875 + 11.3).z;
      col *= 0.955 + 0.07 * tooth + 0.04 * (mottle - 0.5);
      // The fabrics (alpha 0 in the scene buffer): no split tone, crease lines or paper grain on
      // the photo; only fabricInk of the ink. Their outline is still drawn on what is beside them.
      col = mix(col, mix(photo, ink, edge * strength * fabricInk), (1.0 - base.a) * fabricKeep);
      gl_FragColor = vec4(col, base.a);
    }
  `,
};

// A cut-out panel in the edge buffer: "nothing here" (alpha 0), but at the panel's own depth.
const MASK_VERTEX = /* glsl */ `
  uniform mat3 uvTransform;
  varying vec2 vUv;
  void main() {
    vUv = (uvTransform * vec3(uv, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// `cover` raises the alpha per mip level, as the leaf cards' own material does (outside/index.js
// keepCover), so the mask covers what the cards show.
const MASK_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float cover;
  varying vec2 vUv;
  void main() {
    vec2 t = vUv * vec2(textureSize(map, 0));
    float level = max(0.0, 0.5 * log2(max(dot(dFdx(t), dFdx(t)), dot(dFdy(t), dFdy(t)))));
    if (texture2D(map, vUv).a * (1.0 + cover * level) < 0.5) discard;
    gl_FragColor = vec4(0.0);
  }
`;

/**
 * Creates the outline pass. Call render() each frame before the composer renders; it draws the
 * edge buffer for objects on `layer` (default 0). `mask` = { layer, map, cover } or a list of them:
 * objects on that layer are cut out by `map` (alpha: the window lattice, leaf cards outside);
 * they hide the ink of what is behind them and get none. `cover` (default 0) raises their alpha
 * per mip level, to match a material that does (outside/index.js keepCover).
 */
export function createOutline(renderer, scene, camera, { layer = 0, ink = '#000000', lineWidth = 1.3, mask = null } = {}) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  target.depthTexture = new THREE.DepthTexture(1, 1);
  target.texture.minFilter = target.texture.magFilter = THREE.NearestFilter;
  const edgeMaterial = new THREE.ShaderMaterial({ vertexShader: EDGE_VERTEX, fragmentShader: EDGE_FRAGMENT, side: THREE.DoubleSide });
  const material = new THREE.ShaderMaterial({ ...OUTLINE_SHADER, uniforms: THREE.UniformsUtils.clone(OUTLINE_SHADER.uniforms) });
  const masks = (Array.isArray(mask) ? mask : mask ? [mask] : []).map(({ layer: maskLayer, map, cover = 0 }) => {
    map.updateMatrix();
    return { layer: maskLayer, material: new THREE.ShaderMaterial({ uniforms: { map: { value: map }, uvTransform: { value: map.matrix }, cover: { value: cover } }, vertexShader: MASK_VERTEX, fragmentShader: MASK_FRAGMENT, side: THREE.DoubleSide }) };
  });
  material.uniforms.ink.value.set(ink);
  const clear = new THREE.Color();
  material.uniforms.tNoise.value = fieldNoiseTexture();

  let lines = true;
  let size = [1, 1];
  return {
    material,
    /** The lines on or off. Off: the edge buffer is not drawn (render() does nothing) and shrinks to 1x1. */
    setLines(on) {
      lines = !!on;
      material.uniforms.lines.value = lines ? 1 : 0;
      if (lines) target.setSize(...size);
      else target.setSize(1, 1);
    },
    get lines() {
      return lines;
    },
    setSize(w, h, pixelRatio) {
      size = [Math.round(w * pixelRatio), Math.round(h * pixelRatio)];
      if (lines) target.setSize(...size);
      material.uniforms.resolution.value.set(w * pixelRatio, h * pixelRatio);
      material.uniforms.thickness.value = Math.max(0.75, pixelRatio * 0.7) * lineWidth;
      material.uniforms.pixelRatio.value = pixelRatio;
    },
    /** Keeps the hand field on the world: call each frame after the camera moves. */
    setView() {
      setViewField(material.uniforms, camera, material.uniforms.resolution.value.y);
    },
    render() {
      if (!lines) return;
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
      if (masks.length) {
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        for (const m of masks) {
          scene.overrideMaterial = m.material;
          camera.layers.set(m.layer);
          renderer.render(scene, camera);
        }
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
      for (const m of masks) m.material.dispose();
      material.dispose(); // the shared noise texture stays: the wash uses it too
    },
  };
}
