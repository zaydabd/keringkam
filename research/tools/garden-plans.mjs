// Prints the garden layouts (src/lib/three/scene/gardenLayouts.js) as JSON, with the house's
// walls and openings, for research/tools/garden-plans.py to draw as top-down plans.
//   node research/tools/garden-plans.mjs > plans.json
import { LAYOUTS, LAYERS, WALLS } from '../../src/lib/three/scene/gardenLayouts.js';
import { PLAN } from '../../src/lib/three/scene/interior/plan.js';
import { HOUSE } from '../../src/lib/three/scene/interior/exterior.js';
import { WINDOW_EYE } from '../../src/lib/three/scene/outside/site.js';

const s = PLAN.sideWindow;
console.log(JSON.stringify({
  walls: WALLS,
  windows: PLAN.backWindows.map((w) => ({ wall: 'river', a0: w.x0, a1: w.x1 })).concat([{ wall: 'right', a0: s.z0, a1: s.z1 }]),
  door: { x: HOUSE.door.x, w: HOUSE.door.w },
  terraceEdge: HOUSE.ground.z0,
  terrace: HOUSE.ground.y,
  street: -1.85,
  window: { y1: PLAN.window.y1, lattice: PLAN.window.lattice },
  room: PLAN.room,
  eave: HOUSE.plate + 0.06 - HOUSE.roof.overhang * Math.tan((HOUSE.roof.pitch * Math.PI) / 180),
  eaveOut: HOUSE.roof.overhang,
  ridge: HOUSE.plate + 0.06 + ((PLAN.room.x1 - PLAN.room.x0) / 2 + HOUSE.out) * Math.tan((HOUSE.roof.pitch * Math.PI) / 180),
  // the two room views: the seat (PLAN.camera: pitch -6.7, lens 46.8) and the window shot (pitch 4.3, lens 54)
  eyes: { seat: { at: PLAN.camera.eye, bottom: PLAN.camera.pitch - PLAN.camera.fov / 2 }, window: { at: WINDOW_EYE, bottom: 4.3 - 54 / 2 } },
  bankFoot: HOUSE.ground.bankFoot,
  layers: LAYERS,
  layouts: LAYOUTS,
}));
