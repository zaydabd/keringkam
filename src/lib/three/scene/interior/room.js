// The room shell: board walls with their window openings, floor, ceiling and window frames
// (PLAN.room, backWindows, window, sideWindow, dado). Materials: floor, wall, ceiling, frame.

import { INTERIOR_THEME as THEME } from '../themes/interior.js';
import { PLAN } from './plan.js';
import { rand } from './builder.js';

/** Splits [from, to] into boards of uneven width (0.15–0.22 m), with joints at every `edges` value. */
function boardRuns(from, to, edges) {
  const cuts = [from, ...edges.filter((e) => e > from && e < to), to].sort((a, b) => a - b);
  const boards = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    let a = cuts[i];
    while (a < cuts[i + 1] - 0.01) {
      const bEnd = Math.min(cuts[i + 1], a + 0.15 + rand() * 0.07);
      boards.push([a, cuts[i + 1] - bEnd < 0.06 ? cuts[i + 1] : bEnd]);
      a = boards[boards.length - 1][1];
    }
  }
  return boards;
}

/**
 * A wall of vertical boards along one axis. `openings` are [a0, a1, y0, y1] along that axis; boards
 * stop at their edges. `at(a, y, w, h)` returns the box centre and size for a board piece.
 */
function boardWall(b, from, to, top, openings, at) {
  const edges = openings.flatMap((o) => [o[0], o[1]]);
  for (const [a0, a1] of boardRuns(from, to, edges)) {
    const mid = (a0 + a1) / 2;
    const o = openings.find((o) => mid > o[0] && mid < o[1]);
    const spans = o ? [[0, o[2]], [o[3], top]] : [[0, top]];
    for (const [y0, y1] of spans) if (y1 - y0 > 0.02) at(mid, (y0 + y1) / 2, a1 - a0 - 0.004, y1 - y0);
  }
}

export function buildRoom(b) {
  const { x0, x1, z0, z1, top } = PLAN.room;
  const W = PLAN.window;
  // Floor: wide boards running towards the window wall, in staggered lengths.
  for (const [a0, a1] of boardRuns(x0, x1, [])) {
    let z = z0;
    while (z < z1) {
      const len = Math.min(z1 - z, 1.6 + rand() * 2.4);
      b.box('floor', a1 - a0 - 0.006, 0.03, len - 0.004, (a0 + a1) / 2, -0.015, z + len / 2);
      z += len;
    }
  }
  // A dark sub-floor under the boards, so the gaps between them never show the daylight below.
  b.box('frame', x1 - x0, 0.02, z1 - z0, (x0 + x1) / 2, -0.045, (z0 + z1) / 2, 0, 0, 0, 0);
  // Back wall (the window wall), boards outside the room line so the inner face is at z0.
  const back = PLAN.backWindows.map((w) => [w.x0, w.x1, 0, W.y1]);
  boardWall(b, x0, x1, top, back, (a, y, w, h) => b.box('wall', w, h, 0.025, a, y, z0 - 0.0125, 0, 0, 0, THEME.wallTint));
  // Right wall, with the window near the camera.
  const s = PLAN.sideWindow;
  boardWall(b, z0, z1, top, [[s.z0, s.z1, s.y0, W.y1]], (a, y, w, h) => b.box('wall', 0.025, h, w, x1 + 0.0125, y, a, 0, 0, 0, THEME.wallTint));
  // Left and front walls (out of shot: they close the room and cast shadows). Ceiling boards.
  boardWall(b, z0, z1, top, [], (a, y, w, h) => b.box('wall', 0.025, h, w, x0 - 0.0125, y, a, 0, 0, 0, THEME.wallTint));
  boardWall(b, x0, x1, top, [], (a, y, w, h) => b.box('wall', w, h, 0.025, a, y, z1 + 0.0125, 0, 0, 0, THEME.wallTint));
  for (const [a0, a1] of boardRuns(z0, z1, [])) b.box('ceiling', x1 - x0, 0.02, a1 - a0 - 0.004, (x0 + x1) / 2, top + 0.01, (a0 + a1) / 2);
  for (let x = x0 + 0.6; x < x1; x += 1.2) b.box('ceiling', 0.1, 0.14, z1 - z0, x, top - 0.07, (z0 + z1) / 2);

  // Window frames on the back wall: jambs, head, threshold, and the lattice rail.
  for (const w of PLAN.backWindows) {
    const cx = (w.x0 + w.x1) / 2;
    const ww = w.x1 - w.x0;
    for (const x of [w.x0 - 0.035, w.x1 + 0.035]) b.box('frame', 0.07, W.y1 + 0.1, 0.09, x, (W.y1 + 0.1) / 2, z0 - 0.01);
    b.box('frame', ww + 0.22, 0.1, 0.1, cx, W.y1 + 0.05, z0 - 0.005);
    b.box('frame', ww + 0.14, 0.03, 0.12, cx, 0.015, z0 - 0.01);
    b.box('frame', ww, 0.06, 0.07, cx, W.lattice + 0.03, z0 - 0.02);
    b.box('frame', ww, 0.05, 0.06, cx, 0.06, z0 - 0.02);
  }
  // Side window frame and the dado rail on the right wall.
  for (const z of [s.z0 - 0.035, s.z1 + 0.035]) b.box('frame', 0.09, W.y1 + 0.1, 0.07, x1 - 0.01, (W.y1 + 0.1) / 2, z);
  b.box('frame', 0.1, 0.1, s.z1 - s.z0 + 0.22, x1 - 0.005, W.y1 + 0.05, (s.z0 + s.z1) / 2);
  b.box('frame', 0.12, 0.04, s.z1 - s.z0 + 0.14, x1 - 0.02, s.y0, (s.z0 + s.z1) / 2);
  for (const [a, c] of [[z0, s.z0 - 0.07], [s.z1 + 0.07, z1]]) b.box('frame', 0.03, 0.06, c - a, x1 - 0.015, PLAN.dado, (a + c) / 2);
  b.box('frame', 0.03, 0.05, x1 - x0, (x0 + x1) / 2, top - 0.025, z0 + 0.015, 0, Math.PI / 2);
}
