// Garden layouts round the house (branch house-exterior, step 2): data only, so a plan drawing
// can be made from the same numbers as the scene (research/tools/garden-plans.mjs). garden.js
// builds them. Each layout is a set of beds (polygons in plan, [x, z]) and plant slots. A slot
// is the volume its plant is cut to: an upright ellipsoid (rx, rz across, h tall) or, for a
// hedge, a box (shape 'box', w along x, d along z). A hanging slot (shape 'hang') is a flat
// panel w wide and h tall, its top at y = top: vines hang in it, uncut. A slot stands on the
// terrace unless it gives its own ground height, `base`. Every place and size is a design choice:
// ESTIMATES.

import { HOUSE } from './interior/exterior.js';
import { PLAN } from './interior/plan.js';
import { SITE } from './outside/site.js';

const R = PLAN.room;
export const WALLS = { X0: R.x0 - HOUSE.out, X1: R.x1 + HOUSE.out, Z0: R.z0 - HOUSE.out, Z1: R.z1 + HOUSE.out }; // the cladding's faces
const { X0, X1, Z0 } = WALLS;
const EDGE = HOUSE.ground.z0;
const HOUSE_FLOOR_ABOVE_GROUND = -HOUSE.ground.y;
const WIN_HEAD = PLAN.window.y1 + 0.06; // just under the head trim outside
const SOFFIT = HOUSE.plate + 0.06 - HOUSE.roof.overhang * Math.tan((HOUSE.roof.pitch * Math.PI) / 180) - 0.17; // under the eaves' lining // 0.45: a slot's h is from the terrace, the floor is this much higher // the terrace's edge, where the bank drops to the street (-6.8)
const [w1, w2, w3] = PLAN.backWindows;
const s = PLAN.sideWindow;

// What each layer is, its plant, and its placeholder colour.
export const LAYERS = {
  low: { plant: 'aglaonema', label: 'Chinese evergreen, kept under 0.55 m', colour: '#9ccf6a' },
  hedge: { plant: 'aglaonema', label: 'Chinese evergreen planted as a low clipped line', colour: '#5fae5a' },
  column: { plant: 'bougainvillea', label: 'Bougainvillea trained flat on the wall', colour: '#d9579b' },
  corner: { plant: 'bougainvillea', label: 'Bougainvillea, a rounded bush', colour: '#f0974a' },
  palm: { plant: 'nipah', label: 'Nipah palm', colour: '#2f7a4a' },
  mound: { plant: 'bougainvillea', label: 'Bougainvillea bush, trimmed (tops about 1.3 m above the floor)', colour: '#c2407f' },
  climber: { plant: 'bougainvillea', label: 'Bougainvillea trained up the wall beside a window', colour: '#f08cc0' },
  curtain: { plant: 'vineCurtain', label: 'Vine curtain hanging from a window head', colour: '#4f9e3a' },
  hanging: { plant: 'hangingVine', label: 'Hanging vine from the eaves', colour: '#7cc24f' },
  tree: { plant: 'rainTree', label: 'Rain tree, kept small (about 4 m tall)', colour: '#3d6b2f' },
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
  // 5. The user's design (2026-11-25): bougainvillea all along the river wall, wrapping round both
  // corners, its tops trimmed about 1.3 m above the floor so a band of flowers shows at the bottom
  // of the windows; a few trained up the wall beside the windows like creepers; vines hanging
  // from the window heads and the eaves, so they show hanging at the top of the windows from
  // inside; one rain tree on the grass below the bank in front of the left window, so it shows
  // through that window from the seat (the user's choice; the two side trees were taken out).
  bougainvillea: {
    label: '5. Bougainvillea all along, hanging vines',
    beds: [
      [[X0 - 1.2, wallZ], [X1 + 1.2, wallZ], [X1 + 1.2, Z0 - 1.02], [X0 - 1.2, Z0 - 1.02]],
      [[X0 - 0.02, wallZ], [X0 - 0.02, Z0 + 1.7], [X0 - 1.0, Z0 + 1.7], [X0 - 1.0, wallZ]],
      [[sideX, wallZ], [sideX, Z0 + 1.7], [X1 + 1.0, Z0 + 1.7], [X1 + 1.0, wallZ]],
    ],
    slots: [
      // the row along the river wall: overlapping mounds, tops between 1.2 and 1.4 m above the floor (raised from about 1 m: the user's choice, so they show from the seat too)
      ...Array.from({ length: 10 }, (_, k) => ({ layer: 'mound', at: [X0 - 0.85 + k * ((X1 - X0 + 1.7) / 9), Z0 - 0.5 + (k % 2 ? 0.06 : -0.04)], rx: 0.55, rz: 0.42, h: HOUSE_FLOOR_ABOVE_GROUND + [1.3, 1.22, 1.38, 1.25, 1.4, 1.2, 1.35, 1.27, 1.4, 1.23][k] })),
      // round the corners, a little lower
      { layer: 'mound', at: [X0 - 0.5, Z0 + 0.45], rx: 0.45, rz: 0.55, h: 1.25 },
      { layer: 'mound', at: [X0 - 0.5, Z0 + 1.25], rx: 0.42, rz: 0.45, h: 1.05 },
      { layer: 'mound', at: [X1 + 0.5, Z0 + 0.45], rx: 0.45, rz: 0.55, h: 1.25 },
      { layer: 'mound', at: [X1 + 0.5, Z0 + 1.25], rx: 0.42, rz: 0.45, h: 1.05 },
      // climbers beside the windows, against the wall, up to just under the eaves (widened from rx 0.14-0.18: they read sparse once trimmed)
      { layer: 'climber', at: [w1.x0 - 0.36, Z0 - 0.22], rx: 0.3, rz: 0.24, h: 3.2 },
      { layer: 'climber', at: [pierL, Z0 - 0.22], rx: 0.26, rz: 0.24, h: 3.25 },
      { layer: 'climber', at: [pierR, Z0 - 0.22], rx: 0.26, rz: 0.24, h: 3.15 },
      { layer: 'climber', at: [w3.x1 + 0.34, Z0 - 0.22], rx: 0.28, rz: 0.24, h: 3.2 },
      // vines hanging from the window heads, over the top of each opening (top just under the head trim)
      { layer: 'curtain', shape: 'hang', at: [w1.x0 + 0.38, Z0 - 0.07], top: WIN_HEAD, w: 0.7, h: 1.1 },
      { layer: 'hanging', shape: 'hang', at: [w1.x1 - 0.2, Z0 - 0.07], top: WIN_HEAD, w: 0.4, h: 0.95 },
      { layer: 'hanging', shape: 'hang', at: [w2.x0 + 0.2, Z0 - 0.07], top: WIN_HEAD, w: 0.4, h: 0.9 },
      { layer: 'curtain', shape: 'hang', at: [w2.x1 - 0.38, Z0 - 0.07], top: WIN_HEAD, w: 0.7, h: 1.2 },
      { layer: 'hanging', shape: 'hang', at: [(w3.x0 + w3.x1) / 2, Z0 - 0.07], top: WIN_HEAD, w: 0.4, h: 1.0 },
      // ...and a row from under the eaves, half a metre out, between and in front of the windows
      ...[X0 + 0.25, w1.x0 + 0.1, pierL, w2.x0 + 0.55, pierR, w3.x1 + 0.1, X1 - 0.1].map((x, k) => ({ layer: 'hanging', shape: 'hang', at: [x, Z0 - 0.45 - (k % 2) * 0.06], top: SOFFIT, w: 0.4, h: [1.0, 0.85, 1.15, 0.9, 1.05, 0.8, 1.1][k] })),
      { layer: 'curtain', shape: 'hang', at: [X1 + 0.07, (s.z0 + s.z1) / 2], top: WIN_HEAD, w: 0.7, h: 1.0, yaw: Math.PI / 2 },
      // the tree: on the street's grass (y -1.85), about 4.5 m out from the river wall
      { layer: 'tree', at: [-3.5, -10.0], base: SITE.ground, rx: 3.5, rz: 3.5, h: 5.5 },
    ],
  },
};
