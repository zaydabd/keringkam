// Garden layouts round the house (branch house-exterior, step 2): data only, so a plan drawing
// can be made from the same numbers as the scene (research/tools/garden-plans.mjs). garden.js
// builds them. Each layout is a set of beds (polygons in plan, [x, z]) and plant slots. A slot
// is the volume its plant is cut to: an upright ellipsoid (rx, rz across, h tall) or, for a
// hedge, a box (shape 'box', w along x, d along z). Every place and size is a design choice:
// ESTIMATES.

import { HOUSE } from './interior/exterior.js';
import { PLAN } from './interior/plan.js';

const R = PLAN.room;
export const WALLS = { X0: R.x0 - HOUSE.out, X1: R.x1 + HOUSE.out, Z0: R.z0 - HOUSE.out, Z1: R.z1 + HOUSE.out }; // the cladding's faces
const { X0, X1, Z0 } = WALLS;
const EDGE = HOUSE.ground.z0; // the terrace's edge, where the bank drops to the street (-6.8)
const [w1, w2, w3] = PLAN.backWindows;
const s = PLAN.sideWindow;

// What each layer is, its plant, and its placeholder colour.
export const LAYERS = {
  low: { plant: 'aglaonema', label: 'Chinese evergreen, kept under 0.55 m', colour: '#9ccf6a' },
  hedge: { plant: 'aglaonema', label: 'Chinese evergreen planted as a low clipped line', colour: '#5fae5a' },
  column: { plant: 'bougainvillea', label: 'Bougainvillea trained flat on the wall', colour: '#d9579b' },
  corner: { plant: 'bougainvillea', label: 'Bougainvillea, a rounded bush', colour: '#f0974a' },
  palm: { plant: 'nipah', label: 'Nipah palm', colour: '#2f7a4a' },
};

const wallZ = Z0 - 0.02; // a bed's edge along the river wall
const sideX = X1 + 0.02; // ...and along the right wall
const pierL = (w1.x1 + w2.x0) / 2, pierR = (w2.x1 + w3.x0) / 2;
const pierHalf = (a, b) => (b - a) / 2 - 0.16; // half the wall between two window surrounds

/** Low plants spread under a window, staggered in two rows. */
function under(w, z, layer = 'low', h = 0.55) {
  const n = Math.max(1, Math.round((w.x1 - w.x0) / 0.38));
  return Array.from({ length: n }, (_, k) => ({ layer, at: [w.x0 + ((k + 0.5) * (w.x1 - w.x0)) / n, z + (k % 2 ? -0.16 : 0.08)], rx: 0.27, rz: 0.27, h }));
}
const underSide = (x) => [0, 1, 2].map((k) => ({ layer: 'low', at: [x + (k % 2 ? 0.14 : -0.06), s.z0 + ((k + 0.5) * (s.z1 - s.z0)) / 3], rx: 0.27, rz: 0.27, h: 0.55 }));

export const LAYOUTS = {
  // 1. Framed windows: a straight bed along the river wall and down the right side. Low plants
  // under every window; bougainvillea trained up the wall between the windows and at the corners,
  // so each window is framed and stays open.
  framed: {
    label: '1. Framed windows',
    beds: [
      [[X0 - 0.6, wallZ], [X1 + 0.85, wallZ], [X1 + 0.85, Z0 - 0.95], [X0 - 0.6, Z0 - 0.95]],
      [[sideX, wallZ], [sideX, -0.2], [X1 + 0.85, -0.2], [X1 + 0.85, wallZ]],
    ],
    slots: [
      ...under(w1, Z0 - 0.42), ...under(w2, Z0 - 0.42), ...under(w3, Z0 - 0.42),
      ...underSide(X1 + 0.4),
      { layer: 'column', at: [pierL, Z0 - 0.42], rx: pierHalf(w1.x1, w2.x0), rz: 0.36, h: 2.5 },
      { layer: 'column', at: [pierR, Z0 - 0.42], rx: pierHalf(w2.x1, w3.x0), rz: 0.34, h: 2.5 },
      { layer: 'corner', at: [X0 - 0.12, Z0 - 0.48], rx: 0.55, rz: 0.45, h: 2.2 },
      { layer: 'corner', at: [X1 + 0.38, Z0 - 0.48], rx: 0.5, rz: 0.42, h: 2.2 },
      { layer: 'column', at: [X1 + 0.42, (Z0 + s.z0) / 2 - 0.2], rx: 0.36, rz: 0.6, h: 2.4 },
      { layer: 'column', at: [X1 + 0.42, (s.z1 - 0.2) / 2], rx: 0.36, rz: 0.5, h: 2.4 },
    ],
  },
  // 2. Open front: nothing against the river wall, so the windows look straight out. A low
  // clipped line along the terrace's edge draws a green line across the bottom of the view from
  // the seat; a rounded bougainvillea and a few low plants anchor each corner.
  open: {
    label: '2. Open front, low edge',
    beds: [
      [[X0 - 0.9, EDGE + 0.55], [X1 + 1.1, EDGE + 0.55], [X1 + 1.1, EDGE + 0.1], [X0 - 0.9, EDGE + 0.1]],
      [[X0 - 1.4, wallZ], [X0 + 0.25, wallZ], [X0 + 0.25, EDGE + 0.55], [X0 - 1.4, EDGE + 0.55]],
      [[X1 - 0.25, wallZ], [X1 + 1.5, wallZ], [X1 + 1.5, EDGE + 0.55], [X1 - 0.25, EDGE + 0.55]],
      [[sideX, s.z0 - 0.3], [sideX, s.z1 + 0.3], [X1 + 0.7, s.z1 + 0.3], [X1 + 0.7, s.z0 - 0.3]],
    ],
    slots: [
      { layer: 'hedge', shape: 'box', at: [(X0 + X1) / 2 + 0.1, EDGE + 0.32], w: X1 - X0 + 1.8, d: 0.36, h: 0.5 },
      { layer: 'corner', at: [X0 - 0.6, Z0 - 0.45], rx: 0.6, rz: 0.5, h: 2.0 },
      { layer: 'low', at: [X0 - 0.1, Z0 - 0.75], rx: 0.27, rz: 0.27, h: 0.55 },
      { layer: 'low', at: [X0 - 1.0, Z0 - 0.85], rx: 0.27, rz: 0.27, h: 0.55 },
      { layer: 'corner', at: [X1 + 0.75, Z0 - 0.45], rx: 0.6, rz: 0.5, h: 2.0 },
      { layer: 'low', at: [X1 + 0.15, Z0 - 0.8], rx: 0.27, rz: 0.27, h: 0.55 },
      { layer: 'low', at: [X1 + 1.15, Z0 - 0.85], rx: 0.27, rz: 0.27, h: 0.55 },
      ...underSide(X1 + 0.36),
    ],
  },
  // 3. Corner drift: an informal bed wrapped round the left corner, planted in drifts that step
  // down from a palm at the corner to low plants by the middle window. The right half of the
  // river wall stays open; the right corner gets one low group.
  drift: {
    label: '3. Corner drift (informal)',
    beds: [
      [[X0 - 0.02, -2.6], [X0 - 1.5, -3.2], [X0 - 1.9, -4.6], [X0 - 1.6, Z0 - 0.95], [X0 - 0.4, Z0 - 1.1], [w2.x0, Z0 - 1.0], [w2.x1 - 0.2, Z0 - 0.6], [w2.x1 - 0.2, wallZ], [X0 - 0.02, wallZ]],
      [[X1 - 0.3, wallZ], [X1 + 0.9, wallZ], [X1 + 0.9, Z0 - 0.8], [X1 - 0.3, Z0 - 0.8]],
    ],
    slots: [
      { layer: 'palm', at: [X0 - 0.75, Z0 - 0.5], rx: 1.4, rz: 1.4, h: 3.2 },
      { layer: 'corner', at: [X0 - 0.75, Z0 + 1.1], rx: 0.55, rz: 0.7, h: 1.8 },
      { layer: 'corner', at: [w1.x0 - 0.35, Z0 - 0.55], rx: 0.45, rz: 0.4, h: 1.5 },
      { layer: 'low', at: [X0 - 1.25, -3.6], rx: 0.3, rz: 0.3, h: 0.55 },
      { layer: 'low', at: [X0 - 1.1, Z0 - 0.9], rx: 0.3, rz: 0.3, h: 0.55 },
      ...under(w1, Z0 - 0.5), ...under(w2, Z0 - 0.4, 'low', 0.45).slice(0, 2),
      { layer: 'low', at: [X1 + 0.1, Z0 - 0.4], rx: 0.27, rz: 0.27, h: 0.5 },
      { layer: 'low', at: [X1 + 0.55, Z0 - 0.5], rx: 0.27, rz: 0.27, h: 0.55 },
      { layer: 'low', at: [X1 + 0.35, Z0 - 0.15], rx: 0.27, rz: 0.27, h: 0.5 },
    ],
  },
  // 4. Tropical screen: nipah palms at both river corners, bougainvillea trained between the
  // windows, low plants under them: the fullest, most private front. Palms also at the side.
  tropical: {
    label: '4. Tropical screen',
    beds: [
      [[X0 - 1.6, wallZ], [X1 + 1.5, wallZ], [X1 + 1.5, Z0 - 1.15], [X0 - 1.6, Z0 - 1.15]],
      [[sideX, wallZ], [sideX, -0.2], [X1 + 1.1, -0.2], [X1 + 1.1, wallZ]],
    ],
    slots: [
      ...under(w1, Z0 - 0.45), ...under(w2, Z0 - 0.45), ...under(w3, Z0 - 0.45),
      { layer: 'column', at: [pierL, Z0 - 0.42], rx: pierHalf(w1.x1, w2.x0), rz: 0.36, h: 2.5 },
      { layer: 'column', at: [pierR, Z0 - 0.42], rx: pierHalf(w2.x1, w3.x0), rz: 0.34, h: 2.5 },
      { layer: 'palm', at: [X0 - 0.75, Z0 - 0.55], rx: 1.3, rz: 1.1, h: 3.2 },
      { layer: 'palm', at: [X1 + 0.85, Z0 - 0.55], rx: 1.2, rz: 1.0, h: 3.0 },
      ...underSide(X1 + 0.4),
      { layer: 'palm', at: [X1 + 0.6, -0.9], rx: 0.9, rz: 0.9, h: 2.8 },
    ],
  },
};
