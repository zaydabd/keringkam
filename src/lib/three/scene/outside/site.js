// The lay of the land outside the windows: where the river runs and where things stand.
//
// Every number here is an estimate read off reference R3 (a painting supplied by the user; not
// in the repo), not a surveyed fact. The painting was back-projected from the window shot
// (interior.js SHOTS.window: eye 4.7 m above the water, 54 degree lens, horizon a little below
// the middle), so a point of the painting gets a place in metres. The painting is not to scale
// (its river is far narrower than the real Sarawak River at Kuching); the scene follows the
// painting's composition.

import * as THREE from 'three';

export const SITE = {
  ground: -1.85, // the house stands on 1.85 m stilts; the room's floor is y = 0
  water: -3.2,
  // Waterlines as [x, z], upstream (far left of the view) to downstream (right, passing the house).
  // The first point of each only carries the river out of sight.
  farLine: [[-900, -585], [-420, -360], [-260, -285], [-122, -207], [-27, -147], [3, -109], [19.6, -83.5], [30, -67], [34, -57], [40, -40], [52, -10], [70, 30], [85, 70]],
  nearLine: [[-900, -520], [-440, -290], [-280, -210], [-140, -130], [-60, -78], [-20.4, -45.2], [-12.6, -33.7], [-7.6, -26.9], [-4, -22.7], [0.5, -21], [10, -20], [24, -14], [40, 5], [55, 35], [65, 70]],
  // The far bank, as distances inland from its waterline (metres) and heights (y).
  far: {
    mud: 1.5, // bare mud above the water
    rough: 8, // rough grass up to here
    path: 10.5, // a worn path
    foot: 15, // foot of the mown embankment
    crest: 27, // its crest, at about the eye's height: the terrace behind it is seen edge-on
    back: 110, // the terrace behind, as far as the swept part goes
    roughY: -2.3,
    crestY: 1.4,
    backY: 1.9,
    meadowY: 0, // left of the embankment the bank is natural: this high at the crest distance
    lawnFrom: [-3, 4], // x of the waterline where the embankment's sloped end starts and is at full height
    wall: { from: 12, offset: 40, height: 3 }, // pale retaining wall on the terrace (x of the waterline it starts at)
  },
  extent: { x0: -1100, x1: 900, z0: -1100, z1: 400 }, // the land and the water end here, in the haze
  // Our bank, as distances inland from its waterline: a low grass berm at the water, a bare mud
  // track behind it that opens to the water at the bend, a short shoulder, level grass.
  near: {
    lip: 0.35, // wet mud at the water
    berm: 3.1, // the berm ends
    mud: 4.4, // the mud track ends at the foot of the shoulder
    edge: 5.2, // edge of the level grass
    level: 9,
    bermY: -2.5,
    bermTo: -6.5, // the berm runs down to this x of the waterline; from there the mud meets the water
    tip: [-3, 1], // a patch of grass and tufts on the tip of the mud flat (x of the waterline)
    fern: [-7.6, -17], // where the fern stands [x, z]
  },
  // Trees of the far bank (trees.js). clump and big: [x, z, scale]; bushes: [x of the waterline,
  // offset inland, scale]; rows: far-tier trees spread along the waterline (x0..x1 of the waterline,
  // offsets inland) or over a box [x0, x1, z0, z1]; `bush` rows are shrubs.
  trees: {
    clump: [[-9.1, -130, 1.05], [-5.2, -132, 1.15], [-1.2, -129, 1.2], [1.9, -133, 1.12], [5.2, -130, 1.05]], // between the bridge and the Assembly building, clear of its arcade (R3)
    big: [[-118, -219, 2.2]],
    bushes: [[-13, 12, 0.9], [-9, 11.5, 1.1], [-6, 12.5, 1.3], [-2.5, 11.5, 1], [1, 12, 1.2], [4.5, 13, 1.1]],
    rows: [
      { name: 'wood', x0: -135, x1: -30, count: 16, offset: [12, 26], scale: [1, 1.45], detail: 0 },
      { name: 'wood behind', x0: -135, x1: -28, count: 8, offset: [34, 60], scale: [1.2, 1.6], detail: 0 },
      { name: 'underwood', x0: -138, x1: -2, count: 20, offset: [7, 13], scale: [2, 3], detail: 0, bush: true },
      { name: 'low', x0: -28, x1: 0, count: 6, offset: [16, 44], scale: [0.55, 0.8], detail: 0 },
      { name: 'upstream', x0: -430, x1: -140, count: 9, offset: [10, 40], scale: [1, 1.5], detail: 0 },
      { name: 'behind', box: [10, 45, -300, -250], count: 7, scale: [0.5, 0.7], detail: 0 }, // left of the Assembly building, outside its brim
    ],
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
  skyline: { z: -470, x0: -70, x1: 75, count: 16 }, // between the bridge towers and the Assembly building (R3)
  boats: [
    { x: -6.5, z: -40, ry: 0.3 }, // the near boat, heading right (R3)
    { x: -19, z: -72, ry: 0.15 }, // the far boat, left of it
  ],
};

/**
 * Samples a waterline, finely near the house and coarsely far away: the step is the distance to
 * `focus` times `rate`, kept between `min` and `max` metres. Returns stations
 * { x, z, tx, tz, nx, nz, s }: position, unit tangent, unit normal pointing inland, distance
 * along the line. `landOnLeft`: the land lies to the left of the direction of travel (our bank)
 * or to the right (the far bank).
 */
export function sampleLine(points, { landOnLeft, focus = [0, -5], rate = 0.05, min = 2, max = 40 }) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const length = curve.getLength();
  const fine = 0.25;
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
    out.push(at(i));
    const p = pts[i];
    const step = Math.min(max, Math.max(min, Math.hypot(p.x - focus[0], p.z - focus[1]) * rate));
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
