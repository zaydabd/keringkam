// The Assembly's river front on the far bank's embankment (pass e7): a wide stepped slope (the
// musical fountain's cascade) with a pattern of pointed arches, white stepped planters with
// flowers and narrow stairs at its sides, a white lattice plinth at the top with the building's
// name, and three flagpoles behind it.
//
// Reference: the photo "Sarawak State Assembly Building.jpg" by Horatio Wong, CC BY-SA 4.0
// (https://commons.wikimedia.org/wiki/File:Sarawak_State_Assembly_Building.jpg; not in the repo),
// chosen by the user over their own generated renders. The fountain being in front of the
// building is sourced (https://commons.wikimedia.org/wiki/File:Darul_Hana_musical_fountain_in_front_of_the_state_assembly_building.jpg).
// Every size here is an estimate read off that photo, or a design choice to fit the window shot:
// none is survey data. The real cascade is wider; here it is sized so that the window frame shows
// most of it (the frame sees about 26 m of the embankment), and it stands left of the building's
// axis for the same reason. It lies on the embankment's slope (banks.js, SITE.far foot..crest),
// which is straight where it is built, so the slope's height depends on the offset only.
// Writes slot 'paint'.

import { createContract } from './contract.js';
import { SITE, sampleLine, rgbTable } from './site.js';
import { OUTSIDE_THEME } from '../themes/index.js';
import { lerp } from '../../../utils/vec3.js';


export const FORECOURT = {
  from: 4, // x of the waterline where the left planter starts: the embankment is full height from here (SITE.far.lawnFrom)
  line: 21, // widths are measured along the line this far inland (m)
  // across the bank, left to right: planter, stair, cheek wall, cascade, cheek, stair, planter (m)
  widths: { planter: 3.5, stair: 1.6, cheek: 0.5, cascade: 22 },
  cascade: { tiers: 12, cell: 0.6, arches: 4, spring: 0.35, apex: 0.92, lift: 0.03, cheek: 0.45 }, // arches: pointed, like the arcade (photo); spring and apex: of the slope's depth
  planter: { steps: 3, height: 0.7, inset: 0.3, flowers: 0.25 },
  stair: { steps: 18 },
  plinth: { width: 10, height: 2.2, depth: 0.8, offset: 27.6, cell: 0.5, sign: { width: 7.6, height: 1.5, lift: 0.35 } },
  // The name in letter blocks: too small to read from the window, so a block per letter.
  letters: { lines: ['DEWAN UNDANGAN NEGERI', 'SARAWAK'], size: [[0.26, 0.38], [0.3, 0.42]], pitch: [0.35, 0.42], gap: 0.18 },
  flags: { count: 3, spacing: 3.2, offset: 29.5, height: 12, pole: 0.2, flag: [1.0, 1.6], droop: 0.35 }, // the photo shows three, too small to identify: colours are a design choice
};

// Paint, as vertex colours (themes/outside.js).
export const FORECOURT_PAINT = rgbTable(OUTSIDE_THEME.forecourt);

const F = SITE.far;
const footY = F.roughY + 0.1; // banks.js: the path's level at the embankment's foot
/** Height of the built embankment's surface at an offset inland (banks.js cross-section where it is built). */
export const slopeAt = (o) => (o <= F.foot ? footY : o <= F.crest ? lerp(footY, F.crestY, (o - F.foot) / (F.crest - F.foot)) : lerp(F.crestY, F.backY, (o - F.crest) / (F.back - F.crest)));

/**
 * The river front's frame along the bank: dense stations of the far waterline, and `at(u, o)`,
 * the point `o` inland at `u` metres along the line `FORECOURT.line` inland from where it starts.
 * Shared with banks.js, which keeps its grass ticks out of the footprint.
 */
export function forecourtFrame(R = FORECOURT) {
  const st = sampleLine(SITE.farLine, { landOnLeft: false, step: () => 0.5 });
  const i0 = st.findIndex((s) => s.x >= R.from);
  const u = [0];
  for (let i = i0 + 1; i < st.length; i++) {
    const a = st[i - 1], b = st[i];
    u.push(u[u.length - 1] + Math.hypot(b.x + b.nx * R.line - a.x - a.nx * R.line, b.z + b.nz * R.line - a.z - a.nz * R.line));
  }
  const W = R.widths, total = 2 * (W.planter + W.stair + W.cheek) + W.cascade;
  const frameAt = (uu) => {
    let k = 1;
    while (k < u.length - 1 && u[k] < uu) k++;
    const t = (uu - u[k - 1]) / (u[k] - u[k - 1]);
    const a = st[i0 + k - 1], b = st[i0 + k];
    const nx = lerp(a.nx, b.nx, t), nz = lerp(a.nz, b.nz, t), l = Math.hypot(nx, nz);
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), nx: nx / l, nz: nz / l };
  };
  const at = (uu, o, y = slopeAt(o)) => {
    const f = frameAt(uu);
    return [f.x + f.nx * o, y, f.z + f.nz * o];
  };
  const xEnd = frameAt(total).x;
  return { at, frameAt, total, xRange: [R.from, xEnd] };
}

/** The river front into `w` (slot 'paint'). Returns { contract, stats }. */
export function buildForecourt(w, R = FORECOURT) {
  const C = FORECOURT_PAINT;
  const { at, frameAt, total, xRange } = forecourtFrame(R);
  const W = R.widths;
  const stats = { width: +total.toFixed(1), xRange: xRange.map((v) => +v.toFixed(1)), quads: 0, pale: 0, flipped: 0 };
  const contract = createContract('river front');

  // A quad that faces `want` (a direction, or 'up'): flipped if its winding says otherwise.
  const face = (a, b, c, d, colour, want) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const d0 = want === 'up' ? n[1] : n[0] * want[0] + n[1] * want[1] + n[2] * want[2];
    if (d0 < 0) { w.quad('paint', d, c, b, a, colour); stats.flipped++; } else w.quad('paint', a, b, c, d, colour);
    stats.quads++;
  };
  // A block over [u0, u1] x [o0, o1] from yb up to its top (a number, or (u, o) => y); its sides face out.
  const block = (u0, u1, o0, o1, yb, top, colour, sideColour = colour) => {
    const yt = typeof top === 'function' ? top : () => top;
    const T = (u, o) => at(u, o, yt(u, o)), B = (u, o) => at(u, o, yb);
    const mid = at((u0 + u1) / 2, (o0 + o1) / 2, 0);
    const out = (p) => [p[0] - mid[0], 0, p[2] - mid[2]];
    face(T(u0, o0), T(u1, o0), T(u1, o1), T(u0, o1), colour, 'up');
    const side = (ua, oa, ub, ob) => {
      const p = at((ua + ub) / 2, (oa + ob) / 2, 0);
      face(B(ua, oa), B(ub, ob), T(ub, ob), T(ua, oa), sideColour, out(p));
    };
    side(u0, o0, u1, o0); // river side
    side(u1, o0, u1, o1);
    side(u1, o1, u0, o1);
    side(u0, o1, u0, o0);
  };

  // Across the bank: where each part starts.
  const uStair = W.planter, uCheek = uStair + W.stair, uCascade = uCheek + W.cheek, uCascadeEnd = uCascade + W.cascade;
  const uc = uCascade + W.cascade / 2;
  const K = R.cascade, depth = F.crest - F.foot, d = depth / K.tiers;
  const tierTop = (k) => slopeAt(F.foot + (k + 1) * d) + K.lift;

  // --- The cascade: tiers of tread and riser, cut in cells; pale cells draw the arches ----------
  const a = W.cascade / (2 * K.arches), vs = K.spring * depth, H = K.apex * depth - vs, Rr = (a * a + H * H) / (2 * a);
  /** Does an arch line cross the cell [u0, u1] x [v0, v1] (u across the cascade, v up its depth)? */
  const pale = (u0, u1, v0, v1) => {
    for (let j = 0; j <= 2 * K.arches; j += 2) {
      const leg = j * a; // the legs, shared by neighbouring arches
      if (v0 < vs && u0 <= leg && leg <= u1) return true;
    }
    for (let j = 0; j < K.arches; j++) {
      const c = (2 * j + 1) * a;
      for (const [cx, lo, hi] of [[c + a - Rr, c, c + a], [c - a + Rr, c - a, c]]) {
        const s0 = Math.max(lo, u0), s1 = Math.min(hi, u1);
        if (s0 > s1) continue;
        const vAt = (u) => vs + Math.sqrt(Math.max(0, Rr * Rr - (u - cx) * (u - cx)));
        const lo2 = Math.min(vAt(s0), vAt(s1)), hi2 = Math.max(vAt(s0), vAt(s1));
        if (hi2 >= v0 && lo2 <= v1) return true;
      }
    }
    return false;
  };
  const cells = Math.max(1, Math.round(W.cascade / K.cell));
  const toRiver = (u, o) => { const f = frameAt(u); return [-f.nx, 0, -f.nz]; };
  for (let k = 0; k < K.tiers; k++) {
    const o0 = F.foot + k * d, o1 = o0 + d, y = tierTop(k), yLow = k ? tierTop(k - 1) : slopeAt(F.foot) - 0.05;
    for (let i = 0; i < cells; i++) {
      const u0 = uCascade + (i * W.cascade) / cells, u1 = uCascade + ((i + 1) * W.cascade) / cells;
      const p = pale(u0 - uCascade, u1 - uCascade, o0 - F.foot, o1 - F.foot);
      if (p) stats.pale++;
      face(at(u0, o0, y), at(u1, o0, y), at(u1, o1, y), at(u0, o1, y), p ? C.pattern : C.cascade, 'up');
      face(at(u0, o0, yLow), at(u1, o0, yLow), at(u1, o0, y), at(u0, o0, y), p ? C.patternShade : C.cascadeRiser, toRiver(u0, o0));
    }
  }
  contract.range('cascade: rise per tier (m)', tierTop(1) - tierTop(0), 0.15, 0.4);
  contract.range('cascade: share of pale cells (the arch lines)', stats.pale / (cells * K.tiers), 0.08, 0.35);
  contract.max('cascade: highest tread above the crest (m)', tierTop(K.tiers - 1) - F.crestY, 0.1);

  // --- Cheek walls along both edges, stepping with the tiers ------------------------------------
  for (const [u0, u1] of [[uCheek, uCascade], [uCascadeEnd, uCascadeEnd + W.cheek]]) {
    for (let k = 0; k < K.tiers; k++) {
      const o0 = F.foot + k * d;
      block(u0, u1, o0, o0 + d, slopeAt(o0) - 0.3, tierTop(k) + K.cheek, C.white, C.whiteShade);
    }
  }

  // --- Narrow stairs beside the cheeks, then the stepped planters with flowers --------------------
  const S = R.stair, ds = depth / S.steps;
  for (const [u0, u1] of [[uStair, uCheek], [uCascadeEnd + W.cheek, uCascadeEnd + W.cheek + W.stair]]) {
    for (let k = 0; k < S.steps; k++) {
      const o0 = F.foot + k * ds, top = slopeAt(o0 + ds) + K.lift;
      block(u0, u1, o0, o0 + ds, slopeAt(o0) - 0.2, top, k % 2 ? C.white : C.whiteStep, C.whiteShade);
    }
  }
  stats.stair = { rise: +((F.crestY - footY) / S.steps).toFixed(3), tread: +ds.toFixed(2) };
  contract.range('side stairs: rise per step (m)', stats.stair.rise, 0.12, 0.2);
  const P = R.planter, dp = depth / P.steps;
  for (const [u0, u1] of [[0, uStair], [uCascadeEnd + W.cheek + W.stair, total]]) {
    for (let k = 0; k < P.steps; k++) {
      const o0 = F.foot + k * dp, top = slopeAt(o0 + dp) + P.height;
      block(u0, u1, o0, o0 + dp, slopeAt(o0) - 0.3, top, C.white, C.whiteShade);
      block(u0 + P.inset, u1 - P.inset, o0 + P.inset, o0 + dp - P.inset, top - 0.05, top + P.flowers, k % 2 ? C.flowers : C.flowersDeep, C.leaves);
    }
  }

  // --- The plinth at the crest: a white lattice wall with the name panel in the middle -----------
  const Q = R.plinth, base = slopeAt(Q.offset) - 0.2, o0 = Q.offset, o1 = Q.offset + Q.depth;
  block(uc - Q.width / 2, uc + Q.width / 2, o0, o1, base, base + Q.height + 0.2, C.white, C.whiteShade);
  // its river face, in cells a hair in front: lattice lines on the diagonals, the panel plain
  const front = o0 - 0.02, n = Math.round(Q.width / Q.cell), m = Math.round(Q.height / Q.cell);
  const signL = uc - Q.sign.width / 2, signR = uc + Q.sign.width / 2, signB = base + 0.2 + Q.sign.lift, signT = signB + Q.sign.height;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const u0 = uc - Q.width / 2 + i * Q.cell, y0 = base + 0.2 + j * Q.cell;
      const inSign = u0 + Q.cell > signL && u0 < signR && y0 + Q.cell > signB && y0 < signT;
      if (inSign || ((i + j) % 3 && (i - j + 300) % 3)) continue; // only the lattice's lines get a cell
      face(at(u0, front, y0), at(u0 + Q.cell, front, y0), at(u0 + Q.cell, front, y0 + Q.cell), at(u0, front, y0 + Q.cell), C.lattice, toRiver(u0, front));
    }
  }
  // the name: a block per letter, centred, two lines
  const Lt = R.letters;
  let glyphs = 0;
  Lt.lines.forEach((text, li) => {
    const [gw, gh] = Lt.size[li], pitch = Lt.pitch[li];
    const y0 = signT - 0.2 - (li + 1) * gh - li * Lt.gap;
    const left = uc - (text.length * pitch) / 2;
    [...text].forEach((ch, k) => {
      if (ch === ' ') return;
      const u0 = left + k * pitch + (pitch - gw) / 2;
      face(at(u0, front - 0.02, y0), at(u0 + gw, front - 0.02, y0), at(u0 + gw, front - 0.02, y0 + gh), at(u0, front - 0.02, y0 + gh), C.sign, toRiver(u0, front));
      glyphs++;
    });
  });
  contract.is('name: letter blocks', glyphs, Lt.lines.join('').replace(/ /g, '').length);
  contract.max('name: widest line within the panel (m)', Math.max(...Lt.lines.map((t, i) => t.length * Lt.pitch[i])) - Q.sign.width, 0);

  // --- Flagpoles behind the plinth, flags hanging limp --------------------------------------------
  const G = R.flags;
  const schemes = [[C.flagRed, C.flagWhite], [C.flagYellow, C.flagRed], [C.flagRed, C.flagWhite]];
  for (let i = 0; i < G.count; i++) {
    const u = uc + (i - (G.count - 1) / 2) * G.spacing, y0 = slopeAt(G.offset) - 0.1;
    block(u - G.pole / 2, u + G.pole / 2, G.offset, G.offset + G.pole, y0, y0 + G.height, C.pole);
    const f = frameAt(u), tx = -f.nz, tz = f.nx; // along the bank
    const top = at(u, G.offset + G.pole / 2, y0 + G.height - 0.2);
    const [fw, fh] = G.flag, bands = 4, [c0, c1] = schemes[i % schemes.length];
    for (let b = 0; b < bands; b++) {
      const t0 = b / bands, t1 = (b + 1) / bands;
      const p = (s, t) => [top[0] + tx * s * fw * (1 - G.droop * t), top[1] - t * fh, top[2] + tz * s * fw * (1 - G.droop * t)];
      const q = [p(0, t0), p(1, t0), p(1, t1), p(0, t1)];
      const col = b % 2 ? c1 : c0;
      w.quad('paint', q[0], q[1], q[2], q[3], col);
      w.quad('paint', q[3], q[2], q[1], q[0], col); // two-sided
      stats.quads += 2;
    }
  }

  // --- Checks -------------------------------------------------------------------------------------
  contract.range('total width along the bank (m)', total, 25, 45);
  contract.min('starts where the embankment is full height (waterline x)', xRange[0] - F.lawnFrom[1], 0);
  contract.max('ends before the last station of the waterline (waterline x)', xRange[1] - SITE.farLine[SITE.farLine.length - 2][0], 0);
  const assemblyFront = SITE.assembly.z + 82; // ASSEMBLY.kiosks.rowZ: the kiosks' row in front of the building
  const far = at(uc, R.flags.offset + 1);
  contract.min('stands in front of the Assembly kiosks (m)', far[2] - assemblyFront, 10);
  stats.triangles = w.triangles().paint ?? 0;
  contract.range('triangles (river front)', stats.quads * 2, 2000, 8000);
  return { contract: contract.assert(), stats };
}

/** Is a point of the far bank, given by its waterline x and offset inland, under the river front? */
export function underForecourt(xWater, offset, R = FORECOURT) {
  const { xRange } = FRAME ?? (FRAME = forecourtFrame(R));
  return xWater >= xRange[0] - 0.5 && xWater <= xRange[1] + 0.5 && offset >= F.foot - 0.5 && offset <= R.flags.offset + 1;
}
let FRAME = null;
