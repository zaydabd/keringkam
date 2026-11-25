// Garden layouts round the house (branch house-exterior, step 2): data only, so a plan drawing
// can be made from the same numbers as the scene (research/tools/garden-plans.mjs). garden.js
// builds them. Each layout is a set of beds (polygons in plan, [x, z]) and plant slots. A slot
// is the volume its plant is cut to: an upright ellipsoid (rx, rz across, h tall) or, for a
// hedge, a box (shape 'box', w along x, d along z). A hanging slot (shape 'hang') is a flat
// panel w wide and h tall, its top at y = top: vines hang in it, uncut. A slot stands on the
// terrace unless it gives its own ground height, `base`. Every place and size is a design choice:
// ESTIMATES.

import { HOUSE } from '../../world/house.js';
import { PLAN } from '../../world/plan.js';
import { SITE } from '../../world/site.js';

const R = PLAN.room;
export const WALLS = { X0: R.x0 - HOUSE.out, X1: R.x1 + HOUSE.out, Z0: R.z0 - HOUSE.out, Z1: R.z1 + HOUSE.out }; // the cladding's faces
const { X0, X1, Z0 } = WALLS;
const HOUSE_FLOOR_ABOVE_GROUND = -HOUSE.ground.y;
const WIN_HEAD = PLAN.window.y1 + 0.06; // just under the head trim outside
const SOFFIT = HOUSE.plate + 0.06 - HOUSE.roof.overhang * Math.tan((HOUSE.roof.pitch * Math.PI) / 180) - 0.17; // under the eaves' lining // 0.45: a slot's h is from the terrace, the floor is this much higher // the terrace's edge, where the bank drops to the street (-6.8)
const [w1, w2, w3] = PLAN.backWindows;
const s = PLAN.sideWindow;

// What each layer is, its plant, and its placeholder colour.
export const LAYERS = {
  mound: { plant: 'bougainvillea', label: 'Bougainvillea bush, trimmed (tops about 1.3 m above the floor)', colour: '#c2407f' },
  climber: { plant: 'bougainvillea', label: 'Bougainvillea trained up the wall beside a window', colour: '#f08cc0' },
  curtain: { plant: 'vineCurtain', label: 'Vine curtain hanging from a window head', colour: '#4f9e3a' },
  hanging: { plant: 'hangingVine', label: 'Hanging vine from the eaves', colour: '#7cc24f' },
  tree: { plant: 'rainTree', label: 'Rain tree, kept small (about 4 m tall)', colour: '#3d6b2f' },
};

const wallZ = Z0 - 0.02; // a bed's edge along the river wall
const sideX = X1 + 0.02; // ...and along the right wall
const pierL = (w1.x1 + w2.x0) / 2, pierR = (w2.x1 + w3.x0) / 2;
export const LAYOUTS = {
  // The user's design (2026-11-25): bougainvillea all along the river wall, wrapping round both
  // corners, its tops trimmed about 1.3 m above the floor so a band of flowers shows at the bottom
  // of the windows; a few trained up the wall beside the windows like creepers; vines hanging
  // from the window heads and the eaves, so they show hanging at the top of the windows from
  // inside; one rain tree on the grass below the bank in front of the left window, so it shows
  // through that window from the seat (the user's choice; the two side trees were taken out).
  bougainvillea: {
    label: 'Bougainvillea all along, hanging vines',
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
