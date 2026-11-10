// Painted textures for the kampung interior, drawn on canvases at load time (no photos).
// Each one is painted mostly in light values so the material colour and the per-part vertex tint
// still set the hue; the texture adds the brushwork: grain strokes, shingle rows, weave, motifs.

import * as THREE from 'three';

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, repeat = [1, 1], wrap = true) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Draws fn(dx) at dx = -w, 0, w so strokes wrap seamlessly across the left/right edge. */
function wrapX(w, fn) {
  for (const dx of [-w, 0, w]) fn(dx);
}

/**
 * Wood planks. One tile is 2 m along the grain (canvas x) by 0.5 m across (canvas y), so with
 * UVs in metres the texture repeat is (0.5, 2).
 */
export function paintPlanks(seed = 1) {
  const r = rng(seed);
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#eeeae4';
  g.fillRect(0, 0, W, H);

  // Broad soft streaks of lighter and darker wood.
  for (let i = 0; i < 70; i++) {
    const y0 = r() * H;
    const h = 3 + r() * 16;
    const a = 0.03 + r() * 0.06;
    const k = 1 + Math.floor(r() * 3);
    const ph = r() * Math.PI * 2;
    const amp = 2 + r() * 6;
    g.fillStyle = r() < 0.4 ? `rgba(255,250,238,${a})` : `rgba(96,70,46,${a})`;
    g.beginPath();
    for (let x = 0; x <= W; x += 16) g.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 2 * k + ph) * amp);
    for (let x = W; x >= 0; x -= 16) g.lineTo(x, y0 + h + Math.sin((x / W) * Math.PI * 2 * k + ph + 0.6) * amp);
    g.fill();
  }

  // A few crisp grain strokes, as if drawn with a fine brush.
  g.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const y0 = r() * H;
    const amp = 1 + r() * 4;
    const k = 1 + Math.floor(r() * 3);
    const ph = r() * Math.PI * 2;
    const x0 = r() * W;
    const len = 120 + r() * 520;
    g.strokeStyle = `rgba(66,40,22,${0.07 + r() * 0.15})`;
    g.lineWidth = 0.8 + r() * 1.5;
    wrapX(W, (dx) => {
      g.beginPath();
      for (let x = 0; x <= len; x += 8) {
        const X = x0 + x;
        g.lineTo(X + dx, y0 + Math.sin((X / W) * Math.PI * 2 * k + ph) * amp);
      }
      g.stroke();
    });
  }

  // Knots.
  for (let i = 0; i < 3; i++) {
    const x = r() * W;
    const y = 30 + r() * (H - 60);
    const rx = 8 + r() * 10;
    wrapX(W, (dx) => {
      g.fillStyle = 'rgba(70,42,24,0.35)';
      g.beginPath();
      g.ellipse(x + dx, y, rx * 0.45, rx * 0.25, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(70,42,24,0.22)';
      g.lineWidth = 1.2;
      for (let k = 1; k <= 3; k++) {
        g.beginPath();
        g.ellipse(x + dx, y, rx * (0.5 + k * 0.45), rx * (0.3 + k * 0.22), 0, 0, Math.PI * 2);
        g.stroke();
      }
    });
  }
  return texture(c, [0.5, 2]);
}

/** The underside of the thatch: rows of shingles, 1 m by 1 m per tile, rows every 12.5 cm (H1). */
export function paintThatch(seed = 2) {
  const r = rng(seed);
  const S = 512;
  const ROW = 64;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#e4dccd';
  g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  for (let y0 = 0; y0 < S; y0 += ROW) {
    // fibres: short slanted strokes, light and dark
    for (let i = 0; i < 260; i++) {
      const x = r() * S;
      const y = y0 + r() * ROW;
      const len = 14 + r() * 34;
      const tilt = (r() - 0.5) * 6;
      g.strokeStyle = r() < 0.55 ? `rgba(70,46,24,${0.1 + r() * 0.22})` : `rgba(255,244,220,${0.1 + r() * 0.2})`;
      g.lineWidth = 1 + r() * 1.6;
      wrapX(S, (dx) => {
        g.beginPath();
        g.moveTo(x + dx, y);
        g.lineTo(x + dx + tilt, y + len);
        g.stroke();
      });
    }
    // the overlap: a soft shadow under the next row, a lit lip above it
    const sh = g.createLinearGradient(0, y0 + ROW - 18, 0, y0 + ROW);
    sh.addColorStop(0, 'rgba(50,30,16,0)');
    sh.addColorStop(1, 'rgba(50,30,16,0.45)');
    g.fillStyle = sh;
    g.fillRect(0, y0 + ROW - 18, S, 18);
    g.fillStyle = 'rgba(255,240,210,0.25)';
    g.fillRect(0, y0, S, 3);
    // a ragged edge along the lip
    g.fillStyle = 'rgba(60,38,20,0.35)';
    for (let x = 0; x < S; x += 4 + r() * 6) g.fillRect(x, y0 + ROW - 2, 2, -(2 + r() * 8));
  }
  return texture(c, [1, 1]);
}

/** A woven split-bamboo mat (H1, H4): a 2-over-2 twill, 0.25 m per tile. */
export function paintMat(seed = 3) {
  const r = rng(seed);
  const S = 256;
  const N = 16;
  const cell = S / N;
  const [c, g] = canvas(S, S);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const across = (i + j) % 4 < 2;
      const x = i * cell;
      const y = j * cell;
      const v = 222 + Math.floor(r() * 30);
      const grad = across ? g.createLinearGradient(x, y, x, y + cell) : g.createLinearGradient(x, y, x + cell, y);
      grad.addColorStop(0, `rgb(${v - 40},${v - 46},${v - 56})`);
      grad.addColorStop(0.35, `rgb(${v},${v - 6},${v - 18})`);
      grad.addColorStop(1, `rgb(${v - 30},${v - 36},${v - 46})`);
      g.fillStyle = grad;
      g.fillRect(x, y, cell, cell);
      g.strokeStyle = 'rgba(70,46,24,0.45)';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      // a fibre line along the strip
      g.strokeStyle = 'rgba(90,64,36,0.25)';
      g.beginPath();
      if (across) {
        g.moveTo(x, y + cell * (0.3 + r() * 0.4));
        g.lineTo(x + cell, y + cell * (0.3 + r() * 0.4));
      } else {
        g.moveTo(x + cell * (0.3 + r() * 0.4), y);
        g.lineTo(x + cell * (0.3 + r() * 0.4), y + cell);
      }
      g.stroke();
    }
  }
  return texture(c, [4, 4]);
}

/**
 * Painted post: cream ground with red-brown scrolls and spirals, inked in dark brown. A generic
 * pattern inspired by the painted posts in H1/H6, not a copy of any particular carving.
 * Canvas x wraps around the post, y runs up its height (cylinder UVs, 0..1).
 */
export function paintPost(seed = 4) {
  const r = rng(seed);
  const W = 512;
  const H = 1024;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#f1e4c6';
  g.fillRect(0, 0, W, H);
  // weathering: soft vertical streaks
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    g.fillStyle = `rgba(${r() < 0.5 ? '120,96,70' : '255,248,232'},${0.04 + r() * 0.08})`;
    g.fillRect(x, 0, 2 + r() * 14, H);
  }

  const RED = '#8f3f2a';
  const INK = '#3a2418';
  const stroke = (path, width) => {
    wrapX(W, (dx) => {
      g.save();
      g.translate(dx, 0);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = INK;
      g.lineWidth = width + 6;
      path();
      g.stroke();
      g.strokeStyle = RED;
      g.lineWidth = width;
      path();
      g.stroke();
      g.restore();
    });
  };
  const spiral = (cx, cy, rad, turns, dir, start) => () => {
    g.beginPath();
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = start + dir * t * turns * Math.PI * 2;
      const rr = rad * (0.12 + 0.88 * t);
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  };

  // Bands at the top and bottom.
  for (const y of [40, H - 60]) {
    g.fillStyle = INK;
    g.fillRect(0, y - 4, W, 30);
    g.fillStyle = RED;
    g.fillRect(0, y, W, 22);
  }

  // A chain of S-scrolls up the post: big spirals alternating left and right, joined by tails.
  const centres = [];
  for (let k = 0; k < 5; k++) centres.push([k % 2 ? W * 0.28 : W * 0.72, 150 + k * 175]);
  centres.forEach(([cx, cy], k) => {
    const dir = k % 2 ? 1 : -1;
    stroke(spiral(cx, cy, 66, 1.6, dir, k * 1.3), 15);
    if (k < centres.length - 1) {
      const [nx, ny] = centres[k + 1];
      stroke(() => {
        g.beginPath();
        g.moveTo(cx + dir * 60, cy + 30);
        g.bezierCurveTo(cx + dir * 90, cy + 120, nx - dir * 120, ny - 120, nx - dir * 50, ny - 40);
      }, 13);
    }
    // small hooks filling the space on the other half of the post
    const hx = cx + W * 0.5;
    stroke(spiral(hx, cy - 30, 28, 1.1, -dir, 0.5), 9);
    stroke(() => {
      g.beginPath();
      g.moveTo(hx - 50, cy + 40);
      g.quadraticCurveTo(hx, cy + 80, hx + 50, cy + 40);
    }, 9);
  });
  // a few dots
  g.fillStyle = RED;
  for (let i = 0; i < 40; i++) {
    const x = r() * W;
    const y = 120 + r() * (H - 260);
    g.beginPath();
    g.arc(x, y, 3 + r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c, [1, 1]);
}

/** A late-afternoon sky with painted cumulus, for an equirectangular sky dome. */
export function paintSky(seed = 5) {
  const r = rng(seed);
  const W = 2048;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, '#6f9fd2');
  sky.addColorStop(0.55, '#a9c6e2');
  sky.addColorStop(1, '#f3e2c6');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H / 2);
  g.fillStyle = '#d9dcc4';
  g.fillRect(0, H / 2, W, H / 2);

  // Cumulus: flat bases, piled-up tops. Shadow layer first, then the lit side, then highlights.
  for (let n = 0; n < 16; n++) {
    const cx = r() * W;
    const base = H / 2 - 30 - r() * 150;
    const width = 160 + r() * 340;
    const height = width * (0.35 + r() * 0.35);
    const puffs = [];
    for (let i = 0; i < 14; i++) {
      const t = r();
      const px = cx + (t - 0.5) * width;
      const hump = Math.sin(Math.PI * t);
      const rad = 25 + hump * height * (0.35 + r() * 0.3);
      puffs.push([px, base - rad * 0.6 - hump * height * 0.3 * r(), rad]);
    }
    const layer = (color, dx, dy, s) => {
      g.fillStyle = color;
      wrapX(W, (ox) => {
        g.beginPath();
        for (const [x, y, rad] of puffs) {
          g.moveTo(x + ox + dx + rad * s, y + dy);
          g.arc(x + ox + dx, y + dy, rad * s, 0, Math.PI * 2);
        }
        g.fill();
      });
    };
    layer('#b8b6cf', 0, 0, 1); // cool shadow
    layer('#e9e3e6', -6, -8, 0.9); // mid
    layer('#fff6e4', -14, -16, 0.72); // warm lit tops (sun from the left)
    // flat shadowed base
    g.fillStyle = '#b8b6cf';
    wrapX(W, (ox) => g.fillRect(cx - width * 0.5 + ox, base - 10, width, 14));
  }
  // soft haze at the horizon
  const haze = g.createLinearGradient(0, H / 2 - 120, 0, H / 2);
  haze.addColorStop(0, 'rgba(243,226,198,0)');
  haze.addColorStop(1, 'rgba(243,226,198,0.85)');
  g.fillStyle = haze;
  g.fillRect(0, H / 2 - 120, W, 120);
  const t = texture(c, [1, 1], false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** A palm frond (alpha): a midrib with leaflets on both sides. Canvas x runs base to tip. */
export function paintFrond(seed = 6) {
  const r = rng(seed);
  const W = 512;
  const H = 128;
  const [c, g] = canvas(W, H);
  const greens = ['#4d7a3a', '#5c8c43', '#6a9c4b', '#7aab55'];
  g.lineCap = 'round';
  for (let x = 16; x < W - 8; x += 6) {
    const t = x / W;
    const len = 60 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.6) * (0.85 + r() * 0.3);
    for (const s of [-1, 1]) {
      g.strokeStyle = greens[Math.floor(r() * greens.length)];
      g.lineWidth = 3 + r() * 2.5;
      g.beginPath();
      g.moveTo(x, H / 2);
      g.quadraticCurveTo(x + len * 0.25, H / 2 + s * len * 0.6, x + len * 0.7, H / 2 + s * len * 0.95);
      g.stroke();
    }
  }
  g.strokeStyle = '#5a6a2c';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, H / 2);
  g.lineTo(W, H / 2);
  g.stroke();
  return texture(c, [1, 1], false);
}

/** A banana leaf (alpha): wide blade, pale midrib, fine side veins and a few wind tears (H6). */
export function paintBananaLeaf(seed = 7) {
  const r = rng(seed);
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  const edge = (x, s) => H / 2 + s * (H / 2 - 6) * Math.pow(Math.sin(Math.PI * Math.min(1, x / W * 0.98 + 0.02)), 0.45);
  g.beginPath();
  for (let x = 0; x <= W; x += 4) g.lineTo(x, edge(x, -1));
  for (let x = W; x >= 0; x -= 4) g.lineTo(x, edge(x, 1));
  g.closePath();
  const fill = g.createLinearGradient(0, 0, 0, H);
  fill.addColorStop(0, '#567f33');
  fill.addColorStop(0.5, '#7aa646');
  fill.addColorStop(1, '#4c7530');
  g.fillStyle = fill;
  g.fill();
  // side veins
  g.save();
  g.clip();
  g.lineWidth = 1;
  for (let x = 4; x < W; x += 5) {
    g.strokeStyle = `rgba(60,90,30,${0.12 + r() * 0.1})`;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(x, H / 2);
      g.lineTo(x + 34, H / 2 + s * H * 0.5);
      g.stroke();
    }
  }
  g.restore();
  // tears along the veins
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 2.5;
  for (let i = 0; i < 7; i++) {
    const x = 60 + r() * (W - 120);
    const s = r() < 0.5 ? -1 : 1;
    const depth = 0.35 + r() * 0.5;
    g.beginPath();
    g.moveTo(x + 34, H / 2 + s * H * 0.5);
    g.lineTo(x + 34 - 34 * depth, H / 2 + s * H * 0.5 * (1 - depth));
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  // midrib
  g.strokeStyle = '#d9e3a4';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(0, H / 2);
  g.lineTo(W, H / 2);
  g.stroke();
  return texture(c, [1, 1], false);
}
