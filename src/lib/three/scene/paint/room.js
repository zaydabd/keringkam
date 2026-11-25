// Painted textures for the room: planks, carving, the window lattice, curtains, decor and the
// soft glows under the furniture.

import * as THREE from 'three';
import { rng, canvas, texture, css, vary, wrapX, blot, brushDabs } from './core.js';

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
 * Sizes in metres (the tile, its rails and bands) come from LATTICE_TILE (room/lattice.js);
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
