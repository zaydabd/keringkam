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
  settee: { x: -0.8, z: -5.08, ry: 0, w: 1.45, d: 0.55, back: 1.0, settee: true },
  chairs: [
    { x: -1.85, z: -4.0, ry: Math.PI / 2, w: 0.6, d: 0.55, back: 0.98 },
    { x: 0.15, z: -4.0, ry: -Math.PI / 2, w: 0.6, d: 0.55, back: 0.98 },
    { x: 0.5, z: -1.78, ry: -0.35, w: 0.6, d: 0.55, back: 0.98 }, // foreground right, where the embroidery frame stood; faces the viewer, turned 20° towards the room
  ],
  // The tables start about 10 cm clear of the left armchair's arm scrolls (its front is at
  // x = -1.548, from seatReach() in furniture.js); furnitureOverlaps() checks every pair.
  tables: [
    { x0: -1.45, x1: -0.36, z0: -4.5, z1: -4.1, h: 0.46 },
    { x0: -1.45, x1: -0.45, z0: -3.8, z1: -3.0, h: 0.45, stretcher: true },
  ],
  // Fabrics laid on the furniture and over a window rail (room/fabrics.js). Each names its
  // photo (manifest.json), its size in metres (estimated from the photo's proportions: the real
  // sizes are not recorded) and how it starts before it falls: `path` is the line its length
  // follows, in the piece's own frame (front = +z), in the y-z plane (plane 'yz', its width along
  // x) or the x-y plane (plane 'xy', its width along z); `across` moves it along its width. Its
  // length runs down the photo; flip starts it from the photo's bottom edge. `label` names the
  // place in the Fabrics menu.
  fabrics: [
    // Each seat's fabric hangs a little behind the top of its back, falls down the front and
    // ends on the seat, never past it. One too long for that is folded in half (fold: 1), the fold
    // lying on the seat; one wider than the gap between the arms is folded across (foldAcross: 1).
    { name: 'armchair', label: 'The front armchair', on: 'chair 2', fabric: 'black-goldflower-scarf-22', size: [0.8, 1.6], fold: 1, foldAcross: 1, plane: 'yz', path: [[-0.34, 0.95], [-0.33, 1.015], [-0.27, 1.015], [-0.222, 0.48], [0.27, 0.462]] },
    // Flipped, so the songket's woven band is the part on top.
    { name: 'settee', label: 'The settee', on: 'settee', fabric: 'maroon-gold-songket-12', size: [1.05, 1.7], fold: 1, plane: 'yz', flip: true, path: [[-0.34, 0.98], [-0.33, 1.045], [-0.27, 1.045], [-0.222, 0.47], [0.28, 0.462]] },
    // A cover over the nearer low table (the one with the stretcher), hanging a little over every side.
    { name: 'table', label: 'The low table', on: 'table 1', fabric: 'teal-songket-28', size: [1.0, 1.2], plane: 'xy', path: [[-0.6, 0.475], [0.6, 0.475]] },
    { name: 'left-chair', label: 'The left chair', on: 'chair 0', fabric: 'lilac-beaded-scarf-18', size: [0.8, 1.33], fold: 1, foldAcross: 1, plane: 'yz', path: [[-0.33, 1.015], [-0.27, 1.015], [-0.222, 0.48], [0.27, 0.462]] },
    { name: 'right-chair', label: 'The right chair', on: 'chair 1', fabric: 'plum-embroidered-scarf-01', size: [0.9, 1.23], fold: 1, foldAcross: 1, plane: 'yz', path: [[-0.33, 1.015], [-0.27, 1.015], [-0.222, 0.48], [0.27, 0.462]] },
    // Folded over the lattice rail of the left back window (the settee stands in front of the
    // middle one), the longer side in the room.
    { name: 'window', label: 'The window rail', on: 'window 0', fabric: 'maroon-gold-songket-14', size: [0.8, 1.33], plane: 'yz', path: [[-0.12, 0.7], [-0.065, 1.19], [0.025, 1.19], [0.05, 0.3]] },
  ],
};
