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

/** A soft watercolour blot: a radial gradient, drawn wrapped across the left/right edge. */
function blot(g, W, x, y, rx, ry, rgb, a) {
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
 * Wood planks. One tile is 2 m along the grain (canvas x) by 0.5 m across (canvas y), so with
 * UVs in metres the texture repeat is (0.5, 2). `weathered` adds the silver-grey streaks and
 * checks of sun-bleached timber, as on the rails and benches in H1/H4.
 */
export function paintPlanks(seed = 1, { weathered = false } = {}) {
  const r = rng(seed);
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = weathered ? '#e6e4e0' : '#eeeae4';
  g.fillRect(0, 0, W, H);

  // Watercolour blots: big soft patches of warmer and cooler wood.
  for (let i = 0; i < 34; i++) {
    const warm = r() < 0.5;
    blot(g, W, r() * W, r() * H, 60 + r() * 160, 20 + r() * 50, warm ? '150,104,60' : '255,248,236', 0.06 + r() * 0.08);
  }

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

  // Grain strokes, as if drawn with a fine brush; some sweep around a knot.
  g.lineCap = 'round';
  const knots = [];
  for (let i = 0; i < 3; i++) knots.push([r() * W, 30 + r() * (H - 60), 8 + r() * 10]);
  for (let i = 0; i < 26; i++) {
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
      for (let x = 0; x <= len; x += 6) {
        const X = x0 + x;
        let y = y0 + Math.sin((X / W) * Math.PI * 2 * k + ph) * amp;
        for (const [kx, ky, kr] of knots) {
          const dxk = ((X - kx + W * 1.5) % W) - W / 2;
          const push = Math.exp(-(dxk * dxk) / (kr * kr * 9)) * kr * 1.6;
          y += Math.sign(y - ky || 1) * push * Math.exp(-((y - ky) ** 2) / (kr * kr * 6));
        }
        g.lineTo(X + dx, y);
      }
      g.stroke();
    });
  }
  for (const [x, y, rx] of knots) {
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

  if (weathered) {
    // sun-bleached silver streaks and dark checks (short cracks along the grain)
    for (let i = 0; i < 40; i++) {
      const y = r() * H;
      const x = r() * W;
      g.fillStyle = `rgba(205,210,214,${0.12 + r() * 0.16})`;
      wrapX(W, (dx) => g.fillRect(x + dx, y, 80 + r() * 300, 2 + r() * 6));
    }
    for (let i = 0; i < 26; i++) {
      const y = r() * H;
      const x = r() * W;
      const len = 30 + r() * 120;
      g.strokeStyle = `rgba(48,32,22,${0.35 + r() * 0.3})`;
      g.lineWidth = 1 + r() * 1.2;
      wrapX(W, (dx) => {
        g.beginPath();
        g.moveTo(x + dx, y);
        g.quadraticCurveTo(x + dx + len / 2, y + (r() - 0.5) * 4, x + dx + len, y + (r() - 0.5) * 3);
        g.stroke();
      });
    }
  }

  // Dry-brush highlights: broken light dashes along the grain.
  for (let i = 0; i < 30; i++) {
    const y = r() * H;
    let x = r() * W;
    const end = x + 60 + r() * 200;
    g.fillStyle = `rgba(255,252,244,${0.18 + r() * 0.15})`;
    while (x < end) {
      const w = 6 + r() * 22;
      wrapX(W, (dx) => g.fillRect(x + dx, y + (r() - 0.5) * 2, w, 1.5));
      x += w + 3 + r() * 10;
    }
  }
  return texture(c, [0.5, 2]);
}

/**
 * The underside of the thatch (H1): rows of leaf shingles, 1 m by 1 m per tile, rows every
 * 12.5 cm. Each row is split into shingles of different widths and tones, fibrous, with a soft
 * shadow under the overlap and a ragged lit lip.
 */
export function paintThatch(seed = 2) {
  const r = rng(seed);
  const S = 512;
  const ROW = 64;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#e4dccd';
  g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  for (let y0 = 0; y0 < S; y0 += ROW) {
    // shingles: segments of the row in slightly different tones
    for (let x = r() * 40; x < S + 40; ) {
      const w = 26 + r() * 50;
      const v = r();
      g.fillStyle = v < 0.5 ? `rgba(90,60,30,${0.05 + r() * 0.12})` : `rgba(255,240,210,${0.05 + r() * 0.12})`;
      wrapX(S, (dx) => g.fillRect(x + dx, y0, w, ROW));
      g.strokeStyle = 'rgba(55,34,18,0.35)';
      g.lineWidth = 1.2;
      wrapX(S, (dx) => {
        g.beginPath();
        g.moveTo(x + dx, y0 + 4);
        g.lineTo(x + dx + (r() - 0.5) * 4, y0 + ROW - 4);
        g.stroke();
      });
      x += w;
    }
    // fibres: short slanted strokes, light and dark
    for (let i = 0; i < 300; i++) {
      const x = r() * S;
      const y = y0 + r() * ROW;
      const len = 12 + r() * 34;
      const tilt = (r() - 0.5) * 6;
      g.strokeStyle = r() < 0.55 ? `rgba(70,46,24,${0.1 + r() * 0.22})` : `rgba(255,244,220,${0.1 + r() * 0.2})`;
      g.lineWidth = 1 + r() * 1.6;
      wrapX(S, (dx) => {
        g.beginPath();
        g.moveTo(x + dx, y);
        g.lineTo(x + dx + tilt, Math.min(y + len, y0 + ROW));
        g.stroke();
      });
    }
    // the overlap: a soft shadow under the next row, a lit lip above it
    const sh = g.createLinearGradient(0, y0 + ROW - 20, 0, y0 + ROW);
    sh.addColorStop(0, 'rgba(50,30,16,0)');
    sh.addColorStop(1, 'rgba(50,30,16,0.5)');
    g.fillStyle = sh;
    g.fillRect(0, y0 + ROW - 20, S, 20);
    g.fillStyle = 'rgba(255,240,210,0.3)';
    g.fillRect(0, y0, S, 3);
    // a ragged edge along the lip: hanging leaf tips
    g.fillStyle = 'rgba(60,38,20,0.4)';
    for (let x = 0; x < S; x += 3 + r() * 6) g.fillRect(x, y0 + ROW - 2, 1.5 + r() * 1.5, -(3 + r() * 10));
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
 * Painted post: an aged cream ground with red-brown scrolls and spirals, inked in dark brown,
 * with chipped paint, cracks along the grain and grime at the foot. A generic pattern inspired
 * by the painted posts in H1/H6, not a copy of any particular carving.
 * Canvas x wraps around the post, y runs down from its top (cylinder UVs, 0..1).
 */
export function paintPost(seed = 4) {
  const r = rng(seed);
  const W = 512;
  const H = 1024;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#ebdcbc';
  g.fillRect(0, 0, W, H);
  // wood grain under the paint, and weathering streaks
  for (let i = 0; i < 30; i++) blot(g, W, r() * W, r() * H, 40 + r() * 90, 120 + r() * 220, r() < 0.5 ? '150,120,84' : '255,248,232', 0.08 + r() * 0.08);
  g.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const x0 = r() * W;
    const ph = r() * 6.28;
    g.strokeStyle = `rgba(110,84,56,${0.06 + r() * 0.1})`;
    g.lineWidth = 1 + r();
    wrapX(W, (dx) => {
      g.beginPath();
      for (let y = 0; y <= H; y += 16) g.lineTo(x0 + dx + Math.sin(y / 90 + ph) * 3, y);
      g.stroke();
    });
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
    const steps = 90;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = start + dir * t * turns * Math.PI * 2;
      const rr = rad * (0.12 + 0.88 * t);
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  };
  const band = (y, h) => {
    g.fillStyle = INK;
    g.fillRect(0, y - 4, W, h + 8);
    g.fillStyle = RED;
    g.fillRect(0, y, W, h);
  };
  // a row of inked triangles (a generic border, not a specific motif)
  const teeth = (y, h, down) => {
    for (let x = 0; x < W; x += 32) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 16, y + (down ? h : -h));
      g.lineTo(x + 32, y);
      g.closePath();
      g.fillStyle = RED;
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.stroke();
    }
  };

  // Borders at the top and the foot.
  band(6, 40);
  teeth(50, 34, true);
  band(H - 80, 26);
  teeth(H - 84, 34, false);

  // A chain of S-scrolls up the post: big spirals alternating left and right, joined by tails.
  const centres = [];
  for (let k = 0; k < 5; k++) centres.push([k % 2 ? W * 0.28 : W * 0.72, 175 + k * 158]);
  centres.forEach(([cx, cy], k) => {
    const dir = k % 2 ? 1 : -1;
    stroke(spiral(cx, cy, 62, 1.7, dir, k * 1.3), 15);
    if (k < centres.length - 1) {
      const [nx, ny] = centres[k + 1];
      stroke(() => {
        g.beginPath();
        g.moveTo(cx + dir * 56, cy + 28);
        g.bezierCurveTo(cx + dir * 90, cy + 110, nx - dir * 120, ny - 110, nx - dir * 48, ny - 38);
      }, 13);
    }
    // on the other half of the post: a smaller spiral with a leaf-like hook, and a curl
    const hx = cx + W * 0.5;
    stroke(spiral(hx, cy - 34, 30, 1.3, -dir, 0.5), 10);
    stroke(() => {
      g.beginPath();
      g.moveTo(hx - 56, cy + 30);
      g.quadraticCurveTo(hx, cy + 86, hx + 56, cy + 30);
      g.quadraticCurveTo(hx + 70, cy + 4, hx + 46, cy - 4);
    }, 9);
    stroke(spiral(hx + dir * 64, cy + 62, 16, 1.1, dir, 2), 7);
  });
  // rows of dots along the tails
  g.fillStyle = INK;
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = 110 + r() * (H - 240);
    wrapX(W, (dx) => {
      g.beginPath();
      g.arc(x + dx, y, 2.5 + r() * 2.5, 0, Math.PI * 2);
      g.fill();
    });
  }

  // Age: chipped paint (flecks of ground showing through), cracks, grime at the foot.
  for (let i = 0; i < 220; i++) {
    const x = r() * W;
    const y = r() * H;
    g.fillStyle = `rgba(222,204,170,${0.55 + r() * 0.4})`;
    g.beginPath();
    g.ellipse(x, y, 1.5 + r() * 5, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 8; i++) {
    const x0 = r() * W;
    const y0 = r() * H * 0.7;
    const len = 120 + r() * 380;
    g.strokeStyle = `rgba(50,32,20,${0.35 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    let x = x0;
    for (let y = y0; y < y0 + len; y += 10) {
      x += (r() - 0.5) * 3;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const grime = g.createLinearGradient(0, H * 0.78, 0, H);
  grime.addColorStop(0, 'rgba(84,64,44,0)');
  grime.addColorStop(1, 'rgba(84,64,44,0.55)');
  g.fillStyle = grime;
  g.fillRect(0, H * 0.78, W, H * 0.22);
  const soot = g.createLinearGradient(0, 0, 0, 90);
  soot.addColorStop(0, 'rgba(60,44,30,0.4)');
  soot.addColorStop(1, 'rgba(60,44,30,0)');
  g.fillStyle = soot;
  g.fillRect(0, 0, W, 90);
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
  const greens = ['#5a8a3e', '#6f9f49', '#86b356', '#9cc462', '#b3cf74'];
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

/**
 * A clump of leaves (alpha), painted in grey values so each tree's vertex colour sets the green.
 * Used on foliage cards scattered over the canopy blobs (after craftzdog's ghibli-style-shader).
 */
export function paintLeafClump(seed = 8) {
  const r = rng(seed);
  const S = 256;
  const [c, g] = canvas(S, S);
  const leaves = [];
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 82;
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d;
    const ang = a + (r() - 0.5) * 1.2;
    const len = 34 + r() * 30;
    const wid = 13 + r() * 9;
    // leaves higher in the clump are lighter, as if lit from above
    const v = 150 + (1 - y / S) * 70 + r() * 35;
    leaves.push({ x, y, ang, len, wid, v });
  }
  leaves.sort((p, q) => p.v - q.v); // dark ones first, lit ones on top
  for (const { x, y, ang, len, wid, v } of leaves) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(-len * 0.35, 0);
    g.quadraticCurveTo(0, -wid, len * 0.65, 0);
    g.quadraticCurveTo(0, wid, -len * 0.35, 0);
    g.closePath();
    const c0 = Math.min(255, v);
    g.fillStyle = `rgb(${c0},${c0},${c0})`;
    g.fill();
    g.strokeStyle = `rgba(40,40,40,0.35)`;
    g.lineWidth = 1.5;
    g.stroke();
    // a lit edge on the upper side and a midrib
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-len * 0.2, -wid * 0.35);
    g.quadraticCurveTo(len * 0.1, -wid * 0.6, len * 0.5, -wid * 0.1);
    g.stroke();
    g.strokeStyle = 'rgba(60,60,60,0.3)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-len * 0.3, 0);
    g.lineTo(len * 0.55, 0);
    g.stroke();
    g.restore();
  }
  return texture(c, [1, 1], false);
}

/** Tree bark: pale grey-brown with vertical fissures, lichen patches and a mossy foot. x wraps round the trunk. */
export function paintBark(seed = 9) {
  const r = rng(seed);
  const W = 128;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#9a8a74';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const rgb = ['196,186,160', '120,104,84', '150,160,128', '214,206,186'][Math.floor(r() * 4)];
    blot(g, W, r() * W, r() * H, 10 + r() * 26, 20 + r() * 60, rgb, 0.18 + r() * 0.2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x0 = r() * W;
    const y0 = r() * H;
    const len = 30 + r() * 120;
    g.strokeStyle = `rgba(58,44,34,${0.25 + r() * 0.35})`;
    g.lineWidth = 0.8 + r() * 1.6;
    wrapX(W, (dx) => {
      g.beginPath();
      for (let y = 0; y <= len; y += 10) g.lineTo(x0 + dx + Math.sin((y0 + y) / 26 + i) * 2.5, y0 + y);
      g.stroke();
    });
  }
  // moss creeping up from the ground (v = 0 is the foot of the trunk, drawn at the bottom)
  const moss = g.createLinearGradient(0, H, 0, H * 0.55);
  moss.addColorStop(0, 'rgba(84,110,60,0.6)');
  moss.addColorStop(1, 'rgba(84,110,60,0)');
  g.fillStyle = moss;
  g.fillRect(0, 0, W, H);
  return texture(c, [1, 1]);
}

/** Coconut trunk: grey with close leaf-scar rings. x runs along the trunk and repeats. */
export function paintPalmTrunk(seed = 10) {
  const r = rng(seed);
  const W = 128;
  const H = 64;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#a39680';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 8; i++) blot(g, W, r() * W, r() * H, 14 + r() * 20, 10 + r() * 16, r() < 0.5 ? '196,188,168' : '120,108,90', 0.25);
  for (let x = 4; x < W; x += 16) {
    g.strokeStyle = `rgba(70,56,44,${0.45 + r() * 0.25})`;
    g.lineWidth = 2 + r() * 1.5;
    g.beginPath();
    for (let y = 0; y <= H; y += 8) g.lineTo(x + Math.sin(y / 9 + x) * 1.5, y);
    g.stroke();
  }
  return texture(c, [7, 1]);
}
