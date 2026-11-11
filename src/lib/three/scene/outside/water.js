// The river. After .claude/skills/threejs-water-optics, "normal-only wave bundle" tier, stated
// plainly: the surface is a flat plane; four directional wave bands give it a normal (no real
// displacement, so no crest parallax); the view-dependent Fresnel term mixes the muddy water
// colour with an analytic mirror of the sky; each band is switched off once its wavelength is
// smaller than a pixel. Limits: the water is opaque (silt, as in R3: nothing is seen through
// it), and it mirrors the sky gradient only: not the clouds, the bridge or the far bank.
// A painted streak texture goes over it for the watercolour look.
// view: 0 final, 1 normal, 2 Fresnel, 3 how much of the finest band survives the filter.

import * as THREE from 'three';

export function createWaterMaterial({ map, body = '#e0b078', horizon = '#f4faea', zenith = '#7fb1df', sun = new THREE.Vector3(0, 1, 0), light = 1, key = 1, fog }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uTime: { value: 0 },
      uBody: { value: new THREE.Color(body).multiplyScalar(key) },
      uHorizon: { value: new THREE.Color(horizon).multiplyScalar(light) },
      uZenith: { value: new THREE.Color(zenith).multiplyScalar(light) },
      uSun: { value: sun.clone().normalize() },
      uSunLight: { value: 3.4 * light }, // how bright the lit water body is
      uFogColor: { value: fog.color },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
      uView: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uTime, uSunLight, uFogNear, uFogFar, uView;
      uniform vec3 uBody, uHorizon, uZenith, uSun, uFogColor;
      varying vec3 vWorld;
      varying vec2 vUv;
      varying float vDepth;

      // One wave band: direction d, wavelength L (m), amplitude a (m), speed s (m/s).
      // Returns the slope it adds; f is how much of it this pixel can resolve.
      vec2 band(vec2 p, vec2 d, float L, float a, float s, float footprint, out float f) {
        float k = 6.2832 / L;
        f = 1.0 - smoothstep(0.0, 1.6, footprint * k);
        return d * k * a * cos(k * dot(d, p) - s * k * uTime) * f;
      }

      void main() {
        vec2 p = vWorld.xz;
        float footprint = max(length(dFdx(p)), length(dFdy(p))); // metres per pixel
        float f0, f1, f2, f3;
        // A river, not a sea: short, low waves crossing at wide angles, so no band reads as stripes.
        vec2 slope = band(p, normalize(vec2(0.8, 0.6)), 6.5, 0.022, 0.8, footprint, f0)
                   + band(p, normalize(vec2(-0.7, 0.7)), 3.7, 0.018, 0.6, footprint, f1)
                   + band(p, normalize(vec2(0.2, -1.0)), 1.9, 0.012, 0.5, footprint, f2)
                   + band(p, normalize(vec2(1.0, -0.1)), 0.8, 0.007, 0.4, footprint, f3);
        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 V = normalize(cameraPosition - vWorld);
        // Silt-laden water is a poor mirror: the Fresnel curve is kept, scaled down.
        float fresnel = 0.32 * (0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0));
        vec3 R = reflect(-V, n);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.55));
        vec3 wash = texture2D(uMap, vUv).rgb; // painted streaks, about mid grey to white
        vec3 body = uBody * uSunLight * (0.55 + 0.45 * max(dot(n, uSun), 0.0)) * (0.35 + 0.9 * wash);
        vec3 col = mix(body, sky, fresnel);
        col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth)); // the same haze as the land
        if (uView > 0.5) col = uView < 1.5 ? n * 0.5 + 0.5 : uView < 2.5 ? vec3(fresnel) : vec3(f3);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
