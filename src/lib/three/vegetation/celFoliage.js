// Shared cel shading for foliage, after the Substack anime-foliage pipeline
// (research/CREDITS.md, "Stylised foliage method"): diffuse N·L → a 3-tone colour ramp
// (their Shader to RGB → Color Ramp), multiplied by AO. No translucency. Not tone mapped.
// The ramp step positions and the sun direction are design choices.

import * as THREE from 'three';

/** Sun direction for the ramp (matches the preview's key light; a design choice). */
export const FOLIAGE_SUN = new THREE.Vector3(1.5, 3, 2.5).normalize();

/** GLSL: `vec3 celRamp(float shade)`, needs uniforms tone0..tone2. */
export const CEL_RAMP_GLSL = /* glsl */ `
  uniform vec3 tone0;
  uniform vec3 tone1;
  uniform vec3 tone2;
  vec3 celRamp(float shade) {
    float w = 0.04;
    vec3 col = mix(tone0, tone1, smoothstep(0.22 - w, 0.22 + w, shade));
    return mix(col, tone2, smoothstep(0.6 - w, 0.6 + w, shade));
  }`;

export function toneUniforms(tones) {
  const [t0, t1, t2] = tones.map((c) => new THREE.Color(c));
  return { sunDir: { value: FOLIAGE_SUN }, tone0: { value: t0 }, tone1: { value: t1 }, tone2: { value: t2 } };
}

/**
 * Cel material for real leaf meshes drawn as an InstancedMesh (the vines). The guide gives no
 * vine method, so this is our own adaptation of its tree shading: the leaf's own normal is
 * blended with a per-instance proxy normal (`proxyNormal`, from the leaf mass the leaf sits in),
 * the way the guide transfers a smooth normal onto its cards. `instanceAo` darkens deep leaves.
 * Vertex colours (the leaf paint, relative to `paintRef`, the blade colour) and the instance
 * colour scale the ramp's result.
 * `proxyWeight` (0..1) is a design choice.
 */
export function createCelLeafMaterial({ tones, paintRef, proxyWeight = 0.6 }) {
  // Vertex colours are linear in the shader; the reference must be too.
  const ref = new THREE.Color(paintRef);
  return new THREE.ShaderMaterial({
    uniforms: { ...toneUniforms(tones), proxyWeight: { value: proxyWeight }, paintRef: { value: ref } },
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec3 proxyNormal;
      attribute float instanceAo;
      uniform float proxyWeight;
      uniform vec3 paintRef;
      varying vec3 vNormal;
      varying vec3 vPaint;
      varying float vAo;
      void main() {
        vec3 leafN = mat3(instanceMatrix) * normal;
        vec3 n = normalize(mix(normalize(leafN), proxyNormal, proxyWeight));
        vNormal = normalize(normalMatrix * n);
        // Paint relative to the blade colour, halved, so veins and edges stay as soft marks.
        vPaint = mix(vec3(1.0), clamp(color / paintRef, 0.0, 1.6), 0.5) * instanceColor;
        vAo = instanceAo;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      ${CEL_RAMP_GLSL}
      varying vec3 vNormal;
      varying vec3 vPaint;
      varying float vAo;
      void main() {
        // Not flipped on back faces: the normal is mostly the leaf mass's, so both sides of a
        // leaf shade with its mass, as the tree cards do.
        vec3 N = normalize(vNormal);
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float shade = max(dot(N, L), 0.0) * vAo;
        gl_FragColor = vec4(celRamp(shade) * vPaint, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

/**
 * Per-instance attributes for createCelLeafMaterial. Each leaf gives `proxy` (unit normal of the
 * leaf mass it sits in) and `depth` (0 deep inside the mass .. 1 on its outside). AO uses the same
 * formula as the tree clumps: deep leaves and the side away from the sun are darker.
 */
export function setCelLeafAttributes(geometry, leaves) {
  const proxy = new Float32Array(leaves.length * 3);
  const ao = new Float32Array(leaves.length);
  leaves.forEach((leaf, i) => {
    const n = leaf.proxy;
    proxy.set([n.x, n.y, n.z], i * 3);
    const away = n.dot(FOLIAGE_SUN) * 0.5 + 0.5;
    ao[i] = 0.6 + 0.25 * leaf.depth + 0.15 * away;
  });
  geometry.setAttribute('proxyNormal', new THREE.InstancedBufferAttribute(proxy, 3));
  geometry.setAttribute('instanceAo', new THREE.InstancedBufferAttribute(ao, 1));
}
