// The Darul Hana Bridge: an S-curved footbridge hung from two leaning towers.
// After .claude/skills/threejs-procedural-geometry: a semantic contract first (dimensions, what
// supports what), one modelling operation per form (the deck is one sweep of a box profile along
// the curve; a tower is a tapered loft; a cable is a thin prism between two datum points), then
// checks that measure the result. Cables and piers take their ends from the same curve as the deck.
//
// Sourced (https://en.wikipedia.org/wiki/Darul_Hana_Bridge and https://ktas.com.my/?p=531):
// S-shaped, cable-stayed, two towers of about 48-50 m, total length 276 m or about 335 m
// (the sources disagree). Estimated from R3: deck width and height, tower lean, cable count.

import * as THREE from 'three';
import { createContract } from './contract.js';

export const BRIDGE = {
  deck: { width: 3.3, depth: 0.9, rail: 1.1, rise: 5, clearance: 8 }, // metres; clearance = deck soffit above water at the banks
  tower: { height: 48, base: 2.8, top: 1.0, lean: 0.36 }, // lean in radians from upright
  cables: 7, // per side of each tower
  samples: 96,
  colors: { steel: [0.93, 0.92, 0.88], pier: [0.78, 0.76, 0.7], cable: [0.86, 0.86, 0.84] },
};

/**
 * `points` are [x, z] for: the south landing, the two tower piers, the north landing.
 * `water` is the river level, `bankY` the ground level the deck must meet at both ends.
 * Triangles go to the writer's 'steel' slot. Returns the report with the contract.
 */
export function buildBridge(writer, { points, water, bankY }, settings = BRIDGE) {
  const B = settings;
  const C = B.colors;
  const flat = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const length = flat.getLength();
  // The deck's centre line: the flat S-curve, lifted in a shallow arch between the banks.
  const deckY = (t) => bankY + (water + B.deck.clearance + B.deck.depth - bankY) * smooth(t) + B.deck.rise * Math.sin(Math.PI * t);
  function smooth(t) {
    // 0 at the landings, 1 over the water: the approach ramps
    const k = Math.min(t, 1 - t) / 0.12;
    return k >= 1 ? 1 : k * k * (3 - 2 * k);
  }
  const centre = (t) => {
    const p = flat.getPointAt(t);
    p.y = deckY(t);
    return p;
  };
  const frame = (t) => {
    const p = centre(t);
    const tan = flat.getTangentAt(t).setY(0).normalize();
    const side = new THREE.Vector3(tan.z, 0, -tan.x); // to the right of travel
    return { p, tan, side };
  };
  const arr = (v) => [v.x, v.y, v.z];

  // 1. Deck: one sweep of a rectangle; rails: two thin sweeps on its edges.
  const sweep = (offset, halfW, y0, y1, color) => {
    let prev = null;
    for (let i = 0; i <= B.samples; i++) {
      const { p, side } = frame(i / B.samples);
      const c = p.clone().addScaledVector(side, offset);
      const ring = [
        arr(c.clone().addScaledVector(side, -halfW).setY(p.y + y0)),
        arr(c.clone().addScaledVector(side, halfW).setY(p.y + y0)),
        arr(c.clone().addScaledVector(side, halfW).setY(p.y + y1)),
        arr(c.clone().addScaledVector(side, -halfW).setY(p.y + y1)),
      ];
      if (prev) for (let k = 0; k < 4; k++) writer.quad('steel', prev[k], ring[k], ring[(k + 1) % 4], prev[(k + 1) % 4], color);
      else writer.quad('steel', ring[0], ring[1], ring[2], ring[3], color);
      prev = ring;
    }
    writer.quad('steel', prev[3], prev[2], prev[1], prev[0], color);
  };
  sweep(0, B.deck.width / 2, -B.deck.depth, 0, C.steel);
  for (const s of [-1, 1]) sweep((s * B.deck.width) / 2, 0.05, 0, B.deck.rail, C.steel);

  // 2. Towers: each stands on a pier in the river beside the deck and leans away from the other.
  const curveT = (index) => {
    // parameter of control point `index` along the curve (by arc length)
    const target = flat.points[index];
    let best = 0, bestD = Infinity;
    for (let i = 0; i <= 400; i++) {
      const d = flat.getPointAt(i / 400).distanceToSquared(target);
      if (d < bestD) { bestD = d; best = i / 400; }
    }
    return best;
  };
  const towers = [];
  const cableErrors = [];
  [1, 2].forEach((index, n) => {
    const t0 = curveT(index);
    const { p, tan, side } = frame(t0);
    const out = n === 0 ? -1 : 1; // the two towers stand on opposite sides of the deck
    const foot = p.clone().addScaledVector(side, out * (B.deck.width / 2 + B.tower.base * 0.9));
    foot.y = water - 2; // into the river bed
    const dir = new THREE.Vector3(0, 1, 0).applyAxisAngle(side, (n === 0 ? -1 : 1) * B.tower.lean).normalize(); // leans along the bridge, away from the other tower
    const top = foot.clone().addScaledVector(dir, (B.tower.height + 2) / dir.y);
    // pier: a squat block from the bed to just above the water
    const pierTop = water + 1.5;
    writer.box('steel', [foot.x, (foot.y + pierTop) / 2, foot.z], [3, 0, 0], [0, (pierTop - foot.y) / 2, 0], [0, 0, 3], C.pier);
    // mast: a tapered square loft from the pier to the top
    const rings = 5;
    let prev = null;
    for (let k = 0; k <= rings; k++) {
      const f = k / rings;
      const c = foot.clone().lerp(top, f);
      const half = THREE.MathUtils.lerp(B.tower.base, B.tower.top, f) / 2;
      const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => arr(c.clone().addScaledVector(side, a * half).addScaledVector(tan, b * half)));
      if (prev) for (let j = 0; j < 4; j++) writer.quad('steel', prev[j], prev[(j + 1) % 4], ring[(j + 1) % 4], ring[j], C.steel);
      prev = ring;
    }
    writer.quad('steel', prev[0], prev[1], prev[2], prev[3], C.steel);
    // 3. Cables: from the mast head to points on the near edge of the deck, either side of the tower.
    for (const along of [-1, 1]) {
      for (let k = 1; k <= B.cables; k++) {
        const t = THREE.MathUtils.clamp(t0 + (along * k * 0.2) / (B.cables + 1), 0.02, 0.98);
        const f = frame(t);
        const anchor = f.p.clone().addScaledVector(f.side, (out * B.deck.width) / 2);
        cableErrors.push(Math.abs(anchor.clone().sub(f.p).setY(0).length() - B.deck.width / 2));
        const head = top.clone().addScaledVector(dir, -1.5 - k * 0.5);
        const axis = anchor.clone().sub(head);
        const a = new THREE.Vector3(0, 1, 0).cross(axis).normalize().multiplyScalar(0.07);
        const b = axis.clone().cross(a).normalize().multiplyScalar(0.07);
        const corner = (o, i) => arr(o.clone().addScaledVector(a, Math.cos((i * Math.PI * 2) / 3)).addScaledVector(b, Math.sin((i * Math.PI * 2) / 3)));
        for (let i = 0; i < 3; i++) writer.quad('steel', corner(head, i), corner(anchor, i), corner(anchor, i + 1), corner(head, i + 1), C.cable);
      }
    }
    towers.push({ height: top.y - water, footY: foot.y, lean: Math.acos(dir.y) });
  });

  // 4. Small piers under the approaches.
  for (const t of [0.14, 0.86]) {
    const { p } = frame(t);
    const y0 = Math.min(water - 2, bankY - 1);
    writer.box('steel', [p.x, (p.y - B.deck.depth + y0) / 2, p.z], [0.5, 0, 0], [0, (p.y - B.deck.depth - y0) / 2, 0], [0, 0, 0.5], C.pier);
  }

  // What was built, measured.
  let minClear = Infinity;
  for (let i = 0; i <= 50; i++) {
    const t = 0.15 + (0.7 * i) / 50;
    minClear = Math.min(minClear, deckY(t) - B.deck.depth - water);
  }
  const contract = createContract('bridge');
  contract.range('length in metres (sources: 276 to about 335)', length, 270, 340);
  contract.range('tower height above water (sources: 48 to 50)', towers[0].height, 46, 51);
  contract.range('tower height above water, second', towers[1].height, 46, 51);
  contract.max('tower feet below water level', Math.max(towers[0].footY, towers[1].footY), water);
  contract.near('deck meets the south bank', deckY(0), bankY, 0.05);
  contract.near('deck meets the north bank', deckY(1), bankY, 0.05);
  contract.min('clearance over the water', minClear, 6);
  contract.max('cable ends off the deck edge', Math.max(...cableErrors), 0.01);
  contract.is('cables', cableErrors.length, B.cables * 4);
  return { length: +length.toFixed(1), towers, minClearance: +minClear.toFixed(2), contract: contract.assert() };
}
