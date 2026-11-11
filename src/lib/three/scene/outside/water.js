// The river. After .claude/skills/threejs-water-optics (references/water-surface-system.md).
//
// What is followed:
//   - one authored wave list (WAVES): the normal, the crest metric and the roughness that the
//     filter removes all come from the same phases, in one evaluation;
//   - phase = k * dot(d, xz) - w * t with k = 2 pi / wavelength and w = sqrt(g k);
//   - the "normal-only" tier, stated plainly: the plane is flat, so there is no crest parallax
//     and no silhouette;
//   - each band fades out before its wavelength is smaller than the pixel footprint;
//   - side-aware Schlick Fresnel from the two refractive indices (the camera's side is set per
//     frame), mixing the water body with the reflection: energy stays within 1;
//   - a diagnostic view of each part (uView).
// Divergences and limits, on purpose:
//   - the reflection is a planar mirror of the outside (drawn from the mirrored camera at half
//     size), not an analytic sky. The mirror is flat; the wave normal shifts the lookup by
//     assuming that what is reflected is `reach` metres along the reflected ray: there is no
//     depth, so nearer or farther things shift a little too much or too little;
//   - no refraction and no depth: the water is silt, opaque after a few centimetres (R3 shows
//     nothing through it), so the body is one scattering colour, not a Beer-Lambert path;
//   - the footprint is taken along each wave's own direction (a plane wave needs samples only
//     across its crests); the slope a band loses to the filter is not thrown away: it widens
//     the reflection (three taps), as unresolved roughness does;
//   - `gain` scales the Fresnel term and `chop` the reflected shift: paint controls, 1 = physical;
//   - `shade` lets a reflection darker than the body show at steep angles, where Fresnel alone
//     hides it (the painting draws a dark patch under each boat): a paint control, 0 = physical;
//   - the reflection loses 70% of its own hue and is tinted by `film`, as R3 paints silty water
//     (a clean surface reflects without a tint): a paint control, not physical;
//   - no foam (a calm river); the pale dashes are the crest metric of the same waves;
//   - below the surface only the Fresnel side changes: there is no underwater view.
// view: 0 final, 1 normal, 2 Fresnel, 3 how much of the finest band survives the filter,
//       4 reflection alone, 5 body alone, 6 crest metric, 7 roughness lost to the filter.

import * as THREE from 'three';

const G = 9.81;
const N_AIR = 1.0;
const N_WATER = 1.333;

/** The shared wave list: direction in XZ, wavelength (m), amplitude (m), steepness q. Authored estimates for a calm tidal river. */
export const WAVES = [
  { dir: [0.9, 0.44], length: 9, amplitude: 0.03, q: 0.3 },
  { dir: [-0.6, 0.8], length: 5.2, amplitude: 0.022, q: 0.3 },
  { dir: [0.25, -0.97], length: 3.1, amplitude: 0.016, q: 0.25 },
  { dir: [1, -0.1], length: 1.7, amplitude: 0.01, q: 0.2 },
  { dir: [-0.8, -0.6], length: 0.9, amplitude: 0.006, q: 0.2 },
].map((w) => {
  const l = Math.hypot(...w.dir);
  const k = (2 * Math.PI) / w.length;
  return { ...w, dir: [w.dir[0] / l, w.dir[1] / l], k, omega: Math.sqrt(G * k) };
});

/** Fresnel reflectance at normal incidence, from the camera's side of the surface. */
export const fresnelF0 = (below = false) => {
  const eta = below ? N_WATER / N_AIR : N_AIR / N_WATER;
  return ((1 - eta) / (1 + eta)) ** 2;
};

const f = (n) => n.toFixed(5);

/**
 * The water material and its mirror. `level` is the water's height; `layer` is the layer the
 * mirrored camera draws (everything outside except the water itself).
 */
export function createWater({ level, layer = 2, body = '#ecd2a2', film = '#fff0cc', pale = '#f4faea', sun = new THREE.Vector3(0, 1, 0), light = 1, key = 1, fog, gain = 1.2, chop = 0.45, shade = 0.8, reach = 14 }) {
  const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
  const textureMatrix = new THREE.Matrix4();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMirror: { value: target.texture },
      uMirrorMatrix: { value: textureMatrix },
      uMirrorOn: { value: 0 },
      uTime: { value: 0 },
      uEta: { value: N_AIR / N_WATER },
      uBody: { value: new THREE.Color(body).multiplyScalar(key) },
      uPale: { value: new THREE.Color(pale).multiplyScalar(light) },
      uSun: { value: sun.clone().normalize() },
      uFilm: { value: new THREE.Color(film) },
      uSunLight: { value: 5.6 * light }, // how bright the lit water body is
      uGain: { value: gain },
      uShade: { value: shade },
      uChop: { value: chop },
      uReach: { value: reach },
      uFogColor: { value: fog.color },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
      uView: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMirror;
      uniform mat4 uMirrorMatrix;
      uniform float uMirrorOn, uTime, uEta, uSunLight, uGain, uShade, uChop, uReach, uFogNear, uFogFar, uView;
      uniform vec3 uBody, uFilm, uPale, uSun, uFogColor;
      varying vec3 vWorld;
      varying float vDepth;

      // One band of the shared list. Adds its slope, its part of the normal's y term (the crest
      // metric), and the slope variance the footprint filter removed. Returns what survived.
      float band(vec2 p, vec2 dpx, vec2 dpy, vec2 d, float k, float A, float q, float w, inout vec2 slope, inout float ny, inout float lost) {
        float footprint = max(abs(dot(d, dpx)), abs(dot(d, dpy))); // metres per pixel, across the crests
        float keep = 1.0 - smoothstep(0.0, 1.6, footprint * k);
        float phase = k * dot(d, p) - w * uTime;
        slope += d * (k * A * cos(phase)) * keep;
        ny += q * k * A * sin(phase) * keep;
        lost += 0.5 * k * A * k * A * (1.0 - keep * keep);
        return keep;
      }

      vec3 mirror(vec3 R) {
        vec4 c = uMirrorMatrix * vec4(vWorld + R * uReach, 1.0);
        return texture2D(uMirror, clamp(c.xy / c.w, 0.002, 0.998)).rgb;
      }

      void main() {
        vec2 p = vWorld.xz;
        vec2 dpx = dFdx(p), dpy = dFdy(p);
        vec2 slope = vec2(0.0);
        float ny = 0.0, lost = 0.0, keep = 0.0, crestMax = 0.0;
${WAVES.map((w) => `        keep = band(p, dpx, dpy, vec2(${f(w.dir[0])}, ${f(w.dir[1])}), ${f(w.k)}, ${f(w.amplitude)}, ${f(w.q)}, ${f(w.omega)}, slope, ny, lost); crestMax += ${f(w.q * w.k * w.amplitude)} * keep;`).join('\n')}
        vec3 n = normalize(vec3(-slope.x, 1.0 - ny, -slope.y));
        float crest = crestMax > 0.0 ? clamp(ny / crestMax, -1.0, 1.0) : 0.0; // -1 trough .. 1 crest, of what is resolved

        vec3 V = normalize(cameraPosition - vWorld);
        float side = V.y < 0.0 ? -1.0 : 1.0; // the camera's side: the normal faces it
        float F0 = pow((1.0 - uEta) / (1.0 + uEta), 2.0);
        float fresnel = clamp(uGain * (F0 + (1.0 - F0) * pow(1.0 - abs(dot(n, V)), 5.0)), 0.0, 1.0);

        // Reflection: the flat mirror, looked up along the wave's reflected ray.
        vec3 nc = normalize(mix(vec3(0.0, 1.0, 0.0), n, uChop)) * side;
        vec3 R = reflect(-V, nc);
        R.y = side * max(side * R.y, 0.03);
        R = normalize(R);
        vec3 refl = uPale;
        if (uMirrorOn > 0.5) {
          float spread = 2.0 * sqrt(lost) * uChop; // the angle the lost slopes would have spread the ray by
          vec3 up = vec3(0.0, spread, 0.0);
          refl = 0.5 * mirror(R) + 0.25 * mirror(normalize(R + up)) + 0.25 * mirror(normalize(R - up * 0.6));
        }
        refl = mix(refl, vec3(dot(refl, vec3(0.2126, 0.7152, 0.0722))), 0.7) * uFilm; // the silt film: keeps the value, takes the water's hue

        vec3 body = uBody * uSunLight * (0.55 + 0.45 * max(dot(n, uSun), 0.0));
        float lb = dot(body, vec3(0.2126, 0.7152, 0.0722));
        float darker = clamp((lb - dot(refl, vec3(0.2126, 0.7152, 0.0722))) / max(lb, 1e-4), 0.0, 1.0);
        vec3 col = mix(body, refl, max(fresnel, uShade * darker * uMirrorOn));
        // Ripple strokes, from the crest metric of the same waves: pale on the crests, a darker
        // wash in the troughs (paint, in place of glints and foam).
        float strokes = 1.0 - smoothstep(0.0, 1.6, max(length(dpx), length(dpy)) * 2.0); // none where a pixel is wider than the ripples
        col *= 1.0 - 0.16 * strokes * smoothstep(0.55, 0.9, -crest);
        col = mix(col, uPale * uFilm, strokes * smoothstep(0.7, 0.92, crest) * 0.55);
        col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth)); // the same haze as the land

        if (uView > 0.5) {
          col = uView < 1.5 ? n * 0.5 + 0.5
              : uView < 2.5 ? vec3(fresnel)
              : uView < 3.5 ? vec3(keep)
              : uView < 4.5 ? refl
              : uView < 5.5 ? body
              : uView < 6.5 ? vec3(crest * 0.5 + 0.5)
              : vec3(sqrt(lost) * 20.0);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  // The mirrored camera (after three's Reflector: reflected pose, oblique near plane at the water).
  const cam = new THREE.PerspectiveCamera();
  cam.layers.set(layer);
  const up = new THREE.Vector3(0, 1, 0);
  const point = new THREE.Vector3(0, level, 0);
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q = new THREE.Vector4();
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const size = new THREE.Vector2();
  const reflectAbout = (v) => v.sub(point).reflect(up).add(point);

  return {
    material,
    target,
    /** Draws the mirror image for this frame. Call before the main render. */
    renderMirror(renderer, scene, camera) {
      material.uniforms.uEta.value = camera.position.y < level ? N_WATER / N_AIR : N_AIR / N_WATER;
      if (camera.position.y <= level) {
        material.uniforms.uMirrorOn.value = 0; // no mirror from below: the body and the pale sky only
        return;
      }
      renderer.getDrawingBufferSize(size);
      const w = Math.max(2, Math.round(size.x / 2));
      const h = Math.max(2, Math.round(size.y / 2));
      if (target.width !== w || target.height !== h) target.setSize(w, h);

      camera.updateMatrixWorld();
      eye.setFromMatrixPosition(camera.matrixWorld);
      rot.extractRotation(camera.matrixWorld);
      look.set(0, 0, -1).applyMatrix4(rot).add(eye);
      cam.position.copy(reflectAbout(eye.clone()));
      cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(up);
      cam.lookAt(reflectAbout(look));
      cam.near = camera.near;
      cam.far = camera.far;
      cam.updateMatrixWorld();
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      cam.projectionMatrix.copy(camera.projectionMatrix);

      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);

      // Oblique near plane, so nothing under the water is drawn into the mirror (Lengyel).
      plane.setFromNormalAndCoplanarPoint(up, point).applyMatrix4(cam.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const e = cam.projectionMatrix.elements;
      q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
      clip.multiplyScalar(2 / clip.dot(q));
      e[2] = clip.x;
      e[6] = clip.y;
      e[10] = clip.z + 1;
      e[14] = clip.w;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

      material.uniforms.uMirrorOn.value = 1;
      const before = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.setRenderTarget(before);
    },
    dispose() {
      target.dispose();
      material.dispose();
    },
  };
}
