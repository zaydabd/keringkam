// Leaf cards for the view outside: flat quads (or bent strips) that carry a painted leaf from the
// leaf atlas (paint.js paintLeaves), cut out by its alpha. They go to the 'leaf' slot, drawn
// two-sided with an alpha test (outside/index.js). The ink pass gets no rectangles from them: the
// leaf mesh is not on the ink's layer, only on a mask layer that hides the ink behind its leaves
// (toon.js createOutline). The near bank's plants use them, and the far trees.
//
// Atlas: 2 x 2 cells. In every cell the leaf's base is at the bottom middle and its tip at the top.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const LEAF_ATLAS = {
  cols: 2,
  rows: 2,
  // a sprig of small leaves; a sprig of larger, drooping ones; one broad leaf; a fern frond
  cell: { sprig: 0, sprigBig: 1, broad: 2, frond: 3 },
};

/** The atlas cell's UV box [u0, u1, v0, v1]; v0 is the leaf's base (the canvas is flipped on upload). */
export function cellUV(index) {
  const { cols, rows } = LEAF_ATLAS;
  const col = index % cols, row = Math.floor(index / cols);
  return [col / cols, (col + 1) / cols, 1 - (row + 1) / rows, 1 - row / rows];
}

/**
 * One leaf card: from `base` along unit `up` for `length`, `width` across unit `side`. Wound to
 * face `eye` when given (the window shot), so the two-sided material lights its front. `normal`
 * is the shading normal (one, or one per corner: base left, base right, tip right, tip left).
 * Returns the triangles written (2).
 */
export function leafCard(w, base, up, side, { length, width, cell, normal, colour, eye = null, slot = 'leaf' }) {
  const [u0, u1, v0, v1] = cellUV(cell);
  const h = width / 2;
  const a = add(base, side, -h), b = add(base, side, h), tip = add(base, up, length);
  const c = add(tip, side, h), d = add(tip, side, -h);
  const n = Array.isArray(normal[0]) ? normal : [normal, normal, normal, normal];
  let quad = [[a, b, c, d], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], n];
  if (eye) {
    const f = cross(sub(b, a), sub(d, a)), m = add(base, up, length / 2);
    if (dot(f, sub(eye, m)) < 0) quad = [[b, a, d, c], [[u1, v0], [u0, v0], [u0, v1], [u1, v1]], [n[1], n[0], n[3], n[2]]];
  }
  const [p, uv, nn] = quad;
  w.smoothTri(slot, [p[0], p[1], p[2]], [nn[0], nn[1], nn[2]], [uv[0], uv[1], uv[2]], colour);
  w.smoothTri(slot, [p[0], p[2], p[3]], [nn[0], nn[2], nn[3]], [uv[0], uv[2], uv[3]], colour);
  return 2;
}

/**
 * A bent strip of the atlas cell along a spine (points from base to tip), `half` its half-width
 * at each point, `sides` the unit across-vector at each point: a fern frond. Wound to face `eye`.
 * Returns the triangles written.
 */
export function leafStrip(w, spine, sides, half, { cell, normals, colour, eye = null, slot = 'leaf' }) {
  const [u0, u1, v0, v1] = cellUV(cell);
  const n = spine.length - 1;
  let tris = 0;
  for (let i = 0; i < n; i++) {
    const t0 = v0 + ((v1 - v0) * i) / n, t1 = v0 + ((v1 - v0) * (i + 1)) / n;
    const a = add(spine[i], sides[i], -half[i]), b = add(spine[i], sides[i], half[i]);
    const c = add(spine[i + 1], sides[i + 1], half[i + 1]), d = add(spine[i + 1], sides[i + 1], -half[i + 1]);
    let P = [a, b, c, d], U = [[u0, t0], [u1, t0], [u1, t1], [u0, t1]], N = [normals[i], normals[i], normals[i + 1], normals[i + 1]];
    if (eye) {
      const f = cross(sub(b, a), sub(d, a)), m = spine[i];
      if (dot(f, sub(eye, m)) < 0) [P, U, N] = [[b, a, d, c], [U[1], U[0], U[3], U[2]], [N[1], N[0], N[3], N[2]]];
    }
    w.smoothTri(slot, [P[0], P[1], P[2]], [N[0], N[1], N[2]], [U[0], U[1], U[2]], colour);
    w.smoothTri(slot, [P[0], P[2], P[3]], [N[0], N[2], N[3]], [U[0], U[2], U[3]], colour);
    tris += 2;
  }
  return tris;
}
