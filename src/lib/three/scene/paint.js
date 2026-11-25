// Painted textures for the interior and the view outside its windows, drawn on canvases at load
// time (no photos). Each one is painted mostly in light values so the material colour and the
// per-part vertex tint still set the hue; the texture adds the brushwork: grain strokes, weave,
// motifs, clouds.

// The textures are split by where they are used (paint/): the room, the sky, the street.

export { setPaintDetail } from './paint/core.js';
export { paintPlanks, paintCarving, paintWindowLattice, paintCurtain, paintDecor, paintGlow } from './paint/room.js';
export { paintSoftSky } from './paint/sky.js';
export { paintPaving, styleGain, paintStylized, paintAssembly } from './paint/outside.js';
