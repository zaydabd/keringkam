// Planting round the house (branch house-exterior, step 2): three trial setups, chosen with
// ?garden=a|b|c (none by default until the user picks one). Built by flora-stylised.js from the
// existing plants (vegetation/plants/); each entry's `group` names the plant the way PLANT_OF
// there matches it. Places and sizes are design choices, tuned by eye: ESTIMATES.
//
// The house: the river wall's cladding at z -5.61, its windows at x [-3.02,-1.92], [-1.0,0.05],
// [0.72,1.2] (PLAN.backWindows), the corners at x -4.31 and 1.45; the right wall at x 1.45 with
// its window at z [-2.45,-1.45]; the terrace at y -0.45, ending at z -6.8 (interior/exterior.js).

import { HOUSE } from './interior/exterior.js';
import { PLAN } from './interior/plan.js';

const Y = HOUSE.ground.y;
const BED = -6.15; // the bed along the river wall: about half a metre out from the cladding
// flora-stylised.js maps the Chinese evergreen only by this group name (a room plant's): it has no
// pot, so it stands on the ground as it is.
const EVERGREEN = 'proposed: Chinese evergreen (floor)';

const evergreen = (x, z, i, height = 0.75) => ({ group: EVERGREEN, kind: 'bush', at: [x, Y, z], height, width: 0.7, yaw: i * 1.7 });
const bougainvillea = (x, z, i, name) => ({ group: `proposed: bougainvillea (garden ${name})`, kind: 'bush', at: [x, Y, z], height: 2.5, width: 2, yaw: 0.4 + i * 1.3 });

/** Three evergreens across each river window, a little staggered. */
function underWindows(z = BED) {
  return PLAN.backWindows.flatMap((w, k) => {
    const n = w.x1 - w.x0 > 0.8 ? 3 : 2;
    return Array.from({ length: n }, (_, i) => evergreen(w.x0 + ((i + 0.5) * (w.x1 - w.x0)) / n, z + (i % 2 ? -0.18 : 0.05), k * 3 + i, 0.6 + ((k + i) % 3) * 0.12));
  });
}

const s = PLAN.sideWindow;
const sideMid = (s.z0 + s.z1) / 2;

export const GARDENS = {
  // a: a low bed under the windows, flowering bushes at the two river corners.
  a: () => [
    ...underWindows(),
    bougainvillea(-4.9, -6.2, 0, 'left corner'),
    bougainvillea(2.15, -6.2, 1, 'right corner'),
    evergreen(1.95, sideMid - 0.35, 20),
    evergreen(2.05, sideMid + 0.3, 21, 0.85),
  ],
  // b: a flowering screen: bougainvillea in front of the wall between the windows and at the
  // corners, so the windows look out between them; low evergreens under the windows.
  b: () => [
    ...underWindows(-5.95),
    bougainvillea((PLAN.backWindows[0].x1 + PLAN.backWindows[1].x0) / 2, -6.35, 0, 'pier left'),
    bougainvillea((PLAN.backWindows[1].x1 + PLAN.backWindows[2].x0) / 2, -6.35, 1, 'pier right'),
    bougainvillea(-4.75, -6.35, 2, 'left corner'),
    bougainvillea(2.05, -6.1, 3, 'right corner'),
    bougainvillea(3.0, sideMid + 1.3, 4, 'side'),
  ],
  // c: palms and a tree: nipah palms at the river corners, a pedada off the left side, the bed of
  // evergreens under the windows, a bougainvillea by the side window.
  c: () => [
    ...underWindows(),
    { group: 'proposed: nipah (garden left corner)', kind: 'bush', at: [-5.3, Y, -6.3], height: 3.2, width: 4, yaw: 0.8 },
    { group: 'proposed: nipah (garden right corner)', kind: 'bush', at: [2.5, Y, -6.3], height: 2.8, width: 3.5, yaw: 2.3 },
    { group: 'proposed: pedada (garden left side)', kind: 'tree', at: [-7.5, Y, -2.5], height: 7, width: 6, yaw: 1.1 },
    bougainvillea(3.0, sideMid + 0.2, 5, 'side'),
  ],
};

/** The chosen setup's entries, or [] (?garden=a|b|c). */
export function gardenEntries(params) {
  const g = params.get('garden');
  return GARDENS[g]?.() ?? [];
}
