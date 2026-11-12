// Painted textures for the interior and the view outside its windows, drawn on canvases at load
// time (no photos). Each one is painted mostly in light values so the material colour and the
// per-part vertex tint still set the hue; the texture adds the brushwork: grain strokes, weave,
// motifs, clouds.

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
  // willReadFrequently keeps the canvas on the CPU. These textures are thousands of small strokes,
  // drawn once and then uploaded: on a GPU-backed canvas every one of them is a GPU command that
  // must finish before the upload (2.1 s for the turf alone under software WebGL), on the CPU the
  // same strokes take 20-100 ms. Measured: research/INTERIOR-NOTES.md, "Performance pass".
  return [c, c.getContext('2d', { willReadFrequently: true })];
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
/** A hex colour as 'r,g,b', for rgba() strings with their own alpha. */
const css = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

/**
 * A pattern value from a theme: a plain number is fixed; a pair [from, by] is random, from `from`
 * up to `from + by`. Only a pair draws a random number, so fixed values keep the sequence.
 */
const vary = (r, v) => (typeof v === 'number' ? v : v[0] + r() * v[1]);

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
 * UVs in metres the texture repeat is (0.5, 2). The pattern (themes/interior.js WOOD.grainMarks)
 * sets how many marks of each kind and how big and strong they are; a pattern with `weathering`
 * also gets the silver streaks and checks of sun-bleached timber, on the greyer paper.
 */
export function paintPlanks(seed = 1, { colours: C, pattern: P }) {
  const r = rng(seed);
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = P.weathering ? C.paperWeathered : C.paper;
  g.fillRect(0, 0, W, H);

  // Watercolour blots: big soft patches of warmer and cooler wood.
  const B = P.blots;
  for (let i = 0; i < B.count; i++) {
    const warm = r() < B.warmShare;
    blot(g, W, r() * W, r() * H, vary(r, B.length), vary(r, B.width), warm ? css(C.blotWarm) : css(C.blotPale), vary(r, B.opacity));
  }

  // Broad soft streaks of lighter and darker wood.
  const S = P.streaks;
  for (let i = 0; i < S.count; i++) {
    const y0 = r() * H;
    const h = vary(r, S.width);
    const a = vary(r, S.opacity);
    const k = 1 + Math.floor(r() * S.waves);
    const ph = r() * Math.PI * 2;
    const amp = vary(r, S.sway);
    g.fillStyle = r() < S.lightShare ? `rgba(${css(C.streakLight)},${a})` : `rgba(${css(C.streakDark)},${a})`;
    g.beginPath();
    for (let x = 0; x <= W; x += 16) g.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 2 * k + ph) * amp);
    for (let x = W; x >= 0; x -= 16) g.lineTo(x, y0 + h + Math.sin((x / W) * Math.PI * 2 * k + ph + 0.6) * amp);
    g.fill();
  }

  // Grain strokes, as if drawn with a fine brush; some sweep around a knot.
  g.lineCap = 'round';
  const L = P.lines;
  const K = P.knots;
  const knots = [];
  for (let i = 0; i < K.count; i++) knots.push([r() * W, 30 + r() * (H - 60), vary(r, K.size)]);
  for (let i = 0; i < L.count; i++) {
    const y0 = r() * H;
    const amp = vary(r, L.sway);
    const k = 1 + Math.floor(r() * L.waves);
    const ph = r() * Math.PI * 2;
    const x0 = r() * W;
    const len = vary(r, L.length);
    g.strokeStyle = `rgba(${css(C.line)},${vary(r, L.opacity)})`;
    g.lineWidth = vary(r, L.width);
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
      g.fillStyle = `rgba(${css(C.knot)},${K.opacity})`;
      g.beginPath();
      g.ellipse(x + dx, y, rx * 0.45, rx * 0.25, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(${css(C.knot)},${K.ringOpacity})`;
      g.lineWidth = K.ringWidth;
      for (let k = 1; k <= K.rings; k++) {
        g.beginPath();
        g.ellipse(x + dx, y, rx * (0.5 + k * 0.45), rx * (0.3 + k * 0.22), 0, 0, Math.PI * 2);
        g.stroke();
      }
    });
  }

  if (P.weathering) {
    // sun-bleached silver streaks and dark checks (short cracks along the grain)
    const { silver: Sv, checks: Ck } = P.weathering;
    for (let i = 0; i < Sv.count; i++) {
      const y = r() * H;
      const x = r() * W;
      g.fillStyle = `rgba(${css(C.silver)},${vary(r, Sv.opacity)})`;
      wrapX(W, (dx) => g.fillRect(x + dx, y, vary(r, Sv.length), vary(r, Sv.width)));
    }
    for (let i = 0; i < Ck.count; i++) {
      const y = r() * H;
      const x = r() * W;
      const len = vary(r, Ck.length);
      g.strokeStyle = `rgba(${css(C.check)},${vary(r, Ck.opacity)})`;
      g.lineWidth = vary(r, Ck.width);
      wrapX(W, (dx) => {
        g.beginPath();
        g.moveTo(x + dx, y);
        g.quadraticCurveTo(x + dx + len / 2, y + (r() - 0.5) * 4, x + dx + len, y + (r() - 0.5) * 3);
        g.stroke();
      });
    }
  }

  // Dry-brush highlights: broken light dashes along the grain.
  const Sh = P.sheen;
  for (let i = 0; i < Sh.count; i++) {
    const y = r() * H;
    let x = r() * W;
    const end = x + Sh.length[0] + r() * Sh.length[1];
    g.fillStyle = `rgba(${css(C.sheen)},${vary(r, Sh.opacity)})`;
    while (x < end) {
      const w = vary(r, Sh.dash);
      wrapX(W, (dx) => g.fillRect(x + dx, y + (r() - 0.5) * 2, w, Sh.thickness));
      x += w + Sh.gap[0] + r() * Sh.gap[1];
    }
  }
  return texture(c, [0.5, 2]);
}

/**
 * Window lattice (alpha): our own pattern, not a copy of a specific house. Diagonal strips cross in
 * a diamond grid, with a ring at every other crossing and a small rosette at the rest. One tile is
 * 0.4 m square, so with UVs in metres the repeat is 2.5. Inked edges, cream face: the material
 * colour sets the wood tone.
 */
export function paintLattice(seed = 11, { colours: C, pattern: P }) {
  const r = rng(seed);
  const S = 512;
  const pitch = 128; // crossing pitch: 10 cm
  const [c, g] = canvas(S, S);
  g.lineCap = 'round';
  const strips = (width, style) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    for (let k = -8; k <= 8; k++) {
      g.beginPath();
      g.moveTo(k * pitch - S, -S);
      g.lineTo(k * pitch + S * 2, S * 2);
      g.moveTo(k * pitch - S, S * 2);
      g.lineTo(k * pitch + S * 2, -S);
      g.stroke();
    }
  };
  const nodes = (fn) => {
    for (let i = -1; i <= S / 64 + 1; i++) for (let j = -1; j <= S / 64 + 1; j++) if ((i + j) % 2 === 0) fn(i * 64, j * 64, (i / 2 + j / 2) % 2 === 0);
  };
  const { back: Bk, front: Fr, hole: Ho, tone: To } = P;
  strips(Bk.strip, C.dark);
  nodes((x, y, ring) => {
    g.fillStyle = C.dark;
    g.beginPath();
    g.arc(x, y, ring ? Bk.ring : Bk.node, 0, Math.PI * 2);
    g.fill();
  });
  strips(Fr.strip, C.light);
  nodes((x, y, ring) => {
    g.fillStyle = C.light;
    g.beginPath();
    g.arc(x, y, ring ? Fr.ring : Fr.node, 0, Math.PI * 2);
    g.fill();
    if (ring) {
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(x, y, Ho.radius, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = C.dark;
      g.lineWidth = Ho.edge;
      g.beginPath();
      g.arc(x, y, Ho.radius, 0, Math.PI * 2);
      g.stroke();
    }
  });
  // brush tone along the strips
  for (let i = 0; i < To.count; i++) {
    g.fillStyle = `rgba(${r() < To.darkShare ? css(C.toneDark) : css(C.toneLight)},${vary(r, To.opacity)})`;
    g.globalCompositeOperation = 'source-atop';
    g.fillRect(r() * S, r() * S, vary(r, To.length), vary(r, To.width));
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
export function paintCurtain(seed = 12, { colours: C, pattern: P }) {
  const r = rng(seed);
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = C.ground;
  g.fillRect(0, 0, S, S);
  // uneven dye
  const D = P.dye;
  for (let i = 0; i < D.count; i++) blot(g, S, r() * S, r() * S, vary(r, D.size), vary(r, D.size), r() < D.darkShare ? css(C.dye[0]) : css(C.dye[1]), vary(r, D.opacity));
  const inks = C.inks;
  const M = P.motifs;
  const cell = M.cell; // large flowing shapes (R2), four or five across the tile
  for (let y = cell / 2; y < S; y += cell) {
    for (let x = cell / 2; x < S; x += cell) {
      g.fillStyle = inks[Math.floor(r() * inks.length)];
      g.globalAlpha = vary(r, M.opacity);
      const row = Math.round(y / cell);
      motif(g, S, x + (r() - 0.5) * cell * 0.4 + (row % 2 ? cell / 2 : 0), y + (r() - 0.5) * cell * 0.3, cell * vary(r, M.main), r);
      // a smaller patch of another colour inside it, and a third beside it
      g.fillStyle = inks[Math.floor(r() * inks.length)];
      motif(g, S, x + (r() - 0.5) * cell * 0.3 + (row % 2 ? cell / 2 : 0), y + (r() - 0.5) * cell * 0.3, cell * vary(r, M.inner), r);
      g.fillStyle = inks[Math.floor(r() * inks.length)];
      motif(g, S, x + cell * 0.5 + (r() - 0.5) * cell * 0.3, y + cell * 0.5 + (r() - 0.5) * cell * 0.3, cell * vary(r, M.beside), r);
    }
  }
  g.globalAlpha = 1;
  // brush streaks down the cloth (folds catch the paint)
  const St = P.streaks;
  for (let i = 0; i < St.count; i++) {
    g.fillStyle = r() < St.darkShare ? `rgba(${css(C.streaks[0])},${vary(r, St.darkOpacity)})` : `rgba(${css(C.streaks[1])},${vary(r, St.lightOpacity)})`;
    g.fillRect(r() * S, 0, vary(r, St.width), S);
  }
  if (P.hem) {
    g.fillStyle = `rgba(${css(C.hem)},${P.hem.opacity})`;
    g.fillRect(0, S - P.hem.fromBottom, S, P.hem.height);
  }
  return texture(c, [2, 2]);
}

/**
 * The red cloth on the embroidery frame, after R2: deep crimson with painted creases and a gold
 * border band. Still plain in the middle (no keringkam motif yet).
 */
export function paintCloth(seed = 13, { colours: C, pattern: P }) {
  const r = rng(seed);
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = C.ground;
  g.fillRect(0, 0, W, H);
  const Bl = P.blots;
  for (let i = 0; i < Bl.count; i++) blot(g, W, r() * W, r() * H, vary(r, Bl.length), vary(r, Bl.width), r() < Bl.darkShare ? css(C.blots[0]) : css(C.blots[1]), vary(r, Bl.opacity));
  // creases: long soft diagonal strokes, dark with a light edge
  const Cr = P.creases;
  for (let i = 0; i < Cr.count; i++) {
    const x = r() * W;
    const y = r() * H;
    const len = vary(r, Cr.length);
    const a = vary(r, Cr.angle);
    for (const [off, col] of [[0, `rgba(${css(C.creases[0])},${vary(r, Cr.darkOpacity)})`], [Cr.edgeOffset, `rgba(${css(C.creases[1])},${vary(r, Cr.edgeOpacity)})`]]) {
      g.strokeStyle = col;
      g.lineWidth = vary(r, Cr.width);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y + off);
      g.quadraticCurveTo(x + (Math.cos(a) * len) / 2, y + off + (Math.sin(a) * len) / 2 + (r() - 0.5) * Cr.bend, x + Math.cos(a) * len, y + off + Math.sin(a) * len);
      g.stroke();
    }
  }
  const Wv = P.weave;
  for (let y = 0; y < H; y += Wv.spacing) {
    g.fillStyle = `rgba(${css(C.weave)},${vary(r, Wv.opacity)})`;
    g.fillRect(0, y, W, Wv.thread);
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
  const Bd = P.band;
  const Rw = Bd.rows;
  for (const x0 of [Bd.inset, W - Bd.inset - Bd.width]) {
    g.fillStyle = `rgba(${css(C.bandShade)},${Bd.shadeOpacity})`; // the band sits on slightly darker cloth
    g.fillRect(x0 - Bd.shadeMargin, 0, Bd.width + 2 * Bd.shadeMargin, H);
    g.fillStyle = C.gold;
    for (const [dx, w] of Bd.rules) g.fillRect(x0 + dx, Bd.ruleMargin, w, H - 2 * Bd.ruleMargin);
    g.fillStyle = C.goldLight;
    for (let y = Rw.from; y < H - Rw.endMargin; y += Rw.every) {
      diamond(x0 + Bd.width / 2, y, Rw.diamond);
      for (const dx of Rw.dots) g.fillRect(x0 + dx, y + Rw.dotDrop, Rw.dot, Rw.dot);
    }
    g.fillStyle = C.ground;
    for (let y = Rw.from; y < H - Rw.endMargin; y += Rw.every) diamond(x0 + Bd.width / 2, y, Rw.hole);
  }
  return texture(c, [1, 1], false);
}

/**
 * Wall hangings atlas, 4 x 2 tiles: woven mats in tan, green and violet checks, and framed pictures
 * with a painted spray of flowers. Each item's face takes one tile by its UVs.
 */
export function paintDecor(seed = 14, { colours: C, pattern: P }) {
  const r = rng(seed);
  const T = 192;
  const [c, g] = canvas(T * 4, T * 2);
  const { weave: Wv, picture: Pc } = P;
  const weave = (x0, y0, [a, b]) => {
    const n = Wv.cells;
    const s = T / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? a : b;
        g.fillRect(x0 + i * s, y0 + j * s, s, s);
        g.fillStyle = `rgba(${css(C.matShadow)},${Wv.shadowOpacity})`;
        g.fillRect(x0 + i * s, y0 + j * s + ((i + j) % 2 ? 0 : s - Wv.shadow), s, Wv.shadow);
      }
    g.strokeStyle = C.matEdge;
    g.lineWidth = Wv.edge;
    g.strokeRect(x0 + Wv.edge / 2, y0 + Wv.edge / 2, T - Wv.edge, T - Wv.edge);
  };
  const picture = (x0, y0, { ground, flower }) => {
    g.fillStyle = C.frame;
    g.fillRect(x0, y0, T, T);
    g.fillStyle = ground;
    g.fillRect(x0 + Pc.frame, y0 + Pc.frame, T - 2 * Pc.frame, T - 2 * Pc.frame);
    g.strokeStyle = C.stem;
    g.lineWidth = Pc.stemWidth;
    for (let k = 0; k < Pc.stems; k++) {
      g.beginPath();
      g.moveTo(x0 + T / 2, y0 + T - 30);
      g.quadraticCurveTo(x0 + T / 2 + (r() - 0.5) * 60, y0 + T / 2, x0 + 40 + r() * (T - 80), y0 + 40 + r() * 50);
      g.stroke();
      g.fillStyle = flower;
      g.beginPath();
      g.arc(x0 + 40 + r() * (T - 80), y0 + 40 + r() * 60, vary(r, Pc.flower), 0, Math.PI * 2);
      g.fill();
    }
  };
  const [m, p] = [C.mats, C.pictures];
  weave(0, 0, m[0]);
  weave(T, 0, m[1]);
  picture(T * 2, 0, p[0]);
  weave(T * 3, 0, m[2]);
  picture(0, T, p[1]);
  weave(T, T, m[3]);
  picture(T * 2, T, p[2]);
  weave(T * 3, T, m[4]);
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

/**
 * A soft watercolour sky for the window view (R2): pale blue wash fading to the haze colour at
 * the horizon, with a few soft cumulus (white tops, faint lilac bases). Equirectangular: the
 * upper half of the canvas is the sky, the lower half takes the haze colour.
 */
export function paintSoftSky(seed = 25, { colours: C, pattern: P, haze }) {
  const r = rng(seed);
  const W = 2048;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  // vivid (R3): a strong, clear blue that holds almost to the horizon. It is painted more
  // saturated than it should look: the room's grade takes about a third of the colour out again.
  for (const [at, colour] of C.gradient) sky.addColorStop(at, colour);
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
  if (P.banks) {
    // R3: wide cumulus banks rather than single puffs. Each bank has a flat, shaded base and a
    // lumpy top built from many small lobes; a few small clouds sit low near the horizon.
    const { banks: Bk, low: Lw, lobes: Lb, base: Ba, shade: Sd, lit: Lt } = P;
    const banks = [];
    for (let n = 0; n < Bk.count; n++) banks.push({ cx: ((n + r() * Bk.scatter) / Bk.count) * W, base: H / 2 - Bk.height[0] - r() * Bk.height[1], width: vary(r, Bk.width), tall: vary(r, Bk.tall) });
    for (let n = 0; n < Lw.count; n++) banks.push({ cx: r() * W, base: H / 2 - Lw.height[0] - r() * Lw.height[1], width: vary(r, Lw.width), tall: vary(r, Lw.tall) });
    for (const b of banks) {
      const lobes = [];
      const count = Math.round(b.width / Lb.spacing);
      for (let i = 0; i < count; i++) {
        const t = r();
        const hump = Math.sin(Math.PI * t) ** 0.7; // fuller in the middle of the bank
        const rad = vary(r, Lb.size) * (0.5 + hump) * (b.width / 380);
        const lift = hump * b.width * b.tall * vary(r, Lb.lift); // how high this lobe stands
        lobes.push([b.cx + (t - 0.5) * b.width, b.base - lift, Math.max(Lb.minSize, rad), lift]);
      }
      // the base: a long, flat shaded band, cool grey (the shade side of a cumulus)
      for (let x = -0.5; x <= 0.5; x += 0.06) {
        const hump = Math.cos(Math.PI * x);
        puff(b.cx + x * b.width * 0.95, b.base + 2, 8 + hump * b.width * 0.05, css(C.cloudBase), Ba.opacity, Ba.core);
      }
      // body: each lobe as a warm grey shade, then a lit cap offset up and to the light (left)
      for (const [x, y, rad] of lobes) puff(x + rad * 0.15, y + rad * 0.3, rad * 1.08, css(C.cloudShade), Sd.opacity, Sd.core);
      for (const [x, y, rad, lift] of lobes) if (lift > b.width * b.tall * Lt.minLift) puff(x - rad * 0.2, y - rad * 0.2, rad, css(C.cloudLit), Lt.opacity, Lt.core);
    }
  } else {
    const { clouds: Cl, base: Ba, lit: Lt } = P;
    const count = Cl.count;
    for (let n = 0; n < count; n++) {
      const cx = ((n + r()) / count) * W; // spread round the sky, so blue shows between them
      const base = H / 2 - Cl.height[0] - r() * Cl.height[1]; // between about 6 and 33 degrees up
      const width = vary(r, Cl.width);
      for (let i = 0; i < Cl.puffs; i++) {
        const t = r();
        const rad = 12 + Math.sin(Math.PI * t) * width * vary(r, Cl.size);
        const x = cx + (t - 0.5) * width;
        puff(x, base + 6, rad * 0.8, css(C.cloudBase), Ba.opacity);
        puff(x - 3, base - rad * 0.55, rad, css(C.cloudLit), Lt.opacity);
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
export function paintMud(seed = 31, { colours: C, pattern: P }) {
  const r = rng(seed);
  const S = 512;
  const [c, g] = canvas(S, S);
  const at = tileDraw(S, g), soft = softSpot(g, at);
  g.fillStyle = C.ground;
  g.fillRect(0, 0, S, S);
  const { patches: Pa, hollows: Ho, trickles: Tr, clods: Cd, grit: Gr } = P;
  for (let i = 0; i < Pa.count; i++) soft(r() * S, r() * S, vary(r, Pa.length), vary(r, Pa.width), r() < Pa.darkShare ? css(C.patches[0]) : css(C.patches[1]), vary(r, Pa.opacity));
  for (let i = 0; i < Ho.count; i++) soft(r() * S, r() * S, vary(r, Ho.length), vary(r, Ho.width), css(C.hollow), vary(r, Ho.opacity)); // wet hollows
  g.lineCap = 'round';
  for (let i = 0; i < Tr.count; i++) {
    const x = r() * S, y = r() * S, len = vary(r, Tr.length), a = (r() - 0.5) * Tr.tilt + (r() < Tr.alongShare ? 0 : Math.PI / 2);
    const pts = [0, 1, 2, 3].map((k) => [x + Math.cos(a) * len * (k / 3) + (r() - 0.5) * Tr.wobble, y + Math.sin(a) * len * (k / 3) + (r() - 0.5) * Tr.wobble]);
    at(x, y, len + Tr.wobble, (X, Y) => {
      g.strokeStyle = `rgba(${css(C.trickle)},${vary(r, Tr.opacity)})`;
      g.lineWidth = vary(r, Tr.width);
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px - x + X, py - y + Y) : g.moveTo(px - x + X, py - y + Y)));
      g.stroke();
    });
  }
  for (let i = 0; i < Cd.count; i++) {
    const x = r() * S, y = r() * S, rad = Cd.size[0] + r() * r() * Cd.size[1]; // mostly small: r * r
    const dark = vary(r, Cd.shadeOpacity), lit = vary(r, Cd.litOpacity);
    at(x, y, rad + 2, (X, Y) => {
      g.fillStyle = `rgba(${css(C.clod[0])},${dark})`;
      g.beginPath();
      g.ellipse(X, Y + rad * 0.3, rad, rad * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(${css(C.clod[1])},${lit})`;
      g.beginPath();
      g.ellipse(X - rad * 0.2, Y - rad * 0.25, rad * 0.6, rad * 0.38, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  for (let i = 0; i < Gr.count; i++) {
    const x = r() * S, y = r() * S, rad = vary(r, Gr.size);
    at(x, y, rad + 1, (X, Y) => {
      g.fillStyle = `rgba(${css(C.grit[0])},${Gr.opacity})`;
      g.strokeStyle = `rgba(${css(C.grit[1])},${Gr.outlineOpacity})`;
      g.lineWidth = Gr.outline;
      g.beginPath();
      g.arc(X, Y, rad, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    });
  }
  grain(g, S, r, P.noise);
  const t = texture(c);
  t.anisotropy = 8;
  return t;
}

/** Turf: short blade strokes in light, dark and straw tones over soft lush and dry patches. */
export function paintTurf(seed = 37, { colours: C, pattern: P }) {
  const r = rng(seed);
  const S = 512;
  const [c, g] = canvas(S, S);
  const at = tileDraw(S, g), soft = softSpot(g, at);
  g.fillStyle = C.ground;
  g.fillRect(0, 0, S, S);
  const { lush: Lu, dry: Dr, blades: Bl } = P;
  for (let i = 0; i < Lu.count; i++) soft(r() * S, r() * S, vary(r, Lu.length), vary(r, Lu.width), css(C.lush), vary(r, Lu.opacity));
  for (let i = 0; i < Dr.count; i++) soft(r() * S, r() * S, vary(r, Dr.length), vary(r, Dr.width), css(C.dry), vary(r, Dr.opacity));
  g.lineCap = 'round';
  for (let i = 0; i < Bl.count; i++) {
    const x = r() * S, y = r() * S, len = vary(r, Bl.length), a = -Math.PI / 2 + (r() - 0.5) * Bl.lean;
    const k = r();
    const [dark, light, straw] = Bl.opacity;
    const col = k < Bl.split[0] ? `rgba(${css(C.blades[0])},${vary(r, dark)})` : k < Bl.split[1] ? `rgba(${css(C.blades[1])},${vary(r, light)})` : `rgba(${css(C.blades[2])},${vary(r, straw)})`;
    const lw = vary(r, Bl.width);
    at(x, y, len + 1, (X, Y) => {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(X, Y);
      g.lineTo(X + Math.cos(a) * len, Y + Math.sin(a) * len);
      g.stroke();
    });
  }
  grain(g, S, r, P.noise);
  const t = texture(c);
  t.anisotropy = 8;
  return t;
}
