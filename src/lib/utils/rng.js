// Seeded random numbers, so a seed always grows the same plant.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rand, a, b) => a + (b - a) * rand();

/** Fisher-Yates shuffle of a copy. */
export function shuffled(rand, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** n stratified slots in [a, b]: one jittered value per equal stratum. */
export function stratified(rand, n, a, b, jitter = 0.8) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const centre = (i + 0.5) / n;
    out.push(a + (b - a) * (centre + (rand() - 0.5) * jitter / n));
  }
  return out;
}
