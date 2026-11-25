// The far bank's ground under the grass fur (?flora=stylised only; the fur itself is fur.js): the
// bank's ground paint swapped to dark greens like the trees' leaves (banks.js `paint`), so any
// gap in the fur still reads as grass. Design choices, not measurements.

import { rgb } from './site.js';
import { OUTSIDE_THEME } from '../themes/index.js';

// The bank's ground as grass: the worn path grassed over too (the whole bank covered).
export const FAR_GRASS_GROUND = Object.fromEntries(Object.entries(OUTSIDE_THEME.fur.ground).map(([k, hex]) => [k, rgb(hex)]));
