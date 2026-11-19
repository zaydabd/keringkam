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

// How many canvas pixels each painted pixel gets (setPaintDetail). The strokes are the same: only
// the canvas is finer, so a texture seen close on a 2x screen is not magnified into blur.
let detail = 1;
/** Paints the next textures at k times the resolution (1 as designed); returns the previous k. */
export function setPaintDetail(k) {
  const was = detail;
  detail = k;
  return was;
}

function canvas(w, h) {
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
 * Brush dabs: short tapered strokes laid side by side over a tile, each a little lighter or darker
 * than the paint under it, so the surface reads as painted stroke by stroke. They are painted on
 * the surface's own texture, so they stay inside each object and move with it. Drawn wrapped
 * across every edge of the tile. D (a theme's `dabs` marks): count, length and width (px), opacity,
 * angle (rad, 0 = along the tile's x), turn (rad, how far each one turns from it), darkShare.
 * colours: [dark, light] (hex).
 */
function brushDabs(g, W, H, r, D, [dark, light]) {
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
  if (P.dabs) brushDabs(g, W, H, r, P.dabs, [C.streakDark, C.streakLight]);
  return texture(c, [0.5, 2]);
}

/** Carved lattice textures are drawn at this many pixels per metre (strap widths in the theme). */
const CARVING_PX_PER_M = 1280;

/**
 * The pierced carving in the chair and settee backs (alpha): our own pattern, not a copy of a
 * specific chair. Diagonal strips cross in a diamond grid, with a ring at every other crossing and
 * a small rosette at the rest. One tile is 0.4 m square, so with UVs in metres the repeat is 2.5.
 * Inked edges, light face: the material colour sets the wood tone.
 */
export function paintCarving(seed = 17, { colours: C, pattern: P }) {
  const r = rng(seed);
  const S = 512;
  const pitch = 0.1 * CARVING_PX_PER_M; // crossing pitch: 10 cm
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
 * The window lattice, after the user's photo W1 (research/INTERIOR-NOTES.md; not in the repo):
 * a plaited band at the top and the bottom, between rails, and an interlaced field of diamonds,
 * paired scroll rings and vase-shaped straps between them. The design is simplified, not traced.
 * One tile is one motif `unit` wide (metres, wraps left to right) and the whole panel `height`
 * tall (no vertical repeat), so the bands and the rings keep their size whatever the window.
 * Sizes in metres (the tile, its rails and bands) come from LATTICE_TILE (interior/lattice.js);
 * strap widths, the red-brown fade and the tone from the theme.
 */
export function paintWindowLattice(seed, { colours: C, pattern: P }, { unit, height, rail, band }) {
  const r = rng(seed);
  const k = CARVING_PX_PER_M;
  const W = Math.round(unit * k);
  const H = Math.round(height * k);
  const [c, g] = canvas(W, H);
  g.lineCap = g.lineJoin = 'round';
  const X = (x) => x * k; // metres from the tile's left edge
  const Y = (y) => (height - y) * k; // metres up from the panel's bottom
  const f0 = 2 * rail + band; // the field: between the bands
  const F = (height - 2 * f0) / 2; // half the field's height
  const ym = height / 2;
  const U = unit;

  // Every strap as a polyline [[x, y], ...] or a ring {x, y, r}, in metres. The field is mirrored
  // top to bottom about ym, the motif left to right about its centre (a vase at 0, rings at U/2).
  const lines = [];
  const rings = [];
  for (const bot of [rail / 2, height - rail / 2]) lines.push([[-U, bot], [2 * U, bot]]); // outer rails
  for (const y of [f0 - rail / 2, height - f0 + rail / 2]) lines.push([[-U, y], [2 * U, y]]); // inner rails
  // The plait: two zigzag strands in opposite phase; "\" strokes are drawn last, so each strand
  // goes over, then under, along its length.
  const p = U / 4; // W1: the weave crosses about twice per quarter motif
  const plait = { up: [], down: [] };
  for (const [y0, y1] of [[rail, rail + band], [height - f0 + rail, height - rail]]) {
    for (let x = -U; x < 2 * U; x += p) {
      plait.up.push([[x, y0], [x + p / 2, y1]], [[x + p / 2, y0], [x + p, y1]]);
      plait.down.push([[x, y1], [x + p / 2, y0]], [[x + p / 2, y1], [x + p, y0]]);
    }
  }
  // W1's motif: a vase (diamond waist, straight sides, a neck ending in two scroll rings by the
  // band) per unit, and between two vases a touching pair of rings with straps that step out to
  // the rails. Spaced for W1's thick straps (P.face, about 8% of a motif): every hole stays open.
  const R = 0.075 * U; // scroll ring radius (centre line)
  for (const cx of [0, U]) {
    const bx = cx + U / 2; // the boundary to the next unit
    for (const s of [1, -1]) {
      const y = (v) => ym + s * v * F; // v: 0 at the field's middle, 1 at its edge
      // the vase, half by half: waist diamond, side, shoulder, neck into a ring, ring up to the rail
      lines.push([[cx - 0.15 * U, ym], [cx, y(0.22)], [cx + 0.15 * U, ym]]);
      for (const t of [1, -1]) {
        const x = (a) => cx + t * a * U;
        lines.push([[cx, y(0.22)], [x(0.22), y(0.4)], [x(0.22), y(0.6)], [x(0.075), y(0.72)], [x(0.075), y(0.84) - s * R]]);
        rings.push({ x: x(0.075), y: y(0.84), r: R });
        lines.push([[x(0.075), y(0.84) + s * R], [x(0.075), y(1.02)]]);
      }
      // between vases: from each ring of the pair, up, stepping out under the band
      for (const t of [1, -1]) {
        const x = (a) => bx + t * a * U;
        lines.push([[x(0.075), ym + s * R], [x(0.075), y(0.45)], [x(0.17), y(0.65)], [x(0.17), y(1.02)]]);
      }
    }
    // the waist line through the diamond to the paired rings between vases
    lines.push([[cx - U / 2 + 0.075 * U + R, ym], [cx - 0.15 * U, ym]], [[cx + 0.15 * U, ym], [bx - 0.075 * U - R, ym]]);
    for (const t of [1, -1]) rings.push({ x: bx + t * 0.075 * U, y: ym, r: R }, { x: cx - U / 2 + t * 0.075 * U, y: ym, r: R }); // a touching pair
  }

  const stroke = (width, style, list) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    wrapX(W, (dx) => {
      for (const l of list) {
        g.beginPath();
        l.forEach(([x, y], i) => (i ? g.lineTo(X(x) + dx, Y(y)) : g.moveTo(X(x) + dx, Y(y))));
        g.stroke();
      }
    });
  };
  const loops = (width, style) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    wrapX(W, (dx) => {
      for (const o of rings) {
        g.beginPath();
        g.arc(X(o.x) + dx, Y(o.y), o.r * k, 0, Math.PI * 2);
        g.stroke();
      }
    });
  };
  const { face, edge, plait: Pl, fade: Fd, tone: To } = P;
  // Dark carving behind, the strap's face on top: the field and rails, then each half of the plait.
  stroke(edge, C.dark, lines);
  loops(edge, C.dark);
  stroke(face, C.light, lines);
  loops(face, C.light);
  for (const half of [plait.up, plait.down]) {
    stroke(Pl.edge, C.dark, half);
    stroke(Pl.face, C.light, half);
  }
  // The room's wood (the material colour), faded in soft patches to W1's red-brown; painted only
  // where there is wood (source-atop), so the holes stay clear.
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < Fd.count; i++) {
    const rx = vary(r, Fd.radius);
    blot(g, W, r() * W, r() * H, rx, rx * (0.6 + r() * 0.8), css(C.fade), vary(r, Fd.opacity));
  }
  // brush tone along the straps: the theme's count is per 512 px square, as on paintCarving's tile
  for (let i = 0; i < To.count * ((W * H) / (512 * 512)); i++) {
    g.fillStyle = `rgba(${r() < To.darkShare ? css(C.toneDark) : css(C.toneLight)},${vary(r, To.opacity)})`;
    g.fillRect(r() * W, r() * H, vary(r, To.length), vary(r, To.width));
  }
  g.globalCompositeOperation = 'source-over';
  const t = texture(c);
  t.wrapT = THREE.ClampToEdgeWrapping; // one panel tall
  return t;
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
  if (P.dabs) brushDabs(g, S, S, r, P.dabs, C.streaks);
  if (P.hem) {
    g.fillStyle = `rgba(${css(C.hem)},${P.hem.opacity})`;
    g.fillRect(0, S - P.hem.fromBottom, S, P.hem.height);
  }
  return texture(c, [2, 2]);
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

/**
 * Soft light (alpha in the red channel is not used: colour and alpha together), for glows and floor
 * sheen. 'round' is a soft spot; 'contact' keeps a solid middle and fades only in its outer half
 * (the dark spot right round a foot).
 */
export function paintGlow(kind = 'round') {
  const S = 128;
  const [c, g] = canvas(S, S);
  if (kind === 'round' || kind === 'contact') {
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    if (kind === 'contact') grad.addColorStop(0.35, 'rgba(255,255,255,0.95)');
    grad.addColorStop(kind === 'contact' ? 0.6 : 0.45, 'rgba(255,255,255,0.45)');
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
  const im = g.getImageData(0, 0, g.canvas.width, g.canvas.height); // every canvas pixel (setPaintDetail)
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

/**
 * The trodden mud of the near bank (outside/nearbank.js `trample`): one map over the stretch the
 * window sees, mapped by distance along the river (s, across) and offset inland (o, down), so it
 * never repeats. Returns { map, bump }:
 *   - map: what the mud's colour is multiplied by, painted as `v = 127.5 * target / base` per
 *     channel (sRGB), so 127.5 changes nothing and the shader takes (2 v)^2.2: wet mud near the
 *     water and in the hollows, prints with dark wet soles and pale rims, churned smears, glints,
 *     standing water;
 *   - bump: red is the height (128 flat) of the prints, rims, smears and the dragged hull; green
 *     is where water stands (the shader drops the tiled mud texture there).
 * Both fade to neutral at their edges, so the clamped edge is neutral for everything outside.
 */
export function paintTrample(seed = 41, { colours: C, pattern: P }, trample) {
  const r = rng(seed);
  const [s0, s1] = trample.s, [o0, o1] = trample.o;
  const W = Math.min(P.maxWidth, Math.ceil((s1 - s0) * P.pxPerM));
  const H = Math.ceil((o1 - o0) * P.pxPerM);
  const [cMap, g] = canvas(W, H);
  const [cBump, b] = canvas(W, H);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const base = hex(C.base);
  /** The multiplier that turns the mud into `target`, as canvas values. */
  const ratio = (target) => hex(target).map((v, k) => Math.min(255, (127.5 * v) / base[k]));
  const wet = ratio(C.wet), soaked = ratio(C.soaked), rim = ratio(C.rim), water = ratio(C.water), glint = ratio(C.glint);
  const churn = C.churn.map(ratio);
  const rgba = (v, a) => `rgba(${v.map(Math.round).join(',')},${a})`;
  const fade = (s, o) => {
    const t = (v, a, c) => Math.min(1, Math.max(0, (v - a) / c));
    return t(s, s0, 1.5) * t(s1, s, 1.5) * t(o, o0, 0.3) * t(o1, o, 0.3);
  };

  // The field: wet mud, soaked mud at the water, standing water; worked out on a coarse grid and
  // drawn smoothed onto the full map.
  const F = P.field, w = Math.ceil(W / F) + 1, h = Math.ceil(H / F) + 1;
  const cField = document.createElement('canvas');
  cField.width = w;
  cField.height = h;
  const cWater = document.createElement('canvas');
  cWater.width = w;
  cWater.height = h;
  const field = cField.getContext('2d', { willReadFrequently: true }).createImageData(w, h);
  const still = cWater.getContext('2d', { willReadFrequently: true }).createImageData(w, h);
  const M = P.mottle;
  const mottleAt = (s, o) => Math.sin(s / M.size + Math.sin(o * 1.7 / M.size) * 1.3) * Math.cos(o / (M.size * 0.7) + Math.sin(s * 0.9 / M.size));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const s = s0 + ((i * F) / W) * (s1 - s0), o = o0 + ((j * F) / H) * (o1 - o0);
      const q = trample.sample(s, o), f = fade(s, o), p = (j * w + i) * 4;
      let v = [127.5, 127.5, 127.5], st = 0;
      if (q.mud) {
        const k = Math.min(1, Math.max(0, q.wet * P.wetness + M.amount * mottleAt(s, o)));
        v = v.map((c, n) => c + (wet[n] - c) * k);
        const sk = Math.min(1, Math.max(0, 1 - o / P.soak)) * q.wet;
        v = v.map((c, n) => c + (soaked[n] - c) * sk);
        if (q.water) {
          v = water;
          st = 1;
        }
      }
      for (let n = 0; n < 3; n++) field.data[p + n] = 127.5 + (v[n] - 127.5) * f;
      field.data[p + 3] = 255;
      still.data[p] = 128;
      still.data[p + 1] = 255 * st * f;
      still.data[p + 2] = 128;
      still.data[p + 3] = 255;
    }
  }
  cField.getContext('2d').putImageData(field, 0, 0);
  cWater.getContext('2d').putImageData(still, 0, 0);
  for (const [gg, src] of [[g, cField], [b, cWater]]) {
    gg.imageSmoothingEnabled = true;
    gg.imageSmoothingQuality = 'high';
    gg.drawImage(src, 0, 0, w - 1, h - 1, 0, 0, W, H);
  }

  // From here on everything is drawn in metres: x along the river (s), y inland (o).
  for (const gg of [g, b]) {
    gg.save();
    gg.scale(W / (s1 - s0), H / (o1 - o0));
    gg.translate(-s0, -o0);
  }
  const height = (d) => rgba([128 + d, 0, 128], 1); // red is the height; no standing water
  const heightA = (d, a) => rgba([128 + d, 0, 128], a);

  // Churned smears where people and boats come and go: the worn way, the ruts, the landing.
  const Ch = P.churn;
  for (let k = 0, tries = 0; k < Ch.count && tries < Ch.count * 20; tries++) {
    const s = s0 + r() * (s1 - s0), o = o0 + r() * (o1 - o0);
    const q = trample.sample(s, o);
    if (!q.mud || fade(s, o) < 0.5 || r() > Math.max(q.path, q.rut * 0.7, 0.08)) continue;
    k++;
    const rx = vary(r, Ch.size), ry = rx * (0.35 + r() * 0.4), a = r() * Math.PI, dark = r() < 0.6;
    const op = vary(r, Ch.opacity);
    g.fillStyle = rgba(dark ? churn[0] : churn[1], op);
    b.fillStyle = heightA(dark ? -Ch.bump : Ch.bump, op * 2);
    for (const gg of [g, b]) {
      gg.beginPath();
      gg.ellipse(s, o, rx, ry, a, 0, Math.PI * 2);
      gg.fill();
    }
  }

  // A hull dragged up from the water: a smooth trough with lengthwise ridges.
  const Dg = P.drag, [ds0, do0] = trample.drag.from, [ds1, do1] = trample.drag.to;
  const dAng = Math.atan2(do1 - do0, ds1 - ds0), dLen = Math.hypot(ds1 - ds0, do1 - do0), dW = trample.drag.width;
  for (const gg of [g, b]) {
    gg.save();
    gg.translate(ds0, do0);
    gg.rotate(dAng);
  }
  const grad = b.createLinearGradient(0, -dW / 2, 0, dW / 2);
  grad.addColorStop(0, height(0));
  grad.addColorStop(0.15, height(18));
  grad.addColorStop(0.3, height(-Dg.bump));
  grad.addColorStop(0.7, height(-Dg.bump));
  grad.addColorStop(0.85, height(18));
  grad.addColorStop(1, height(0));
  b.fillStyle = grad;
  b.fillRect(0, -dW / 2, dLen, dW);
  g.fillStyle = rgba(wet, Dg.opacity);
  g.fillRect(0, -dW * 0.35, dLen, dW * 0.7);
  b.lineWidth = 0.012;
  for (let k = 0; k < Dg.ridges; k++) {
    const y = (k / (Dg.ridges - 1) - 0.5) * dW * 0.6 + (r() - 0.5) * 0.02;
    b.strokeStyle = heightA(r() < 0.5 ? 14 : -14, 0.8);
    b.beginPath();
    b.moveTo(r() * 0.2, y);
    b.lineTo(dLen - r() * 0.3, y + (r() - 0.5) * 0.04);
    b.stroke();
  }
  for (const gg of [g, b]) gg.restore();

  // Footprints. A sole is drawn in its own frame: x forward (toe), y to the side, in metres.
  const Pr = P.prints;
  const sole = (gg, kind, grow = 0) => {
    const S = Pr[kind];
    gg.beginPath();
    if (kind === 'boot') {
      gg.ellipse(S.length * 0.2, 0, S.length * 0.31 + grow, S.width / 2 + grow, 0, 0, Math.PI * 2); // forefoot
      gg.moveTo(-S.length * 0.25 + S.heel / 2 + grow, 0);
      gg.ellipse(-S.length * 0.25, 0, S.heel / 2 + grow, S.width * 0.42 + grow, 0, 0, Math.PI * 2); // heel
      gg.rect(-S.length * 0.25, -S.width * 0.3 - grow, S.length * 0.4, S.width * 0.6 + grow * 2); // waist
    } else {
      gg.ellipse(S.length * 0.12, 0.006, S.length * 0.3 + grow, S.width / 2 + grow, 0.05, 0, Math.PI * 2);
      gg.moveTo(-S.length * 0.26 + S.width * 0.38 + grow, 0);
      gg.ellipse(-S.length * 0.26, 0, S.width * 0.38 + grow, S.width * 0.36 + grow, 0, 0, Math.PI * 2);
    }
  };
  const toes = (gg, S, foot) => {
    for (let t = 0; t < 5; t++) {
      const y = (t / 4 - 0.5) * S.width * 0.85 * -foot, x = S.length * (0.44 - Math.abs(t / 4 - 0.15) * 0.1);
      gg.beginPath();
      gg.arc(x, y, (t === 0 ? 0.016 : 0.01), 0, Math.PI * 2);
      gg.fill();
    }
  };
  for (const f of trample.prints) {
    const S = Pr[f.kind], k = f.old ? Pr.old : 1; // old prints are half filled in
    for (const gg of [g, b]) {
      gg.save();
      gg.translate(f.s, f.o);
      gg.rotate(f.a);
      gg.scale(f.size, f.size * f.foot);
    }
    // the pale rim, squeezed up round the sole; then the sole pressed in, wet and dark
    g.fillStyle = rgba(rim, k * Pr.rim * (0.6 + r() * 0.4));
    sole(g, f.kind, 0.018);
    g.fill();
    b.fillStyle = height(k * Pr.lift * (0.6 + r() * 0.4));
    sole(b, f.kind, 0.02);
    b.fill();
    const fill = f.water ? water : soaked.map((c, n) => 127.5 + (c - 127.5) * (Pr.depth + r() * 0.25));
    g.fillStyle = rgba(fill, f.water ? 0.95 : k * 0.95);
    sole(g, f.kind);
    g.fill();
    b.fillStyle = height(-k * Pr.sink * (0.75 + r() * 0.25));
    sole(b, f.kind);
    b.fill();
    if (f.water) {
      b.fillStyle = 'rgba(0,255,0,0.9)'; // green only matters here: water stands in this print
      b.globalCompositeOperation = 'lighter';
      sole(b, f.kind, -0.008);
      b.fill();
      b.globalCompositeOperation = 'source-over';
    }
    if (f.kind === 'boot') {
      // the tread: bars across the sole, pressed a little less deep
      b.strokeStyle = heightA(-k * Pr.sink * 0.55, 0.9);
      b.lineWidth = 0.009;
      for (let x = -S.length * 0.38; x < S.length * 0.45; x += 0.024) {
        b.beginPath();
        b.moveTo(x, -S.width * 0.4);
        b.lineTo(x + 0.006, S.width * 0.4);
        b.stroke();
      }
    } else {
      g.fillStyle = rgba(f.water ? water : soaked, k * 0.9);
      toes(g, S, 1);
      b.fillStyle = height(-k * Pr.sink);
      toes(b, S, 1);
    }
    for (const gg of [g, b]) gg.restore();
  }

  // Wet glints on the wet mud.
  const Gl = P.glints;
  for (let k = 0, tries = 0; k < Gl.count && tries < Gl.count * 10; tries++) {
    const s = s0 + r() * (s1 - s0), o = o0 + r() * (o1 - o0);
    const q = trample.sample(s, o);
    if (!q.mud || fade(s, o) < 0.7 || r() > q.wet) continue;
    k++;
    const rad = vary(r, Gl.size);
    g.fillStyle = rgba(glint, vary(r, Gl.opacity));
    g.beginPath();
    g.ellipse(s, o, rad * 1.8, rad, 0, 0, Math.PI * 2);
    g.fill();
  }
  for (const gg of [g, b]) gg.restore();
  grain(g, W, r, P.grain);
  // A neutral border: outside the map the shader reads the clamped edge.
  g.strokeStyle = 'rgb(128,128,128)';
  g.lineWidth = 4;
  g.strokeRect(0, 0, W, H);

  const map = texture(cMap, [1, 1], false);
  map.colorSpace = THREE.NoColorSpace; // the shader decodes it: (2 v)^2.2
  map.flipY = false; // row 0 is the waterline end (o0), as the bank's second map channel has it
  map.anisotropy = 8;
  const bump = texture(cBump, [1, 1], false);
  bump.colorSpace = THREE.NoColorSpace;
  bump.flipY = false;
  bump.anisotropy = 8;
  bump.channel = 1; // the near bank's second map channel: (s, o); the shader reads `map` there too
  return { map, bump, size: [W, H] };
}

/**
 * The leaf atlas (outside/leaves.js LEAF_ATLAS): 2 x 2 cells of `pattern.cell` px, one cut-out in
 * each, its base at the bottom middle: a sprig of small leaves, a sprig of larger drooping ones,
 * one broad leaf, a fern frond with lobed leaflets. Light greys with a dark edge line (the leaves
 * get no ink from the ink pass); the plant's vertex colour sets the green. Transparent around.
 */
export function paintLeaves(seed = 43, { colours: C, pattern: P }) {
  const r = rng(seed);
  const S = P.cell;
  const [c, g] = canvas(S * 2, S * 2);
  g.clearRect(0, 0, S * 2, S * 2);
  g.lineCap = g.lineJoin = 'round';
  const tone = () => (r() < 0.5 ? C.fill : C.fillDark);
  // A leaf: base at (x, y), pointing along angle a (0 = up the cell), length L, width W.
  const outline = (L, W) => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(W * 0.62, -L * 0.15, W * 0.55, -L * 0.7, 0, -L);
    g.bezierCurveTo(-W * 0.55, -L * 0.7, -W * 0.62, -L * 0.15, 0, 0);
  };
  const leaf = (x, y, a, L, W, veins = 3) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    outline(L, W);
    g.fillStyle = tone();
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = C.shade; // one half of the blade turned from the light
    g.globalAlpha = P.shade;
    g.fillRect(0, -L, W, L);
    g.globalAlpha = 1;
    g.strokeStyle = C.vein;
    g.lineWidth = Math.max(1.2, L * P.vein);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -L * 0.9);
    for (let k = 1; k <= veins; k++) {
      const y0 = (-L * k) / (veins + 1.2);
      for (const s of [-1, 1]) {
        g.moveTo(0, y0);
        g.lineTo(s * W * 0.34, y0 - L * 0.12);
      }
    }
    g.lineWidth = Math.max(0.8, L * P.vein * 0.5);
    g.stroke();
    g.restore(); // the veins stay inside the blade
    outline(L, W);
    g.strokeStyle = C.edge;
    g.lineWidth = P.edge;
    g.stroke();
    g.restore();
  };
  const stem = (pts, w0, w1) => {
    g.strokeStyle = C.stem;
    for (let i = 0; i < pts.length - 1; i++) {
      g.lineWidth = w0 + ((w1 - w0) * i) / (pts.length - 1);
      g.beginPath();
      g.moveTo(...pts[i]);
      g.lineTo(...pts[i + 1]);
      g.stroke();
    }
  };
  const inCell = (index, fn) => {
    g.save();
    g.translate((index % 2) * S, Math.floor(index / 2) * S);
    fn();
    g.restore();
  };
  // A sprig: a bent stem with leaves on alternate sides and one at its tip.
  const sprig = ({ top, count, length, width, spread, droop }) => {
    const bend = (r() - 0.5) * S * 0.12;
    const at = (t) => {
      const u = 1 - t; // quadratic: base, control, tip
      return [u * u * S * 0.5 + 2 * u * t * (S * 0.5 - bend * 0.6) + t * t * (S * 0.5 + bend), u * u * S * 0.97 + 2 * u * t * S * (0.97 + top) / 2 + t * t * S * top];
    };
    const pts = Array.from({ length: 13 }, (_, i) => at(i / 12));
    stem(pts, S * 0.014, S * 0.005);
    for (let k = 0; k < count; k++) {
      const t = 0.18 + (0.8 * k) / count;
      const [x, y] = at(t), [x2, y2] = at(Math.min(1, t + 0.02));
      const dir = Math.atan2(x2 - x, -(y2 - y)); // the stem's own angle from up
      const side = k % 2 ? 1 : -1;
      const L = S * vary(r, length) * (1 - 0.25 * t);
      leaf(x, y, dir + side * (vary(r, spread) + droop * (1 - t)), L, L * vary(r, width));
    }
    const [x, y] = at(1), [x0, y0] = at(0.96);
    const L = S * length[0] * 1.05;
    const tipL = Math.min(L, y - S * 0.02);
    leaf(x, y, Math.atan2(x - x0, -(y - y0)), tipL, tipL * width[0]);
  };
  inCell(0, () => sprig(P.sprig));
  inCell(1, () => sprig(P.sprigBig));
  inCell(2, () => {
    stem([[S * 0.5, S * 0.98], [S * 0.5, S * 0.9]], S * 0.016, S * 0.012);
    leaf(S * 0.5, S * 0.9, (r() - 0.5) * 0.08, S * 0.86, S * P.broad.width, P.broad.veins);
  });
  inCell(3, () => {
    // A frond: a spine with paired leaflets (pinnae), longest about a third of the way up, each a
    // row of rounded lobes shrinking to its tip, narrower than the gap to the next pair.
    const F = P.frond;
    const gap = (S * 0.9) / F.pairs;
    stem([[S * 0.5, S * 0.985], [S * 0.5, S * 0.03]], S * 0.012, S * 0.004);
    for (let k = 0; k < F.pairs; k++) {
      const u = (k + 0.5) / F.pairs, y = S * (0.95 - 0.9 * u);
      const len = S * F.reach * Math.max(0.08, Math.sin(Math.PI * (0.18 + 0.8 * u)));
      const lobes = Math.max(2, Math.round((F.lobes * len) / (S * F.reach)));
      for (const s of [-1, 1]) {
        g.save();
        g.translate(S * 0.5, y);
        g.rotate(s * (Math.PI / 2 - F.angle - 0.25 * u));
        const step = len / (lobes + 0.3);
        for (let j = 0; j < lobes; j++) {
          const t = (j + 0.5) / lobes;
          const across = gap * F.width * (1 - 0.55 * t), along = step * 0.62;
          g.beginPath();
          g.ellipse(0, -step * (j + 0.6), across, along, 0, 0, Math.PI * 2);
          g.fillStyle = tone();
          g.fill();
          g.strokeStyle = C.edge;
          g.lineWidth = P.edge * 0.6;
          g.stroke();
        }
        g.strokeStyle = C.vein;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -len * 0.92);
        g.stroke();
        g.restore();
      }
    }
  });
  const t = texture(c, [1, 1], false);
  t.anisotropy = 4;
  return t;
}
