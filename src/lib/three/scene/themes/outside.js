// The view outside the windows in one place: the air, and the paint of every object out there.
// Change values here to restyle the view; the modules in outside/ only read them. Colours were
// tuned in the window shot against colours sampled from R3 (the user's reference painting, not in
// the repo) and from the reference photos in research/CREDITS.md, unless a comment says otherwise.
// The room's grade (themes/interior.js) runs over the whole screen and takes about a third of the
// colour out again, so these are stronger than the painting's.

export const OUTSIDE_THEME = {
  air: {
    // Daylight: the colour in the windows, the haze, the sky's horizon and the river's reflection
    // of the sky. Pale, a little green from the garden (R2).
    daylight: '#f4faea',
    haze: { near: -100, far: 1500 }, // metres: clear air (R3). The Assembly, 330 m off, is about a sixth washed; the skyline a third
    // The room is exposed for shade, so sunlit paint outside would burn out to white. The outdoor
    // paint is keyed down by this much instead, as a painter would, so it keeps its colour.
    key: 0.3,
    skyKey: 0.3, // the sky likewise, so its blue survives an exposure set for the shaded room
  },

  // The river (water.js): the body colour seen into the water, and the thin film on top.
  water: { body: '#cf9a5c', film: '#f4d8a2' },

  // The far banks (banks.js), as vertex colours.
  banks: {
    mud: '#70522e',
    mudDark: '#6e5234',
    rough: '#74903a',
    path: '#a8905a',
    verge: '#7c9434',
    lawnFoot: '#839a36',
    lawn: '#9aa62f',
    terrace: '#93a03a',
    meadow: '#6b822d',
    meadowFar: '#74883a',
    wall: '#efe7d1',
    reed: '#4e6a2c',
    tuft: '#5c7630',
    tick: '#7c9030',
  },

  // The near bank (nearbank.js). The textured bands are lifted because the detail texture darkens them.
  nearBank: {
    mudUnder: '#5a4430',
    mudWet: '#6c5238',
    mudFlat: '#bca47c',
    mudTrack: '#c6b08a',
    berm: '#8fae4c',
    shoulder: '#7c9c44',
    level: '#80a048',
    clod: '#6a5038',
    clodLight: '#a8875e',
    stone: '#928b7c',
    stoneLight: '#b4ac9a',
    wood: '#7a6650',
    woodPale: '#b0a088',
    puddle: '#b8b49e',
    leafLight: '#a2c85e',
    leafMid: '#78a844',
    leafDark: '#527e36',
    leafCore: '#6a9c40',
    blade: ['#7aa63e', '#94b84e', '#5e8a36', '#a8c060'],
    straw: '#c2b06a',
    fern: '#5c9638',
    fernLight: '#84b44a',
  },

  // Trees and bushes on the banks (trees.js).
  trees: {
    trunk: '#5c5a34',
    light: '#74a845',
    mid: '#528c3c',
    dark: '#3a6c38',
  },

  // River taxis (boats.js): each boat is painted its own bright colours, chosen from the photos.
  boats: {
    schemes: {
      red: { // B1 ("Kuching river taxi 03"): red hull and cabin, black bottom, dark rub rail, white roof,
        // pale green ceiling, orange roof edges
        bottom: '#1c1a1a', stripe: '#3a2a26', hull: '#c42a1e', cabin: '#c42a1e', frame: '#e07a1f',
        roof: '#f2efe8', roofUnder: '#a9c9b4', fascia: '#e07a1f', hatch: '#f6f4ee', hatchEdge: '#e07a1f', shirt: '#2aa58a', trousers: '#c9b79a',
      },
      orange: { // B3 ("Kuching river taxi 02"): teal bottom, yellow stripe, orange cabin, blue roof, yellow edge
        bottom: '#1e9a95', stripe: '#f0c419', hull: '#e5671c', cabin: '#e5671c', frame: '#d4561a',
        roof: '#2f5fa8', roofUnder: '#8a7a66', fascia: '#f0c419', hatch: '#e9eef0', hatchEdge: '#2f9a4a', shirt: '#d8382e', trousers: '#3b3b44',
      },
      green: { // B2, B4 ("Kuching river taxi 01", "boatman"): green hull, white roof, red roof patch
        bottom: '#1d3b2c', stripe: '#e8e4da', hull: '#2e8a4e', cabin: '#2e8a4e', frame: '#f1ede4',
        roof: '#efece4', roofUnder: '#9a958a', fascia: '#d23b2a', hatch: '#d23b2a', hatchEdge: '#efece4', shirt: '#f0eee8', trousers: '#40404a',
      },
    },
    // Shared by every boat: the cabin's shade, glass, deck, the boatman's skin and the oar.
    shade: { inside: '#2a2220', glass: '#1f2326', deck: '#6b5440', skin: '#8a5a3c', oar: '#a8875e' },
  },

  // The State Legislative Assembly building (assembly.js), as linear vertex colours (0-1).
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

  // The Darul Hana Bridge (bridge.js), as linear vertex colours (0-1).
  bridge: { steel: [0.93, 0.92, 0.88], pier: [0.78, 0.76, 0.7], cable: [0.86, 0.86, 0.84], shade: [0.97, 0.96, 0.92], truss: [0.84, 0.83, 0.78] },
};
