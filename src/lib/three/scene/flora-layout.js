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
  planter: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
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
      m.compose(new THREE.Vector3(...e.at), q.setFromAxisAngle(up, e.yaw ?? 0), new THREE.Vector3(e.width, e.height, e.depth ?? e.width));
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
  for (let x = -240; x < -12; ) {
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++, x += 4 + rand() * 3) add('proposed: meadow tree line', 'tree', place(x, 28 + rand() * 18), 9 + rand() * 6, 6 + rand() * 3);
    x += 6 + rand() * 8;
  }
  // Left of the bridge (upstream), the user's ask: a taller back row behind the line, and loose
  // groups nearer the water, so that side reads wooded.
  for (let x = -230; x < -20; x += 9 + rand() * 6) add('proposed: meadow back trees', 'tree', place(x, 55 + rand() * 30), 12 + rand() * 6, 8 + rand() * 3);
  for (let x = -210; x < -35; x += 14 + rand() * 12) for (let i = 0; i < 2; i++) add('proposed: meadow riverside trees', 'tree', place(x + i * 4.5, 12 + rand() * 8), 7 + rand() * 4, 5 + rand() * 2);
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
 * PROPOSED (markers only, design guesses): one long trough planter on each back window's ledge
 * (the lattice rail, room.js: top at window.lattice + 0.06, its room face 1.5 cm into the room),
 * its foliage mounded on top and leaves spilling a little over the room side.
 */
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
  out.push({ group: 'proposed: Chinese evergreen (Aglaonema)', kind: 'fern', at: [gapX, 0.25, z0 + 0.3], width: 0.38, height: 0.75, yaw: 0 });
  // Tall upright plant in the back-left corner, clear of the window.
  out.push({ group: 'proposed: floor pot (upright)', kind: 'planter', at: [w0.x0 - 0.5, 0, z0 + 0.4], width: 0.4, height: 0.4, yaw: 0 });
  out.push({ group: 'proposed: rubber plant (Ficus elastica)', kind: 'fern', at: [w0.x0 - 0.5, 0.35, z0 + 0.4], width: 0.6, height: 1.2, yaw: 0 });
  // A small upright pot on the back low table.
  const tx = table.x0 + 0.3, tz = (table.z0 + table.z1) / 2;
  out.push({ group: 'proposed: table pot (small upright)', kind: 'planter', at: [tx, table.h, tz], width: 0.14, height: 0.12, yaw: 0 });
  out.push({ group: 'proposed: Peperomia (table)', kind: 'bush', at: [tx, table.h + 0.1, tz], width: 0.18, height: 0.18, yaw: 0 });
  // A low plant stand about 0.9 m in front of the left window (below its rail, so the view stays
  // open), its trailer spilling down the front: repeats the troughs. On the right it would hide
  // behind the front armchair.
  const sx = (w0.x0 + w0.x1) / 2 + 0.1, sz = z0 + 0.9, standH = 0.6;
  out.push({ group: 'proposed: plant stand', kind: 'planter', at: [sx, 0, sz], width: 0.3, height: standH, yaw: 0 });
  out.push({ group: 'proposed: satin pothos (stand)', kind: 'bush', at: [sx, standH - 0.03, sz], width: 0.4, height: 0.22, yaw: 0 });
  out.push({ group: 'proposed: satin pothos trailing', kind: 'vine', at: [sx, standH - 0.4, sz + 0.17], width: 0.26, height: 0.4, depth: 0.15, yaw: 0 });
  return out;
}

export function windowHangingProposal(PLAN) {
  const { z0 } = PLAN.room;
  const ledge = PLAN.window.lattice + 0.06;
  const depth = 0.14, front = z0 + 0.05; // overhangs the rail's room face by 3.5 cm
  const zc = front - depth / 2, tall = 0.14;
  const out = [];
  // Only the two left windows (lowest x); each trough covers about half its ledge, at the left end.
  [...PLAN.backWindows].sort((a, b) => a.x0 - b.x0).slice(0, 2).forEach((w, i) => {
    const span = w.x1 - w.x0, len = span * 0.5, x = w.x0 + 0.05 + len / 2; // left end of the ledge
    out.push({ group: 'proposed: ledge trough', kind: 'planter', at: [x, ledge, zc], width: len, height: tall, depth, yaw: 0 });
    out.push({ group: 'proposed: Hoya (ledge)', kind: 'bush', at: [x, ledge + tall - 0.04, zc], width: len * 1.1, height: 0.22, depth: depth * 1.5, yaw: 0 });
    const drop = [0.3, 0.38][i];
    out.push({ group: 'proposed: Hoya trailing', kind: 'vine', at: [x, ledge + tall - drop, front + 0.02], width: len * 0.7, height: drop, depth: 0.15, yaw: 0 });
  });
  return out;
}
