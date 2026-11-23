// Where the plants of #/interior stand, as data: the bush below the window (its blobs, fern and
// grass tufts; outside/waterbush.js), the grass ticks of the far slope (outside/banks.js), and the
// vines beside the windows (interior/vines.js). `?flora=blockout` draws a flat marker per entry
// instead of the plant (and `?flora=both` draws the markers over the plants), to try a layout
// before the plants are replaced. The plants themselves do not move.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The `?flora=` flag: 'blockout', 'both' or null. */
export function floraMode(params) {
  const f = params.get('flora');
  return f === 'blockout' || f === 'both' ? f : null;
}

/** The vines beside the windows (interior/vines.js): anchor, top and bottom of each. */
export function windowVineLayout(PLAN) {
  const { z0, x1 } = PLAN.room;
  const [w1, w2, w3] = PLAN.backWindows;
  return [
    { x: w1.x1 + 0.2, z: z0, yTop: 2.3, yBottom: 1.45, alongX: true },
    { x: w2.x0 - 0.16, z: z0, yTop: 2.3, yBottom: 1.7, alongX: true },
    { x: w3.x1 + 0.08, z: z0, yTop: 2.45, yBottom: 1.25, alongX: true },
    { x: w3.x1 + 0.03, z: z0 + 0.15, yTop: 2.4, yBottom: 1.6, alongX: true },
    { x: x1, z: PLAN.sideWindow.z0 - 0.2, yTop: 2.35, yBottom: 1.0, alongX: false },
  ];
}

/** Marker entries for the vines: a thin strip from top to bottom, where the leaves hang. */
export function vineMarkers(vines) {
  return vines.map((v, i) => ({
    group: 'window vines',
    kind: 'vine',
    at: [v.alongX ? v.x : v.x - 0.05, v.yBottom, v.alongX ? v.z + 0.065 : v.z],
    height: v.yTop - v.yBottom,
    width: 0.1,
    yaw: v.alongX ? 0 : Math.PI / 2,
    name: `vine ${i + 1}`,
  }));
}

/**
 * Patches of the grass blades of the banks, read back from their geometry: each blade's root is
 * binned in a grid (3 m cells within 40 m of the house, 12 m beyond) per kind of blade, which is
 * told apart by its paint. `colours` maps a group name to an [r, g, b] paint (banks.js BANK_PAINT).
 * Returns marker entries { group, kind: 'patch', at, width, height, blades }.
 */
export function bladePatches(slot, from, colours) {
  const P = slot.position, C = slot.color;
  const groups = Object.entries(colours);
  const cells = new Map();
  for (let t = from; t < slot.triangles; t++) {
    const o = t * 9;
    const r = C[o], g = C[o + 1], b = C[o + 2];
    const hit = groups.find(([, c]) => Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b) < 1e-4);
    if (!hit) continue;
    const xs = [P[o], P[o + 3], P[o + 6]], ys = [P[o + 1], P[o + 4], P[o + 7]], zs = [P[o + 2], P[o + 5], P[o + 8]];
    const x = (xs[0] + xs[1]) / 2, z = (zs[0] + zs[1]) / 2;
    const near = Math.hypot(x, z + 5) < 40;
    const size = near ? 3 : 12;
    const key = `${hit[0]}|${near}|${Math.floor(x / size)}|${Math.floor(z / size)}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { group: hit[0], n: 0, sx: 0, sz: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity }));
    c.n++;
    c.sx += x;
    c.sz += z;
    for (let k = 0; k < 3; k++) {
      c.x0 = Math.min(c.x0, xs[k]); c.x1 = Math.max(c.x1, xs[k]);
      c.z0 = Math.min(c.z0, zs[k]); c.z1 = Math.max(c.z1, zs[k]);
      c.y0 = Math.min(c.y0, ys[k]); c.y1 = Math.max(c.y1, ys[k]);
    }
  }
  return [...cells.values()].map((c) => ({
    group: c.group,
    kind: 'patch',
    at: [c.sx / c.n, c.y0, c.sz / c.n],
    width: Math.max(0.3, Math.max(c.x1 - c.x0, c.z1 - c.z0)),
    height: Math.max(0.05, c.y1 - c.y0),
    yaw: 0,
    blades: c.n,
  }));
}

/** Removes from `slot` the triangles at or after `from` whose paint is one of `colours` (values). */
export function dropTriangles(slot, from, colours) {
  const paints = Object.values(colours);
  const per = { position: 9, normal: 9, uv: 6, uv1: 6, color: 9 };
  const keep = [];
  for (let t = from; t < slot.triangles; t++) {
    const o = t * 9, C = slot.color;
    if (!paints.some((c) => Math.abs(c[0] - C[o]) + Math.abs(c[1] - C[o + 1]) + Math.abs(c[2] - C[o + 2]) < 1e-4)) keep.push(t);
  }
  for (const [k, n] of Object.entries(per)) {
    const a = slot[k];
    let j = from * n;
    for (const t of keep) for (let i = 0; i < n; i++) a[j++] = a[t * n + i]; // t * n >= j: copies forward only
    a.length = j;
  }
  slot.triangles = from + keep.length;
}

// Marker shapes, one unit shape per kind: base at y = 0, 1 high, 1 across.
const UNIT = {
  tree: () => mergeGeometries([new THREE.CylinderGeometry(0.04, 0.05, 0.3, 6).translate(0, 0.15, 0), new THREE.ConeGeometry(0.5, 0.75, 8).translate(0, 0.625, 0)]),
  bush: () => new THREE.SphereGeometry(0.5, 10, 6).translate(0, 0.5, 0),
  fern: () => new THREE.SphereGeometry(0.5, 10, 6).translate(0, 0.5, 0),
  patch: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0),
  vine: () => new THREE.BoxGeometry(1, 1, 0.2).translate(0, 0.5, 0),
};
// A colour per group, in the order groups first appear.
const PALETTE = ['#1f6f3a', '#d1495b', '#edae49', '#00798c', '#8e5cc4', '#3e8ed0', '#e07a1f', '#6a994e', '#c2185b', '#7b5e3b', '#2ec4b6', '#b5179e', '#a7c957', '#ff6b6b'];

/**
 * Flat markers for layout entries { group, kind, at, width, height, yaw }: one InstancedMesh per
 * kind, coloured by group (from PALETTE[firstColour] on, so two blockouts can share a legend). `opacity` < 1 draws them see-through over the plants. Returns
 * { group, legend: [{ group, kind, count, colour }], dispose }.
 */
export function buildFloraBlockout(entries, { opacity = 1, layer, firstColour = 0 } = {}) {
  const root = new THREE.Group();
  root.name = 'flora-blockout';
  const colourOf = new Map();
  const legend = [];
  for (const e of entries) {
    if (!colourOf.has(e.group)) {
      colourOf.set(e.group, PALETTE[(firstColour + colourOf.size) % PALETTE.length]);
      legend.push({ group: e.group, kind: e.kind, count: 0, colour: colourOf.get(e.group) });
    }
    legend.find((l) => l.group === e.group).count++;
  }
  const disposables = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  for (const kind of Object.keys(UNIT)) {
    const list = entries.filter((e) => e.kind === kind);
    if (!list.length) continue;
    const geo = UNIT[kind]();
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: opacity < 1, opacity, depthWrite: opacity >= 1, fog: false });
    disposables.push(geo, mat);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.name = `flora-${kind}`;
    list.forEach((e, i) => {
      m.compose(new THREE.Vector3(...e.at), q.setFromAxisAngle(up, e.yaw ?? 0), new THREE.Vector3(e.width, e.height, e.width));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(colourOf.get(e.group)));
    });
    mesh.renderOrder = opacity < 1 ? 2 : 0;
    if (layer != null) mesh.layers.enable(layer);
    root.add(mesh);
  }
  return { group: root, legend, dispose: () => disposables.forEach((d) => d.dispose()) };
}

/** A small legend in the page's corner: one line per group with its count. Returns a remove(). */
export function showFloraLegend(legend, title) {
  const el = document.createElement('div');
  el.dataset.flora = 'legend';
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;background:rgba(255,255,255,0.88);color:#222;font:11px/1.35 system-ui,sans-serif;padding:6px 8px;border-radius:4px;pointer-events:none;max-width:260px';
  const rows = legend.map((l) => `<div><span style="display:inline-block;width:10px;height:10px;background:${l.colour};margin-right:5px;vertical-align:-1px"></span>${l.group} <span style="opacity:.6">${l.kind} × ${l.count}</span></div>`);
  el.innerHTML = `<b>${title}</b>${rows.join('')}`;
  document.body.append(el);
  return () => el.remove();
}

/**
 * PROPOSED planting for the far bank (not in the scene yet; markers only, under ?flora): a
 * composition to try before the plants are made. Every position and size is a design guess,
 * not taken from a photo or survey. `place(xWater, offset)` comes from the far bank (banks.js);
 * `forecourt` is the x range of the waterline the Assembly's river front stands on, kept clear.
 *  - a tree line on the natural bank left of the embankment, in clumps with gaps, behind the
 *    bridge: it gives the flat meadow a skyline;
 *  - a pair of tall trees each side of the forecourt, framing its stairs;
 *  - street trees along the far path, evenly spaced, both sides of the forecourt;
 *  - trees on the terrace behind the crest, their crowns showing over it, either side of the Assembly;
 *  - low bushes at the foot of the embankment, right of the forecourt.
 */
export function farBankProposal({ place, forecourt: [f0, f1], rand }) {
  const out = [];
  const add = (group, kind, at, height, width) => out.push({ group, kind, at, height, width, yaw: rand() * Math.PI * 2 });
  // Tree line on the meadow: clumps of 3-5 along the crest distance, gaps between them.
  for (let x = -150; x < -12; ) {
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++, x += 4 + rand() * 3) add('proposed: meadow tree line', 'tree', place(x, 28 + rand() * 18), 9 + rand() * 6, 6 + rand() * 3);
    x += 12 + rand() * 14;
  }
  // Framing pairs either side of the forecourt, on the slope above the path.
  for (const [x, o] of [[f0 - 3, 17], [f0 - 6.5, 21], [f1 + 3, 17], [f1 + 6.5, 21]]) add('proposed: forecourt framing trees', 'tree', place(x, o), 12 + rand() * 2, 7);
  // Street trees on the far path, every 12 m, clear of the forecourt and the bridge's pier.
  for (let x = -66; x <= 66; x += 12) if ((x < f0 - 10 || x > f1 + 10) && Math.abs(x + 22) > 6) add('proposed: far street trees', 'tree', place(x, 9.3), 6 + rand() * 1.5, 4);
  // Terrace trees behind the crest, either side of the Assembly.
  for (const x of [f1 + 20, f1 + 28, f1 + 40, 60, 72]) add('proposed: terrace trees', 'tree', place(x, 48 + rand() * 20), 11 + rand() * 4, 7 + rand() * 2);
  // Bushes along the embankment's foot, right of the forecourt, in threes.
  for (let x = f1 + 12; x < f1 + 46; x += 11) for (let i = 0; i < 3; i++) add('proposed: embankment foot bushes', 'bush', place(x + i * 1.6, 15.6 + rand() * 0.6), 1.2 + rand() * 0.5, 1.8 + rand() * 0.6);
  return out;
}

/**
 * PROPOSED (markers only, design guesses): plants on the window ledges that hang into the room.
 * On each back window's lattice rail (room.js: top at window.lattice + 0.06, its face 1.5 cm into
 * the room) a trailing plant sits in a low pot, and strands spill over the rail's room side and
 * hang down the lattice. The side window's sill (y0) gets a pot whose strands reach the floor.
 */
export function windowHangingProposal(PLAN) {
  const { z0 } = PLAN.room;
  const ledge = PLAN.window.lattice + 0.06, face = z0 + 0.015;
  const out = [];
  PLAN.backWindows.forEach((w, i) => {
    const span = w.x1 - w.x0;
    const pots = span > 0.8 ? [0.3, 0.72] : [0.5];
    pots.forEach((f, j) => {
      const x = w.x0 + span * f;
      out.push({ group: 'proposed: ledge plants', kind: 'bush', at: [x, ledge, z0 - 0.02], width: 0.28, height: 0.24, yaw: 0 });
      // strands over the room side of the rail, either side of the pot
      for (const [dx, drop] of [[-0.08, [0.55, 0.8, 0.4][(i + j) % 3]], [0.07, [0.35, 0.6, 0.75][(i + j) % 3]]])
        out.push({ group: 'proposed: strands over the ledge', kind: 'vine', at: [x + dx, ledge + 0.04 - drop, face + 0.02], width: 0.08, height: drop, yaw: 0 });
    });
  });
  return out;
}
