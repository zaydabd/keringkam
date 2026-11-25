// The painted textures' shared tools (paint.js): a seeded random, the canvas at the paint
// detail, the texture, and the brush marks.

import * as THREE from 'three';

export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How many canvas pixels each painted pixel gets (setPaintDetail). The strokes are the same: only
// the canvas is finer, so a texture seen close on a 2x screen is not magnified into blur.
export let detail = 1; // read live by the other paint modules
/** Paints the next textures at k times the resolution (1 as designed); returns the previous k. */
export function setPaintDetail(k) {
  const was = detail;
  detail = k;
  return was;
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * detail);
  c.height = Math.round(h * detail);
  // willReadFrequently keeps the canvas on the CPU. These textures are thousands of small strokes,
  // drawn once and then uploaded: on a GPU-backed canvas every one of them is a GPU command that
  // must finish before the upload (2.1 s for the turf alone under software WebGL), on the CPU the
  // same strokes take 20-100 ms. Measured: research/INTERIOR-NOTES.md, "Performance pass".
  const g = c.getContext('2d', { willReadFrequently: true });
  g.scale(c.width / w, c.height / h); // everything below draws in the design's pixels
  return [c, g];
}

export function texture(c, repeat = [1, 1], wrap = true) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Draws fn(dx) at dx = -w, 0, w so strokes wrap seamlessly across the left/right edge. */
/** A hex colour as 'r,g,b', for rgba() strings with their own alpha. */
export const css = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

/**
 * A pattern value from a theme: a plain number is fixed; a pair [from, by] is random, from `from`
 * up to `from + by`. Only a pair draws a random number, so fixed values keep the sequence.
 */
export const vary = (r, v) => (typeof v === 'number' ? v : v[0] + r() * v[1]);

export function wrapX(w, fn) {
  for (const dx of [-w, 0, w]) fn(dx);
}

/** A soft watercolour blot: a radial gradient, drawn wrapped across the left/right edge. */
export function blot(g, W, x, y, rx, ry, rgb, a) {
  wrapX(W, (dx) => {
    g.save();
    g.translate(x + dx, y);
    g.scale(1, ry / rx);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, `rgba(${rgb},${a})`);
    grad.addColorStop(0.7, `rgba(${rgb},${a * 0.6})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  });
}

/**
 * Brush dabs: short tapered strokes laid side by side over a tile, each a little lighter or darker
 * than the paint under it, so the surface reads as painted stroke by stroke. They are painted on
 * the surface's own texture, so they stay inside each object and move with it. Drawn wrapped
 * across every edge of the tile. D (a theme's `dabs` marks): count, length and width (px), opacity,
 * angle (rad, 0 = along the tile's x), turn (rad, how far each one turns from it), darkShare.
 * colours: [dark, light] (hex).
 */
export function brushDabs(g, W, H, r, D, [dark, light]) {
  for (let i = 0; i < D.count; i++) {
    const x = r() * W;
    const y = r() * H;
    const length = vary(r, D.length);
    const half = vary(r, D.width) / 2;
    const angle = D.angle + (r() - 0.5) * 2 * D.turn;
    g.fillStyle = `rgba(${css(r() < D.darkShare ? dark : light)},${vary(r, D.opacity)})`;
    for (const dy of [-H, 0, H]) {
      wrapX(W, (dx) => {
        g.save();
        g.translate(x + dx, y + dy);
        g.rotate(angle);
        // A loaded brush: a round head that thins to a dry tail.
        g.beginPath();
        g.moveTo(-length / 2, 0);
        g.quadraticCurveTo(-length / 4, -half * 0.5, length / 4, -half);
        g.quadraticCurveTo(length / 2, -half, length / 2, 0);
        g.quadraticCurveTo(length / 2, half, length / 4, half);
        g.quadraticCurveTo(-length / 4, half * 0.5, -length / 2, 0);
        g.fill();
        g.restore();
      });
    }
  }
}
