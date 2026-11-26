// Where the riverside's plants stand, as data: the grass ticks of the far slope (riverside/banks.js)
// and the far-bank planting. vegetation/stylised.js grows the plants at these entries.

import { mulberry32 } from '../../../utils/rng.js';

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
 * PROPOSED planting for the far bank (grown by vegetation/stylised.js): a
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
    // More trees left of the stairs (the user's asks: "put bit more trees there", and two more on
    // 2026-11-26, the last two), between the
    // stair planting and the meadow line: [waterline x from the forecourt's left end, offset].
    // Last, with their own random stream, so the plants above keep their places and sizes.
    const r = mulberry32(7717);
    for (const [dx, o] of [[-6, 19], [-9.5, 24], [-5, 27], [-13, 21], [-12, 30], [-16.5, 26], [-7.5, 34]]) add('proposed: rain tree (by the stairs)', 'tree', place(f0 + dx, o + r() * 2), 10 + r() * 4, 7);
    // The trees nearest the stairs turn their lit side to the window (the user's ask: "make it
    // face us more"); vegetation/stylised.js sets the turn from the eye. The 45 m reach is a design choice.
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

// The shore tree row (the user's ask, 2026-11-26): one near-straight row along the far bank just
// behind its waterfront path, closer together than the other plantings. Mostly rain trees and old
// kapoks, now and then a pedada, a tall kapok or a trumpet tree, each a bit different in size. All
// drawn with the detailed (near) model, the user's choice. Positions and sizes are design choices.
// `seed` picks the design of a Kuching tree (vegetation/plants/kuchingTree.js DESIGN_BY_SEED):
// 1 and 4 rain tree, 2 old kapok, 3 trumpet tree, 5 tall kapok.
export const SHORE_ROW = {
  from: -234, // waterline x of the first tree (the far left of the bank the window sees)
  to: 70, // waterline x of the last, right of the Assembly (where its terrace trees were planned)
  endGap: 3, // m kept clear of each end of the forecourt
  spacing: 6.2, // m between trees along the line
  // Right of the Assembly, denser (the user's ask): closer spacing, and a loose second row behind.
  right: { spacing: 4, back: { offset: 21, spacing: 5 } },
  jitter: 0.8, // m either way along the line, so the spacing is not exact
  offset: 14, // m inland of the waterline: behind the far path (its street trees stand at 9.3)
  wobble: 0.6, // m either way across the line: near straight, not ruled
  clear: 3.5, // m: a row tree this near another tree's trunk is left out
  bridgeTrees: [-4, 3.5], // m along the shore from the bridge's far ramp foot: two trees partly hiding its entrance (the user's ask)
  rareEvery: 5, // the third tree of every five is one of `rare`, in turn; the rest are from `main`
  // [group, seed or null (any), height range m, width m, leaf clump factor (default `leaves`)]
  main: [
    ['proposed: rain tree (shore row)', [1, 4], [9, 13], 7], // rain tree
    // old kapok: its sparse crown went bare from 80 m in the street view (the user saw it); bigger clumps keep it leafy
    ['proposed: rain tree (shore row)', [2], [10, 14], 8, 2.4],
  ],
  rare: [
    ['proposed: rain tree (shore row)', [3], [8, 11], 6], // trumpet tree
    // tall kapok: its model is about 23 m tall, so at 13-17 m its leaf cards shrink to about two
    // thirds and vanish at a distance (the user saw it bare); bigger clumps make up for it
    ['proposed: rain tree (shore row)', [5], [13, 17], 7, 2.5],
    ['proposed: pedada (shore row)', null, [7, 10], 5],
  ],
  nudge: [0, 2.5, -2.5], // m along the line tried in turn to clear another tree or the bridge
  bridgeNudge: [0, 3, -3, 6, -6, 9, -9, 12, -12, 15, -15], // the same for the two at the bridge's foot: they may move further to stay out of its ramps
  crown: 0.5, // share of a tree's half-width its crown must keep clear of the bridge's decks (the leaves at the rim may brush; judged by eye)
  leaves: 1.6, // leaf clumps this much bigger (kuchingTree.js `leaves`): at 100-300 m the detailed crowns read thin and bare without it (judged in the street view)
};

/**
 * The shore row's tree entries. `place(xWater, offset)` comes from the far bank (banks.js);
 * `forecourt` is the forecourt's waterline x range; `avoid` lists [x, z] points to keep clear of
 * (other trees' trunks); `bridgeFoot` [x, z] is the bridge's far ramp foot, with trees either side;
 * `underBridge(at, radius, height)` says where a crown would reach into the bridge (bridgePlace.js). Its own random stream, so
 * the other plantings keep their places and sizes.
 */
export function farBankShoreRow({ place, forecourt: [f0, f1], avoid = [], bridgeFoot = null, underBridge = () => false, row = SHORE_ROW }) {
  const rand = mulberry32(9127);
  const out = [];
  // Both sides of the forecourt, left first, so the left side keeps its trees as first planted.
  // [waterline x, offset inland, nudges]. Left row, the bridge's two, then the right's front and back rows.
  const spots = [];
  const line = (a, b, step, offset) => { for (let x = a; x <= b; x += step) spots.push([x, offset, row.nudge]); };
  line(row.from, f0 - row.endGap, row.spacing, row.offset);
  // The waterline x nearest the bridge's foot, then a tree either side of it along the shore.
  if (bridgeFoot) {
    let best = [Infinity, 0];
    for (let x = f0 - 20; x <= f1 + 20; x += 0.5) {
      const p = place(x, row.offset);
      const d = Math.hypot(p[0] - bridgeFoot[0], p[2] - bridgeFoot[1]);
      if (d < best[0]) best = [d, x];
    }
    spots.push(...row.bridgeTrees.map((d) => [best[1] + d, row.offset, row.bridgeNudge]));
  }
  line(f1 + row.endGap, row.to, row.right.spacing, row.offset);
  line(f1 + row.endGap + row.right.back.spacing / 2, row.to, row.right.back.spacing, row.right.back.offset);
  spots.forEach(([x, offset, nudge], i) => {
    const m = i % row.rareEvery === 2 ? row.rare[Math.floor(i / row.rareEvery) % row.rare.length] : row.main[Math.floor(rand() * row.main.length)];
    const [group, seeds, [h0, h1], width, leaves = row.leaves] = m;
    const along = x + (rand() - 0.5) * 2 * row.jitter, across = offset + (rand() - 0.5) * 2 * row.wobble;
    const seed = seeds ? seeds[Math.floor(rand() * seeds.length)] : 1 + Math.floor(rand() * 5);
    const squash = 0.85 + rand() * 0.3;
    const height = h0 + rand() * (h1 - h0), yaw = rand() * Math.PI * 2;
    const clear = (at) => !avoid.some((p) => Math.hypot(at[0] - p[0], at[2] - p[1]) < row.clear) && !underBridge([at[0], at[2]], (width * squash * row.crown) / 2, height);
    const at = nudge.map((d) => place(along + d, across)).find(clear);
    if (at) out.push({ group, kind: 'tree', at, height, width: width * squash, squash, yaw, seed, lod: 'near', leaves });
  });
  return out;
}

/**
 * The tree nearest each side stair of the forecourt becomes a rain tree (the user's ask,
 * 2026-11-26: "the two near the stairs should be rain tree"); the rest stay mixed. Changes the
 * entries in place. `seed` 1 is a rain tree's design (kuchingTree.js DESIGN_BY_SEED).
 */
export function rainTreesAtStairs(entries, { place, forecourt: [f0, f1] }) {
  const trees = entries.filter((e) => e.kind === 'tree');
  for (const s of [place(f0, 14), place(f1, 14)]) {
    const d = (e) => Math.hypot(e.at[0] - s[0], e.at[2] - s[2]);
    const e = trees.reduce((a, b) => (d(b) < d(a) ? b : a));
    Object.assign(e, { group: 'proposed: rain tree (by the stairs)', seed: 1 });
  }
}

/**
 * The old kapok by the left side stair, behind the bridge's ramp, read as a bare tree (its leaf
 * clumps are drawn small near the stairs, and its crown is thin): it becomes a rain tree, with a
 * pink trumpet tree beside it (the user's ask, 2026-11-26). `seed`: kuchingTree.js DESIGN_BY_SEED
 * (1 rain tree, 2 old kapok, 3 trumpet). The trumpet stands TRUMPET_BESIDE metres from it, to
 * one side as seen from the stair, the first side `free(entry)` allows (the bridge), else behind.
 */
const TRUMPET_BESIDE = 5;
export function bareKapokToRainAndTrumpet(entries, { place, forecourt: [f0], free = () => true }) {
  const s = place(f0, 14);
  const d = (e) => Math.hypot(e.at[0] - s[0], e.at[2] - s[2]);
  const kapok = entries.filter((e) => e.kind === 'tree' && e.seed === 2 && /by the stairs/.test(e.group)).sort((a, b) => d(a) - d(b))[0];
  if (!kapok) return;
  Object.assign(kapok, { seed: 1, leaves: 1 });
  const n = Math.hypot(kapok.at[0] - s[0], kapok.at[2] - s[2]) || 1;
  const ax = (kapok.at[0] - s[0]) / n, az = (kapok.at[2] - s[2]) / n;
  const tries = [[az, -ax], [-az, ax], [ax, az]].map(([dx, dz]) => ({ ...kapok, at: [kapok.at[0] + dx * TRUMPET_BESIDE, kapok.at[1], kapok.at[2] + dz * TRUMPET_BESIDE], seed: 3, height: kapok.height * 0.8, width: kapok.width * 0.8, yaw: kapok.yaw + 2 }));
  entries.push(tries.find(free) ?? tries[2]);
}
