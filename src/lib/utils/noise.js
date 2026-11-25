// Seeded hashes and value noise, in one place (CPU and GLSL), so a texture or a plant keeps the
// same pattern wherever the noise is used.

/** The sine hash in [0, 1) for a point and a seed (the GLSL classic; float precision is enough). */
export function sinHash(x, y, s = 0) {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Value noise in [0, 1] from sinHash: smooth between the integer lattice points. */
export function valueNoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = sinHash(xi, yi, s), b = sinHash(xi + 1, yi, s), c = sinHash(xi, yi + 1, s), d = sinHash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** `oct` octaves of valueNoise (each twice as fine, half as strong), in [0, 1]. */
export function valueFbm(x, y, s = 0, oct = 4) {
  let sum = 0, amp = 0.5;
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise(x, y, s + i * 13);
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / (1 - 0.5 ** oct);
}

/** An integer hash in [0, 1) for a lattice point and a seed (no sine: the same on every GPU/CPU). */
export function intHash(i, j, seed) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise in -1..1 from intHash (the outside's ground and grass, outside/site.js). */
export function latticeNoise(x, y, seed) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const mix = (a, b, t) => a + (b - a) * t;
  return mix(mix(intHash(i, j, seed), intHash(i + 1, j, seed), u), mix(intHash(i, j + 1, seed), intHash(i + 1, j + 1, seed), u), v) * 2 - 1;
}

/** latticeNoise plus two finer octaves (weights 0.6, 0.3, 0.1), in -1..1. */
export const latticeFbm = (x, y, seed) => latticeNoise(x, y, seed) * 0.6 + latticeNoise(x * 2.1, y * 2.1, seed + 1) * 0.3 + latticeNoise(x * 4.3, y * 4.3, seed + 2) * 0.1;

/** GLSL: the sine hash of a 3D point in [0, 1) (sinHash's constants). */
export const HASH3_GLSL = 'float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }';
