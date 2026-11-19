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
 * The leaf atlas (outside/leaves.js LEAF_ATLAS): 3 x 2 cells of `pattern.cell` px, one cut-out in
 * each, its base at the bottom middle: a sprig of small leaves, a sprig of larger drooping ones,
 * one broad leaf, a fern frond with lobed leaflets, a cluster of leaves painted as soft washes,
 * and a five-petalled flower (centred). The leaves are light greys with a dark edge line (the
 * leaves get no ink from the ink pass); the plant's vertex colour sets the green. The flower is
 * painted in its own colours, for a near-white vertex colour. Transparent around.
 */
export function paintLeaves(seed = 43, { colours: C, pattern: P }) {
  const r = rng(seed);
  const S = P.cell;
  const [c, g] = canvas(S * 3, S * 2);
  g.clearRect(0, 0, S * 3, S * 2);
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
    g.translate((index % 3) * S, Math.floor(index / 3) * S);
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
    // A frond: a spine with paired leaflets (pinnae), longest about a third of the way up. Each
    // pinna is one tapering blade with a scalloped (lobed) margin. All pinnae are stroked first
    // with a wide edge and then filled on top, so only the frond's outer margin keeps an edge:
    // no line between lobes or where pinnae touch the spine.
    const F = P.frond;
    const gap = (S * 0.9) / F.pairs;
    const pinnae = [];
    for (let k = 0; k < F.pairs; k++) {
      const u = (k + 0.5) / F.pairs, y = S * (0.95 - 0.9 * u);
      const len = S * F.reach * Math.max(0.08, Math.sin(Math.PI * (0.18 + 0.8 * u)));
      const lobes = Math.max(2, Math.round((F.lobes * len) / (S * F.reach)));
      for (const s of [-1, 1]) pinnae.push({ y, s, a: s * (Math.PI / 2 - F.angle - 0.25 * u), len, lobes, half: gap * F.width, fill: tone() });
    }
    const blade = ({ y, a, len, lobes, half }) => {
      g.save();
      g.translate(S * 0.5, y);
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, 0);
      const hw = (t) => half * (1 - 0.75 * t);
      for (const side of [-1, 1]) {
        // out along one margin (scallop per lobe) to the tip, then back along the other
        for (let j = 0; j < lobes; j++) {
          const jj = side < 0 ? j : lobes - 1 - j;
          const t0 = jj / lobes, t1 = (jj + 1) / lobes, tm = (t0 + t1) / 2;
          const tEnd = side < 0 ? t1 : t0;
          g.quadraticCurveTo(side * hw(tm) * 1.45, -len * tm, side * hw(tEnd) * 0.7 * (tEnd < 1 ? 1 : 0), -len * tEnd);
        }
      }
      g.closePath();
      g.restore();
    };
    g.strokeStyle = C.shade; // a soft edge, not an ink line (pass e5b: the bush's fronds)
    g.lineWidth = P.edge * F.edge;
    for (const q of pinnae) blade(q), g.stroke();
    for (const q of pinnae) {
      blade(q);
      g.fillStyle = q.fill;
      g.fill();
      if (q.s > 0) {
        g.fillStyle = C.shade; // the pinnae on one side turned from the light
        g.globalAlpha = P.shade * 0.6;
        g.fill();
        g.globalAlpha = 1;
      }
    }
    g.strokeStyle = C.vein;
    g.lineWidth = 1.2;
    for (const q of pinnae) {
      g.save();
      g.translate(S * 0.5, q.y);
      g.rotate(q.a);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -q.len * 0.9);
      g.stroke();
      g.restore();
    }
    stem([[S * 0.5, S * 0.985], [S * 0.5, S * 0.03]], S * 0.012, S * 0.004);
  });
  // A wobbly outline: the edge of a wash, which a brush never leaves smooth. `pts` is a closed
  // polygon; each point is pushed in or out by up to `wob` px.
  const wobbly = (pts, wob) => {
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length];
      const jx = x + (r() - 0.5) * wob * 2, jy = y + (r() - 0.5) * wob * 2;
      if (i === 0) g.moveTo(jx, jy);
      g.quadraticCurveTo(jx, jy, (jx + nx) / 2, (jy + ny) / 2);
    });
    g.closePath();
  };
  const lerpN = (a, b, t) => a + (b - a) * t;
  // A leaf shape as a polygon, base at the origin pointing up, then turned and moved.
  const leafPoly = (x, y, a, L, W, n = 14) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n; // up one margin
      pts.push([W * 0.55 * Math.sin(Math.PI * Math.pow(t, 0.8)), -L * t]);
    }
    for (let i = n - 1; i > 0; i--) {
      const t = i / n; // down the other
      pts.push([-W * 0.55 * Math.sin(Math.PI * Math.pow(t, 0.8)), -L * t]);
    }
    const ca = Math.cos(a), sa = Math.sin(a);
    return pts.map(([px, py]) => [x + px * ca - py * sa, y + px * sa + py * ca]);
  };
  inCell(4, () => {
    // Loose sprays of pointed leaves painted as washes (pass e5b; R4 and the watercolour
    // references in research/CREDITS.md): each leaf a soft wash, darker at its base and pale at
    // its tip, a faint midrib, a thin dried edge a little darker than the wash, no hard edge line.
    // The gaps between the leaves stay transparent, so the bush is not a solid mass.
    const W = P.wash;
    g.lineCap = 'round';
    for (let k = 0; k < W.sprays; k++) {
      const lean = (k / Math.max(1, W.sprays - 1) - 0.5) * W.fan + (r() - 0.5) * 0.15;
      const reach = S * (0.8 - 0.15 * Math.abs(lean));
      const bend = (r() - 0.5) * 0.5;
      const at = (t) => {
        const a = lean + bend * t;
        return [S * 0.5 + Math.sin(a) * reach * t, S * 0.98 - Math.cos(a) * reach * t];
      };
      stem(Array.from({ length: 9 }, (_, i) => at(i / 8)), S * 0.009, S * 0.004);
      const leaves = [];
      for (let j = 0; j < W.leaves; j++) {
        const t = 0.25 + (0.7 * j) / W.leaves, [x, y] = at(t), [x2, y2] = at(t + 0.02);
        const dir = Math.atan2(x2 - x, -(y2 - y));
        const side = j % 2 ? 1 : -1;
        leaves.push([x, y, dir + side * vary(r, W.spread), S * vary(r, W.length) * (1 - 0.3 * t)]);
      }
      const [x, y] = at(1), [x0, y0] = at(0.97);
      leaves.push([x, y, Math.atan2(x - x0, -(y - y0)), Math.min(S * W.length[0], y - S * 0.02)]);
      for (const [lx, ly, a, L] of leaves) {
        const poly = leafPoly(lx, ly, a, L, L * vary(r, W.width));
        g.save();
        wobbly(poly, S * W.wobble);
        const tip = [lx + Math.sin(a) * L, ly - Math.cos(a) * L];
        const grad = g.createLinearGradient(lx, ly, tip[0], tip[1]);
        grad.addColorStop(0, C.washBase);
        grad.addColorStop(0.55, tone());
        grad.addColorStop(1, C.fill);
        g.fillStyle = grad;
        g.fill();
        g.clip();
        // a bloom: pigment pooled somewhere in the wash
        const bx = lerpN(lx, tip[0], r()), by = lerpN(ly, tip[1], r()), rad = L * (0.2 + 0.25 * r());
        const blot = g.createRadialGradient(bx, by, 0, bx, by, rad);
        blot.addColorStop(0, C.shade);
        blot.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = W.bloom;
        g.fillStyle = blot;
        g.fillRect(bx - rad, by - rad, rad * 2, rad * 2);
        g.globalAlpha = W.rib;
        g.strokeStyle = C.vein;
        g.lineWidth = S * 0.006;
        g.beginPath();
        g.moveTo(lx, ly);
        g.lineTo(lerpN(lx, tip[0], 0.85), lerpN(ly, tip[1], 0.85));
        g.stroke();
        g.globalAlpha = W.rim; // the dried edge: inside the clip, so only its inner half shows
        g.strokeStyle = C.shade;
        g.lineWidth = S * 0.012;
        wobbly(poly, S * W.wobble * 0.5);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
      }
    }
  });
  inCell(5, () => {
    // A flower (pass e5): five broad overlapping petals, a little cupped, painted as loose washes
    // (Homer's reds are single strokes over the green), a deeper red towards the throat and at the
    // dried edge, and a pale point in the middle. Shape from the Commons photos (research/CREDITS.md).
    const F = P.flower;
    const cx = S * 0.5, cy = S * 0.5, R = S * F.radius;
    const turn = r() * Math.PI * 2;
    for (let k = 0; k < 5; k++) {
      const a = turn + (k * Math.PI * 2) / 5 + (r() - 0.5) * 0.2;
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        // a petal: narrow at the throat, a broad rounded end, a slight notch
        const t = i / 16, ang = (t - 0.5) * F.spread;
        const rr = R * (0.15 + 0.85 * Math.sin(Math.PI * Math.min(1, t * 1.02)) ** 0.35) * (1 - 0.06 * Math.cos(ang * 6));
        pts.push([cx + Math.sin(a + ang) * rr, cy - Math.cos(a + ang) * rr]);
      }
      pts.push([cx, cy]);
      g.save();
      wobbly(pts, R * 0.04);
      g.fillStyle = C.petal;
      g.fill();
      g.clip();
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      grad.addColorStop(0, C.petalDeep); // deep at the throat...
      grad.addColorStop(0.5, C.petal);
      grad.addColorStop(1, C.petalLight); // ...pale at the tips (R4)
      g.fillStyle = grad;
      g.fillRect(cx - R, cy - R, R * 2, R * 2);
      g.globalAlpha = 0.35;
      g.strokeStyle = C.petalDeep;
      g.lineWidth = S * 0.012;
      wobbly(pts, R * 0.02);
      g.stroke();
      g.globalAlpha = 1;
      g.restore();
    }
    g.fillStyle = C.eye; // the pale column in the middle
    g.beginPath();
    g.ellipse(cx, cy - R * 0.08, R * 0.07, R * 0.16, 0, 0, Math.PI * 2);
    g.fill();
  });
  const t = texture(c, [1, 1], false);
  t.anisotropy = 4;
  return t;
}
