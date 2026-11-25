// Where the plants of #/interior stand, as data: the grass ticks of the far slope
// (outside/banks.js), the far-bank planting, the room's plants and the vines beside the windows
// (interior/vines.js). flora-stylised.js grows the stylised plants at these entries.

import { mulberry32 } from './outside/site.js';

/**
 * The `?flora=` flag: 'stylised' (the stylised plants, flora-stylised.js; the default, the user's
 * choice, 25 Nov 2026) or null (?flora=off).
 */
export function floraMode(params) {
  const f = params.get('flora') ?? 'stylised';
  return f === 'stylised' ? f : null;
}

/** The vines beside the windows (interior/vines.js): anchor, top and bottom of each. */
export function windowVineLayout(PLAN) {
  const { z0, x1 } = PLAN.room;
  const [w1, w2, w3] = PLAN.backWindows;
  return [
    { x: w1.x1 + 0.2, z: z0, yTop: 2.3, yBottom: 1.45, alongX: true },
    { x: w2.x0 - 0.16, z: z0, yTop: 2.3, yBottom: 1.7, alongX: true },
    { x: w3.x1 + 0.08, z: z0, yTop: 2.45, yBottom: 1.25, alongX: true },
    { x: w3.x1 + 0.03, z: z0 + 0.15, yTop: 2.4, yBottom: 1.6, alongX: true },
    { x: x1, z: PLAN.sideWindow.z0 - 0.2, yTop: 2.35, yBottom: 1.0, alongX: false },
  ];
}

/**
 * Patches of the grass blades of the banks, read back from their geometry: each blade's root is
 * binned in a grid (3 m cells within 40 m of the house, 12 m beyond) per kind of blade, which is
 * told apart by its paint. `colours` maps a group name to an [r, g, b] paint (banks.js BANK_PAINT).
 * Returns marker entries { group, kind: 'patch', at, width, height, blades }.
 */
export function bladePatches(slot, from, colours) {
  const P = slot.position, C = slot.color;
  const groups = Object.entries(colours);
  const cells = new Map();
  for (let t = from; t < slot.triangles; t++) {
    const o = t * 9;
    const r = C[o], g = C[o + 1], b = C[o + 2];
    const hit = groups.find(([, c]) => Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b) < 1e-4);
    if (!hit) continue;
    const xs = [P[o], P[o + 3], P[o + 6]], ys = [P[o + 1], P[o + 4], P[o + 7]], zs = [P[o + 2], P[o + 5], P[o + 8]];
    const x = (xs[0] + xs[1]) / 2, z = (zs[0] + zs[1]) / 2;
    const near = Math.hypot(x, z + 5) < 40;
    const size = near ? 3 : 12;
    const key = `${hit[0]}|${near}|${Math.floor(x / size)}|${Math.floor(z / size)}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { group: hit[0], n: 0, sx: 0, sz: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity }));
    c.n++;
    c.sx += x;
    c.sz += z;
    for (let k = 0; k < 3; k++) {
      c.x0 = Math.min(c.x0, xs[k]); c.x1 = Math.max(c.x1, xs[k]);
      c.z0 = Math.min(c.z0, zs[k]); c.z1 = Math.max(c.z1, zs[k]);
      c.y0 = Math.min(c.y0, ys[k]); c.y1 = Math.max(c.y1, ys[k]);
    }
  }
  return [...cells.values()].map((c) => ({
    group: c.group,
    kind: 'patch',
    at: [c.sx / c.n, c.y0, c.sz / c.n],
    width: Math.max(0.3, Math.max(c.x1 - c.x0, c.z1 - c.z0)),
    height: Math.max(0.05, c.y1 - c.y0),
    yaw: 0,
    blades: c.n,
  }));
}

/**
 * PROPOSED planting for the far bank (grown by flora-stylised.js): a
 * composition to try before the plants are made. Every position and size is a design guess,
 * not taken from a photo or survey. `place(xWater, offset)` comes from the far bank (banks.js);
 * `forecourt` is the x range of the waterline the Assembly's river front stands on, kept clear.
 *  - a tree line on the natural bank left of the embankment, in clumps with gaps, behind the
 *    bridge: it gives the flat meadow a skyline;
 *  - a pair of tall trees each side of the forecourt, framing its stairs;
 *  - street trees along the far path, evenly spaced, both sides of the forecourt;
 *  - trees on the terrace behind the crest, their crowns showing over it, either side of the Assembly;
 *  - low bushes at the foot of the embankment, right of the forecourt.
 */
// Oak bushes and bougainvillea round each side stair (design guesses): a low row along the foot
// of the planter beside the stair, and a loose drift up the slope outside it, taller at the back.
const STEP_PLANTING = [
  [0.6, 13.8, 'bougainvillea', 1.6], [1.9, 13.6, 'oak bush', 1.1], [3.1, 13.9, 'bougainvillea', 1.4],
  [-1.0, 15.6, 'oak bush', 1.4], [-2.4, 16.4, 'bougainvillea', 2.0], [-1.3, 18.6, 'oak bush', 1.6],
  [-3.6, 19.2, 'oak bush', 1.3], [-1.8, 21.6, 'bougainvillea', 2.4], [-3.2, 23.4, 'oak bush', 1.8],
  [-1.2, 25.2, 'bougainvillea', 2.2],
];

export function farBankProposal({ place, forecourt: [f0, f1], rand, stepPlanting = false }) {
  const out = [];
  // Each plant gets its own size and shape (the user's ask: randomise height, width, leaves): a
  // height jitter and `squash` (width over a uniform scale) from a second stream, so the places
  // above stay as they were. Ranges are design choices.
  const vary = mulberry32(4441);
  // `line`: the waterline x the plant was placed from (used to drop the right-hand planting below).
  const add = (group, kind, at, height, width, line) => {
    const h = height * (0.85 + vary() * 0.3), squash = 0.78 + vary() * 0.44;
    out.push({ group, kind, at, height: h, width: width * squash, squash, yaw: rand() * Math.PI * 2, line });
  };
  // Tree line on the meadow: clumps of 3-5 along the crest distance, gaps between them.
  for (let x = -240; x < -12; ) {
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++, x += 4 + rand() * 3) add('proposed: rain tree (meadow line)', 'tree', place(x, 28 + rand() * 18), 9 + rand() * 6, 6 + rand() * 3);
    x += 6 + rand() * 8;
  }
  // Left of the bridge (upstream), the user's ask: a taller back row behind the line, and loose
  // groups nearer the water, so that side reads wooded.
  for (let x = -230; x < -20; x += 9 + rand() * 6) add('proposed: rain tree (meadow back)', 'tree', place(x, 55 + rand() * 30), 12 + rand() * 6, 8 + rand() * 3);
  for (let x = -210; x < -35; x += 14 + rand() * 12) for (let i = 0; i < 2; i++) add('proposed: pedada (Sonneratia caseolaris)', 'tree', place(x + i * 4.5, 12 + rand() * 8), 7 + rand() * 4, 5 + rand() * 2);
  // Framing pairs either side of the forecourt, on the slope above the path.
  // (stepPlanting, the user's choice under ?flora=stylised: oak bushes and bougainvillea round the
  // side stairs in place of the trees. [d, offset, plant, height]: d metres along the waterline
  // from the forecourt's end, outwards when negative; the same pattern mirrored on the right.)
  if (!stepPlanting) for (const [x, o] of [[f0 - 3, 17], [f0 - 6.5, 21], [f1 + 3, 17], [f1 + 6.5, 21]]) add('proposed: rain tree (forecourt)', 'tree', place(x, o), 12 + rand() * 2, 7);
  else
    for (const [d, o, kind, h] of STEP_PLANTING)
      for (const x of [f0 + d, f1 - d]) add(`proposed: step planting (${kind})`, 'bush', place(x, o + rand() * 0.4), h * (0.9 + rand() * 0.2), h * 1.3);
  // Street trees on the far path, every 12 m, clear of the forecourt and the bridge's pier.
  for (let x = -66; x <= 66; x += 12) if ((x < f0 - 10 || x > f1 + 10) && Math.abs(x + 22) > 6) add('proposed: rain tree (street)', 'tree', place(x, 9.3), 6 + rand() * 1.5, 4, x);
  // Terrace trees behind the crest, either side of the Assembly.
  for (const x of [f1 + 20, f1 + 28, f1 + 40, 60, 72]) add('proposed: rain tree (terrace)', 'tree', place(x, 48 + rand() * 20), 11 + rand() * 4, 7 + rand() * 2, x);
  // Bushes along the embankment's foot, right of the forecourt, in threes.
  for (let x = f1 + 12; x < f1 + 46; x += 11) for (let i = 0; i < 3; i++) add('proposed: nipah palm (Nypa fruticans)', 'bush', place(x + i * 1.6, 15.6 + rand() * 0.6), 1.2 + rand() * 0.5, 1.8 + rand() * 0.6, x);
  if (stepPlanting) {
    // More trees left of the stairs (the user's ask: "put bit more trees there"), between the
    // stair planting and the meadow line: [waterline x from the forecourt's left end, offset].
    // Last, with their own random stream, so the plants above keep their places and sizes.
    const r = mulberry32(7717);
    for (const [dx, o] of [[-6, 19], [-9.5, 24], [-5, 27], [-13, 21], [-12, 30]]) add('proposed: rain tree (by the stairs)', 'tree', place(f0 + dx, o + r() * 2), 10 + r() * 4, 7);
    // The trees nearest the stairs turn their lit side to the window (the user's ask: "make it
    // face us more"); flora-stylised.js sets the turn from the eye. The 45 m reach is a design choice.
    const stairs = [place(f0, 14), place(f1, 14)];
    // They are also drawn with the near (detailed) model whatever their distance, with smaller leaf
  // clumps (0.65, by eye) so the crown reads as leaves, not big balls (the user's asks).
    for (const e of out) if (e.kind === 'tree' && stairs.some((s) => Math.hypot(e.at[0] - s[0], e.at[2] - s[2]) < 45)) Object.assign(e, { faceEye: true, lod: 'near', leaves: 0.65 });
    // The street trees, terrace trees and nipah right of the forecourt go (the user's ask: the room
    // shows little of them; at most a few through the side window, checked by ray tests from each
    // view's eye through the window openings). Dropped last, so the other plants keep their draws.
    return out.filter((e) => !(e.line > f1 && /\((street|terrace)\)|nipah/.test(e.group)));
  }
  return out;
}

/**
 * PROPOSED (markers only, design guesses): one long trough planter on each back window's ledge
 * (the lattice rail, room.js: top at window.lattice + 0.06, its room face 1.5 cm into the room),
 * its foliage mounded on top and leaves spilling a little over the room side.
 */
/**
 * Placeholder plants inside the room, away from the window ledges. After interior-design guides:
 * mix upright and trailing shapes, let trailers spill down, repeat the trailing look of the ledge
 * troughs elsewhere, and keep plants back from the glass. Sizes are guesses.
 */
export function roomPlantsProposal(PLAN) {
  const { z0 } = PLAN.room;
  const [w0] = PLAN.backWindows;
  const table = PLAN.tables[0];
  const out = [];
  // Upright floor plant on the wall between the left window and the settee.
  const gapX = (w0.x1 + (PLAN.settee.x - PLAN.settee.w / 2)) / 2;
  out.push({ group: 'proposed: floor pot (upright)', kind: 'planter', at: [gapX, 0, z0 + 0.3], width: 0.28, height: 0.3, yaw: 0 });
  out.push({ group: 'proposed: Chinese evergreen (floor)', kind: 'fern', at: [gapX, 0.25, z0 + 0.3], width: 0.38, height: 0.75, yaw: 0 });
  // Tall upright plant in the back-left corner, clear of the window.
  out.push({ group: 'proposed: floor pot (upright)', kind: 'planter', at: [w0.x0 - 0.5, 0, z0 + 0.4], width: 0.4, height: 0.4, yaw: 0 });
  out.push({ group: 'proposed: rubber plant (Ficus elastica)', kind: 'fern', at: [w0.x0 - 0.5, 0.35, z0 + 0.4], width: 0.6, height: 1.2, yaw: 0 });
  // A small upright pot on the back low table.
  const tx = table.x0 + 0.3, tz = (table.z0 + table.z1) / 2;
  out.push({ group: 'proposed: table pot (small upright)', kind: 'planter', at: [tx, table.h, tz], width: 0.14, height: 0.12, yaw: 0 });
  out.push({ group: 'proposed: Chinese evergreen (table)', kind: 'bush', at: [tx, table.h + 0.1, tz], width: 0.18, height: 0.18, yaw: 0 });
  // A low plant stand about 0.9 m in front of the left window (below its rail, so the view stays
  // open), its trailer spilling down the front: repeats the troughs. On the right it would hide
  // behind the front armchair.
  const sx = (w0.x0 + w0.x1) / 2 + 0.1, sz = z0 + 0.9, standH = 0.6;
  out.push({ group: 'proposed: plant stand', kind: 'planter', at: [sx, 0, sz], width: 0.3, height: standH, yaw: 0 });
  out.push({ group: 'proposed: satin pothos (stand)', kind: 'bush', at: [sx, standH - 0.03, sz], width: 0.4, height: 0.22, yaw: 0 });
  out.push({ group: 'proposed: satin pothos trailing', kind: 'vine', at: [sx, standH - 0.4, sz + 0.17], width: 0.26, height: 0.4, depth: 0.15, yaw: 0 });
  return out;
}

export function windowHangingProposal(PLAN, { skipMiddle = false } = {}) {
  const { z0 } = PLAN.room;
  const ledge = PLAN.window.lattice + 0.06;
  const depth = 0.14, front = z0 + 0.05; // overhangs the rail's room face by 3.5 cm
  const zc = front - depth / 2, tall = 0.14;
  const out = [];
  // Only the two left windows (lowest x); each trough covers about half its ledge, at the left end.
  // skipMiddle (?flora=stylised, the user's choice): the middle window keeps its ledge bare.
  [...PLAN.backWindows].sort((a, b) => a.x0 - b.x0).slice(0, 2).forEach((w, i) => {
    if (skipMiddle && i === 1) return;
    const span = w.x1 - w.x0, len = span * 0.5, x = w.x0 + 0.05 + len / 2; // left end of the ledge
    out.push({ group: 'proposed: ledge trough', kind: 'planter', at: [x, ledge, zc], width: len, height: tall, depth, yaw: 0 });
    out.push({ group: 'proposed: satin pothos (ledge)', kind: 'bush', at: [x, ledge + tall - 0.04, zc], width: len * 1.1, height: 0.22, depth: depth * 1.5, yaw: 0 });
    const drop = [0.3, 0.38][i];
    out.push({ group: 'proposed: satin pothos trailing (ledge)', kind: 'vine', at: [x, ledge + tall - drop, front + 0.02], width: len * 0.7, height: drop, depth: 0.15, yaw: 0 });
  });
  return out;
}
