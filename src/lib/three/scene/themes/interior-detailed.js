// The detailed theme: the original look (themes/interior.js) with about twice the watercolour
// detail. Same colours, light, ink and grade; only these change:
//   - the pigment field is twice as fine: wash blotches about 90 px and mottle about 22 px on
//     screen, instead of 180 and 45, so there are twice as many across the screen;
//   - the fine brushwork in the painted textures is twice as dense (FINE_MARKS: streaks, grain
//     lines, dry-brush sheen, weathering, dye blots, brush tone along carved straps). The big soft
//     patches (wood blots, lattice fade) and the knots stay as they are: they set the tone and
//     layout of each surface, not its detail.
// The view outside keeps the original theme's own textures (themes/index.js); the watercolour pass
// runs over the whole screen, so it gets the finer field too.

import { INTERIOR_THEME as ORIGINAL } from './interior.js';

const DETAIL = 2;

/** The marks that are brushwork detail: their counts are multiplied by DETAIL. */
const FINE_MARKS = new Set(['streaks', 'lines', 'sheen', 'silver', 'checks', 'dye', 'tone']);

/** A copy of a theme's textures with each fine mark's count times `by` (everything else as is). */
function moreBrushwork(value, by, key = '') {
  if (Array.isArray(value)) return value.map((v) => moreBrushwork(v, by));
  if (value === null || typeof value !== 'object') return value;
  const copy = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, moreBrushwork(v, by, k)]));
  if (FINE_MARKS.has(key) && typeof copy.count === 'number') copy.count = Math.round(copy.count * by);
  return copy;
}

export const INTERIOR_THEME = {
  ...ORIGINAL,
  textures: moreBrushwork(ORIGINAL.textures, DETAIL),
  paint: { ...ORIGINAL.paint, detail: DETAIL, granulation: ORIGINAL.paint.granulation * DETAIL },
};
