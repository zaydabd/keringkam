// The scene's render layers (three.js Layers), in one place: every module that puts a mesh on a
// layer, or draws or casts shadows by layer, imports them from here.

export const INK_LAYER = 0; // drawn, and outlined by the ink pass (toon.js createOutline)
export const NO_INK_LAYER = 1; // drawn, with no ink outline: cut-outs, the sky, painted shadows
export const MIRROR_LAYER = 2; // seen in the river's mirror (outside/water.js)
export const INK_MASK_LAYER = 3; // cuts the ink of what is behind it by its texture: the window lattice
// Cast the sky light's shadow. One direction stands for the three windows, so only the furniture
// casts it: the window wall would otherwise shut it out (interior/lights.js).
export const FURNITURE_LAYER = 4;
// Cast the side window's shadow: walls, frames and furniture, not the curtain in the opening.
export const SIDE_LAYER = 5;
