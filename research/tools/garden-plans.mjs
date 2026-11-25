// Prints the garden layouts (src/lib/three/scene/garden-layouts.js) as JSON, with the house's
// walls and openings, for research/tools/garden-plans.py to draw as top-down plans.
//   node research/tools/garden-plans.mjs > plans.json
import { LAYOUTS, LAYERS, WALLS } from '../../src/lib/three/scene/garden-layouts.js';
import { PLAN } from '../../src/lib/three/scene/interior/plan.js';
import { HOUSE } from '../../src/lib/three/scene/interior/exterior.js';

const s = PLAN.sideWindow;
console.log(JSON.stringify({
  walls: WALLS,
  windows: PLAN.backWindows.map((w) => ({ wall: 'river', a0: w.x0, a1: w.x1 })).concat([{ wall: 'right', a0: s.z0, a1: s.z1 }]),
  door: { x: HOUSE.door.x, w: HOUSE.door.w },
  terraceEdge: HOUSE.ground.z0,
  bankFoot: HOUSE.ground.bankFoot,
  layers: LAYERS,
  layouts: LAYOUTS,
}));
