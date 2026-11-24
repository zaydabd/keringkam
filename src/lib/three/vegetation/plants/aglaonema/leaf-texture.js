// Procedural leaf textures for the Chinese evergreen, in the blade's UV space:
// u across the blade (0 = one margin, 0.5 = midrib, 1 = other margin), v from base (0) to tip (1).
//
// Workflow after Cyprien Witkowski's foliage study (https://80.lv/articles/vegetation-study-crafting-stylized-foliage-from-scratch),
// translated to code: his steps are texture blockout → ZBrush sculpt → SpeedTree setup → Substance
// Painter (procedural + hand-painted). We cannot run those tools, so (our interpretation, guess):
//   - "sculpt": a height field with sunken curved veins, puffed blade between them, a rolled margin,
//     turned into a tangent-space normal map;
//   - "texture": a base gradient, the variegation, veins and margin painted from the same fields,
//     plus soft low-frequency "brush" noise for a hand-painted feel.
// Shape facts (curved lateral veins, 5–8 of them, variegation along primary veins) are from
// https://plants.ces.ncsu.edu/plants/aglaonema/. Every number here is a design choice.
// Nothing is copied from any image or model.

import * as THREE from 'three';
import { mulberry32 } from '../../rng.js';

const W = 128;
const H = 256;

/** Smooth seeded value noise on a lattice, for the painted look. */
function valueNoise(seed, cells) {
  const rand = mulberry32(seed);
  const n = cells + 1;
  const grid = Array.from({ length: n * n }, () => rand());
  const fade = (x) => x * x * (3 - 2 * x);
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const i = Math.min(cells - 1, Math.floor(x));
    const j = Math.min(cells - 1, Math.floor(y));
    const fx = fade(x - i);
    const fy = fade(y - j);
    const a = grid[j * n + i];
    const b = grid[j * n + i + 1];
    const c = grid[(j + 1) * n + i];
    const d = grid[(j + 1) * n + i + 1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Builds the albedo and normal maps for one plant.
 * pal: { green, deep, tip, light, rib } as THREE.Color (linear); pattern: { veins, phase, amount }.
 */
export function createLeafTextures(seed, pal, pattern) {
  const noise = valueNoise(seed * 31 + 7, 6);
  const fine = valueNoise(seed * 53 + 3, 18);
  const height = new Float32Array(W * H);
  const albedo = new Uint8Array(W * H * 4);
  const c = new THREE.Color();
  const core = 0.15 + 0.4 * pattern.amount;

  for (let y = 0; y < H; y++) {
    const t = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const s = u * 2 - 1;
      const a = Math.abs(s);
      // Curved lateral veins: they leave the midrib and bend towards the tip.
      const p = (t - 0.32 * Math.pow(a, 0.8)) * pattern.veins + pattern.phase;
      const dv = Math.abs(p - Math.round(p)); // 0 on a vein .. 0.5 between
      const veinLine = Math.exp(-((dv / 0.06) ** 2)) * (1 - 0.7 * a) * smooth(0.04, 0.12, a);
      const rib = Math.exp(-((a / 0.035) ** 2));

      // ---- "Sculpt": sunken veins and midrib, puffed panels, margin rolled down.
      const puff = Math.sin(Math.PI * dv * 2) * 0.5 * (1 - a * a);
      height[y * W + x] = 0.55 * puff - 0.5 * veinLine - 0.35 * rib - 0.9 * Math.pow(a, 5) + 0.15 * fine(u, t);

      // ---- "Paint": deep green at the base, brighter towards the tip and along the light side.
      c.copy(pal.deep).lerp(pal.green, smooth(0, 0.35, t)).lerp(pal.tip, smooth(0.55, 1, t) * 0.55);
      // Variegation: a light core whose edge swings out along each vein, with ragged painted edges.
      const vein = Math.cos(Math.PI * 2 * p);
      const ends = smooth(0.03, 0.14, t) * (1 - smooth(0.72, 0.95, t));
      const edge = core + 0.12 * vein + 0.08 * (noise(u, t) - 0.5) + 0.03 * (fine(u, t) - 0.5);
      const light = smooth(-0.02, 0.02, edge - a) * ends;
      c.lerp(pal.light, light * 0.92);
      // A few light specks outside the core ("spotted", source).
      if (fine(u * 1.7, t * 1.3) > 0.8 && a > core && a < 0.85) c.lerp(pal.light, 0.5 * ends);
      // Veins: green veins through the light core, light midrib.
      c.lerp(pal.green, veinLine * light * 0.45);
      c.lerp(pal.rib, rib * 0.85 * smooth(0, 0.05, t) * (1 - smooth(0.85, 1, t)));
      // Painted margin: a thin darker outline.
      c.lerp(pal.deep, smooth(0.9, 0.98, a) * 0.7);
      // Low-frequency brush variation (±8 %).
      const k = 0.92 + 0.16 * noise(u * 0.7 + 0.3, t * 0.7);
      c.multiplyScalar(k);

      const i = (y * W + x) * 4;
      const srgb = c.clone().convertLinearToSRGB();
      albedo[i] = Math.min(255, srgb.r * 255);
      albedo[i + 1] = Math.min(255, srgb.g * 255);
      albedo[i + 2] = Math.min(255, srgb.b * 255);
      albedo[i + 3] = 255;
    }
  }

  // Height → tangent-space normal (x across = u, y along = v).
  const normal = new Uint8Array(W * H * 4);
  const strength = 2.2;
  const hAt = (x, y) => height[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const n = new THREE.Vector3();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * 0.5 * strength;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * 0.5 * strength * (H / W) * 0.5;
      n.set(-dx, -dy, 1).normalize();
      const i = (y * W + x) * 4;
      normal[i] = (n.x * 0.5 + 0.5) * 255;
      normal[i + 1] = (n.y * 0.5 + 0.5) * 255;
      normal[i + 2] = (n.z * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }

  const make = (data, srgb) => {
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };
  return { map: make(albedo, true), normalMap: make(normal, false) };
}
