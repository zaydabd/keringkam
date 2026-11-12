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
  // vivid (R3): a strong, clear blue that holds almost to the horizon, with wide cumulus banks.
  // Painted more saturated than it should look: the room's grade takes a third of the colour out.
  vivid: {
    gradient: [[0, '#1f6fd6'], [0.6, '#3f8fe6'], [0.93, '#8cc4f0']], // [height, colour] from the top; the haze below
    cloudBase: '#9a9eb8', // the flat shaded base: cool grey, the shade side of a cumulus
    cloudShade: '#c8c5cc', // each lobe's warm grey shade
    cloudLit: '#fffdf6', // and its lit cap
  },
  // soft (R2): pale blue with single puffs (the painter's other option; not used in the current shot).
  soft: {
    gradient: [[0, '#a9c8e4'], [0.5, '#d6e6ee'], [0.8, '#eaf2ee']],
    cloudBase: '#bec0d6', // faint lilac bases
    cloudLit: '#fffdf4', // white tops
  },
  // The clouds' marks (paintSoftSky), on a 2048 x 1024 sky; heights are px above the horizon.
  cloudMarks: {
    vivid: {
      banks: { count: 8, scatter: 0.7, height: [60, 120], width: [220, 300], tall: [0.22, 0.12] }, // wide cumulus banks round the sky
      low: { count: 10, height: [18, 30], width: [60, 90], tall: [0.18, 0.08] }, // small clouds low near the horizon
      lobes: { spacing: 9, size: [8, 22], minSize: 6, lift: [0.4, 0.6] }, // the lumpy tops: px of bank per lobe
      base: { opacity: 0.4, core: 0.6 }, // the flat shaded base (core: how far out a puff stays solid)
      shade: { opacity: 0.8, core: 0.78 }, // each lobe's shade
      lit: { opacity: 0.97, core: 0.82, minLift: 0.2 }, // and its lit cap (only on lobes standing this high)
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
  puddle: '#b8b49e', // puddles on the near bank
};

const EARTH = {
  // far bank
  mud: '#70522e',
  mudDark: '#6e5234',
  path: '#a8905a',
  // near bank, from the water up
  mudUnder: '#5a4430',
  mudWet: '#6c5238',
  mudFlat: '#bca47c',
  mudTrack: '#c6b08a',
  clod: '#6a5038',
  clodLight: '#a8875e',
  // The painted mud texture (paintMud), in light values: the band's colour sets the hue.
  texture: {
    ground: '#f6f0e8',
    patches: ['#8c7c6c', '#fffcf4'], // mottled wet and dry patches: darker, lighter
    hollow: '#5c5048', // wet hollows
    trickle: '#584c44', // trickle and drag marks
    clod: ['#4e443e', '#fffcf6'], // small clods: shade, lit top
    grit: ['#faf8f2', '#5a544e'], // grit: fill, outline
  },
  // The mud's marks (paintMud), one 512 px tile.
  mudMarks: {
    patches: { count: 90, length: [28, 70], width: [18, 46], opacity: [0.2, 0.25], darkShare: 0.6 }, // mottled wet and dry patches
    hollows: { count: 34, length: [16, 40], width: [8, 22], opacity: [0.3, 0.25] }, // wet hollows
    trickles: { count: 140, length: [18, 60], width: [1.2, 2.8], opacity: [0.3, 0.35], tilt: 0.7, alongShare: 0.6, wobble: 6 }, // trickle and drag marks
    clods: { count: 520, size: [1.2, 5.5], shadeOpacity: [0.3, 0.35], litOpacity: [0.25, 0.3] }, // size is skewed small
    grit: { count: 260, size: [0.8, 1.8], opacity: 0.7, outline: 0.8, outlineOpacity: 0.35 },
    noise: 18, // fine paper grain over everything
  },
};

const STONE = {
  stone: '#928b7c',
  stoneLight: '#b4ac9a',
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
  // near bank grass bands
  berm: '#8fae4c',
  shoulder: '#7c9c44',
  level: '#80a048',
  // near bank shrubs, blades and fern
  leafLight: '#a2c85e',
  leafMid: '#78a844',
  leafDark: '#527e36',
  leafCore: '#6a9c40',
  blades: ['#7aa63e', '#94b84e', '#5e8a36', '#a8c060'],
  straw: '#c2b06a',
  fern: '#5c9638',
  fernLight: '#84b44a',
  // trees and bushes on the banks
  foliageLight: '#74a845',
  foliageMid: '#528c3c',
  foliageDark: '#3a6c38',
  // The painted turf texture (paintTurf), in light values: the band's colour sets the hue.
  turf: {
    ground: '#eef2e2',
    lush: '#788664', // soft lush patches
    dry: '#fff4c4', // and dry ones
    blades: ['#46583a', '#ffffee', '#ecdc96'], // short blade strokes: dark, light, straw
  },
  // The turf's marks (paintTurf), one 512 px tile.
  turfMarks: {
    lush: { count: 70, length: [24, 60], width: [18, 44], opacity: [0.2, 0.22] },
    dry: { count: 26, length: [20, 50], width: [14, 36], opacity: [0.14, 0.16] },
    // blades: lean in radians from upright; split: dark below the first, light below the second, the rest straw
    blades: { count: 14000, length: [3, 7], width: [0.9, 0.8], lean: 1.1, split: [0.45, 0.8], opacity: [[0.4, 0.35], [0.35, 0.3], [0.3, 0.3]] },
    noise: 14,
  },
};

const WOOD = {
  drift: '#7a6650', // driftwood and posts on the near bank
  driftPale: '#b0a088',
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
  // City skyline towers (R3): pale grey to grey-blue (linear). Each tower gets a random value
  // tone = min + random * spread and a random blueness b (0-1); its colour is
  // tone * [red[0] + red[1] * (1 - b), green, blue[0] + blue[1] * b].
  skyline: { tone: { min: 0.66, spread: 0.18 }, red: [0.86, 0.08], green: 0.94, blue: [1.02, 0.1] },
};

// --- 2. The theme -----------------------------------------------------------------------------------

export const OUTSIDE_THEME = {
  air: {
    daylight: AIR.daylight,
    haze: { near: -100, far: 1500 }, // metres: clear air (R3). The Assembly, 330 m off, is about a sixth washed; the skyline a third
    // The room is exposed for shade, so sunlit paint outside would burn out to white. The outdoor
    // paint is keyed down by this much instead, as a painter would, so it keeps its colour.
    key: 0.3,
    skyKey: 0.3, // the sky likewise, so its blue survives an exposure set for the shaded room
  },

  // paintSoftSky; its horizon is air.daylight. style picks one of the two looks below.
  sky: {
    style: 'vivid',
    vivid: { colours: SKY.vivid, pattern: SKY.cloudMarks.vivid },
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

  // The near bank (nearbank.js), as vertex colours. The textured bands are lifted because the
  // detail textures darken them.
  nearBank: {
    mudUnder: EARTH.mudUnder,
    mudWet: EARTH.mudWet,
    mudFlat: EARTH.mudFlat,
    mudTrack: EARTH.mudTrack,
    berm: PLANT.berm,
    shoulder: PLANT.shoulder,
    level: PLANT.level,
    clod: EARTH.clod,
    clodLight: EARTH.clodLight,
    stone: STONE.stone,
    stoneLight: STONE.stoneLight,
    wood: WOOD.drift,
    woodPale: WOOD.driftPale,
    puddle: WATER.puddle,
    leafLight: PLANT.leafLight,
    leafMid: PLANT.leafMid,
    leafDark: PLANT.leafDark,
    leafCore: PLANT.leafCore,
    blade: PLANT.blades,
    straw: PLANT.straw,
    fern: PLANT.fern,
    fernLight: PLANT.fernLight,
  },
  // The near bank's painted detail textures (paint.js).
  textures: {
    mud: { colours: EARTH.texture, pattern: EARTH.mudMarks },
    turf: { colours: PLANT.turf, pattern: PLANT.turfMarks },
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
  skyline: BUILT.skyline, // outside/index.js
};
