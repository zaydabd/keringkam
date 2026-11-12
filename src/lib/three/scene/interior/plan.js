// The room's layout: every size in metres (estimated from R1, research/INTERIOR-NOTES.md). The
// camera stands at the origin and looks along -z at the window wall.

// Everything in metres. The camera stands at the origin and looks along -z at the window wall.
export const PLAN = {
  camera: { eye: [0, 0.9, 0], pitch: -6.7, fov: 46.8, aspect: 1.387 }, // from R1's horizon and vanishing point
  room: { x0: -4.2, x1: 1.34, z0: -5.5, z1: 1.2, top: 2.7 },
  backWindows: [
    { x0: -3.02, x1: -1.92 },
    { x0: -1.0, x1: 0.05 },
    { x0: 0.72, x1: 1.2 },
  ],
  window: { y1: 2.25, lattice: 1.1, valance: [2.1, 2.45], tie: 1.2 },
  sideWindow: { z0: -2.45, z1: -1.45, y0: 0.3 }, // on the right wall, near the camera
  dado: 0.85,
  hangings: { z: -3.2, y: 1.52, size: 0.27 },
  plate: { x: 0.38, y: 1.78, r: 0.15 },
  settee: { x: -0.8, z: -5.08, ry: 0, w: 1.45, d: 0.55, back: 1.0 },
  chairs: [
    { x: -1.85, z: -4.0, ry: Math.PI / 2, w: 0.6, d: 0.55, back: 0.98 },
    { x: 0.15, z: -4.0, ry: -Math.PI / 2, w: 0.6, d: 0.55, back: 0.98 },
  ],
  // The tables start 7.5 cm clear of the left armchair's arms (its front is at x = -1.525);
  // furnitureOverlaps() checks every pair.
  tables: [
    { x0: -1.45, x1: -0.36, z0: -4.5, z1: -4.1, h: 0.46 },
    { x0: -1.45, x1: -0.45, z0: -3.8, z1: -3.0, h: 0.45, stretcher: true },
  ],
  frame: { x: 0.5, z: -1.78, ry: -0.42, w: 0.62, d: 0.52, front: 0.36, back: 0.5 }, // embroidery frame
};
