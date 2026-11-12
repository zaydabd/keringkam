// The river taxis of Kuching (perahu tambang, "penambang"): small covered sampans that ferry people
// across the Sarawak River, rowed standing at the stern or pushed by a small outboard.
// Built like assembly.js: settings -> a serialisable plan (parts in build order, checked) ->
// registered part builders -> triangles in the 'paint' slot.
//
// Sourced: they are covered sampans carrying up to about 10-12 passengers
// (https://www.theborneopost.com/2024/05/29/iconic-sarawak-perahu-tambang-boats-embrace-modern-tech/,
// https://www.malaymail.com/news/malaysia/2025/08/31/kuchings-iconic-river-boat-goes-green-with-electric-powered-penambang-fleet-under-smart-city-plan/189520).
// No published dimensions were found. Every size below is read off photos (research/CREDITS.md,
// B1-B4), mostly a broadside one (B3, "Kuching river taxi 02"), scaled by the boatman's head
// (about 0.23 m with his cap): estimates, not measured data. Parts, bottom to top:
//   - a narrow hull drawn to a point at both ends, the ends rising; painted in bands: a dark or
//     teal bottom, a light rub stripe, the main colour up to the gunwale;
//   - a closed cabin over the after two thirds, a row of small windows, a door near the stern;
//     an open porch at the bow under the roof, a raking strut at its front;
//   - a long roof, nearly flat across the beam, low over the middle, swept up hard at the bow
//     and a little at the stern; a hatch on its after end;
//   - the boatman standing on the stern deck with a long oar.

import { createContract } from './contract.js';
import { rgbTable } from './site.js';
import { OUTSIDE_THEME } from '../themes/outside.js';

export const PENAMBANG = {
  length: 6.2, // overall, stem to stern (B3: 892 px at ~143 px per metre)
  beam: 1.5, // estimated (B3 is broadside; B1, B2 show a beam of about a quarter of the length)
  draft: 0.25, // estimated
  // the gunwale above the water: low amidships, rising to both tips, the stern higher (B3, traced
  // along the hull's stripe)
  sheer: { mid: 0.33, bow: 0.53, stern: 0.62, power: [1.2, 2.9] }, // power: towards the bow, the stern
  // the bottom: a near-upright stem at the bow, lifting clear of the water over the last half metre
  // at the stern (B3): [power, keel height at the tip]
  rocker: { bow: [10, 0], stern: [5, 0.35] },
  bands: { strake: 0.09, stripe: 0.08 }, // below the gunwale: a top strake, then the stripe, then the bottom colour (B3)
  // x from midships, bow +x; the windows sit high, just under the roof (B3); the stern opening is large
  cabin: { front: 1.73, back: -2.4, door: [-2.28, -1.62], windows: { from: 0.43, count: 3, width: 0.55 }, sill: 0.76, head: 0.85 },
  roof: {
    front: 3.62, // the roof reaches past the stem
    back: -2.44,
    low: 0.92, // its edge above the water over the middle
    bow: [0.6, 0.92, 1.8], // sweep at the bow: starts at x, rises this much by the front, power (B3, traced)
    stern: [-0.9, 0.2, 1.6], // and at the stern
    overhang: 0.1, // past the hull's side
    rise: 0.45, // the ridge above the eaves (B1: the stern gable; B3: the roof's top seen from low down)
    taper: 2.6, // from here to the front the roof narrows and its ridge sinks into the tip (B1, B3)
    fascia: 0.1,
    hatch: { from: -2.3, to: -0.4, inner: 0.08, outer: 0.72, lift: 0.06 }, // B1, B3: a raised panel on the after roof (u across)
  },
  boatman: { x: -2.55, deck: 0.2, height: 1.65 }, // just aft of the roof (B1, B3)
  stations: 18,
};

// Colours (themes/outside.js): each boat is painted its own bright colours, chosen from the photos.
export const SCHEMES = OUTSIDE_THEME.boats.schemes;
const SHADE = OUTSIDE_THEME.boats.shade;

/** Parts in build order. Pure data: no geometry. */
export function planBoat(settings = PENAMBANG, scheme = 'red') {
  if (!SCHEMES[scheme]) throw new Error(`boats: no colour scheme ${scheme}`);
  const parts = ['hull', 'deck', 'cabin', 'porch', 'roof', 'hatch', 'boatman'].map((part) => ({ part }));
  return { settings, scheme, parts };
}

// --- geometry in the boat's frame: x along the boat (bow +x), y up from the water, z across ------

/** Half-beam at x: pointed at both ends, fuller towards the bow. */
function halfBeam(B, x) {
  const t = (2 * x) / B.length; // -1 stern .. 1 bow
  const p = t > 0 ? 2.2 : 1.8;
  return Math.max(0.03, (B.beam / 2) * (1 - Math.abs(t) ** p));
}
/** Station i of B.stations along the boat, closer together towards the tips. */
const stationX = (B, i) => (-B.length / 2) * Math.cos((Math.PI * i) / B.stations);
/** Gunwale height at x. */
function sheerAt(B, x) {
  const t = (2 * x) / B.length;
  const end = t > 0 ? B.sheer.bow : B.sheer.stern;
  return B.sheer.mid + (end - B.sheer.mid) * Math.abs(t) ** B.sheer.power[t > 0 ? 0 : 1];
}
/** The roof's edge height at x (B3, fitted). */
export function roofAt(B, x) {
  const R = B.roof;
  const bow = x > R.bow[0] ? R.bow[1] * ((x - R.bow[0]) / (R.front - R.bow[0])) ** R.bow[2] : 0;
  const stern = x < R.stern[0] ? R.stern[1] * ((R.stern[0] - x) / (R.stern[0] - R.back)) ** R.stern[2] : 0;
  return R.low + bow + stern;
}

const PARTS = {
  hull({ B, w, at, C }) {
    // a section is a polyline across the boat, keel to gunwale on each side, coloured in bands;
    // stations bunch towards the tips, where the bottom and the bands curve up
    const n = B.stations;
    const section = (x) => {
      const t = Math.abs((2 * x) / B.length), h = halfBeam(B, x), g = sheerAt(B, x);
      const [power, tip] = x > 0 ? B.rocker.bow : B.rocker.stern;
      const keel = -B.draft + (B.draft + tip) * t ** power;
      const y2 = g - B.bands.strake, y1 = y2 - B.bands.stripe;
      const side = (s) => [[x, keel, s * h * 0.45], [x, y1, s * h * 0.97], [x, y2, s * h], [x, g, s * h]];
      return [...side(-1).reverse(), ...side(1)]; // -z gunwale ... keel ... +z gunwale
    };
    const colors = [C.hull, C.stripe, C.bottom, C.bottom, C.bottom, C.stripe, C.hull];
    for (let i = 0; i < n; i++) {
      const x0 = stationX(B, i), x1 = stationX(B, i + 1);
      const a = section(x0), b = section(x1);
      for (let k = 0; k < a.length - 1; k++) w.quad('paint', at(...a[k]), at(...b[k]), at(...b[k + 1]), at(...a[k + 1]), colors[k]);
      // the inside of the sides, above the floor (seen over the gunwale and through the porch)
      for (const s of [-1, 1]) {
        const p = (x, y) => at(x, y, s * (halfBeam(B, x) - 0.02));
        const q = [p(x0, B.boatman.deck), p(x1, B.boatman.deck), p(x1, sheerAt(B, x1)), p(x0, sheerAt(B, x0))];
        if (s < 0) w.quad('paint', q[0], q[1], q[2], q[3], C.hull);
        else w.quad('paint', q[1], q[0], q[3], q[2], C.hull);
      }
    }
    // the gunwale's top edge, a light cap, where no cabin wall stands on it
    for (let i = 0; i < n; i++) {
      const x0 = stationX(B, i), x1 = stationX(B, i + 1);
      if (x0 >= B.cabin.back && x1 <= B.cabin.front) continue;
      for (const s of [-1, 1]) {
        const p = (x, d) => at(x, sheerAt(B, x) + 0.01, s * (halfBeam(B, x) + d));
        const q = [p(x0, -0.06), p(x1, -0.06), p(x1, 0.02), p(x0, 0.02)];
        if (s > 0) w.quad('paint', q[0], q[3], q[2], q[1], C.frame);
        else w.quad('paint', q[0], q[1], q[2], q[3], C.frame);
      }
    }
  },
  deck({ B, w, at, C }) {
    // dark floor inside, seen through the porch and over the stern
    const y = B.boatman.deck;
    const xs = [-B.length / 2 + 0.15, B.length / 2 - 0.2];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x0 = xs[0] + ((xs[1] - xs[0]) * i) / n, x1 = xs[0] + ((xs[1] - xs[0]) * (i + 1)) / n;
      const h0 = halfBeam(B, x0) - 0.02, h1 = halfBeam(B, x1) - 0.02;
      w.quad('paint', at(x0, y, h0), at(x1, y, h1), at(x1, y, -h1), at(x0, y, -h0), C.deck);
    }
  },
  cabin({ B, w, at, C }) {
    // the side walls rise flush from the hull sides to the roof (B1, B3: one painted surface);
    // windows and a door are dark panes laid just outside them
    const K = B.cabin;
    const n = 8;
    const top = (x) => roofAt(B, x) - 0.02;
    for (const s of [-1, 1]) {
      const z = (x, d = 0) => s * (halfBeam(B, x) + d);
      for (let i = 0; i < n; i++) {
        const x0 = K.back + ((K.front - K.back) * i) / n, x1 = K.back + ((K.front - K.back) * (i + 1)) / n;
        const q = [at(x0, sheerAt(B, x0), z(x0)), at(x1, sheerAt(B, x1), z(x1)), at(x1, top(x1), z(x1)), at(x0, top(x0), z(x0))];
        if (s > 0) w.quad('paint', q[0], q[1], q[2], q[3], C.cabin);
        else w.quad('paint', q[1], q[0], q[3], q[2], C.cabin);
      }
      const pane = (xa, xb, ya, yb, color) => {
        const q = [at(xa, ya, z(xa, 0.02)), at(xb, ya, z(xb, 0.02)), at(xb, yb, z(xb, 0.02)), at(xa, yb, z(xa, 0.02))];
        if (s > 0) w.quad('paint', q[0], q[1], q[2], q[3], color);
        else w.quad('paint', q[1], q[0], q[3], q[2], color);
      };
      const Wn = K.windows, span = (Wn.from - (K.door[1] + 0.05)) / Wn.count; // a row from Wn.from aft to the door
      for (let k = 0; k < Wn.count; k++) {
        const xb = Wn.from - span * k - (span - Wn.width) / 2;
        pane(xb - Wn.width, xb, K.sill, K.head, C.glass);
      }
      pane(K.door[0], K.door[1], K.sill - 0.22, top(K.door[0]) - 0.03, C.inside); // B3: a tall opening near the stern
    }
    // the bulkhead at the front of the cabin, facing the porch, with a dark doorway; and the back
    for (const [x, dir] of [[K.front, 1], [K.back, -1]]) {
      const h = halfBeam(B, x) - 0.03, y0 = sheerAt(B, x) - 0.2, y1 = roofAt(B, x);
      const q = [at(x, y0, h * dir), at(x, y0, -h * dir), at(x, y1, -h * dir), at(x, y1, h * dir)];
      w.quad('paint', q[0], q[1], q[2], q[3], C.cabin);
      const d = h - 0.12, xo = x + dir * 0.01; // B1: the ends stand open but for corner posts
      w.quad('paint', at(xo, y0 + 0.15, d * dir), at(xo, y0 + 0.15, -d * dir), at(xo, y1 - 0.1, -d * dir), at(xo, y1 - 0.1, d * dir), C.inside);
    }
  },
  porch({ B, w, at, C }) {
    // the open bow: a raking strut each side from the stem up to the roof's front (B3), and a post
    // at the front corners of the cabin
    const R = B.roof;
    for (const s of [-1, 1]) {
      const xs = B.length / 2 - 0.35;
      const foot = [xs, sheerAt(B, xs), s * (halfBeam(B, xs) - 0.02)];
      const head = [R.front - 0.15, roofAt(B, R.front - 0.15) - 0.05, s * (roofHalf(B, R.front - 0.15) - 0.1)];
      post(w, at, foot, head, 0.07, C.frame);
      const xc = B.cabin.front + 0.05;
      post(w, at, [xc, sheerAt(B, xc), s * (halfBeam(B, xc) - 0.03)], [xc, roofAt(B, xc), s * (halfBeam(B, xc) - 0.03)], 0.06, C.frame);
    }
  },
  roof({ B, w, at, C }) {
    // a pitched shell (B1: a ridge along the middle, a gable frame at each end): the top, the
    // underside, a fascia along both eaves and barge boards at both gables
    const R = B.roof;
    const n = 18;
    const X = (i) => R.back + ((R.front - R.back) * i) / n;
    const U = [-1, 0, 1];
    const P = (x, u, lift = 0) => [x, roofTop(B, x, u) + lift, u * roofHalf(B, x)];
    for (let i = 0; i < n; i++) {
      const x0 = X(i), x1 = X(i + 1);
      for (let j = 0; j < 2; j++) {
        const [u0, u1] = [U[j], U[j + 1]];
        face(w, at, [P(x0, u0), P(x0, u1), P(x1, u1), P(x1, u0)], [0, 1, 0], C.roof);
        face(w, at, [P(x0, u0, -0.03), P(x0, u1, -0.03), P(x1, u1, -0.03), P(x1, u0, -0.03)], [0, -1, 0], C.roofUnder);
      }
      for (const u of [-1, 1]) {
        face(w, at, [[x0, roofAt(B, x0), u * roofHalf(B, x0)], [x1, roofAt(B, x1), u * roofHalf(B, x1)], P(x1, u), P(x0, u)], [0, 0, u], C.fascia);
      }
    }
    for (const x of [R.front, R.back]) {
      for (let j = 0; j < 2; j++) {
        const [u0, u1] = [U[j], U[j + 1]];
        const q = [P(x, u0, -0.13), P(x, u1, -0.13), P(x, u1, 0.01), P(x, u0, 0.01)];
        face(w, at, q, [1, 0, 0], C.fascia);
        face(w, at, q, [-1, 0, 0], C.fascia);
      }
    }
  },
  hatch({ B, w, at, C }) {
    // a raised framed panel lying on each slope of the after roof (B3: white in a green frame; B1:
    // an orange-edged panel). Which slopes carry one is not visible in every photo: both do here.
    const H = B.roof.hatch, R = B.roof;
    const half = roofHalf(B, 0);
    const P = (x, u, lift) => [x, roofTop(B, x, u) + lift, u * half];
    const n = 4, f = 0.06;
    for (const s of [-1, 1]) {
      const ua = s * H.inner, ub = s * H.outer; // ridge side, eave side
      const panel = (xa, xb, u0, u1, lift, color) => {
        for (let i = 0; i < n; i++) {
          const x0 = xa + ((xb - xa) * i) / n, x1 = xa + ((xb - xa) * (i + 1)) / n;
          face(w, at, [P(x0, u0, lift), P(x0, u1, lift), P(x1, u1, lift), P(x1, u0, lift)], [0, 1, 0], color);
        }
      };
      panel(H.from, H.to, ua, ub, H.lift, C.hatchEdge);
      panel(H.from + f, H.to - f, ua + (s * f) / half, ub - (s * f) / half, H.lift + 0.005, C.hatch);
      for (let i = 0; i < n; i++) {
        const x0 = H.from + ((H.to - H.from) * i) / n, x1 = H.from + ((H.to - H.from) * (i + 1)) / n;
        for (const [u, out] of [[ua, -s], [ub, s]]) {
          face(w, at, [P(x0, u, -0.02), P(x1, u, -0.02), P(x1, u, H.lift), P(x0, u, H.lift)], [0, 0, out], C.hatchEdge);
        }
      }
      for (const [x, out] of [[H.to, 1], [H.from, -1]]) {
        face(w, at, [P(x, ua, -0.02), P(x, ub, -0.02), P(x, ub, H.lift), P(x, ua, H.lift)], [out, 0, 0], C.hatchEdge);
      }
    }
  },
  boatman({ B, w, at, C }) {
    // standing on the stern deck behind the cabin, facing the bow, an oar over the side (B1, B3, B4)
    const M = B.boatman;
    const y0 = M.deck, h = M.height;
    const box = (cx, cy, cz, hx, hy, hz, color) => w.box('paint', at(cx, cy, cz), dirX(at, hx), [0, hy, 0], dirZ(at, hz), color);
    box(M.x, y0 + h * 0.24, 0, 0.1, h * 0.24, 0.17, C.trousers);
    box(M.x, y0 + h * 0.64, 0, 0.12, h * 0.16, 0.2, C.shirt);
    box(M.x + 0.02, y0 + h * 0.88, 0, 0.1, h * 0.06, 0.09, C.skin);
    // the oar: from his hands, out over the starboard quarter into the water
    post(w, at, [M.x + 0.25, y0 + h * 0.62, 0.22], [M.x - 0.35, -0.4, halfBeam(B, M.x) + 0.55], 0.05, C.oar);
  },
};

/** How far the roof has narrowed and flattened towards its upswept bow tip, 0 .. 1 (B1, B3). */
function roofTaper(B, x) {
  const R = B.roof;
  return x > R.taper ? ((x - R.taper) / (R.front - R.taper)) ** 1.5 : 0;
}
/** Half the roof's width at x. */
const roofHalf = (B, x) => (B.beam / 2 + B.roof.overhang) * (1 - 0.4 * roofTaper(B, x));
/** The roof's top surface at x, u (-1 .. 1 across, 0 on the ridge). */
function roofTop(B, x, u) {
  return roofAt(B, x) + B.roof.fascia + B.roof.rise * (1 - roofTaper(B, x)) * (1 - Math.abs(u));
}

/** A quad given in the boat's frame, wound so that it faces `out` (a direction in the same frame). */
function face(w, at, q, out, color) {
  const e1 = q[1].map((v, i) => v - q[0][i]), e2 = q[2].map((v, i) => v - q[0][i]);
  const nrm = cross(e1, e2);
  const p = nrm[0] * out[0] + nrm[1] * out[1] + nrm[2] * out[2] >= 0 ? q : [q[1], q[0], q[3], q[2]];
  w.quad('paint', at(...p[0]), at(...p[1]), at(...p[2]), at(...p[3]), color);
}

/** A square post from a to b (boat frame), `t` thick, all four sides. */
function post(w, at, a, b, t, color) {
  const A = at(...a), Bp = at(...b);
  const axis = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]];
  const len = Math.hypot(...axis);
  const ax = axis.map((v) => v / len);
  const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(ax, ref)), v = cross(u, ax);
  const mid = A.map((p, i) => (p + Bp[i]) / 2);
  w.box('paint', mid, u.map((c) => (c * t) / 2), ax.map((c) => (c * len) / 2), v.map((c) => (c * t) / 2), color);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((c) => c / l);
};
const dirX = (at, k) => {
  const o = at(0, 0, 0), p = at(1, 0, 0);
  return [(p[0] - o[0]) * k, 0, (p[2] - o[2]) * k];
};
const dirZ = (at, k) => {
  const o = at(0, 0, 0), p = at(0, 0, 1);
  return [(p[0] - o[0]) * k, 0, (p[2] - o[2]) * k];
};

/**
 * Compiles a plan into the writer's 'paint' slot, placed at `place` = { x, z, ry } on water level
 * `y` (ry turns the bow from +x towards -z). Returns a report with the contract.
 */
export function compileBoat(plan, w, place = { x: 0, z: 0, ry: 0 }, y = 0) {
  const B = plan.settings;
  const C = rgbTable({ ...SCHEMES[plan.scheme], ...SHADE });
  const c = Math.cos(place.ry), s = Math.sin(place.ry);
  const at = (dx, dy, dz) => [place.x + dx * c + dz * s, y + dy, place.z - dx * s + dz * c];
  const before = w.slot('paint').triangles;
  for (const { part } of plan.parts) PARTS[part]({ B, w, at, C });
  const triangles = w.slot('paint').triangles - before;

  const R = B.roof;
  const contract = createContract('penambang');
  // proportions read off the photos (estimates), with tolerance
  contract.range('beam / length (B1, B2: about 0.25)', B.beam / B.length, 0.2, 0.3);
  contract.range('roof over the middle / length (B3 0.15)', R.low / B.length, 0.13, 0.17);
  contract.range('roof at the front / roof over the middle (B3 traced: 2.0)', roofAt(B, R.front) / R.low, 1.8, 2.3);
  contract.range('roof length / boat length (B3 0.98)', (R.front - R.back) / B.length, 0.92, 1.04);
  contract.range('cabin length / boat length (B3 0.67)', (B.cabin.front - B.cabin.back) / B.length, 0.6, 0.74);
  contract.range('boatman head above the water / roof over the middle (B3 1.95)', (B.boatman.deck + B.boatman.height) / R.low, 1.7, 2.2);
  contract.min('roof clears the gunwale everywhere along the cabin (m)', Math.min(...[B.cabin.back, 0, B.cabin.front].map((x) => roofAt(B, x) - sheerAt(B, x))), 0.3);
  contract.range('ridge rise / roof half-width (B3 fit 0.47; B1 about 0.75)', R.rise / (B.beam / 2 + R.overhang), 0.4, 0.9);
  contract.max('triangles', triangles, 1600);
  const color = w.slot('paint').color.slice(before * 9);
  contract.is('colour values that are not finite numbers', color.filter((v) => typeof v !== 'number' || !Number.isFinite(v)).length, 0);
  return { scheme: plan.scheme, triangles, contract: contract.assert() };
}
