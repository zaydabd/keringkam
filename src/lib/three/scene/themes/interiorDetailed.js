// The detailed theme: the original look (themes/interior.js) painted with many more brush strokes.
// Same colours, light and ink; only these change:
//   - brush dabs (DABS) on every wooden surface and every curtain: short tapered strokes, a
//     little lighter or darker than the paint under them, about two layers deep over each texture
//     tile (paint.js brushDabs). They are painted on the surfaces' own textures, so each stroke
//     stays inside its object and moves with it (an earlier try painted them on the screen, where
//     they ran across from one object to the next);
//   - nothing is blurred: bleed (the wet-in-wet softening) is off;
//   - an HDR-photo grade (GRADE): rich colour and strong local contrast, detail in darks and lights;
//   - the pigment field is twice as fine (detail 2): wash blotches about 90 px instead of 180;
//   - the fine brushwork in the painted textures (FINE_MARKS: streaks, grain lines, dry-brush
//     sheen, weathering, dye blots, brush tone along carved straps) is three times as dense, with
//     thinner, stronger strokes, at the same texture size. The big soft patches (wood blots,
//     lattice fade) and the knots stay as they are: they set each surface's tone and layout.
// The view outside keeps the original theme's own textures (themes/index.js).

import { INTERIOR_THEME as ORIGINAL } from './interior.js';

// Brush dabs per tile (paint.js brushDabs). Both tiles are about 512 px per metre, so a dab is
// about 8-16 cm long and 1-1.5 cm wide on the surface.
const DAB = { length: [40, 40], width: [4, 4], opacity: [0.08, 0.1], turn: 0.12, darkShare: 0.5 };
const DABS = {
  planks: { ...DAB, count: 1600, angle: 0 }, // 1024 x 256 tile (2 x 0.5 m), along the grain
  curtains: { ...DAB, count: 400, angle: Math.PI / 2 }, // 256 px tile (0.5 m), down the cloth
};

// An HDR-photo grade, against the original's soft, faded one: rich colour and strong local
// contrast (clarity), with the darks opened up and the lights kept, instead of strong global
// contrast, which would crush both (watercolour.js FINISH_SHADER; the original's values in comments).
const GRADE = {
  saturation: 1.0, // 0.62
  contrast: 1.06, // 1.08
  blackLift: '#221812', // '#2e2420': deeper darks, still warm brown
  midLift: 0.84, // 0.86: the mid tones stay lifted so the shadows keep their detail
  clarity: 0.7, // 0: local contrast
  clarityRadius: 14, // px
};

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

/** Each texture's pattern with its brush dabs added. */
const withDabs = (group, dabs) => Object.fromEntries(Object.entries(group).map(([k, t]) => [k, { ...t, pattern: { ...t.pattern, dabs } }]));

const textures = moreBrushwork(ORIGINAL.textures);

export const INTERIOR_THEME = {
  ...ORIGINAL,
  textures: { ...textures, planks: withDabs(textures.planks, DABS.planks), curtains: withDabs(textures.curtains, DABS.curtains) },
  paint: { ...ORIGINAL.paint, detail: 2, bleed: 0 },
  grade: { ...ORIGINAL.grade, ...GRADE },
};
