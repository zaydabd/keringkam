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

/**
 * Window lattice (alpha): our own pattern, not a copy of a specific house. Diagonal strips cross in
 * a diamond grid, with a ring at every other crossing and a small rosette at the rest. One tile is
 * 0.4 m square, so with UVs in metres the repeat is 2.5. Inked edges, cream face: the material
 * colour sets the wood tone.
 */
export function paintLattice(seed = 11) {
  const r = rng(seed);
  const S = 512;
  const P = 128; // crossing pitch: 10 cm
  const [c, g] = canvas(S, S);
  g.lineCap = 'round';
  const strips = (width, style) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    for (let k = -8; k <= 8; k++) {
      g.beginPath();
      g.moveTo(k * P - S, -S);
      g.lineTo(k * P + S * 2, S * 2);
      g.moveTo(k * P - S, S * 2);
      g.lineTo(k * P + S * 2, -S);
      g.stroke();
    }
  };
  const nodes = (fn) => {
    for (let i = -1; i <= S / 64 + 1; i++) for (let j = -1; j <= S / 64 + 1; j++) if ((i + j) % 2 === 0) fn(i * 64, j * 64, (i / 2 + j / 2) % 2 === 0);
  };
  strips(26, '#3a2418');
  nodes((x, y, ring) => {
    g.fillStyle = '#3a2418';
    g.beginPath();
    g.arc(x, y, ring ? 34 : 17, 0, Math.PI * 2);
    g.fill();
  });
  strips(17, '#efe2c8');
  nodes((x, y, ring) => {
    g.fillStyle = '#efe2c8';
    g.beginPath();
    g.arc(x, y, ring ? 29 : 12, 0, Math.PI * 2);
    g.fill();
    if (ring) {
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(x, y, 18, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = '#3a2418';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(x, y, 18, 0, Math.PI * 2);
      g.stroke();
    }
  });
  // brush tone along the strips
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '120,80,50' : '255,250,240'},${0.06 + r() * 0.08})`;
    g.globalCompositeOperation = 'source-atop';
    g.fillRect(r() * S, r() * S, 10 + r() * 30, 2 + r() * 3);
  }
  g.globalCompositeOperation = 'source-over';
  return texture(c, [2.5, 2.5]);
}

/**
 * Curtain prints. 'valance': red-orange with yellow and green sprigs, as on the window valances in
 * the reference. 'sheer': pale peach with sparse orange sprigs, for the tied-back panels. One tile
 * is 0.5 m square (repeat 2).
 */
export function paintCurtain(seed = 12, kind = 'valance') {
  const r = rng(seed);
  const S = 256;
  const [c, g] = canvas(S, S);
  const valance = kind === 'valance';
  g.fillStyle = valance ? '#e8582c' : '#f7e2d0';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 18; i++) blot(g, S, r() * S, r() * S, 20 + r() * 40, 20 + r() * 40, valance ? '200,40,30' : '240,170,140', 0.12 + r() * 0.12);
  const sprig = (x, y, s, petal, leaf) => {
    wrapX(S, (dx) => {
      g.save();
      g.translate(x + dx, y);
      g.rotate(r() * Math.PI * 2);
      g.fillStyle = leaf;
      for (const a of [0.6, 2.4]) {
        g.beginPath();
        g.ellipse(Math.cos(a) * s * 1.3, Math.sin(a) * s * 1.3, s * 1.1, s * 0.45, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = petal;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.45, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = valance ? '#7a2414' : '#e8582c';
      g.beginPath();
      g.arc(0, 0, s * 0.28, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });
  };
  const n = valance ? 26 : 9;
  for (let i = 0; i < n; i++) {
    const y = r() * S;
    sprig(r() * S, y, valance ? 7 + r() * 5 : 6 + r() * 4, valance ? (r() < 0.5 ? '#f6d24a' : '#fbe9b0') : '#ef8a52', valance ? '#5f9a3a' : '#9cbf7a');
  }
  if (valance) {
    // a border band along the bottom hem
    g.fillStyle = 'rgba(120,30,16,0.55)';
    g.fillRect(0, S - 20, S, 6);
  }
  const t = texture(c, [2, 2]);
  return t;
}

/** The red cloth on the embroidery frame: fine weave, a little uneven dye, a row of tacking stitches. */
export function paintCloth(seed = 13) {
  const r = rng(seed);
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#d3283a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 20; i++) blot(g, W, r() * W, r() * H, 40 + r() * 90, 30 + r() * 60, r() < 0.5 ? '150,10,30' : '240,80,90', 0.08 + r() * 0.1);
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = `rgba(90,0,16,${0.04 + r() * 0.05})`;
    g.fillRect(0, y, W, 1);
  }
  for (let x = 0; x < W; x += 2) {
    g.fillStyle = `rgba(255,170,170,${0.02 + r() * 0.04})`;
    g.fillRect(x, 0, 1, H);
  }
  // tacking stitches near one end, as in the reference (work not started yet)
  g.fillStyle = 'rgba(255,246,236,0.9)';
  for (let y = 24; y < H - 24; y += 9) g.fillRect(W - 46 + (r() - 0.5) * 2, y, 2, 5);
  return texture(c, [1, 1], false);
}

/**
 * Wall hangings atlas, 4 x 2 tiles: woven mats in tan, green and violet checks, and framed pictures
 * with a painted spray of flowers. Each item's face takes one tile by its UVs.
 */
export function paintDecor(seed = 14) {
  const r = rng(seed);
  const T = 192;
  const [c, g] = canvas(T * 4, T * 2);
  const weave = (x0, y0, a, b) => {
    const n = 12;
    const s = T / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? a : b;
        g.fillRect(x0 + i * s, y0 + j * s, s, s);
        g.fillStyle = 'rgba(40,24,12,0.18)';
        g.fillRect(x0 + i * s, y0 + j * s + ((i + j) % 2 ? 0 : s - 2), s, 2);
      }
    g.strokeStyle = '#3a2418';
    g.lineWidth = 8;
    g.strokeRect(x0 + 4, y0 + 4, T - 8, T - 8);
  };
  const picture = (x0, y0, ground, flower) => {
    g.fillStyle = '#6b4a2c';
    g.fillRect(x0, y0, T, T);
    g.fillStyle = ground;
    g.fillRect(x0 + 18, y0 + 18, T - 36, T - 36);
    g.strokeStyle = '#4c7a3a';
    g.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.moveTo(x0 + T / 2, y0 + T - 30);
      g.quadraticCurveTo(x0 + T / 2 + (r() - 0.5) * 60, y0 + T / 2, x0 + 40 + r() * (T - 80), y0 + 40 + r() * 50);
      g.stroke();
      g.fillStyle = flower;
      g.beginPath();
      g.arc(x0 + 40 + r() * (T - 80), y0 + 40 + r() * 60, 7 + r() * 6, 0, Math.PI * 2);
      g.fill();
    }
  };
  weave(0, 0, '#d8b77a', '#a8804a');
  weave(T, 0, '#7da35a', '#d9c690');
  picture(T * 2, 0, '#efe6d0', '#d8473a');
  weave(T * 3, 0, '#8a5a8a', '#e0c890');
  picture(0, T, '#d9e4e8', '#3a6aa8');
  weave(T, T, '#c9a05a', '#5f8a6a');
  picture(T * 2, T, '#f2ead8', '#e09a2a');
  weave(T * 3, T, '#b04a3a', '#e8d4a8');
  return texture(c, [1, 1], false);
}

/** Soft light (alpha in the red channel is not used: colour and alpha together), for glows and floor sheen. */
export function paintGlow(kind = 'round') {
  const S = 128;
  const [c, g] = canvas(S, S);
  if (kind === 'round') {
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  } else {
    // floor sheen: bright near the window (canvas top), fading into the room, broken into streaks
    const r = rng(15);
    for (let x = 0; x < S; x++) {
      const k = 0.55 + r() * 0.45;
      const grad = g.createLinearGradient(0, 0, 0, S);
      grad.addColorStop(0, `rgba(255,255,255,${k})`);
      grad.addColorStop(0.5, `rgba(255,255,255,${k * 0.35})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 1, S);
    }
    const edge = g.createLinearGradient(0, 0, S, 0);
    edge.addColorStop(0, 'rgba(0,0,0,1)');
    edge.addColorStop(0.2, 'rgba(0,0,0,0)');
    edge.addColorStop(0.8, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = edge;
    g.fillRect(0, 0, S, S);
  }
  const t = texture(c, [1, 1], false);
  return t;
}
