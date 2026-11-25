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

// The placeholder colour of each layer: debug only, for telling the layers apart in a layout
// sketch, never part of the look (so not in themes/).
const PLACEHOLDER_COLOURS = { mound: '#c2407f', climber: '#f08cc0', curtain: '#4f9e3a', hanging: '#7cc24f', tree: '#3d6b2f' };

// What each layer is, its plant, and its placeholder colour.
export const LAYERS = {
  mound: { plant: 'bougainvillea', label: 'Bougainvillea bush, trimmed (tops about 1.3 m above the floor)', colour: PLACEHOLDER_COLOURS.mound },
  hedge: { plant: 'bougainvillea', label: 'Bougainvillea hedge, trimmed square (top about 1.1 m above the floor)', colour: PLACEHOLDER_COLOURS.mound },
  curtain: { plant: 'vineCurtain', label: 'Vine curtain hanging from a window head', colour: PLACEHOLDER_COLOURS.curtain },
  hanging: { plant: 'hangingVine', label: 'Hanging vine from the eaves', colour: PLACEHOLDER_COLOURS.hanging },
  tree: { plant: 'rainTree', label: 'Rain tree, kept small (about 4 m tall)', colour: PLACEHOLDER_COLOURS.tree },
};

const wallZ = Z0 - 0.02; // a bed's edge along the river wall
const sideX = X1 + 0.02; // ...and along the right wall
const pierL = (w1.x1 + w2.x0) / 2, pierR = (w2.x1 + w3.x0) / 2;
export const LAYOUTS = {
  // The user's design (2026-11-25): bougainvillea all along the river wall, wrapping round both
  // corners, its tops trimmed about 1.3 m above the floor so a band of flowers shows at the bottom
  // of the windows (the ones trained up the wall were taken out: the user, 2026-11-25); vines hanging
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
      // the row outside the windows: one long trimmed hedge, a box with rounded edges and a flat top
      // 1.1 m above the floor (the user, 2026-11-25: "it should look like one rectangle", not a row
      // of round mounds). rx and rz are its half sizes, for the plan drawing.
      { layer: 'hedge', shape: 'box', at: [(X0 + X1) / 2, Z0 - 0.5], w: X1 - X0 + 2.2, d: 0.84, rx: (X1 - X0 + 2.2) / 2, rz: 0.42, h: HOUSE_FLOOR_ABOVE_GROUND + 1.1 },
      // round the corners: short hedges along the side walls, a little lower
      { layer: 'hedge', shape: 'box', at: [X0 - 0.5, Z0 + 0.8], w: 0.84, d: 1.6, rx: 0.42, rz: 0.8, h: 1.05 },
      { layer: 'hedge', shape: 'box', at: [X1 + 0.5, Z0 + 0.8], w: 0.84, d: 1.6, rx: 0.42, rz: 0.8, h: 1.05 },
      // vines hanging from the window heads, at the sides of each opening so its middle stays open
      // (the user, 2026-11-25: "make it on the sides a bit"); the wide curtains centred near the
      // edge, half over the wall beside; top just under the head trim
      { layer: 'curtain', shape: 'hang', at: [w1.x0 + 0.08, Z0 - 0.07], top: WIN_HEAD, w: 0.7, h: 1.1 },
      { layer: 'hanging', shape: 'hang', at: [w1.x1 - 0.12, Z0 - 0.07], top: WIN_HEAD, w: 0.4, h: 0.95 },
      { layer: 'hanging', shape: 'hang', at: [w2.x0 + 0.12, Z0 - 0.07], top: WIN_HEAD, w: 0.4, h: 0.9 },
      { layer: 'curtain', shape: 'hang', at: [w2.x1 - 0.08, Z0 - 0.07], top: WIN_HEAD, w: 0.7, h: 1.2 },
      // the narrow right window: one each side, half on the wall beside it
      { layer: 'hanging', shape: 'hang', at: [w3.x0 - 0.02, Z0 - 0.07], top: WIN_HEAD, w: 0.4, h: 1.0 },
      { layer: 'hanging', shape: 'hang', at: [w3.x1 + 0.02, Z0 - 0.07], top: WIN_HEAD, w: 0.4, h: 0.9 },
      // ...and a row from under the eaves, half a metre out, between the windows and at their sides (none over the middle of one)
      ...[X0 + 0.25, w1.x0 + 0.1, pierL, w2.x0 + 0.1, pierR, w3.x1 + 0.1, X1 - 0.1].map((x, k) => ({ layer: 'hanging', shape: 'hang', at: [x, Z0 - 0.45 - (k % 2) * 0.06], top: SOFFIT, w: 0.4, h: [1.0, 0.85, 1.15, 0.9, 1.05, 0.8, 1.1][k] })),
      { layer: 'curtain', shape: 'hang', at: [X1 + 0.07, (s.z0 + s.z1) / 2], top: WIN_HEAD, w: 0.7, h: 1.0, yaw: Math.PI / 2 },
      // the tree: on the street's grass (y -1.85), about 4.5 m out from the river wall
      { layer: 'tree', at: [-3.5, -10.0], base: SITE.ground, rx: 3.5, rz: 3.5, h: 5.5 },
    ],
  },
};
