// The house's shell around the room (room/exterior.js builds it): cladding, roof, door, stairs and
// the terrace it stands on. Sizes are estimates unless a comment says otherwise.

export const HOUSE = {
  out: 0.11, // the cladding's outer face, out from the room's inner wall line (wall boards, studs, cladding)
  clad: { bottom: -0.12, board: 0.18, lap: 0.07 }, // weatherboards: from below the floor frame, 18 cm boards, tilted 0.07 rad
  plate: 3.1, // the top of the walls: a white vented frieze above the ceiling (2.7) carries the roof
  frieze: 2.84, // where the frieze starts
  roof: { pitch: 35, overhang: 0.6, sheet: 0.03, rib: 0.19 }, // degrees; eaves out from the walls; corrugation pitch
  plinth: 0.16, // the concrete base wall's thickness, under the cladding
  door: { x: -3.0, w: 0.9, h: 2.05 }, // in the front wall (z1), behind the seat view's camera
  landing: { depth: 1.15, width: 1.5 },
  stairs: { rise: 0.15, going: 0.3, width: 1.0 },
  // The terrace the house stands on: its top 45 cm below the floor; it ends at z0 in a grass bank
  // down to the street's grass at bankFoot (the bush below the window starts beyond it).
  ground: { y: -0.45, x0: -160, x1: 160, z0: -6.8, z1: 160, bankFoot: -8.0 },
};
