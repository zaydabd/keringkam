// Where the house's plants stand, as data: the room's plants and the window-ledge troughs.
// vegetation/stylised.js grows the plants at these entries.

/**
 * Placeholder plants inside the room, away from the window ledges. After interior-design guides:
 * mix upright and trailing shapes, let trailers spill down, repeat the trailing look of the ledge
 * troughs elsewhere, and keep plants back from the glass. Sizes are guesses.
 */
export function roomPlantsProposal(PLAN) {
  const { z0 } = PLAN.room;
  const [w0] = PLAN.backWindows;
  const table = PLAN.tables[0];
  const out = [];
  // Upright floor plant on the wall between the left window and the settee.
  const gapX = (w0.x1 + (PLAN.settee.x - PLAN.settee.w / 2)) / 2;
  out.push({ group: 'proposed: floor pot (upright)', kind: 'planter', at: [gapX, 0, z0 + 0.3], width: 0.28, height: 0.3, yaw: 0 });
  out.push({ group: 'proposed: Chinese evergreen (floor)', kind: 'fern', at: [gapX, 0.25, z0 + 0.3], width: 0.38, height: 0.75, yaw: 0 });
  // Tall upright plant in the back-left corner, clear of the window.
  out.push({ group: 'proposed: floor pot (upright)', kind: 'planter', at: [w0.x0 - 0.5, 0, z0 + 0.4], width: 0.4, height: 0.4, yaw: 0 });
  out.push({ group: 'proposed: rubber plant (Ficus elastica)', kind: 'fern', at: [w0.x0 - 0.5, 0.35, z0 + 0.4], width: 0.6, height: 1.2, yaw: 0 });
  // A small upright pot on the back low table.
  const tx = table.x0 + 0.3, tz = (table.z0 + table.z1) / 2;
  out.push({ group: 'proposed: table pot (small upright)', kind: 'planter', at: [tx, table.h, tz], width: 0.14, height: 0.12, yaw: 0 });
  out.push({ group: 'proposed: Chinese evergreen (table)', kind: 'bush', at: [tx, table.h + 0.1, tz], width: 0.18, height: 0.18, yaw: 0 });
  // A low plant stand about 0.9 m in front of the left window (below its rail, so the view stays
  // open), its trailer spilling down the front: repeats the troughs. On the right it would hide
  // behind the front armchair.
  const sx = (w0.x0 + w0.x1) / 2 + 0.1, sz = z0 + 0.9, standH = 0.6;
  out.push({ group: 'proposed: plant stand', kind: 'planter', at: [sx, 0, sz], width: 0.3, height: standH, yaw: 0 });
  out.push({ group: 'proposed: satin pothos (stand)', kind: 'bush', at: [sx, standH - 0.03, sz], width: 0.4, height: 0.22, yaw: 0 });
  out.push({ group: 'proposed: satin pothos trailing', kind: 'vine', at: [sx, standH - 0.4, sz + 0.17], width: 0.26, height: 0.4, depth: 0.15, yaw: 0 });
  return out;
}

/**
 * PROPOSED (markers only, design guesses): one long trough planter on each back window's ledge
 * (the lattice rail, room.js: top at window.lattice + 0.06, its room face 1.5 cm into the room),
 * its foliage mounded on top and leaves spilling a little over the room side.
 */
export function windowHangingProposal(PLAN, { skipMiddle = false } = {}) {
  const { z0 } = PLAN.room;
  const ledge = PLAN.window.lattice + 0.06;
  const depth = 0.14, front = z0 + 0.05; // overhangs the rail's room face by 3.5 cm
  const zc = front - depth / 2, tall = 0.14;
  const out = [];
  // Only the two left windows (lowest x); each trough covers about half its ledge, at the left end.
  // skipMiddle (?flora=stylised, the user's choice): the middle window keeps its ledge bare.
  [...PLAN.backWindows].sort((a, b) => a.x0 - b.x0).slice(0, 2).forEach((w, i) => {
    if (skipMiddle && i === 1) return;
    const span = w.x1 - w.x0, len = span * 0.5, x = w.x0 + 0.05 + len / 2; // left end of the ledge
    out.push({ group: 'proposed: ledge trough', kind: 'planter', at: [x, ledge, zc], width: len, height: tall, depth, yaw: 0 });
    out.push({ group: 'proposed: satin pothos (ledge)', kind: 'bush', at: [x, ledge + tall - 0.04, zc], width: len * 1.1, height: 0.22, depth: depth * 1.5, yaw: 0 });
    const drop = [0.3, 0.38][i];
    out.push({ group: 'proposed: satin pothos trailing (ledge)', kind: 'vine', at: [x, ledge + tall - drop, front + 0.02], width: len * 0.7, height: drop, depth: 0.15, yaw: 0 });
  });
  return out;
}
