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
 * UVs in metres the texture repeat is (0.5, 2). `brushy` (walls, after R2): long soft brush
 * streaks and only a few faint grain lines, no knots. `weathered` adds the silver-grey streaks and
 * checks of sun-bleached timber, as on the rails and benches in H1/H4.
 */
export function paintPlanks(seed = 1, { weathered = false, brushy = false } = {}) {
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
  for (let i = 0; i < (brushy ? 110 : 70); i++) {
    const y0 = r() * H;
    const h = 3 + r() * 16;
    const a = brushy ? 0.07 + r() * 0.12 : 0.045 + r() * 0.08;
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
  for (let i = 0; i < (brushy ? 0 : 3); i++) knots.push([r() * W, 30 + r() * (H - 60), 8 + r() * 10]);
  for (let i = 0; i < (brushy ? 9 : 26); i++) {
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
export function paintSky(seed = 5, { haze = '243,226,198' } = {}) {
  const r = rng(seed);
  const W = 2048;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, '#6f9fd2');
  sky.addColorStop(0.55, '#a9c6e2');
  sky.addColorStop(1, `rgb(${haze})`); // the horizon takes the haze colour (the same one the fog uses)
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
  const hazeBand = g.createLinearGradient(0, H / 2 - 120, 0, H / 2);
  hazeBand.addColorStop(0, `rgba(${haze},0)`);
  hazeBand.addColorStop(1, `rgba(${haze},0.85)`);
  g.fillStyle = hazeBand;
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
/** An irregular hand-painted patch (batik / ikat motif): a wobbly closed shape of about radius s. */
function motif(g, S, x, y, s, r) {
  const n = 7;
  const pts = [];
  const a0 = r() * Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2;
    const rad = s * (0.55 + r() * 0.75);
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad * 1.25]);
  }
  for (const dx of [-S, 0, S]) {
    for (const dy of [-S, 0, S]) {
      g.beginPath();
      for (let k = 0; k <= n; k++) {
        const [x0, y0] = pts[k % n];
        const [x1, y1] = pts[(k + 1) % n];
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        if (k === 0) g.moveTo(x + dx + mx, y + dy + my);
        else g.quadraticCurveTo(x + dx + x0, y + dy + y0, x + dx + mx, y + dy + my);
      }
      g.fill();
    }
  }
}

/**
 * Curtain cloth after R2 (the painting): a hand-painted batik, not a printed floral.
 * 'valance': rust ground with cream and ochre patches and a dark hem band.
 * 'drape': cream-grey ground with rust and slate-blue patches. 'pale': a sheer, the same pattern
 * very faint on cream. All tile; repeat is (2, 2).
 */
export function paintCurtain(seed = 12, kind = 'valance') {
  const r = rng(seed);
  const S = 256;
  const [c, g] = canvas(S, S);
  const valance = kind === 'valance';
  const pale = kind === 'pale';
  g.fillStyle = valance ? '#94412a' : pale ? '#efe6d6' : '#8f8274';
  g.fillRect(0, 0, S, S);
  // uneven dye
  for (let i = 0; i < 18; i++) blot(g, S, r() * S, r() * S, 20 + r() * 40, 20 + r() * 40, valance ? (r() < 0.5 ? '110,36,22' : '180,90,50') : r() < 0.5 ? '150,150,160' : '232,220,200', (pale ? 0.04 : 0.12) + r() * (pale ? 0.05 : 0.14));
  const inks = valance ? ['#ead7aa', '#dcb46e', '#efe0bc', '#e2c48a', '#6e2616'] : ['#8e4630', '#66728a', '#9c5638', '#55637c', '#cdbda4', '#7a4a3a', '#6b7890'];
  const cell = valance ? 51.2 : 64; // large flowing shapes (R2), four or five across the tile
  for (let y = cell / 2; y < S; y += cell) {
    for (let x = cell / 2; x < S; x += cell) {
      g.fillStyle = inks[Math.floor(r() * inks.length)];
      g.globalAlpha = pale ? 0.08 : 0.78 + r() * 0.2;
      const row = Math.round(y / cell);
      motif(g, S, x + (r() - 0.5) * cell * 0.4 + (row % 2 ? cell / 2 : 0), y + (r() - 0.5) * cell * 0.3, cell * (0.44 + r() * 0.14), r);
      // a smaller patch of another colour inside it, and a third beside it
      g.fillStyle = inks[Math.floor(r() * inks.length)];
      motif(g, S, x + (r() - 0.5) * cell * 0.3 + (row % 2 ? cell / 2 : 0), y + (r() - 0.5) * cell * 0.3, cell * (0.16 + r() * 0.08), r);
      g.fillStyle = inks[Math.floor(r() * inks.length)];
      motif(g, S, x + cell * 0.5 + (r() - 0.5) * cell * 0.3, y + cell * 0.5 + (r() - 0.5) * cell * 0.3, cell * (0.14 + r() * 0.08), r);
    }
  }
  g.globalAlpha = 1;
  // brush streaks down the cloth (folds catch the paint)
  for (let i = 0; i < 22; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(60,34,26,${(pale ? 0.02 : 0.05) + r() * (pale ? 0.03 : 0.08)})` : `rgba(255,244,226,${0.04 + r() * 0.07})`;
    g.fillRect(r() * S, 0, 2 + r() * 9, S);
  }
  if (valance) {
    g.fillStyle = 'rgba(92,30,18,0.6)';
    g.fillRect(0, S - 22, S, 7);
  }
  return texture(c, [2, 2]);
}

/**
 * The red cloth on the embroidery frame, after R2: deep crimson with painted creases and a gold
 * border band. Still plain in the middle (no keringkam motif yet).
 */
export function paintCloth(seed = 13) {
  const r = rng(seed);
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#b3242a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 22; i++) blot(g, W, r() * W, r() * H, 40 + r() * 90, 30 + r() * 60, r() < 0.55 ? '130,14,24' : '236,84,74', 0.1 + r() * 0.12);
  // creases: long soft diagonal strokes, dark with a light edge
  for (let i = 0; i < 9; i++) {
    const x = r() * W;
    const y = r() * H;
    const len = 80 + r() * 180;
    const a = -0.5 + r() * 1.0;
    for (const [off, col] of [[0, `rgba(110,10,20,${0.16 + r() * 0.12})`], [3, `rgba(255,130,110,${0.1 + r() * 0.1})`]]) {
      g.strokeStyle = col;
      g.lineWidth = 2 + r() * 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y + off);
      g.quadraticCurveTo(x + (Math.cos(a) * len) / 2, y + off + (Math.sin(a) * len) / 2 + (r() - 0.5) * 24, x + Math.cos(a) * len, y + off + Math.sin(a) * len);
      g.stroke();
    }
  }
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = `rgba(90,0,16,${0.03 + r() * 0.04})`;
    g.fillRect(0, y, W, 1);
  }
  // gold bands across the two ends (R2): ruled lines with a row of diamonds and dots between them
  const diamond = (x, y, k) => {
    g.beginPath();
    g.moveTo(x, y - k);
    g.lineTo(x + k, y);
    g.lineTo(x, y + k);
    g.lineTo(x - k, y);
    g.fill();
  };
  for (const x0 of [34, W - 34 - 58]) {
    g.fillStyle = 'rgba(120,16,20,0.35)'; // the band sits on slightly darker cloth
    g.fillRect(x0 - 4, 0, 66, H);
    g.fillStyle = '#e2b860';
    for (const dx of [0, 5, 53, 58]) g.fillRect(x0 + dx, 10, dx === 0 || dx === 58 ? 2.5 : 1.5, H - 20);
    g.fillStyle = '#edc978';
    for (let y = 22; y < H - 14; y += 20) {
      diamond(x0 + 29, y, 7);
      g.fillRect(x0 + 14, y + 9, 3, 3);
      g.fillRect(x0 + 42, y + 9, 3, 3);
    }
    g.fillStyle = '#b3242a';
    for (let y = 22; y < H - 14; y += 20) diamond(x0 + 29, y, 3);
  }
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

// ---------------------------------------------------------------------------------------------
// Outside the windows (outside.js): a Sarawak Malay river kampung, after the Commons photos of
// Kampung Bako (K1, K2, K5 in research/CREDITS.md).

/** Yard: rough grass with sandy, trodden patches. Tiles; made for UVs in metres / 8. */
export function paintGround(seed = 21) {
  const r = rng(seed);
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#a3b872';
  g.fillRect(0, 0, S, S);
  const wrap = (fn) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy);
  };
  for (let i = 0; i < 46; i++) {
    const x = r() * S;
    const y = r() * S;
    const rx = 30 + r() * 80;
    const ry = 20 + r() * 50;
    const rgb = r() < 0.3 ? '204,184,140' : r() < 0.6 ? '118,150,84' : '176,196,120';
    const a = 0.12 + r() * 0.2;
    wrap((dx, dy) => {
      g.save();
      g.translate(x + dx, y + dy);
      g.scale(1, ry / rx);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, `rgba(${rgb},${a})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    });
  }
  // short brush flicks of grass
  g.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = r() * S;
    const y = r() * S;
    g.strokeStyle = r() < 0.5 ? `rgba(86,122,66,${0.15 + r() * 0.2})` : `rgba(212,222,150,${0.12 + r() * 0.18})`;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 8);
    g.stroke();
  }
  return texture(c, [1, 1]);
}

/** Rainforest canopy seen from far off: packed round crowns, lit from the upper left. Tiles. */
export function paintCanopy(seed = 23) {
  const r = rng(seed);
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#5f8556';
  g.fillRect(0, 0, S, S);
  const wrap = (fn) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy);
  };
  for (let i = 0; i < 260; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 14 + r() * 26;
    const hue = r();
    const body = hue < 0.33 ? '104,146,88' : hue < 0.66 ? '84,128,84' : '128,160,96';
    wrap((dx, dy) => {
      g.fillStyle = 'rgba(52,84,62,0.55)'; // shadow under the crown
      g.beginPath();
      g.ellipse(x + dx + rad * 0.2, y + dy + rad * 0.3, rad, rad * 0.85, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgb(${body})`;
      g.beginPath();
      g.ellipse(x + dx, y + dy, rad, rad * 0.85, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(190,212,140,0.5)'; // light on the upper left
      g.beginPath();
      g.ellipse(x + dx - rad * 0.3, y + dy - rad * 0.32, rad * 0.5, rad * 0.38, -0.5, 0, Math.PI * 2);
      g.fill();
    });
  }
  return texture(c, [1, 1]);
}

/**
 * Corrugated zinc roofing: light, so the vertex colour gives the paint (rust red, blue, green,
 * bare grey; K1, K2, K5). Ribs run down the slope (canvas y); sheets overlap; rust comes through.
 * Tiles; made for UVs in metres / 2.
 */
export function paintZinc(seed = 24) {
  const r = rng(seed);
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#e9e6de';
  g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 8) {
    g.fillStyle = 'rgba(70,60,54,0.28)';
    g.fillRect(x, 0, 2, S);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(x + 4, 0, 2, S);
  }
  for (const y of [0, 128]) {
    g.fillStyle = 'rgba(60,50,46,0.3)'; // sheet overlap
    g.fillRect(0, y, S, 3);
  }
  for (let i = 0; i < 22; i++) blot(g, S, r() * S, r() * S, 14 + r() * 40, 10 + r() * 30, r() < 0.6 ? '150,84,50' : '90,80,74', 0.1 + r() * 0.2);
  // streaks running down from the overlaps
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(120,70,44,${0.06 + r() * 0.12})`;
    g.fillRect(r() * S, r() * S, 2 + r() * 3, 20 + r() * 60);
  }
  return texture(c, [1, 1]);
}

/**
 * A soft watercolour sky for the window view (R2): pale blue wash fading to the haze colour at
 * the horizon, with a few soft cumulus (white tops, faint lilac bases). Equirectangular: the
 * upper half of the canvas is the sky, the lower half takes the haze colour.
 */
export function paintSoftSky(seed = 25, { haze = '244,250,234', vivid = false } = {}) {
  const r = rng(seed);
  const W = 2048;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  // vivid (R3): a strong, clear blue that holds almost to the horizon. It is painted more
  // saturated than it should look: the room's grade takes about a third of the colour out again.
  sky.addColorStop(0, vivid ? '#1f6fd6' : '#a9c8e4');
  sky.addColorStop(vivid ? 0.6 : 0.5, vivid ? '#3f8fe6' : '#d6e6ee');
  sky.addColorStop(vivid ? 0.93 : 0.8, vivid ? '#8cc4f0' : '#eaf2ee');
  sky.addColorStop(1, `rgb(${haze})`);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H / 2);
  g.fillStyle = `rgb(${haze})`;
  g.fillRect(0, H / 2, W, H / 2);
  // A puff with a soft edge; `core` is how far out it stays solid (watercolour clouds have
  // a fairly firm edge on the lit side).
  const puff = (x, y, rad, rgb, a, core = 0) => {
    wrapX(W, (dx) => {
      const grad = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
      grad.addColorStop(0, `rgba(${rgb},${a})`);
      grad.addColorStop(Math.max(0.01, core), `rgba(${rgb},${a})`);
      grad.addColorStop(core + (1 - core) * 0.6, `rgba(${rgb},${a * 0.5})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2);
    });
  };
  if (vivid) {
    // R3: wide cumulus banks rather than single puffs. Each bank has a flat, shaded base and a
    // lumpy top built from many small lobes; a few small clouds sit low near the horizon.
    const banks = [];
    for (let n = 0; n < 8; n++) banks.push({ cx: ((n + r() * 0.7) / 8) * W, base: H / 2 - 60 - r() * 120, width: 220 + r() * 300, tall: 0.22 + r() * 0.12 });
    for (let n = 0; n < 10; n++) banks.push({ cx: r() * W, base: H / 2 - 18 - r() * 30, width: 60 + r() * 90, tall: 0.18 + r() * 0.08 });
    for (const b of banks) {
      const lobes = [];
      const count = Math.round(b.width / 9);
      for (let i = 0; i < count; i++) {
        const t = r();
        const hump = Math.sin(Math.PI * t) ** 0.7; // fuller in the middle of the bank
        const rad = (8 + r() * 22) * (0.5 + hump) * (b.width / 380);
        const lift = hump * b.width * b.tall * (0.4 + r() * 0.6); // how high this lobe stands
        lobes.push([b.cx + (t - 0.5) * b.width, b.base - lift, Math.max(6, rad), lift]);
      }
      // the base: a long, flat shaded band, cool grey (the shade side of a cumulus)
      for (let x = -0.5; x <= 0.5; x += 0.06) {
        const hump = Math.cos(Math.PI * x);
        puff(b.cx + x * b.width * 0.95, b.base + 2, 8 + hump * b.width * 0.05, '154,158,184', 0.4, 0.6);
      }
      // body: each lobe as a warm grey shade, then a lit cap offset up and to the light (left)
      for (const [x, y, rad] of lobes) puff(x + rad * 0.15, y + rad * 0.3, rad * 1.08, '200,197,204', 0.8, 0.78);
      for (const [x, y, rad, lift] of lobes) if (lift > b.width * b.tall * 0.2) puff(x - rad * 0.2, y - rad * 0.2, rad, '255,253,246', 0.97, 0.82);
    }
  } else {
    const count = 26;
    for (let n = 0; n < count; n++) {
      const cx = ((n + r()) / count) * W; // spread round the sky, so blue shows between them
      const base = H / 2 - 36 - r() * 190; // between about 6 and 33 degrees up
      const width = 70 + r() * 150;
      for (let i = 0; i < 9; i++) {
        const t = r();
        const rad = 12 + Math.sin(Math.PI * t) * width * (0.16 + r() * 0.1);
        const x = cx + (t - 0.5) * width;
        puff(x, base + 6, rad * 0.8, '190,192,214', 0.07);
        puff(x - 3, base - rad * 0.55, rad, '255,253,244', 0.6);
      }
    }
  }
  const t = texture(c, [1, 1], false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/**
 * Tileable ground detail for the near bank (outside/nearbank.js), painted in light values: the
 * band's vertex colour sets the hue, this adds the texture. One tile covers `tile` metres; the
 * near bank maps it by world x and z.
 */
function tileDraw(S, g) {
  // Draws fn at (x, y) and at its wrapped copies wherever a shape of radius r crosses an edge.
  return (x, y, r, fn) => {
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        if (x + dx + r < 0 || x + dx - r > S || y + dy + r < 0 || y + dy - r > S) continue;
        fn(x + dx, y + dy);
      }
    }
  };
}

function softSpot(g, at) {
  return (x, y, rx, ry, rgbs, a) =>
    at(x, y, Math.max(rx, ry), (X, Y) => {
      g.save();
      g.translate(X, Y);
      g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, `rgba(${rgbs},${a})`);
      gr.addColorStop(0.65, `rgba(${rgbs},${a * 0.55})`);
      gr.addColorStop(1, `rgba(${rgbs},0)`);
      g.fillStyle = gr;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    });
}

function grain(g, S, r, amount) {
  const im = g.getImageData(0, 0, S, S);
  for (let p = 0; p < im.data.length; p += 4) {
    const n = (r() - 0.5) * amount;
    im.data[p] += n;
    im.data[p + 1] += n;
    im.data[p + 2] += n;
  }
  g.putImageData(im, 0, 0);
}

/** River mud: mottled wet and dry patches, trickle and drag marks, clods with a lit top, grit. */
export function paintMud(seed = 31) {
  const r = rng(seed);
  const S = 512;
  const [c, g] = canvas(S, S);
  const at = tileDraw(S, g), soft = softSpot(g, at);
  g.fillStyle = 'rgb(246,240,232)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) soft(r() * S, r() * S, 28 + r() * 70, 18 + r() * 46, r() < 0.6 ? '140,124,108' : '255,252,244', 0.2 + r() * 0.25);
  for (let i = 0; i < 34; i++) soft(r() * S, r() * S, 16 + r() * 40, 8 + r() * 22, '92,80,72', 0.3 + r() * 0.25); // wet hollows
  g.lineCap = 'round';
  for (let i = 0; i < 140; i++) {
    const x = r() * S, y = r() * S, len = 18 + r() * 60, a = (r() - 0.5) * 0.7 + (r() < 0.6 ? 0 : Math.PI / 2);
    const pts = [0, 1, 2, 3].map((k) => [x + Math.cos(a) * len * (k / 3) + (r() - 0.5) * 6, y + Math.sin(a) * len * (k / 3) + (r() - 0.5) * 6]);
    at(x, y, len + 6, (X, Y) => {
      g.strokeStyle = `rgba(88,76,68,${0.3 + r() * 0.35})`;
      g.lineWidth = 1.2 + r() * 2.8;
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px - x + X, py - y + Y) : g.moveTo(px - x + X, py - y + Y)));
      g.stroke();
    });
  }
  for (let i = 0; i < 520; i++) {
    const x = r() * S, y = r() * S, rad = 1.2 + r() * r() * 5.5;
    const dark = 0.3 + r() * 0.35, lit = 0.25 + r() * 0.3;
    at(x, y, rad + 2, (X, Y) => {
      g.fillStyle = `rgba(78,68,62,${dark})`;
      g.beginPath();
      g.ellipse(X, Y + rad * 0.3, rad, rad * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(255,252,246,${lit})`;
      g.beginPath();
      g.ellipse(X - rad * 0.2, Y - rad * 0.25, rad * 0.6, rad * 0.38, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, rad = 0.8 + r() * 1.8;
    at(x, y, rad + 1, (X, Y) => {
      g.fillStyle = 'rgba(250,248,242,0.7)';
      g.strokeStyle = 'rgba(90,84,78,0.35)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(X, Y, rad, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    });
  }
  grain(g, S, r, 18);
  const t = texture(c);
  t.anisotropy = 8;
  return t;
}

/** Turf: short blade strokes in light, dark and straw tones over soft lush and dry patches. */
export function paintTurf(seed = 37) {
  const r = rng(seed);
  const S = 512;
  const [c, g] = canvas(S, S);
  const at = tileDraw(S, g), soft = softSpot(g, at);
  g.fillStyle = 'rgb(238,242,226)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) soft(r() * S, r() * S, 24 + r() * 60, 18 + r() * 44, '120,134,100', 0.2 + r() * 0.22);
  for (let i = 0; i < 26; i++) soft(r() * S, r() * S, 20 + r() * 50, 14 + r() * 36, '255,244,196', 0.14 + r() * 0.16);
  g.lineCap = 'round';
  for (let i = 0; i < 14000; i++) {
    const x = r() * S, y = r() * S, len = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 1.1;
    const k = r();
    const col = k < 0.45 ? `rgba(70,88,58,${0.4 + r() * 0.35})` : k < 0.8 ? `rgba(255,255,238,${0.35 + r() * 0.3})` : `rgba(236,220,150,${0.3 + r() * 0.3})`;
    const lw = 0.9 + r() * 0.8;
    at(x, y, len + 1, (X, Y) => {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(X, Y);
      g.lineTo(X + Math.cos(a) * len, Y + Math.sin(a) * len);
      g.stroke();
    });
  }
  grain(g, S, r, 14);
  const t = texture(c);
  t.anisotropy = 8;
  return t;
}
