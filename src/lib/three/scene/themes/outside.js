// The view outside the windows in one place: the air, the sky and the paint of everything out
// there. Change values here to restyle the view; the modules in outside/ and the texture painters
// in paint.js only read them. Colours were tuned in the window shot against colours sampled from R3
// (the user's reference painting, not in the repo) and from the reference photos in
// research/CREDITS.md, unless a comment says otherwise. The room's grade (themes/interior.js) runs
// over the whole screen and takes about a third of the colour out again, so these are stronger
// than the painting's.
//
// Two layers, as in themes/interior.js:
//   1. Swatches: every colour once, grouped by what it is (earth, plants, wood, paint...).
//   2. The theme: what each object is made of, pointing at the swatches.
// Hex colours are sRGB vertex or texture colours; arrays of three numbers are linear (0-1).
//
// The painted textures' marks (clouds, mud, turf) sit with their material, as in
// themes/interior.js: sizes in texture pixels, opacities 0-1, a plain number is fixed and a pair
// [from, by] is random, from `from` up to `from + by`.

// --- 1. Swatches and marks ----------------------------------------------------------------------

const AIR = {
  // Daylight: the colour in the windows, the haze, the sky's horizon and the river's reflection
  // of the sky. Pale, a little green from the garden (R2).
  daylight: '#f4faea',
};

const SKY = {
  // watercolour (R4, pass e6): a cerulean wash, paler low down, with layered cumulus. R4's own
  // samples (pixels off the painting, not real data): blue high #7ab3d8, low #a8d6e5; cloud
  // tops #f9f4e8, body #dfddd3, shade #d0cec5, pools #c4c3ba, darkest #aea89b. The values below
  // are those pushed through the room's grade backwards (it warms, flattens and greys), then
  // tuned in the window shot until the capture matches the samples.
  watercolour: {
    gradient: [[0, '#2a86e8'], [0.55, '#3c9eee'], [0.9, '#7cc8f0']], // [height, colour] from the top; the haze below
    washLight: '#8ccaf4', // the wash's paler strokes and the blooms' middles
    washDeep: '#1e74d8', // and its deeper strokes
    lit: '#fffefb', // bare paper: the clouds' lit tops (a little cool, against the grade's warmth)
    body: '#ecf3ff', // the warm light grey of a cloud's body
    shade: '#b8c4f2', // the cool grey-blue underside
    pool: '#9098d0', // where the grey wash pooled, and its dried edge
  },
  // soft (R2): pale blue with single puffs (the painter's other option; not used in the current shot).
  soft: {
    gradient: [[0, '#a9c8e4'], [0.5, '#d6e6ee'], [0.8, '#eaf2ee']],
    cloudBase: '#bec0d6', // faint lilac bases
    cloudLit: '#fffdf4', // white tops
  },
  // The clouds' marks (paintSoftSky), on a 2048 x 1024 sky; heights are px above the horizon.
  cloudMarks: {
    // watercolour (R4, pass e6). Heights are px above the horizon (the sky is 2048 px round, so
    // 5.7 px a degree); sizes of a mass are scaled by its perspective (tan of its height, of
    // that at `rows.ref`), so masses shrink and crowd towards the horizon. Design choices, tuned
    // in the window shot against R4's cloud cover (pass e6 in research/INTERIOR-NOTES.md).
    watercolour: {
      wash: { strokes: 70, length: [120, 260], thick: [10, 26], opacity: [0.08, 0.12], blooms: 7, bloom: [26, 40] }, // the uneven blue
      // keep: the share of masses painted, [base, + per unit of scale]; widthMax: the largest scale a mass's width and gaps take; jitter: px up or down, at scale 1; a gap below 0 overlaps
      rows: { count: 9, from: 12, to: 270, bias: 1.15, ref: 80, width: [280, 240], gap: [-130, 90], widthMax: 1.5, scaleMin: 0.35, keep: [0.35, 0.7], jitter: 30 },
      // lobes along the top: px of mass per lobe (at scale 1); small: share of small scraps; aspect: a lobe's width and height (of its size); rough: how far its outline wanders
      mass: { tall: [0.14, 0.1], spacing: 18, size: [9, 16], lift: [0.4, 0.6], small: 0.3, aspect: [1.35, 0.85], rough: 0.16 },
      // body: the warm grey's strength; opacity: each lobe's grey-blue shade; crisp: share of washes left with a dried edge; under: the broad wash low on the mass; fade: px (at scale 1) the base fades over
      shade: { body: 0.7, opacity: 0.55, crisp: 0.35, under: 0.35, fade: 7 },
      lit: { opacity: 1, cap: 0.65 }, // the paper-white silhouette; cap: how far down a lobe (of its size) its grey starts
      pool: { perMass: [1, 2], size: [0.05, 0.05], opacity: 0.35 }, // pooled grey: small crisp shapes with a dried rim
      dry: { chance: 0.3, strokes: [3, 4], opacity: 0.35 }, // broken dry-brush strokes off a mass's end
      streaks: { count: 22, height: [4, 26], length: [40, 120], thick: [2, 4], opacity: [0.5, 0.35] }, // thin flat clouds low down
      grain: { count: 9000, opacity: 0.05, granules: 0.35 }, // paper grain over the sky; granules: density in the greys, per 100 px²
    },
    soft: {
      clouds: { count: 26, height: [36, 190], width: [70, 150], puffs: 9, size: [0.16, 0.1] }, // single puffs
      base: { opacity: 0.07 },
      lit: { opacity: 0.6 },
    },
  },
};

const WATER = {
  river: '#cf9a5c', // the body colour seen into the water
  film: '#f4d8a2', // the thin silt film on top
};

const EARTH = {
  // far bank
  mud: '#70522e',
  mudDark: '#6e5234',
  path: '#a8905a',
};

const PLANT = {
  // far bank grass, from the water up
  rough: '#74903a',
  verge: '#7c9434',
  lawnFoot: '#839a36',
  lawn: '#9aa62f',
  terrace: '#93a03a',
  meadow: '#6b822d',
  meadowFar: '#74883a',
  reed: '#4e6a2c',
  tuft: '#5c7630',
  tick: '#7c9030',
  // the bush at the water: grass blades and fern
  blades: ['#7aa63e', '#94b84e', '#5e8a36', '#a8c060'],
  straw: '#c2b06a',
  seedHead: '#a89058', // the grasses' seed heads (design choice; R3 shows none this small)
  fern: '#5c9638',
  fernLight: '#84b44a',
  // trees and bushes on the banks
  foliageLight: '#74a845',
  foliageMid: '#528c3c',
  foliageDark: '#3a6c38',
};

const WOOD = {
  trunk: '#5c5a34', // tree trunks and branches
  deck: '#6b5440', // boat decks
  oar: '#a8875e',
};

// Boat paint, chosen from the photos: each river taxi is painted its own bright colours.
const PAINT = {
  red: { // B1 ("Kuching river taxi 03"): red hull and cabin, black bottom, dark rub rail, white roof,
    // pale green ceiling, orange roof edges
    bottom: '#1c1a1a', stripe: '#3a2a26', hull: '#c42a1e', cabin: '#c42a1e', frame: '#e07a1f',
    roof: '#f2efe8', roofUnder: '#a9c9b4', fascia: '#e07a1f', hatch: '#f6f4ee', hatchEdge: '#e07a1f',
  },
  orange: { // B3 ("Kuching river taxi 02"): teal bottom, yellow stripe, orange cabin, blue roof, yellow edge
    bottom: '#1e9a95', stripe: '#f0c419', hull: '#e5671c', cabin: '#e5671c', frame: '#d4561a',
    roof: '#2f5fa8', roofUnder: '#8a7a66', fascia: '#f0c419', hatch: '#e9eef0', hatchEdge: '#2f9a4a',
  },
  green: { // B2, B4 ("Kuching river taxi 01", "boatman"): green hull, white roof, red roof patch
    bottom: '#1d3b2c', stripe: '#e8e4da', hull: '#2e8a4e', cabin: '#2e8a4e', frame: '#f1ede4',
    roof: '#efece4', roofUnder: '#9a958a', fascia: '#d23b2a', hatch: '#d23b2a', hatchEdge: '#efece4',
  },
};

const CLOTH = {
  // what each boat's boatman wears (from the same photos)
  red: { shirt: '#2aa58a', trousers: '#c9b79a' },
  orange: { shirt: '#d8382e', trousers: '#3b3b44' },
  green: { shirt: '#f0eee8', trousers: '#40404a' },
};

const PEOPLE = { skin: '#8a5a3c' };
const GLASS = { cabin: '#1f2326' };
const SHADE = { cabin: '#2a2220' }; // the dark inside of a boat's cabin

const BUILT = {
  riverWall: '#efe7d1', // the far bank's wall
  // The State Legislative Assembly building (linear).
  assembly: {
    gold: [0.92, 0.63, 0.08], // authored deep: the haze and the room's grade lift it to the photos' yellow gold
    goldShade: [0.66, 0.41, 0.04], // every other roof facet: the ink pass draws the folds
    band: [0.86, 0.8, 0.62],
    rim: [0.74, 0.74, 0.75],
    rimShade: [0.6, 0.6, 0.62],
    bowl: [0.17, 0.11, 0.07], // authored very dark and warm: dark like the model, brown like the painting once hazed
    bowlShade: [0.25, 0.17, 0.1],
    cone: [0.3, 0.29, 0.3],
    coneShade: [0.42, 0.4, 0.4],
    bronze: [0.78, 0.56, 0.28], // the side kiosks' spires
    white: [0.97, 0.94, 0.87],
    brim: [0.88, 0.87, 0.84],
    brimEdge: [0.76, 0.75, 0.72], // a shade darker than the columns, so they read against it
    soffit: [0.66, 0.62, 0.56],
    infill: [0.27, 0.17, 0.14],
    floor: [0.46, 0.3, 0.24],
    stone: [0.9, 0.88, 0.82],
  },
  kioskGold: [1.0, 0.8, 0.42], // the small kiosks' roofs: a lighter gold than the main roof (linear)
  kioskGoldShade: [0.88, 0.66, 0.3],
  // The Darul Hana Bridge (linear).
  bridge: { steel: [0.93, 0.92, 0.88], pier: [0.78, 0.76, 0.7], cable: [0.86, 0.86, 0.84], shade: [0.97, 0.96, 0.92], truss: [0.84, 0.83, 0.78] },
};

// --- 2. The theme -----------------------------------------------------------------------------------

export const OUTSIDE_THEME = {
  air: {
    daylight: AIR.daylight,
    haze: { near: -100, far: 1500 }, // metres: clear air (R3). The Assembly, 330 m off, is about a sixth washed
    // The room is exposed for shade, so sunlit paint outside would burn out to white. The outdoor
    // paint is keyed down by this much instead, as a painter would, so it keeps its colour.
    key: 0.3,
    skyKey: 0.3, // the sky likewise, so its blue survives an exposure set for the shaded room
  },

  // paintSoftSky; its horizon is air.daylight. style picks one of the two looks below.
  sky: {
    style: 'watercolour',
    // The sky's own seed, added to ?seed (a per-job seed, like Blender's Random Seed field), so the
    // sky can be picked without moving the banks, trees or room. 1 = the take picked from the e6 gate.
    seed: 1,
    gain: 1.3, // the dome's brightness on top of air.skyKey: R4's blue and paper white come through the room's grade (pass e6)
    watercolour: { colours: SKY.watercolour, pattern: SKY.cloudMarks.watercolour },
    soft: { colours: SKY.soft, pattern: SKY.cloudMarks.soft },
  },

  water: { body: WATER.river, film: WATER.film }, // water.js

  // The far bank (banks.js), as vertex colours.
  farBank: {
    mud: EARTH.mud,
    mudDark: EARTH.mudDark,
    rough: PLANT.rough,
    path: EARTH.path,
    verge: PLANT.verge,
    lawnFoot: PLANT.lawnFoot,
    lawn: PLANT.lawn,
    terrace: PLANT.terrace,
    meadow: PLANT.meadow,
    meadowFar: PLANT.meadowFar,
    wall: BUILT.riverWall,
    reed: PLANT.reed,
    tuft: PLANT.tuft,
    tick: PLANT.tick,
  },

  // The bush at the water below the window (waterbush.js), as vertex colours. The leaf ramp
  // runs from a warm yellow-green in the sun to a cool blue-green in the shade: watercolour
  // shadows are cool, not grey (Homer, Sargent; research/INTERIOR-NOTES.md, pass e5). Design
  // choices, tuned in the window shot.
  waterBush: {
    ramp: ['#d4e290', '#a8c666', '#7ca64e', '#507c46', '#2e5038'], // sun to deep shade: R4's greens (pass e5b; its sampled pixels include ink lines, so tuned by eye in the window shot), the shade a little cool
    core: '#2a4434', // the dark inside, between the leaves
    stem: '#5a4c36',
    flower: '#fff6f2', // the flowers' vertex tints: the atlas paints their red (textures.leaves)
    flowerDeep: '#e6d4d0',
    fern: PLANT.fern,
    fernLight: PLANT.fernLight,
    blade: PLANT.blades,
    straw: PLANT.straw,
    seedHead: PLANT.seedHead,
  },

  // Painted textures (paint.js).
  textures: {
    // The leaf atlas (paint.js paintLeaves): light greys, the plant's vertex colour sets the green.
    // The edge line stands in for the ink the leaf cards do not get. Sizes are fractions of a cell.
    leaves: {
      // petal, petalDeep and eye are the flower's own colours: it is drawn with a near-white vertex colour
      colours: { fill: '#f2f2ea', fillDark: '#dcdfd2', shade: '#8c9086', vein: '#c4c8b8', edge: '#4c4e44', stem: '#8c8468', washBase: '#b4b8a8', petal: '#cc4a52', petalDeep: '#9d2e35', petalLight: '#e8908a', eye: '#f4e6b8' }, // petals: R4's reds, sampled (pass e5b)
      pattern: {
        cell: 512, // px; the atlas is 3 x 2 cells
        shade: 0.26, // how dark the half of a blade turned from the light is
        vein: 0.012, // midrib width, of the leaf's length
        edge: 3, // px
        // a sprig of small leaves, alternate along a bent stem
        sprig: { top: 0.2, count: 9, length: [0.15, 0.08], width: [0.4, 0.14], spread: [0.7, 0.35], droop: 0.35 },
        // a sprig of fewer, larger leaves that hang further
        sprigBig: { top: 0.24, count: 6, length: [0.25, 0.1], width: [0.44, 0.12], spread: [0.9, 0.3], droop: 0.6 },
        broad: { width: 0.5, veins: 6 }, // one leaf filling its cell, for the weeds' rosettes
        frond: { pairs: 19, reach: 0.34, angle: 0.35, lobes: 3, width: 0.3, edge: 0.8 }, // paired leaflets, each a lobed blade; width: its half-width, of the gap between pairs; edge: its soft rim, of `edge` (pass e5b: slender and soft, as R4's palm-like fronds)
        // the bush at the water (pass e5b): sprays of pointed leaves painted as washes; fan and
        // spread in radians, sizes and wobble of the cell; bloom, rib and rim the alpha of the
        // pooled pigment, the midrib and the dried edge
        wash: { sprays: 3, leaves: 5, fan: 1.3, spread: [0.75, 0.3], length: [0.3, 0.08], width: [0.36, 0.08], wobble: 0.006, bloom: 0.3, rib: 0.35, rim: 0.3 },
        flower: { radius: 0.46, spread: 1.5 }, // radius of the cell; spread: each petal's angle, radians (5 x 1.5 > 2 pi, so they overlap)
      },
    },
  },

  // Trees and bushes on the banks (trees.js).
  trees: { trunk: WOOD.trunk, light: PLANT.foliageLight, mid: PLANT.foliageMid, dark: PLANT.foliageDark },

  // River taxis (boats.js): each scheme is one boat's paint and its boatman's clothes.
  boats: {
    schemes: {
      red: { ...PAINT.red, ...CLOTH.red },
      orange: { ...PAINT.orange, ...CLOTH.orange },
      green: { ...PAINT.green, ...CLOTH.green },
    },
    // Shared by every boat.
    shade: { inside: SHADE.cabin, glass: GLASS.cabin, deck: WOOD.deck, skin: PEOPLE.skin, oar: WOOD.oar },
  },

  // The State Legislative Assembly building (assembly.js), linear.
  assembly: BUILT.assembly,
  kiosk: { gold: BUILT.kioskGold, goldShade: BUILT.kioskGoldShade },

  bridge: BUILT.bridge, // bridge.js, linear
};
