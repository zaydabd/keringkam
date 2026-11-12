import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Exposure meter, after .claude/skills/threejs-exposure-color-grading: the scene is drawn once
// into a 64 x 36 linear HDR target, its luminance is encoded as L / (L + 1) (16 bits over two byte
// channels) and read back, and the CPU takes a weighted log-average. Exposure is then
// middle grey / average * 2^EV, clamped. The room and its light never change, so this runs once
// per framing (first frame, and after a resize) instead of every few frames with adaptation.

const W = 64;
const H = 36;
const ENCODE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      float l = dot(texture2D(tDiffuse, vUv).rgb, vec3(0.2126, 0.7152, 0.0722));
      float e = clamp(l / (l + 1.0), 0.0, 1.0) * 255.0;
      gl_FragColor = vec4(floor(e) / 255.0, fract(e), 0.0, 1.0);
    }
  `,
};

export const METER = { middleGrey: 0.18, min: 0.45, max: 1.85 };

export function createMeter(renderer) {
  const hdr = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  const bytes = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: false });
  const material = new THREE.ShaderMaterial(ENCODE);
  const quad = new FullScreenQuad(material);
  function draw(scene, camera) {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(hdr);
    renderer.clear();
    renderer.render(scene, camera); // no tone mapping when drawing into a target
    material.uniforms.tDiffuse.value = hdr.texture;
    renderer.setRenderTarget(bytes);
    quad.render(renderer);
    renderer.setRenderTarget(previous);
  }
  function average(pixels) {
    let sum = 0;
    let weights = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const e = (pixels[i] + pixels[i + 1] / 255) / 255;
      const l = e / Math.max(0.0001, 1 - e);
      const w = l > 0.002 ? 1 : 0.15; // near-black pixels count for less
      sum += Math.log(Math.max(l, 0.0001)) * w;
      weights += w;
    }
    return Math.exp(sum / weights);
  }
  return {
    targets: [hdr, bytes],
    /**
     * Resolves to the weighted log-average scene luminance (linear, before exposure). The pixels
     * come back through an asynchronous read (a pixel buffer and a fence), so the CPU never waits
     * for the GPU: a synchronous read here stalled the shot switch until every queued frame was
     * drawn (research/INTERIOR-NOTES.md, "Perf run").
     */
    async measure(scene, camera) {
      draw(scene, camera);
      const pixels = new Uint8Array(W * H * 4);
      await renderer.readRenderTargetPixelsAsync(bytes, 0, 0, W, H, pixels);
      return average(pixels);
    },
    /** Exposure for a measured average, with `ev` stops of compensation (the one artistic control). */
    exposureFor(average, ev = 0) {
      return THREE.MathUtils.clamp((METER.middleGrey / average) * 2 ** ev, METER.min, METER.max);
    },
    dispose() {
      hdr.dispose();
      bytes.dispose();
      quad.dispose();
    },
  };
}
