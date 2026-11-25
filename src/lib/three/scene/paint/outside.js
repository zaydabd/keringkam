// Painted textures for the street outside: the paving, the Assembly building, and the stylised
// tiles they share.

import { rng, canvas, texture, css, vary, blot, brushDabs } from './core.js';

/**
 * The Kuching Waterfront's street (outside/waterfront.js; pass e11), one tile of `P.tile` metres
 * that repeats: small bricks in a basket weave (pairs of bricks, each pair turned against its
 * neighbours), with broad swirls of paler bricks set into them, after the user's photos U1, U3
 * and U4. Painted in its own colours (the street's vertex colour is white). Sizes are estimates
 * from the photos, not measurements.
 */
export function paintPaving(seed = 61, { colours: C, pattern: P }) {
  const r = rng(seed);
  const W = Math.round(P.tile * P.perMetre), m = P.perMetre;
  const mix = (a, b, t) => {
    const A = css(a).split(',').map(Number), B = css(b).split(',').map(Number);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  };
  // the bricks: units of two bricks side by side, the units' direction alternating (basket weave)
  const u = P.brick.unit * m, j = P.brick.joint * m;
  const bricks = (g, a, b, shade) => {
    g.fillStyle = C.joint;
    g.fillRect(0, 0, W, W);
    for (let y = 0; y < W; y += u) {
      for (let x = 0; x < W; x += u) {
        const across = ((x / u + y / u) | 0) % 2 === 0;
        for (let k = 0; k < 2; k++) {
          const bx = across ? x + (k * u) / 2 : x, by = across ? y : y + (k * u) / 2;
          const bw = across ? u / 2 : u, bh = across ? u : u / 2;
          g.fillStyle = mix(a, b, shade());
          g.fillRect(bx + j / 2, by + j / 2, bw - j, bh - j);
        }
      }
    }
  };
  const [c, g] = canvas(W, W);
  bricks(g, C.brick, C.brickDark, () => r() * r() + 0.3 * r());
  // the swirls: the same bricks in the pale colours, cut to smooth bands, so a band's edge runs
  // through the bricks as it does in the photos (U3) instead of stepping brick by brick
  const [sc, sg] = canvas(W, W);
  bricks(sg, C.swirl, C.swirlLight, r);
  sg.globalCompositeOperation = 'destination-in';
  sg.strokeStyle = '#fff';
  sg.lineCap = 'round';
  sg.lineJoin = 'round';
  sg.lineWidth = P.swirl.band * m;
  sg.beginPath(); // one path for every curl: each stroke with 'destination-in' would clear the others
  for (const s of P.swirl.curls) {
    // drawn wrapped in both directions so the tile repeats
    for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) {
      const cx = s.at[0] * W + dx, cy = s.at[1] * W + dy;
      // an Archimedean spiral out from the centre, then a tail that sweeps off
      const turns = s.turns * Math.PI * 2;
      for (let t = 0; t <= turns; t += 0.04) {
        const rr = (s.inner + (s.outer - s.inner) * (t / turns)) * m;
        const x = cx + Math.cos(t * s.dir + s.phase) * rr, y = cy + Math.sin(t * s.dir + s.phase) * rr;
        if (t === 0) sg.moveTo(x, y);
        else sg.lineTo(x, y);
      }
      const end = turns * s.dir + s.phase, R0 = s.outer * m;
      const ex = cx + Math.cos(end) * R0, ey = cy + Math.sin(end) * R0;
      const tx = -Math.sin(end) * s.dir, ty = Math.cos(end) * s.dir; // on along the spiral
      sg.bezierCurveTo(ex + tx * s.tail * m, ey + ty * s.tail * m, ex + tx * s.tail * m * 1.6 + ty * s.tail * m * 0.4, ey + ty * s.tail * m * 1.6 - tx * s.tail * m * 0.4, ex + tx * s.tail * m * 2.2, ey + ty * s.tail * m * 2.2);
    }
  }
  sg.stroke();
  g.drawImage(sc, 0, 0);
  return texture(c, [1, 1], true);
}

/**
 * The Assembly building (outside/assembly.js; pass e15): one canvas of two halves, each `P.size`
 * square. Left: one bay of the glazing behind the arcade, in its own colours (its vertex colour is
 * white): dark brown glass, lighter at the top where it takes the sky, with mullions and transoms.
 * Right: weathering for the cream concrete (columns, brim, podium), near white so the vertex
 * colour sets the hue: rain streaks, a dirty foot, faint formwork joints. Each quad of the
 * building maps the whole of one half (index.js), u round the building, v up. Sizes are estimates.
 */
/**
 * Pass e16: one tile of stylized brushwork at (x0, 0), size S, clipped to the tile and wrapping on
 * every edge. `style` is 'c' (watercolour after Annie Xiao: wash blots and a few long loose
 * strokes), 'd' (hand-painted after Abhishek Maity: short dabs and a warm glaze) or 'cd' (C with D
 * at half). Every quad repeats the tile, so nothing marks its edges: a first try with pooled edges,
 * edge highlights and a dark foot drew a tile grid over the cone (pass e16 gate). C's painted light
 * is a gradient over the whole building instead (outside/index.js).
 */
function styleTile(g, r, x0, S, style, P) {
  const C = P.colours;
  const half = style === 'cd' ? 0.5 : 1;
  g.save();
  g.beginPath();
  g.rect(x0, 0, S, S);
  g.clip();
  g.translate(x0, 0);
  if (style === 'c' || style === 'cd') {
    const W = P.c;
    for (let i = 0; i < W.blots; i++) {
      const rx = S * (0.12 + r() * 0.25);
      const x = r() * S, y = r() * S, ry = rx * (0.5 + r() * 0.5), rgb = css(r() < 0.5 ? C.wash : C.light), a = vary(r, W.blotAlpha);
      for (const dy of [-S, 0, S]) blot(g, S, x, y + dy, rx, ry, rgb, a);
    }
    brushDabs(g, S, S, r, W.strokes, [C.dark, C.light]);
  }
  if (style === 'd' || style === 'cd') {
    const D = P.d;
    brushDabs(g, S, S, r, { ...D.dabs, count: Math.round(D.dabs.count * half) }, [C.dark, C.light]);
    g.fillStyle = `rgba(255,200,130,${D.warm * half})`; // the warm light, glazed over
    g.fillRect(0, 0, S, S);
  }
  g.restore();
}

/** The paper's brightness in linear light: a styled material is brightened by its inverse. */
export function styleGain(P) {
  const v = P.base / 255;
  return 1 / (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
}

/** Pass e16: the gold's map in a style, one tile of brushwork on the paper (P: themes assemblyStyle). */
export function paintStylized(seed, style, P) {
  const r = rng(seed);
  const S = P.size;
  const [c, g] = canvas(S, S);
  g.fillStyle = `rgb(${P.base},${P.base},${P.base})`;
  g.fillRect(0, 0, S, S);
  styleTile(g, r, 0, S, style, P);
  return texture(c, [1, 1], false);
}

/**
 * The Assembly's glass and concrete. With `style` (pass e16) the canvas is darkened to the paper of
 * SP (themes assemblyStyle) and the brushwork laid over the concrete; the material is brightened back.
 */
export function paintAssembly(seed = 71, { colours: C, pattern: P }, style = null, SP = null) {
  const r = rng(seed);
  const S = P.size;
  const [c, g] = canvas(S * 2, S);
  // the glazing
  const glass = g.createLinearGradient(0, 0, 0, S);
  glass.addColorStop(0, C.glassTop);
  glass.addColorStop(1, C.glassBottom);
  g.fillStyle = glass;
  g.fillRect(0, 0, S, S);
  const ys = [0, ...P.transoms.map((t) => (1 - t) * S), S]; // canvas y runs down, v up
  const xs = Array.from({ length: P.mullions + 1 }, (_, i) => (i / P.mullions) * S);
  for (let i = 0; i < xs.length - 1; i++) {
    for (let k = 0; k < ys.length - 1; k++) {
      // each pane a little lighter or darker: the glass catches the sky unevenly
      g.fillStyle = `rgba(${css(C.pane)},${0.25 + r() * 0.35})`;
      g.fillRect(xs[i], ys[k], xs[i + 1] - xs[i], ys[k + 1] - ys[k]);
    }
  }
  const fw = P.frame * S;
  g.fillStyle = C.frame;
  for (const x of xs) g.fillRect(x - fw / 2, 0, fw, S); // the edges wrap: half a line at each side
  for (const y of ys.slice(1, -1)) g.fillRect(0, y - fw / 3, S, (fw * 2) / 3);
  // the concrete: white, then streaks, joints and the dirty foot laid over it
  const x0 = S;
  g.fillStyle = '#ffffff';
  g.fillRect(x0, 0, S, S);
  for (let i = 0; i < P.streaks; i++) {
    const x = x0 + r() * S, w = 1 + r() * 4, top = r() * S * 0.6;
    const a = vary(r, P.streakAlpha);
    const s = g.createLinearGradient(0, top, 0, S);
    s.addColorStop(0, `rgba(${css(C.stain)},0)`);
    s.addColorStop(0.3, `rgba(${css(C.stain)},${a})`);
    s.addColorStop(1, `rgba(${css(C.stain)},${a * 0.6})`);
    g.fillStyle = s;
    g.fillRect(x, top, w, S - top);
  }
  for (let j = 1; j <= P.joints; j++) {
    g.fillStyle = `rgba(${css(C.stain)},0.1)`;
    g.fillRect(x0, (j / (P.joints + 1)) * S, S, 1.5);
  }
  const foot = g.createLinearGradient(0, S * (1 - P.grime), 0, S);
  foot.addColorStop(0, `rgba(${css(C.grime)},0)`);
  foot.addColorStop(1, `rgba(${css(C.grime)},0.35)`);
  g.fillStyle = foot;
  g.fillRect(x0, S * (1 - P.grime), S, S * P.grime);
  if (style) {
    // multiplying by the paper in sRGB is about the same as in linear light (a power law)
    g.fillStyle = `rgba(0,0,0,${1 - SP.base / 255})`;
    g.fillRect(0, 0, 2 * S, S);
    styleTile(g, rng(seed + 5), S, S, style, SP); // the concrete only: the dark glass keeps its own look
  }
  return texture(c, [1, 1], false);
}
