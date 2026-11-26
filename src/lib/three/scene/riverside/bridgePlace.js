// Where the Darul Hana Bridge stands (bridge.js builds and paints it): its size and the model's
// measured points, kept apart from the model file so the far bank and the boat checks (and Node)
// can use them without loading it.

import * as THREE from 'three';
import { SITE } from '../world/site.js';

export const BRIDGE = {
  real: 2.65, // metres per model unit at real size: towers about 49 m above the water, about 318 m long (bridge.js sources)
  scale: 1.85, // metres per model unit as built: 70% of real size, so the bridge stands well inside the river and reads further away (the user's choice, 2026-11-26: the river is too narrow for it at real size; a stylisation)
  // Measured on the model (its own units, y up): where the ramps meet the ground, the tops of the
  // tower piers, and the plan positions [x, z] of the two tower piers and the two ramp feet.
  model: { ground: -3.05, pierTop: -1.98, pierBottom: -2.9, piers: [[24, -3.15], [73.8, -15.45]], ends: [[0.7, 0], [97.1, -18.8]] },
  // The far landing's low decks and ramps, for the trees to keep clear of: [x, z, height above
  // the ground] in model units, the lowest body, walk or roof point in each 4-unit plan cell
  // within 45 units of the far end and under 9 units up (read from the model file, 2026-11-26).
  lowDeck: [[-12, -24, 5.4], [-12, -20, 4.7], [-12, -16, 4.9], [-8, -24, 4], [-8, -20, 0.7], [-8, -16, 0], [-8, -12, 4.7], [-4, -24, 3.4], [-4, -20, 0.7], [-4, -16, 0.7], [-4, -12, 4.7], [-4, -8, 6.1], [-4, 0, 0], [0, -24, 3.3], [0, -20, 0], [0, -16, 3.5], [0, -12, 3.1], [0, -8, 2.5], [0, -4, 2.1], [0, 0, 0], [4, -8, 2.5], [4, -4, 2.1], [4, 0, 0], [8, -8, 4.7], [8, -4, 4.7], [12, -16, 5.6], [12, -12, 5.6], [12, -8, 5.6], [12, -4, 4.7], [16, -16, 4.6], [16, -12, 5.1], [16, -8, 4.6], [16, -4, 4.7], [16, 0, 4.7], [20, -16, 4.4], [20, -12, 4.5], [20, -8, 1], [20, -4, 1.3], [20, 0, 1], [24, -16, 4.3], [24, -12, 4.4], [24, -8, 4.3], [24, -4, 6.3], [24, 0, 4.8], [28, -16, 4.4], [28, -12, 4.5], [28, -8, 1], [28, -4, 1.3], [28, 0, 1], [32, -16, 4.6], [32, -12, 5.1], [32, -8, 4.6], [32, 0, 4.7], [36, -16, 5.6], [36, -12, 5.6], [36, -8, 5.6], [36, 0, 4.7], [40, -4, 4.7], [40, 0, 4.7], [44, -8, 6.1], [44, -4, 4.7], [44, 0, 6.2]],
  pierFoot: 2, // the piers go this far under the water
  crease: 40, // degrees: smooth normals round the tubes, hard edges on the boxes
  // The painted albedo (a stylisation, judged in test renders): brush-stroke lightening, warm and
  // cool dabs, painted light, worn edges, world-scale colour drift.
  paint: { stroke: 0.9, hue: 0.45, bake: 0.85, edge: 0.5, vary: 0.6, rim: 0.06, shine: 0.35, wet: 2.2 }, // rim: brighter where the sun is square on; shine: the gold roofs' glint; wet: metres of dark wet pier above the water
};

/**
 * World position [x, z] of a model plan point [x, z] for a placement { x, z, yaw (degrees),
 * mirror (1 or -1) }: scaled, mirrored across the model's x axis if asked, turned, moved.
 */
export function bridgePoint([mx, mz], place, scale = BRIDGE.scale) {
  const a = THREE.MathUtils.degToRad(place.yaw), c = Math.cos(a), s = Math.sin(a);
  const x = mx * scale, z = mz * scale * place.mirror;
  return [x * c - z * s + place.x, x * s + z * c + place.z];
}

/** The two tower piers' centres [x, z] in the world, for the banks and the boats to keep clear of. */
export const bridgePiers = (place = SITE.bridge) => BRIDGE.model.piers.map((p) => bridgePoint(p, place));

/**
 * True where a tree standing at [x, z] (world), with a crown `radius` m round and `height` m
 * tall, would reach into the bridge's far landing (BRIDGE.lowDeck): a deck cell within the
 * radius (plus half a cell) and lower than the tree.
 */
export function underBridge(at, radius, height, place = SITE.bridge) {
  return bridgeClash(at, radius, height, place) !== null;
}

/** The world [x, z] of the low deck cell nearest a tree at [x, z] that its crown reaches (see underBridge), or null. */
export function bridgeClash([x, z], radius, height, place = SITE.bridge) {
  const half = 2 * BRIDGE.scale * Math.SQRT2;
  let best = null, bd = Infinity;
  for (const [mx, mz, h] of BRIDGE.lowDeck) {
    const [wx, wz] = bridgePoint([mx, mz], place);
    const d = Math.hypot(wx - x, wz - z);
    if (h * BRIDGE.scale < height && d < radius + half && d < bd) [best, bd] = [[wx, wz], d];
  }
  return best;
}

/** True where [x, z] is on the river: beyond our waterline and short of the far one (SITE.farLine). */
export function inRiver([x, z]) {
  const L = SITE.farLine;
  let far = L[0][1];
  for (let i = 1; i < L.length; i++) {
    if (x <= L[i][0]) {
      far = L[i - 1][1] + ((L[i][1] - L[i - 1][1]) * (x - L[i - 1][0])) / (L[i][0] - L[i - 1][0]);
      break;
    }
    far = L[i][1];
  }
  return z < SITE.near.waterline && z > far;
}
