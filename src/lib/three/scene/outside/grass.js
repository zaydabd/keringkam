// The far bank's ground under the grass fur (?flora=stylised only; the fur itself is fur.js): the
// bank's ground paint swapped to dark greens like the trees' leaves (banks.js `paint`), so any
// gap in the fur still reads as grass. Design choices, not measurements.

import { rgb } from './site.js';

// The bank's ground as grass: the worn path grassed over too (the whole bank covered).
export const FAR_GRASS_GROUND = {
  path: rgb('#3b5a2a'),
  verge: rgb('#3a5929'),
  lawnFoot: rgb('#3d5e2b'),
  lawn: rgb('#3f612c'),
  terrace: rgb('#3a5a2a'),
  meadow: rgb('#365427'),
  meadowFar: rgb('#334f26'),
};
