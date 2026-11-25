// Painted textures for the view outside: the soft watercolour sky, its clouds and the far tree
// masses on its horizon.

import * as THREE from 'three';
import { rng, canvas, texture, css, vary, wrapX, blot, detail } from '../paint/core.js';

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
  // The blue is painted more saturated than it should look: the room's grade takes about a third
  // of the colour out again.
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
  if (P.rows) {
    paintWatercolourClouds(g, r, W, H, C, P);
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
 * R4's sky as watercolour (pass e6), over the blue gradient: an uneven wash, then cumulus masses
 * in rows from the horizon up, back to front, each shrunk by its perspective. A mass is many lobes
 * along a lumpy top over a flat base, painted the way R4 paints them: a soft grey-blue underside
 * bled into the blue, warm grey bodies, paper-white caps with a firm edge on the lit side (above,
 * a little left), grey pooled in places with a darker dried rim, and broken dry-brush strokes off
 * some ends. Thin flat streaks lie low down; paper grain over everything; no ink.
 */
function paintWatercolourClouds(g, r, W, H, C, P) {
  const { wash: Wa, rows: Rw, mass: Ms, shade: Sd, lit: Lt, pool: Pl, dry: Dr, streaks: St, grain: Gr } = P;
  const horizon = H / 2;
  // 1. the wash: broad flat strokes of a paler and a deeper blue, and a few blooms (a pale middle
  // with the pigment pushed out to a darker ring)
  for (let n = 0; n < Wa.strokes; n++) {
    const y = horizon * (0.05 + 0.9 * r());
    const len = vary(r, Wa.length);
    blot(g, W, r() * W, y, len / 2, vary(r, Wa.thick) / 2, css(r() < 0.5 ? C.washLight : C.washDeep), vary(r, Wa.opacity));
  }
  // blooms: irregular pale patches where water ran back into the drying wash
  for (let n = 0; n < Wa.blooms; n++) {
    const x = r() * W, y = horizon * (0.15 + 0.7 * r()), rad = vary(r, Wa.bloom);
    for (let k = 0; k < 5; k++) blot(g, W, x + (r() - 0.5) * rad * 1.6, y + (r() - 0.5) * rad * 0.6, rad * (0.4 + 0.4 * r()), rad * (0.2 + 0.2 * r()), css(C.washLight), 0.12);
  }
  // 2. thin flat streaks low down, under the masses
  for (let n = 0; n < St.count; n++) {
    const x = r() * W, y = horizon - vary(r, St.height), len = vary(r, St.length), th = vary(r, St.thick);
    blot(g, W, x, y + th * 0.6, len / 2, th * 0.7, css(C.shade), vary(r, St.opacity) * 0.6);
    blot(g, W, x - len * 0.05, y, len / 2, th / 2, css(C.lit), vary(r, St.opacity));
  }
  // 3. the masses, row by row from the horizon up (far to near), so near masses overlap far ones
  const deg = 360 / W; // the sky is W px round
  const tanRef = Math.tan((Rw.ref * deg * Math.PI) / 180);
  for (let i = 0; i < Rw.count; i++) {
    const e = Rw.from + (Rw.to - Rw.from) * (i / (Rw.count - 1)) ** Rw.bias; // px above the horizon
    const s = Math.max(Rw.scaleMin, Math.tan((e * deg * Math.PI) / 180) / tanRef); // perspective
    const keep = Math.min(1, Rw.keep[0] + Rw.keep[1] * s); // far rows are sparser: scraps, not a frieze
    const sw = Math.min(s, Rw.widthMax); // near masses are capped in width, so every row has several round the sky
    const start = r() * W; // one full turn round the sky from a random start (paintMass wraps the seam)
    for (let x = start; x < start + W; ) {
      const w = vary(r, Rw.width) * sw * (r() < 0.3 ? 0.5 : 1);
      if (r() < keep) paintMass(g, r, W, x + w / 2, horizon - e - (r() - 0.5) * Rw.jitter * s, w, s, C, Ms, Sd, Lt, Pl, Dr, Gr);
      x += w + vary(r, Rw.gap) * sw;
    }
  }
  // 4. paper grain over the whole sky: tiny pale and dark specks
  for (let n = 0; n < Gr.count; n++) {
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${Gr.opacity})` : `rgba(${css(C.pool)},${Gr.opacity})`;
    g.fillRect(r() * W, r() * horizon, 1 + r(), 1 + r());
  }
}

/**
 * An irregular wash outline: a closed loop whose radius wanders by two random waves, so a shape
 * reads as brushed, not as a circle. Points are unit-sized; washShape scales and places them.
 */
function washOutline(r, rough, n = 26) {
  const k1 = 2 + Math.floor(r() * 3), k2 = 5 + Math.floor(r() * 4), p1 = r() * 6.28, p2 = r() * 6.28;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + rough * (0.6 * Math.sin(k1 * a + p1) + 0.4 * Math.sin(k2 * a + p2) + 0.3 * (r() - 0.5));
    pts.push([Math.cos(a) * k, Math.sin(a) * k]);
  }
  return pts;
}

/**
 * Fills an outline as a watercolour wash at (cx, cy), rx by ry. soft = 0: one flat fill with a
 * darker dried rim (pigment pushed to the edge). soft > 0: a few shrinking copies, so the edge
 * feathers out (wet-in-wet) but keeps its irregular shape.
 */
function washShape(m, pts, cx, cy, rx, ry, rgb, a, soft = 0) {
  const path = (k) => {
    m.beginPath();
    const n = pts.length;
    const P = (i) => [cx + pts[i % n][0] * rx * k, cy + pts[i % n][1] * ry * k];
    let [x0, y0] = P(0), [x1, y1] = P(1);
    m.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
    for (let i = 1; i <= n; i++) {
      const [xa, ya] = P(i), [xb, yb] = P(i + 1);
      m.quadraticCurveTo(xa, ya, (xa + xb) / 2, (ya + yb) / 2);
    }
    m.closePath();
  };
  if (!soft) {
    path(1);
    m.fillStyle = `rgba(${rgb},${a})`;
    m.fill();
    if (a >= 1) return; // an opaque wash: a rim of its own colour would not show
    m.strokeStyle = `rgba(${rgb},${Math.min(1, a * 0.6)})`;
    m.lineWidth = 0.8;
    m.stroke();
    return;
  }
  const steps = 2, each = 1 - (1 - a) ** (1 / steps);
  m.fillStyle = `rgba(${rgb},${each})`;
  for (let j = 0; j < steps; j++) {
    path(1 + soft * 0.5 - (soft * j) / (steps - 1));
    m.fill();
  }
}

// One scratch canvas for every mass (grown as needed), cleared between them: a new canvas per
// mass cost more than its painting.
let scratch = null;
function massCanvas(w, h) {
  const cw = Math.ceil(w * detail), ch = Math.ceil(h * detail);
  if (!scratch || scratch[0].width < cw || scratch[0].height < ch) {
    const c = document.createElement('canvas');
    c.width = Math.max(cw, scratch?.[0].width ?? 0);
    c.height = Math.max(ch, scratch?.[0].height ?? 0);
    scratch = [c, c.getContext('2d', { willReadFrequently: true })];
  }
  const [c, m] = scratch;
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.globalCompositeOperation = 'source-over';
  m.clearRect(0, 0, cw + 2, ch + 2);
  m.scale(detail, detail);
  return [c, m];
}

/** One cumulus mass of the watercolour sky, centred at x over its flat base at y, w px wide. */
function paintMass(g, r, W, x, base, w, s, C, Ms, Sd, Lt, Pl, Dr, Gr) {
  const tall = vary(r, Ms.tall) * (0.5 + 0.5 * Math.min(1, s)); // far masses are flatter
  const lobes = [];
  const count = Math.max(3, Math.round(w / (Ms.spacing * Math.max(0.6, s)))); // far masses are a few px tall: fewer lobes
  let top = 0;
  for (let i = 0; i < count; i++) {
    const t = r();
    const hump = Math.sin(Math.PI * t) ** 0.6; // fuller in the middle
    const rad = vary(r, Ms.size) * s * (0.3 + hump) * (r() < Ms.small ? 0.5 : 1);
    const lift = hump * w * tall * vary(r, Ms.lift);
    top = Math.max(top, lift);
    // each lobe: a wider-than-tall brushed outline (cauliflower lumps, not balls)
    lobes.push({ x: x + (t - 0.5) * w, y: base - lift + (r() - 0.5) * rad * 0.4, rad, lift, t, pts: washOutline(r, Ms.rough) });
  }
  lobes.sort((a, b) => b.lift - a.lift); // low lobes last: they overlap the higher ones behind
  // The mass is painted on its own small canvas, then laid on the sky: so its base can fade out
  // softly (flat, but no hard seam) and its greys stay inside its silhouette.
  const maxRad = Math.max(...lobes.map((l) => l.rad));
  const x0 = x - w * 0.5 - maxRad * 1.8, y0 = base - top - maxRad * 1.6;
  const bw = Math.ceil(w + maxRad * 3.6), bh = Math.ceil(base + 2 - y0);
  const [mc, m] = massCanvas(bw, bh);
  m.translate(-x0, -y0);
  const [aw, ah] = Ms.aspect;
  // the silhouette: bare paper, warm white, with a firm edge where it meets the blue
  for (const l of lobes) washShape(m, l.pts, l.x, l.y, l.rad * aw, l.rad * ah, css(C.lit), Lt.opacity);
  m.globalCompositeOperation = 'source-atop'; // the greys stay inside the silhouette
  // the body: warm grey washed under each lobe's cap, so every lump keeps a white top. Mostly wet
  // (soft edge), some dried crisp.
  const tiny = s < 0.6; // far masses are a few px tall: one flat fill per wash, no feathering to see
  for (const l of lobes) {
    const crisp = tiny || r() < Sd.crisp;
    washShape(m, washOutline(r, Ms.rough), l.x + l.rad * 0.15, l.y + l.rad * Lt.cap, l.rad * aw * 0.95, l.rad * ah * 0.9, css(C.body), Sd.body, crisp ? 0 : 0.35);
  }
  // the shade: grey-blue lower again, stronger towards the right (the light is above, a little left)
  for (const l of lobes) {
    const crisp = tiny || r() < Sd.crisp;
    washShape(m, washOutline(r, Ms.rough * 1.2), l.x + l.rad * 0.3, l.y + l.rad * (Lt.cap + 0.45), l.rad * aw * 0.85, l.rad * ah * 0.7, css(C.shade), Sd.opacity * (0.55 + 0.45 * l.t), crisp ? 0 : 0.45);
  }
  // a broad grey-blue wash over the lower part of the whole mass
  for (let u = -0.4; u <= 0.4; u += 0.2) {
    washShape(m, washOutline(r, Ms.rough), x + u * w + (r() - 0.5) * w * 0.05, base - top * 0.12, w * 0.16, Math.max(2, top * 0.32), css(C.shade), Sd.under, tiny ? 0 : 0.5);
  }
  // pooled grey, low in the body: small crisp shapes with a dried rim, and granulation
  const pools = Math.round(vary(r, Pl.perMass));
  for (let n = 0; n < pools; n++) {
    const px = x + (r() - 0.3) * w * 0.6, py = base - top * (0.12 + 0.3 * r()), rad = w * vary(r, Pl.size);
    washShape(m, washOutline(r, Ms.rough * 1.5), px, py, rad, rad * 0.45, css(C.pool), Pl.opacity);
    m.fillStyle = `rgba(${css(C.pool)},0.5)`;
    for (let q = Math.round(((rad * rad) / 40) * Gr.granules); q > 0; q--) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
      m.fillRect(px + Math.cos(a) * d, py + Math.sin(a) * d * 0.45, 1, 1);
    }
  }
  // the flat base: everything fades out over the last few px above it
  m.globalCompositeOperation = 'destination-out';
  const fadeTop = base - Sd.fade * s - 1;
  const fade = m.createLinearGradient(0, fadeTop, 0, base);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  m.fillStyle = fade;
  m.fillRect(x0, fadeTop, bw, base - fadeTop);
  m.fillStyle = '#000';
  m.fillRect(x0, base, bw, y0 + bh - base + 1);
  wrapX(W, (dx) => g.drawImage(mc, 0, 0, bw * detail, bh * detail, x0 + dx, y0, bw, bh));
  // the flat underside bled into the blue below the base (wet-in-wet)
  for (let u = -0.42; u <= 0.42; u += 0.14) blot(g, W, x + u * w, base + 1, w * 0.12, Math.max(1.5, top * 0.08), css(C.shade), Sd.under * 0.5);
  // dry-brush: a few broken flat strokes trailing off one end
  if (r() < Dr.chance) {
    const side = r() < 0.5 ? -1 : 1;
    const n = Math.round(vary(r, Dr.strokes));
    for (let k = 0; k < n; k++) {
      const sx = x + side * (w * 0.45 + r() * w * 0.25), sy = base - r() * top * 0.5;
      const len = w * (0.06 + 0.1 * r());
      for (let d = 0; d < len; d += 3 + r() * 5) blot(g, W, sx + side * d, sy + (r() - 0.5), 2 + r() * 3, 1 + r() * 1.5, css(r() < 0.6 ? C.lit : C.body), Dr.opacity * r());
    }
  }
}
