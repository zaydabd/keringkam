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
  pierFoot: 2, // the piers go this far under the water
  crease: 40, // degrees: smooth normals round the tubes, hard edges on the boxes
  // The painted albedo (a stylisation, judged in test renders): brush-stroke lightening, warm and
  // cool dabs, painted light, worn edges, world-scale colour drift.
  paint: { stroke: 0.9, hue: 0.45, bake: 0.85, edge: 0.5, vary: 0.6 },
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
