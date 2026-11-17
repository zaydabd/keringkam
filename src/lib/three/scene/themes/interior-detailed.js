// The detailed theme: the original look (themes/interior.js) painted with many more brush strokes.
// Same colours, light, ink and grade; only these change:
//   - brush strokes over the whole screen (STROKES): two overlapping layers of short tapered
//     strokes, about one per 12 px cell in each (roughly 15,000 on a 1240 x 900 screen). Each one
//     is a little lighter or darker than its neighbours, so every surface, the furniture and the
//     view outside included, reads as painted stroke by stroke. Nothing is blurred: bleed (the
//     wet-in-wet softening) is off too, so the image stays sharp;
//   - the pigment field is twice as fine (detail 2): wash blotches about 90 px instead of 180;
//   - the fine brushwork in the painted textures (FINE_MARKS: streaks, grain lines, dry-brush
//     sheen, weathering, dye blots, brush tone along carved straps) is three times as dense, with
//     thinner, stronger strokes, at the same texture size. The big soft patches (wood blots,
//     lattice fade) and the knots stay as they are: they set each surface's tone and layout.
// The view outside keeps the original theme's own textures (themes/index.js).

import { INTERIOR_THEME as ORIGINAL } from './interior.js';

const STROKES = { contrast: 0.2, cell: 12, length: [18, 16], width: [5, 4], turn: 0.35 };

/** The marks that are brushwork detail, and how they change: more, thinner, stronger strokes. */
const FINE_MARKS = new Set(['streaks', 'lines', 'sheen', 'silver', 'checks', 'dye', 'tone']);
const BRUSHWORK = { count: 3, width: 0.6, opacity: 1.5 };
const SCALED = { count: 'count', width: 'width', thickness: 'width', opacity: 'opacity', darkOpacity: 'opacity', lightOpacity: 'opacity' };

/** One mark setting times `by`: a number or a [from, by] pair; counts stay whole, opacities at most 1. */
function scale(v, by, what) {
  if (Array.isArray(v)) return v.map((x) => scale(x, by, what));
  if (typeof v !== 'number') return v;
  if (what === 'count') return Math.round(v * by);
  return what === 'opacity' ? Math.min(1, v * by) : v * by;
}

/** A copy of a theme's textures with each fine mark changed by BRUSHWORK (everything else as is). */
function moreBrushwork(value, key = '') {
  if (Array.isArray(value)) return value.map((v) => moreBrushwork(v));
  if (value === null || typeof value !== 'object') return value;
  const copy = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, moreBrushwork(v, k)]));
  if (FINE_MARKS.has(key) && typeof copy.count === 'number') {
    for (const [k, what] of Object.entries(SCALED)) if (k in copy) copy[k] = scale(copy[k], BRUSHWORK[what], what);
  }
  return copy;
}

export const INTERIOR_THEME = {
  ...ORIGINAL,
  textures: moreBrushwork(ORIGINAL.textures),
  paint: { ...ORIGINAL.paint, detail: 2, bleed: 0, strokes: STROKES },
};
