// The room's look in one place: colours, light, shading bands, ink, watercolour and the final grade.
// Change values here to restyle the room; interior.js only reads them. Colours were picked from R1
// and R2 (the user's reference paintings, not in the repo) unless a comment says otherwise.
//
// The ink, watercolour and grade passes run over the whole screen, so they also apply to the view
// outside the windows (themes/outside.js has that view's own colours and light).

export const INTERIOR_THEME = {
  // Material colours. The painted textures are mostly light values, so these set the hue.
  palette: {
    wall: '#977462', // mid brown boards, a little grey, as in R2
    ceiling: '#6e5646', // grey-brown boards, as R2's ceiling (seen on tall screens)
    frame: '#6a3a24', // window frames, dado rail
    floor: '#a06e50', // warm brown floor boards (R2)
    wood: '#9c683e', // honey-brown furniture (R2 is browner than R1's gold)
    top: '#c08a56', // table tops: brown and polished in R2 (they mirror the windows)
    lattice: '#d6bb98', // lighter carved panels, as in R2
    cloth: '#d8283a', // red cloth on the frame
    leaf: '#84a552', // lighter, yellower leaves (R2)
    white: '#fffaf2', // pale curtains
    whiteGlow: '#fff4e4', // and the light through them
    plate: '#e6dcc0',
    tape: '#2f5f6a',
    bag: '#2c2420',
    ink: '#38200f', // dark brown ink, not black (R2)
    contactShadow: '#24140e', // the soft patches painted under the furniture
  },
  wallTint: 0.45, // R2: neighbouring wall boards differ clearly in value

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
    // Polished boards mirror the bright windows (glossBoards in interior.js).
    gloss: { floor: { strength: 1.45, cloth: 0.55, falloff: 0.62 }, top: { strength: 1.5 } },
    contactShadow: { opacity: 0.9, core: 0.75 }, // the patch, and the darker one right under each piece
  },

  // Soft painted ramp (R2): lavender-grey shade, warm half-tones, cream light, blended not stepped.
  shading: { bands: [[0.44, 0.4, 0.4], [0.6, 0.55, 0.53], [0.76, 0.71, 0.68], [0.93, 0.88, 0.82], [1.0, 0.97, 0.9]], smooth: true },

  // Ink outlines (toon.js). The ink colour is palette.ink.
  ink: {
    lineWidth: 1,
    split: 0.18, // how far dark tones lean blue: little, to keep the dark wood warm
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
