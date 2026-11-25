// Shared by the potted plants (schismatoglottis.js, rubberPlant.js): value noise, the colour
// helpers, painting a texture from a function, and laying UVs into an atlas region.

import * as THREE from 'three';

export { sinHash as hash2, valueNoise as vnoise, valueFbm as fbm } from '../../../utils/noise.js'; // the shared noise
export const sstep = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** A hex colour as linear [r, g, b]. */
export const hex = (h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};

const makeCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
const toSrgb = (x) => {
  x = Math.min(1, Math.max(0, x));
  return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
};

/**
 * Paints a w x h colour texture from fn(u, v) -> [r, g, b, height] (linear 0..1, v up). With
 * `bump`, the fourth value also makes a linear bump texture. Returns { map, bump }.
 */
export function paintTextures(w, h, fn, { bump: withBump = false } = {}) {
  const colorCanvas = makeCanvas(w, h);
  const cctx = colorCanvas.getContext('2d');
  const cimg = cctx.createImageData(w, h);
  const bumpCanvas = withBump ? makeCanvas(w, h) : null;
  const bctx = bumpCanvas?.getContext('2d');
  const bimg = bctx?.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const [r, g, b, height] = fn((x + 0.5) / w, v);
      const i = (y * w + x) * 4;
      cimg.data[i] = toSrgb(r);
      cimg.data[i + 1] = toSrgb(g);
      cimg.data[i + 2] = toSrgb(b);
      cimg.data[i + 3] = 255;
      if (bimg) {
        const hb = Math.min(255, Math.max(0, height * 255));
        bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = hb;
        bimg.data[i + 3] = 255;
      }
    }
  }
  cctx.putImageData(cimg, 0, 0);
  bctx?.putImageData(bimg, 0, 0);
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return { map, bump: bumpCanvas ? new THREE.CanvasTexture(bumpCanvas) : null };
}

/** Each point's share of the profile's length (0 at the first point, 1 at the last). */
export function arcShares(profile) {
  const d = [0];
  for (let i = 1; i < profile.length; i++) d.push(d[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  return d.map((x) => x / d[d.length - 1]);
}

/** Moves the UVs of vertices [from, to) of a mesh writer into an atlas region [u0, v0, u1, v1], through fn. */
export function toRegion(w, from, to, region, fn = (u, v) => [u, v]) {
  const [u0, v0, u1, v1] = region;
  for (let i = from; i < to; i++) {
    const [u, v] = fn(w.uvs[i * 2], w.uvs[i * 2 + 1]);
    w.uvs[i * 2] = u0 + (u1 - u0) * THREE.MathUtils.clamp(u, 0, 1);
    w.uvs[i * 2 + 1] = v0 + (v1 - v0) * THREE.MathUtils.clamp(v, 0, 1);
  }
}
