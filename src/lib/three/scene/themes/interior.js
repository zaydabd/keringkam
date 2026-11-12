// The room's look in one place. Change values here to restyle the room; interior.js and the
// texture painters in paint.js only read them. Colours were picked from R1 and R2 (the user's
// reference paintings, not in the repo) unless a comment says otherwise.
//
// Two layers:
//   1. Swatches: every colour once, grouped by what it is (all the wood together, all the cloth...).
//   2. The theme: what each part of the room is made of, pointing at the swatches. Parts that share
//      a swatch change together.
// The ink, watercolour and grade passes run over the whole screen, so they also apply to the view
// outside the windows (themes/outside.js has that view's own colours and light).
//
// Hex colours are sRGB. The painted textures are mostly light values: the material colour sets
// the hue. Arrays of three numbers are linear multipliers used in shaders, as noted.
//
// Each material also holds its marks: the brushwork paint.js draws on its texture (the wood's grain,
// the batik's patches, the crimson cloth's creases...). Sizes are in texture pixels; opacities 0-1.
// In marks a plain number is fixed and a pair [from, by] is random, from `from` up to `from + by`
// (so [60, 160] is 60 to 220). Counts are per texture tile.

// --- 1. Swatches and marks ----------------------------------------------------------------------

// The wood grain (paintPlanks), one tile = 2 m of board. Furniture and rails ("boards"):
const BOARD_GRAIN = {
  blots: { count: 34, length: [60, 160], width: [20, 50], opacity: [0.06, 0.08], warmShare: 0.5 }, // big soft patches of warmer or paler wood
  streaks: { count: 70, width: [3, 16], opacity: [0.045, 0.08], waves: 3, sway: [2, 6], lightShare: 0.4 }, // broad soft bands along the board
  lines: { count: 26, length: [120, 520], width: [0.8, 1.5], opacity: [0.07, 0.15], waves: 3, sway: [1, 4] }, // the fine grain strokes
  knots: { count: 3, size: [8, 10], opacity: 0.35, rings: 3, ringOpacity: 0.22, ringWidth: 1.2 }, // the grain bends round them
  sheen: { count: 30, length: [60, 200], dash: [6, 22], gap: [3, 10], thickness: 1.5, opacity: [0.18, 0.15] }, // broken dry-brush highlights
};

const WOOD = {
  walls: '#977462', // mid brown boards, a little grey, as in R2
  ceiling: '#6e5646', // grey-brown boards, as R2's ceiling (seen on tall screens)
  frames: '#6a3a24', // window frames, dado rail
  floor: '#a06e50', // warm brown floor boards (R2)
  furniture: '#9c683e', // honey-brown furniture (R2 is browner than R1's gold)
  tableTop: '#c08a56', // table tops: brown and polished in R2 (they mirror the windows)
  carving: '#d6bb98', // lighter carved panels, as in R2
  pictureFrame: '#6b4a2c',
  // The painted plank texture (paintPlanks), shared by every board in the room.
  grain: {
    paper: '#eeeae4', // the light ground the grain is painted on
    paperWeathered: '#e6e4e0', // the floor's, a little greyer
    blotWarm: '#96683c', // big soft patches of warmer wood
    blotPale: '#fff8ec', // and paler wood
    streakLight: '#fffaee',
    streakDark: '#60462e',
    line: '#422816', // fine grain strokes
    knot: '#462a18',
    silver: '#cdd2d6', // sun-bleached streaks (weathered boards only)
    check: '#302016', // short cracks along the grain (weathered boards only)
    sheen: '#fffcf4', // dry-brush highlights
  },
  grainMarks: {
    boards: BOARD_GRAIN,
    // The floor: weathered, with sun-bleached silver streaks and checks (short cracks along the grain).
    floor: {
      ...BOARD_GRAIN,
      weathering: {
        silver: { count: 40, length: [80, 300], width: [2, 6], opacity: [0.12, 0.16] },
        checks: { count: 26, length: [30, 120], width: [1, 1.2], opacity: [0.35, 0.3] },
      },
    },
    // The walls (R2): long soft brush streaks and only a few faint grain lines, no knots.
    wall: {
      ...BOARD_GRAIN,
      streaks: { ...BOARD_GRAIN.streaks, count: 110, opacity: [0.07, 0.12] },
      lines: { ...BOARD_GRAIN.lines, count: 9 },
      knots: { ...BOARD_GRAIN.knots, count: 0 },
    },
  },
  // The carved lattice texture (paintLattice): dark carving behind light strips.
  lattice: { dark: '#3a2418', light: '#efe2c8', toneDark: '#785032', toneLight: '#fffaf0' },
  latticeMarks: {
    back: { strip: 26, node: 17, ring: 34 }, // the dark carving: strip width, small and ring node radius
    front: { strip: 17, node: 12, ring: 29 }, // the light strips on top
    hole: { radius: 18, edge: 4 }, // the hole through each ring node, and its dark edge
    tone: { count: 400, length: [10, 30], width: [2, 3], opacity: [0.06, 0.08], darkShare: 0.5 }, // brush tone along the strips
  },
};

const FABRIC = {
  undyed: '#ffffff', // cloth whose colour is all in its painted texture (no tint)
  white: '#fffaf2', // pale curtains
  whiteGlow: '#fff4e4', // and the light through them
  tape: '#2f5f6a', // lacing tapes on the embroidery frame
  bag: '#2c2420', // the cloth bag by the frame
  // Curtain batik (paintCurtain), after R2: hand-painted patches on a dyed ground.
  valance: {
    ground: '#94412a', // rust
    dye: ['#6e2416', '#b45a32'], // uneven dye: darker, lighter
    inks: ['#ead7aa', '#dcb46e', '#efe0bc', '#e2c48a', '#6e2616'], // cream and ochre patches
    hem: '#5c1e12', // dark hem band
  },
  drape: {
    ground: '#8f8274', // cream-grey
    dye: ['#9696a0', '#e8dcc8'],
    inks: ['#8e4630', '#66728a', '#9c5638', '#55637c', '#cdbda4', '#7a4a3a', '#6b7890'], // rust and slate-blue patches
  },
  sheerGround: '#efe6d6', // the pale sheer: the drape's pattern, very faint on cream
  curtainStreaks: ['#3c221a', '#fff4e2'], // brush streaks down every curtain: dark, light
  // The batik's marks (paintCurtain), one tile = 0.5 m. Motif sizes are shares of the cell.
  batikMarks: {
    valance: {
      dye: { count: 18, size: [20, 40], opacity: [0.12, 0.14], darkShare: 0.5 }, // uneven dye blots
      motifs: { cell: 51.2, opacity: [0.78, 0.2], main: [0.44, 0.14], inner: [0.16, 0.08], beside: [0.14, 0.08] }, // five across the tile
      streaks: { count: 22, width: [2, 9], darkOpacity: [0.05, 0.08], lightOpacity: [0.04, 0.07], darkShare: 0.5 },
      hem: { fromBottom: 22, height: 7, opacity: 0.6 }, // the dark hem band
    },
    drape: {
      dye: { count: 18, size: [20, 40], opacity: [0.12, 0.14], darkShare: 0.5 },
      motifs: { cell: 64, opacity: [0.78, 0.2], main: [0.44, 0.14], inner: [0.16, 0.08], beside: [0.14, 0.08] }, // four across
      streaks: { count: 22, width: [2, 9], darkOpacity: [0.05, 0.08], lightOpacity: [0.04, 0.07], darkShare: 0.5 },
      hem: null,
    },
    // the sheer: the drape's pattern, very faint
    pale: {
      dye: { count: 18, size: [20, 40], opacity: [0.04, 0.05], darkShare: 0.5 },
      motifs: { cell: 64, opacity: 0.08, main: [0.44, 0.14], inner: [0.16, 0.08], beside: [0.14, 0.08] },
      streaks: { count: 22, width: [2, 9], darkOpacity: [0.02, 0.03], lightOpacity: [0.04, 0.07], darkShare: 0.5 },
      hem: null,
    },
  },
  // The red cloth on the embroidery frame (paintCloth): deep crimson with creases and gold bands.
  crimson: {
    ground: '#b3242a',
    blots: ['#820e18', '#ec544a'], // darker, lighter
    creases: ['#6e0a14', '#ff826e'], // dark crease, its light edge
    weave: '#5a0010', // fine horizontal threads
    bandShade: '#781014', // the band sits on slightly darker cloth
    gold: '#e2b860', // ruled lines
    goldLight: '#edc978', // diamonds and dots
  },
  crimsonMarks: {
    blots: { count: 22, length: [40, 90], width: [30, 60], opacity: [0.1, 0.12], darkShare: 0.55 },
    // long soft diagonal creases, dark with a light edge; angle in radians, bend in px
    creases: { count: 9, length: [80, 180], angle: [-0.5, 1.0], width: [2, 3], darkOpacity: [0.16, 0.12], edgeOpacity: [0.1, 0.1], edgeOffset: 3, bend: 24 },
    weave: { spacing: 2, thread: 1, opacity: [0.03, 0.04] }, // fine horizontal threads
    // the gold band across each end (R2)
    band: {
      inset: 34, width: 58, shadeMargin: 4, shadeOpacity: 0.35,
      rules: [[0, 2.5], [5, 1.5], [53, 1.5], [58, 2.5]], ruleMargin: 10, // ruled lines: [x in the band, width]
      rows: { from: 22, every: 20, endMargin: 14, diamond: 7, hole: 3, dots: [14, 42], dotDrop: 9, dot: 3 }, // diamonds with a hole, and dots
    },
  },
  // Woven mats on the wall (paintDecor): two colours of check each, a soft shadow on each strand.
  mats: [['#d8b77a', '#a8804a'], ['#7da35a', '#d9c690'], ['#8a5a8a', '#e0c890'], ['#c9a05a', '#5f8a6a'], ['#b04a3a', '#e8d4a8']],
  matShadow: '#28180c',
  matEdge: '#3a2418',
  matMarks: { cells: 12, shadow: 2, shadowOpacity: 0.18, edge: 8 }, // checks across, strand shadow px, border px
};

const PAPER = {
  // Framed pictures (paintDecor): the painted ground and the flowers on it.
  pictures: [{ ground: '#efe6d0', flower: '#d8473a' }, { ground: '#d9e4e8', flower: '#3a6aa8' }, { ground: '#f2ead8', flower: '#e09a2a' }],
  pictureMarks: { frame: 18, stems: 5, stemWidth: 3, flower: [7, 6] }, // frame width, stems per picture, flower radius (px)
};

const PLANT = {
  leaf: '#84a552', // lighter, yellower leaves (R2)
  paintedStem: '#4c7a3a', // the stems in the framed pictures
};

const CERAMIC = {
  plate: '#e6dcc0',
};

// --- 2. The theme -----------------------------------------------------------------------------------

export const INTERIOR_THEME = {
  // Base colour of each material in interior.js (it multiplies the material's texture).
  materials: {
    floor: WOOD.floor,
    wall: WOOD.walls,
    ceiling: WOOD.ceiling,
    frame: WOOD.frames,
    wood: WOOD.furniture,
    top: WOOD.tableTop,
    lattice: WOOD.carving,
    carve: WOOD.furniture, // chair-back carving: the furniture's wood
    valance: FABRIC.undyed,
    sheer: FABRIC.undyed,
    white: FABRIC.white,
    cloth: FABRIC.undyed,
    decor: FABRIC.undyed, // mats and pictures: all colour is in the texture
    plate: CERAMIC.plate,
    leaf: PLANT.leaf,
    tape: FABRIC.tape,
    bag: FABRIC.bag,
  },
  // The colour of the light through the curtains and cloth (emissive; strengths are in light.glow).
  glow: { valance: FABRIC.undyed, sheer: FABRIC.undyed, white: FABRIC.whiteGlow, cloth: FABRIC.undyed },
  wallTint: 0.45, // R2: neighbouring wall boards differ clearly in value
  partWarmth: 0.5, // each plank and part is also a little warmer or cooler: this share of its value variation

  // The painted textures (paint.js): which colours and which marks each uses.
  textures: {
    planks: {
      boards: { colours: WOOD.grain, pattern: WOOD.grainMarks.boards },
      floor: { colours: WOOD.grain, pattern: WOOD.grainMarks.floor },
      wall: { colours: WOOD.grain, pattern: WOOD.grainMarks.wall },
    },
    lattice: { colours: WOOD.lattice, pattern: WOOD.latticeMarks },
    curtains: {
      valance: { colours: { ...FABRIC.valance, streaks: FABRIC.curtainStreaks }, pattern: FABRIC.batikMarks.valance },
      drape: { colours: { ...FABRIC.drape, streaks: FABRIC.curtainStreaks }, pattern: FABRIC.batikMarks.drape },
      pale: { colours: { ...FABRIC.drape, ground: FABRIC.sheerGround, streaks: FABRIC.curtainStreaks }, pattern: FABRIC.batikMarks.pale },
    },
    cloth: { colours: FABRIC.crimson, pattern: FABRIC.crimsonMarks },
    decor: {
      colours: { mats: FABRIC.mats, matShadow: FABRIC.matShadow, matEdge: FABRIC.matEdge, pictures: PAPER.pictures, frame: WOOD.pictureFrame, stem: PLANT.paintedStem },
      pattern: { weave: FABRIC.matMarks, picture: PAPER.pictureMarks },
    },
  },

  light: {
    // One level for everything that gives off light (lamps, daylight, glowing cloth, painted
    // reflections). It is set so the metered exposure comes out near 1 in the design view; at 1
    // the meter sat on its upper limit (1.85) in every view.
    level: 1.75,
    exposureEV: 0, // stops of compensation on top of the metered exposure
    // Sun behind the window wall, high enough that the patches fall just inside the windows.
    sun: { color: '#ffe6c4', intensity: 3.2 },
    bounce: { sky: '#fff2e4', ground: '#5a443a', intensity: 2.2 }, // warm bounce off the floor and walls
    fill: { color: '#ffd6ac', intensity: 0.55 }, // soft light from the room behind the camera
    // Curtains and cloth lit from behind (emissive strength, times the level above).
    glow: { valance: 0.25, sheer: 0.12, white: 0.35, cloth: 0.12 },
    // Polished boards mirror the bright windows and the red cloth (glossBoards in interior/surfaces.js).
    gloss: {
      window: [1.0, 0.74, 0.46], // the windows' colour in the boards (linear)
      clothTint: { multiply: [1.7, 0.6, 0.45], add: [0.05, 0.0, 0.0] }, // the red cloth's tint on the boards (linear)
      floor: { strength: 1.45, cloth: 0.55, falloff: 0.62 },
      top: { strength: 1.5 },
    },
    // The soft shadows painted under the furniture: the patch, and a darker one right under each piece.
    contactShadow: { color: '#24140e', opacity: 0.9, core: 0.75 },
  },

  // Soft painted ramp (R2): lavender-grey shade, warm half-tones, cream light, blended not stepped.
  shading: { bands: [[0.44, 0.4, 0.4], [0.6, 0.55, 0.53], [0.76, 0.71, 0.68], [0.93, 0.88, 0.82], [1.0, 0.97, 0.9]], smooth: true },

  // Ink outlines (toon.js).
  ink: {
    color: '#38200f', // dark brown ink, not black (R2)
    lineWidth: 1,
    split: 0.18, // how far dark tones lean blue: little, to keep the dark wood warm
    splitTint: [0.7, 0.86, 1.5], // the blue-grey they lean towards (linear multiplier of their value)
    strength: 0.85, // dark but thin lines, as in R2
    seams: 0.75, // R2 draws every plank seam clearly
  },

  // Watercolour pigment pass (watercolour.js PIGMENT_SHADER). 0 switches an effect off.
  paint: {
    washVariation: 0.22, // large soft blotches of lighter and darker pigment
    granulation: 0.1, // pigment settling in the paper's tooth, more in dark washes
    edgeDarkening: 0.35, // pigment pooling where a wash meets a different value
    bleed: 0.45, // wet-in-wet: edges softened where the pigment is wet
    shadowTint: '#8c88a4', // R2's shadows lean lavender-grey
    shadowTintAmount: 0.1,
  },

  // Final grade, after tone mapping (watercolour.js FINISH_SHADER).
  grade: {
    blackLift: '#2e2420', // R2's darkest darks are warm brown, not black
    paper: '#faf5e6', // and its lights are cream paper
    saturation: 0.62,
    contrast: 1.08,
    midLift: 0.86, // gamma under 1 lifts the mid tones: R2 keeps dark wood readable
  },
};
