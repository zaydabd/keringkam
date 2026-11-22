// The lay of the land outside the windows: where the river runs and where things stand.
//
// Every number here is an estimate read off reference R3 (a painting supplied by the user; not
// in the repo), not a surveyed fact. The painting was back-projected from the window shot
// (interior.js SHOTS.window: eye 4.7 m above the water, 54 degree lens, horizon a little below
// the middle), so a point of the painting gets a place in metres. The painting is not to scale
// (its river is far narrower than the real Sarawak River at Kuching); the scene follows the
// painting's composition.

import * as THREE from 'three';

// The window shot's eye (interior.js SHOTS.window). Blades and leaf cards are wound to face it.
export const WINDOW_EYE = [-0.475, 1.5, -4.62];

export const SITE = {
  ground: -1.85, // the house stands on 1.85 m stilts; the room's floor is y = 0
  water: -3.2,
  // The far waterline as [x, z], upstream (far left of the view) to downstream (right). The first
  // point only carries the river out of sight. Our side is the waterfront street (`near` below;
  // waterfront.js), with the bush below the window on its grass (waterbush.js).
  farLine: [[-900, -585], [-420, -360], [-260, -285], [-122, -207], [-27, -147], [3, -109], [19.6, -83.5], [30, -67], [34, -57], [40, -40], [52, -10], [70, 30], [85, 70]],
  // The far bank, as distances inland from its waterline (metres) and heights (y).
  far: {
    rough: 8, // the waterfront street up to here (pass e11; was mud and rough grass)
    path: 10.5, // a worn path
    foot: 15, // foot of the mown embankment
    crest: 27, // its crest, at about the eye's height: the terrace behind it is seen edge-on
    back: 110, // the terrace behind, as far as the swept part goes
    roughY: -1.7, // the far street's top, 1.5 m above the water (ESTIMATED; banks.js and forecourt.js footY read it)
    crestY: 1.4,
    backY: 1.9,
    meadowY: 0, // left of the embankment the bank is natural: this high at the crest distance
    lawnFrom: [-3, 4], // x of the waterline where the embankment's sloped end starts and is at full height
    wall: { from: 12, offset: 40, height: 3 }, // pale retaining wall on the terrace (x of the waterline it starts at)
  },
  // Our side (pass e11): the Kuching Waterfront's street and railing (waterfront.js), the user's
  // choice. Its waterline runs straight along x; the street is level with the ground the house's
  // stilts stand on. ESTIMATES, tuned in the window shot (no source gives the street's width): the
  // edge 12.5 m out from the house's wall (z -5.5), so the window sees the street below the
  // railing and the near boat clear above it; the street about 7 m wide; grass from it to under
  // the house. x0..x1 reach past every window view.
  near: { waterline: -18, width: 7, house: -4, x0: -40, x1: 40, step: 4 },
  extent: { x0: -1100, x1: 900, z0: -1100, z1: 400 }, // the land and the water end here, in the haze

  // Trees of the far bank (trees.js). clump and big: [x, z, scale]; bushes: [x of the waterline,
  // offset inland, scale]; rows: far-tier trees spread along the waterline (x0..x1 of the waterline,
  // offsets inland) or over a box [x0, x1, z0, z1]; `bush` rows are shrubs.
  trees: {
    clump: [[-9.1, -130, 1.05], [-5.2, -132, 1.15], [-1.2, -129, 1.2], [1.9, -133, 1.12], [5.2, -130, 1.05]], // between the bridge and the Assembly building, clear of its arcade (R3)
    big: [[-118, -219, 2.2]],
    bushes: [[-13, 12, 0.9], [-9, 11.5, 1.1], [-6, 12.5, 1.3], [-2.5, 11.5, 1], [1, 12, 1.2], [4.5, 13, 1.1]],
    // groups: clumps along the row with sky between them (R3); mix: the weight of each variant
    // (trees.js TREE_VARIANTS). Design choices.
    rows: [
      { name: 'wood', x0: -135, x1: -30, count: 16, offset: [12, 26], scale: [1, 1.45], detail: 0, groups: 4, mix: { base: 2, tall: 2, broad: 2, round: 1 } },
      { name: 'wood behind', x0: -135, x1: -28, count: 8, offset: [34, 60], scale: [1.2, 1.6], detail: 0, groups: 3, mix: { base: 1, tall: 2, broad: 1 } },
      { name: 'underwood', x0: -138, x1: -2, count: 20, offset: [8.6, 13], scale: [2, 3], detail: 0, bush: true },
      { name: 'low', x0: -28, x1: 0, count: 6, offset: [16, 44], scale: [0.55, 0.8], detail: 0, mix: { round: 2, broad: 1 } },
      { name: 'upstream', x0: -430, x1: -140, count: 9, offset: [10, 40], scale: [1, 1.5], detail: 0, groups: 3, mix: { base: 1, tall: 1, broad: 1 } },
      { name: 'behind', box: [10, 45, -300, -250], count: 7, scale: [0.5, 0.7], detail: 0, mix: { round: 2, tall: 1 } }, // left of the Assembly building, outside its brim
    ],
    // Pass e7, after the user's far-bank renders (sizes design choices, not measured): frond trees
    // between the bridge and the river front, and single trees on the lawn at its sides, both
    // [x of the waterline, offset inland, scale]; trees.js keeps them off the river front.
    frond: [[-24, 14, 1], [-19, 18, 1.15], [-15, 13, 0.9], [-8, 16, 1.1], [-3, 19, 1], [1, 15, 0.95], [2.5, 24, 1.1]],
    lawn: [[2.5, 34, 0.7], [3.5, 41, 0.8], [24, 36, 0.75], [27, 42, 0.7]],
    clumpWidth: 0.6, // a clump's width, of its share of the row
    hue: [0.14, 0.1, 0.2], // each tree's colours are scaled by 1 ± half of these (r, g, b)
    cards: { near: 2, mid: 1 }, // leaf cards per sub-lobe, by tier
  },
  // Placed for R3's composition as seen from the window shot (eye -0.475, 1.5, -4.62, looking
  // down -z): bearings are degrees right of that view, read off R3.
  lawn: 1.9,
  // South landing (our bank, far upstream, off the left of the frame), the two tower piers in the
  // river near the far bank (bearings -18 and -9: R3 paints them close together left of centre),
  // north landing on the far bank behind the trees, left of the Assembly building, so the deck
  // does not cross in front of it (R3). About 286 m along the deck.
  bridge: [[-230, -95], [-50, -150], [-22, -140], [10, -200]],
  assembly: { x: 127, z: -225 }, // bearing +31, 254 m: where R3 has it, at the right edge of the window and about as big; the right curtain may cover part of it (agreed with the user)
  boats: [
    // Both bows head left and away, towards the bridge, seen three-quarter from the window (pass
    // e9, the user's choice): about 40° off the line of sight, so the side and the roof still
    // show (pointing straight at the bridge would be nearly stern-on). Was ry 0.3 and 0.15.
    // Placed by the contract in placement.js (pass e12), solved from its targets, not by eye. The
    // near boat comes in just beyond the railing (about 25 m from the eye, its hull seen through
    // the lattice and its roof over the top rail), so the railing gives it a scale; the far boat
    // sits about mid-river (about 55 m), clear of the bridge pier, turned 10° from the near one so
    // they do not read as a queue. Was (-6.5, -40) and (-19, -72, 2.55).
    { x: -0.5, z: -30, ry: 2.45, scheme: 'red' }, // the near boat; colours of photo B1
    { x: -14.5, z: -57.5, ry: 2.63, scheme: 'orange' }, // the far boat, left of it; colours of photo B3
  ],
};

/**
 * Samples a waterline, finely near the house and coarsely far away: the step is the distance to
 * `focus` times `rate`, kept between `min` and `max` metres. Returns stations
 * { x, z, tx, tz, nx, nz, s }: position, unit tangent, unit normal pointing inland, distance
 * along the line. `landOnLeft`: the land lies to the left of the direction of travel (our bank)
 * or to the right (the far bank). `fine` is the finest step (m); `step(station)`, if given,
 * replaces the rule above and returns the step (m) after that station.
 */
export function sampleLine(points, { landOnLeft, focus = [0, -5], rate = 0.05, min = 2, max = 40, fine = 0.25, step: stepAt = null }) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const length = curve.getLength();
  const n = Math.ceil(length / fine);
  const pts = curve.getSpacedPoints(n);
  const sign = landOnLeft ? 1 : -1;
  const at = (i) => {
    const p = pts[i], a = pts[Math.max(0, i - 2)], b = pts[Math.min(n, i + 2)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / l, tz = (b.z - a.z) / l;
    return { x: p.x, z: p.z, tx, tz, nx: -tz * sign, nz: tx * sign, s: (length * i) / n };
  };
  const out = [];
  let i = 0;
  while (i < n) {
    const here = at(i);
    out.push(here);
    const p = pts[i];
    const step = stepAt ? stepAt(here) : Math.min(max, Math.max(min, Math.hypot(p.x - focus[0], p.z - focus[1]) * rate));
    i += Math.max(1, Math.round(step / (length / n)));
  }
  if (n - (out.length ? Math.round((out[out.length - 1].s / length) * n) : 0) < 4) out.pop(); // no sliver at the end
  out.push(at(n));
  return out;
}

export const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Value noise in 2D, deterministic, in -1..1; fbm adds two finer octaves (weights 0.6, 0.3, 0.1).
function hash2(i, j, seed) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y, seed) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const mix = (a, b, t) => a + (b - a) * t;
  return mix(mix(hash2(i, j, seed), hash2(i + 1, j, seed), u), mix(hash2(i, j + 1, seed), hash2(i + 1, j + 1, seed), u), v) * 2 - 1;
}
export const fbm = (x, y, seed) => vnoise(x, y, seed) * 0.6 + vnoise(x * 2.1, y * 2.1, seed + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, seed + 2) * 0.1;

export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rgb = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

/** A theme's paint table as vertex colours: each hex (or list of hexes) through rgb. */
export const rgbTable = (table) =>
  Object.fromEntries(Object.entries(table).map(([k, v]) => [k, Array.isArray(v) ? v.map(rgb) : rgb(v)]));
