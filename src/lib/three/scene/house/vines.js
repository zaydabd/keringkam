// The vines inside the room beside the windows (PLAN.room, backWindows, sideWindow): the same
// hanging vine as the garden's outside the windows (vegetation/hangingVine.js, its leaves and cel
// shading), so inside and outside match (the user, 2026-11-25: the flat indoor vine looked
// inconsistent). Where they hang: house/garden/plants.js windowVineLayout.

import * as THREE from 'three';
import { PLAN } from '../world/plan.js';
import { windowVineLayout } from './garden/plants.js';
import { GARDEN_HANGING, hang } from './garden/garden.js';
import { createHangingVine } from '../../vegetation/hangingVine.js';

const OFF_WALL = 0.06; // how far into the room a vine hangs from its wall (m, guess)

/** The indoor vines: { group, dispose }. Each hangs whole from its top, scaled to its length. */
export function buildVines() {
  const group = new THREE.Group();
  group.name = 'vines';
  const made = windowVineLayout(PLAN).map((l, i) => {
    const vine = createHangingVine({ seed: 11 + i, species: GARDEN_HANGING });
    const at = l.alongX ? [l.x, l.z + OFF_WALL] : [l.x - OFF_WALL, l.z];
    group.add(hang(vine.group, { at, top: l.yTop, h: l.yTop - l.yBottom, yaw: l.alongX ? 0 : Math.PI / 2 }));
    return vine;
  });
  return { group, dispose: () => made.forEach((v) => v.dispose()) };
}
