
// ---------------------------------------------------------------------------------------------
// Parts

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

function buildRoom(b) {
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
  // Back wall (the window wall), boards outside the room line so the inner face is at z0.
  const back = PLAN.backWindows.map((w) => [w.x0, w.x1, 0, W.y1]);
  boardWall(b, x0, x1, top, back, (a, y, w, h) => b.box('wall', w, h, 0.025, a, y, z0 - 0.0125));
  // Right wall, with the window near the camera.
  const s = PLAN.sideWindow;
  boardWall(b, z0, z1, top, [[s.z0, s.z1, s.y0, W.y1]], (a, y, w, h) => b.box('wall', 0.025, h, w, x1 + 0.0125, y, a));
  // Left and front walls (out of shot: they close the room and cast shadows). Ceiling boards.
  boardWall(b, z0, z1, top, [], (a, y, w, h) => b.box('wall', 0.025, h, w, x0 - 0.0125, y, a));
  boardWall(b, x0, x1, top, [], (a, y, w, h) => b.box('wall', w, h, 0.025, a, y, z1 + 0.0125));
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

/** Lattice panels in the lower part of each window: alpha-cut planes (own mesh, see createInterior). */
function buildLattice(b) {
  const { z0 } = PLAN.room;
  const h = PLAN.window.lattice;
  for (const w of PLAN.backWindows) {
    const g = new THREE.PlaneGeometry(w.x1 - w.x0, h - 0.09);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w.x1 - w.x0) + w.x0, uv.getY(i) * (h - 0.09));
    b.place('lattice', g, M((w.x0 + w.x1) / 2, 0.09 + (h - 0.09) / 2, z0 - 0.02), 0.04, false);
  }
}

/** A pleated valance: a strip folded in a sine along its width, scalloped a little at the hem. */
function valance(width, height, pleat = 0.085, depth = 0.028) {
  const g = new THREE.PlaneGeometry(width, height, Math.ceil(width / 0.012), 3);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const s = Math.sin((x / pleat) * Math.PI * 2);
    pos.setZ(i, depth * (0.5 + 0.5 * s) * (1.1 - (y / height + 0.5) * 0.3));
    if (y < -height / 2 + 0.01) pos.setY(i, y - 0.025 * Math.abs(Math.sin((x / pleat) * Math.PI)));
    uv.setXY(i, x + width / 2, y);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A sheer panel hanging from `top` to `bottom`, gathered to a narrow waist at `tie` (or loose when
 * tie is null). Local frame: the panel hangs from x = 0 towards +x, facing +z.
 */
function curtain({ width, top, bottom, tie, folds = 5, depth = 0.035 }) {
  const nu = 14;
  const nv = 30;
  const positions = [];
  const uvs = [];
  const index = [];
  for (let j = 0; j <= nv; j++) {
    const y = top - ((top - bottom) * j) / nv;
    let w = width;
    let pull = 0;
    if (tie != null) {
      w = y > tie ? 0.07 + (width - 0.07) * Math.pow((y - tie) / (top - tie), 0.75) : 0.07 + 0.11 * Math.pow((tie - y) / (tie - bottom), 0.6);
      pull = 0.07 * Math.exp(-(((y - tie) / 0.35) ** 2));
    }
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const z = depth * (width / Math.max(w, 0.07)) ** 0.3 * Math.sin(u * folds * Math.PI) ** 2 + pull * u;
      positions.push(u * w, y, z);
      uvs.push(u * width, y);
      if (i < nu && j < nv) {
        const a = j * (nu + 1) + i;
        index.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function buildCurtains(b) {
  const { z0, x1 } = PLAN.room;
  const W = PLAN.window;
  for (const w of PLAN.backWindows) {
    const ww = w.x1 - w.x0;
    const [v0, v1] = W.valance;
    b.place('valance', valance(ww + 0.22, v1 - v0), M((w.x0 + w.x1) / 2, (v0 + v1) / 2, z0 + 0.06), 0.04, false);
    const panel = Math.min(0.36, ww * 0.34);
    const opts = { width: panel, top: v0 + 0.02, bottom: 0.05, tie: W.tie };
    // Left panel hangs from the left jamb towards +x; the right one is mirrored.
    b.place('sheer', curtain(opts), M(w.x0 + 0.01, 0, z0 + 0.1), 0.05, false);
    b.place('sheer', curtain(opts), new THREE.Matrix4().makeScale(-1, 1, 1).premultiply(M(w.x1 - 0.01, 0, z0 + 0.1)), 0.05, false);
  }
  // Right-wall window: a long white sheer, drawn across.
  const s = PLAN.sideWindow;
  const g = curtain({ width: s.z1 - s.z0 + 0.1, top: W.y1 + 0.05, bottom: s.y0 + 0.02, tie: null, folds: 7, depth: 0.05 });
  b.place('white', g, M(x1 - 0.08, 0, s.z0 - 0.05, 0, -Math.PI / 2, 0), 0.03, false);
}

/** A turned leg, as a lathe: radius r, height h, standing on y = 0. UVs in metres. */
function turnedLeg(r, h) {
  const profile = [[0, 0], [0.55, 0], [0.8, 0.03], [0.55, 0.08], [0.55, 0.36], [1, 0.44], [0.62, 0.52], [0.5, 0.62], [0.5, 0.8], [0.8, 0.86], [0.8, 1], [0, 1]];
  const g = new THREE.LatheGeometry(profile.map(([a, k]) => new THREE.Vector2(a * r, k * h)), 8);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getY(i), uv.getX(i) * Math.PI * 2 * r);
  return g;
}

/**
 * An armchair or settee in the local frame (front towards +z), placed at (x, z) turned by ry:
 * turned legs, seat, aprons, arms on turned posts, and a back of slats between two rails.
 */
function buildSeat(b, { x, z, ry, w, d, back }) {
  const F = new THREE.Matrix4().compose(V(x, 0, z), Q(0, ry, 0), ONE);
  const box = (w2, h, d2, lx, ly, lz, rx = 0, rz = 0) => b.place('wood', boxWithGrainUVs(w2, h, d2), M(lx, ly, lz, rx, 0, rz).premultiply(F));
  const leg = (lx, lz, h, r = 0.025) => b.place('wood', turnedLeg(r, h), M(lx, 0, lz).premultiply(F));
  const seat = 0.44;
  const arm = 0.66;
  const hx = w / 2 - 0.03;
  const hz = d / 2 - 0.03;
  leg(-hx, hz, arm);
  leg(hx, hz, arm);
  box(0.045, back, 0.045, -hx, back / 2, -hz, 0.08);
  box(0.045, back, 0.045, hx, back / 2, -hz, 0.08);
  box(w, 0.035, d, 0, seat, 0);
  box(w - 0.06, 0.07, 0.025, 0, seat - 0.05, hz);
  for (const s of [-1, 1]) {
    box(0.025, 0.07, d - 0.06, s * hx, seat - 0.05, 0);
    box(0.07, 0.03, d + 0.06, s * (hx + 0.005), arm, 0.02); // arm
    box(0.02, 0.022, d - 0.08, s * hx, 0.13, 0); // side stretcher
    for (let k = 0; k < 3; k++) box(0.018, arm - seat - 0.03, 0.018, s * hx, (seat + arm) / 2, -hz + 0.12 + k * 0.13); // arm spindles
  }
  box(w - 0.06, 0.02, 0.022, 0, 0.13, hz);
  // Back: top rail, lower rail, slats; the settee also gets a cross rail with short spindles.
  const lean = 0.08;
  const yz = (y) => -hz - Math.sin(lean) * (y - seat) * 0.5;
  box(w + 0.04, 0.085, 0.03, 0, back - 0.05, yz(back - 0.05), lean);
  box(w - 0.06, 0.05, 0.025, 0, seat + 0.1, yz(seat + 0.1), lean);
  const n = Math.max(4, Math.round(w / 0.1));
  const yA = seat + 0.125;
  const yB = w > 1 ? back - 0.28 : back - 0.09;
  for (let k = 1; k < n; k++) box(0.04, yB - yA, 0.016, -hx + ((2 * hx) / n) * k, (yA + yB) / 2, yz((yA + yB) / 2), lean);
  if (w > 1) {
    box(w - 0.06, 0.04, 0.025, 0, yB + 0.02, yz(yB), lean);
    for (let k = 1; k < n * 2; k++) box(0.02, 0.16, 0.016, -hx + (hx / n) * k, yB + 0.12, yz(yB + 0.12), lean);
  }
}

function buildTable(b, { x0, x1, z0, z1, h, stretcher }) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  b.box('top', w, 0.035, d, cx, h - 0.0175, cz);
  b.box('wood', w - 0.08, 0.07, 0.025, cx, h - 0.07, z1 - 0.05);
  b.box('wood', w - 0.08, 0.07, 0.025, cx, h - 0.07, z0 + 0.05);
  b.box('wood', 0.025, 0.07, d - 0.1, x0 + 0.05, h - 0.07, cz);
  b.box('wood', 0.025, 0.07, d - 0.1, x1 - 0.05, h - 0.07, cz);
  for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [z0 + 0.05, z1 - 0.05]) b.place('wood', turnedLeg(0.028, h - 0.035), M(x, 0, z));
  if (stretcher) {
    for (const x of [x0 + 0.05, x1 - 0.05]) b.box('wood', 0.03, 0.03, d - 0.1, x, 0.1, cz);
    b.box('wood', w - 0.1, 0.03, 0.03, cx, 0.1, cz);
  }
}

/**
 * The embroidery frame (pemidang): red cloth stretched between two rollers, held by side bars on
 * short legs, tilted towards the sitter. Plain cloth: the work has not started.
 */
function buildEmbroideryFrame(b) {
  const { x, z, ry, w, d, front, back } = PLAN.frame;
  const F = new THREE.Matrix4().compose(V(x, 0, z), Q(0, ry, 0), ONE);
  const tilt = Math.atan2(back - front, d);
  const midY = (front + back) / 2;
  const cloth = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateX(tilt);
  b.place('cloth', cloth, M(0, midY + 0.012, 0).premultiply(F), 0.02, false);
  const pole = (a, c, r) => {
    const len = a.distanceTo(c);
    const g = new THREE.CylinderGeometry(r, r, len, 8).rotateZ(Math.PI / 2);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), uv.getY(i) * 0.2);
    b.place('wood', g, M((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2).premultiply(F));
  };
  const box = (w2, h, d2, lx, ly, lz, rx = 0) => b.place('wood', boxWithGrainUVs(w2, h, d2), M(lx, ly, lz, rx).premultiply(F));
  const half = w / 2 + 0.16;
  pole(V(-half, front, d / 2 + 0.03), V(half, front, d / 2 + 0.03), 0.026);
  pole(V(-half, back, -d / 2 - 0.03), V(half, back, -d / 2 - 0.03), 0.026);
  const len = d + 0.5;
  for (const s of [-1, 1]) {
    const sx = s * (w / 2 + 0.07);
    box(0.045, 0.035, len, sx, midY, 0, tilt); // side bar
    box(0.04, front, 0.04, sx, front / 2, d / 2 + 0.12); // front leg
    box(0.04, back, 0.04, sx, back / 2, -d / 2 - 0.12); // back leg
    box(0.05, 0.04, len + 0.1, sx, 0.02, 0); // floor runner
    // lacing: tapes from the cloth edge round the side bar
    for (let k = 0; k < 6; k++) {
      const lz = -d / 2 + 0.06 + ((d - 0.12) * k) / 5;
      b.place('tape', boxWithGrainUVs(0.08, 0.006, 0.012), M(s * (w / 2 + 0.03), midY + 0.02 - Math.sin(tilt) * lz, lz, tilt).premultiply(F), 0.1);
    }
  }
  box(w + 0.18, 0.035, 0.035, 0, 0.12, d / 2 + 0.12);
  box(w + 0.18, 0.035, 0.035, 0, 0.12, -d / 2 - 0.12);
  // A cloth bag on the floor by the frame.
  const bag = new THREE.SphereGeometry(1, 10, 8).scale(0.16, 0.2, 0.13);
  b.place('bag', bag, M(w / 2 + 0.3, 0.17, 0.25, 0, 0.4, 0.1).premultiply(F), 0.1);
}

/** Woven mats and framed pictures hung as diamonds on the right wall; a plate on the back wall. */
function buildHangings(b) {
  const { x1, z0 } = PLAN.room;
  const { z, y, size } = PLAN.hangings;
  const step = size * Math.SQRT1_2 * 1.06;
  const cells = [[0, 0], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1], [0, -1], [1, -1], [0, 2], [-1, -1]];
  cells.forEach(([i, j], k) => {
    const cz = z + (i + j) * step;
    const cy = y + (i - j) * step + (rand() - 0.5) * 0.02;
    const s = size * (0.88 + rand() * 0.18);
    const g = new THREE.PlaneGeometry(s, s);
    const uv = g.attributes.uv;
    const tx = k % 4;
    const ty = Math.floor(k / 4) % 2;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, (tx + uv.getX(n)) / 4, (1 - ty + uv.getY(n)) / 2);
    const tilt = Math.PI / 4 + (rand() - 0.5) * 0.08;
    b.place('decor', g, M(x1 - 0.022, cy, cz, 0, -Math.PI / 2, tilt), 0.06, false);
    b.place('frame', boxWithGrainUVs(0.014, s + 0.02, s + 0.02), M(x1 - 0.008, cy, cz, tilt, 0, 0), 0.1);
  });
  const p = PLAN.plate;
  b.place('plate', new THREE.CylinderGeometry(p.r, p.r * 0.8, 0.02, 20).rotateX(Math.PI / 2), M(p.x, p.y, z0 + 0.012), 0.04, false);
  b.place('frame', new THREE.TorusGeometry(p.r * 0.72, 0.008, 4, 20), M(p.x, p.y, z0 + 0.024), 0.04, false);
  // A small framed print between the first two windows.
  b.box('frame', 0.24, 0.3, 0.02, -1.45, 1.62, z0 + 0.012);
  const g = new THREE.PlaneGeometry(0.18, 0.24);
  const uv = g.attributes.uv;
  for (let n = 0; n < uv.count; n++) uv.setXY(n, (2 + uv.getX(n)) / 4, (1 + uv.getY(n)) / 2);
  b.place('decor', g, M(-1.45, 1.62, z0 + 0.023), 0.04, false);
}

/** Trailing vines beside the windows: small leaf cards along a gently swinging line. */
function buildVines(b) {
  const { z0, x1 } = PLAN.room;
  const vine = (x, z, yTop, yBottom, alongX) => {
    let k = 0;
    for (let y = yTop; y > yBottom; y -= 0.035) {
      const sway = Math.sin(y * 5 + x) * 0.04;
      const leaf = new THREE.PlaneGeometry(0.075, 0.045);
      const a = rand() * Math.PI * 2;
      const px = alongX ? x + sway + Math.cos(a) * 0.035 : x - 0.04 - rand() * 0.02;
      const pz = alongX ? z + 0.05 + rand() * 0.03 : z + sway + Math.cos(a) * 0.035;
      b.place('leaf', leaf, M(px, y + Math.sin(a) * 0.02, pz, (rand() - 0.5) * 0.8, alongX ? (rand() - 0.5) * 1.2 : -Math.PI / 2 + (rand() - 0.5) * 1.2, a), 0.25, false);
      k++;
    }
  };
  const [w1, w2, w3] = PLAN.backWindows;
  vine(w1.x1 + 0.2, z0, 2.3, 1.45, true);
  vine(w2.x0 - 0.16, z0, 2.3, 1.7, true);
  vine(w3.x1 + 0.08, z0, 2.45, 1.25, true);
  vine(w3.x1 + 0.03, z0 + 0.15, 2.4, 1.6, true);
  vine(x1, PLAN.sideWindow.z0 - 0.2, 2.35, 1.0, false);
}

/** Soft sheen on the floor in front of each window: additive glow quads, bright at the window. */
function buildGlows(texture) {
  const group = new THREE.Group();
  const { z0 } = PLAN.room;
  const mat = new THREE.MeshBasicMaterial({ map: texture, color: '#ffd9a8', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (const w of PLAN.backWindows) {
    const ww = w.x1 - w.x0;
    const len = 1.2 + ww * 1.4;
    const g = new THREE.PlaneGeometry(ww * 1.15, len).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set((w.x0 + w.x1) / 2 + 0.12, 0.002, z0 + len / 2);
    mesh.layers.set(1);
    group.add(mesh);
  }
  return { group, mat };
}

