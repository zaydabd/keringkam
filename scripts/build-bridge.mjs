// Builds src/assets/models/darul-hana-bridge.bin from the user's Blender export of the Darul Hana
// Bridge (WaterfrontBridge.obj, uploaded 2026-11-25; kept in research/bridge-refs/, not in the repo).
//   node scripts/build-bridge.mjs [path/to/WaterfrontBridge.obj]
// What it does to the model:
//   - drops the hairline 'l' elements (they draw as stray lines);
//   - sorts every piece into a part, by the model's own object names: the deck and truss (body),
//     the walkway, the viewing platforms' roofs, the piers, the two A-frame towers, the stay cables;
//   - the model's posts and cables are 32-sided cylinders (840 posts alone are 104,000 of its
//     146,000 triangles). Each is rebuilt as a 6-sided prism on the same axis and radius, which
//     brings the model to about 52,000 triangles. Nothing else is changed.
// The file: 'DHB1', a u32 header length, a JSON header, then per part its positions (u16,
// quantised to the model's bounds) and its triangle indices (u16 or u32), each 4-byte aligned.
// Units are the model's own (about 1 to 2.65 m); riverside/bridge.js places and scales it.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SRC = process.argv[2] ?? 'research/bridge-refs/user-upload/source/inner/WaterfrontBridge.obj';
const OUT = 'src/assets/models/darul-hana-bridge.bin';
const SIDES = 6; // the rebuilt posts and cables
const CABLE_SLIM = 1.6; // the cables drawn this much thicker (look pass, 2026-11-26: was 2.5, which with ink read as grey rods). Past about 100 m a cable is under a pixel; riverside/bridge.js cableLines draws each one as an unbroken line too (a stylisation, like banks.js FAR_FRONT.drawn)

// --- Read the OBJ ----------------------------------------------------------------------------
const V = [];
const objects = []; // [name, faces]
for (const line of readFileSync(SRC, 'utf8').split('\n')) {
  if (line.startsWith('v ')) V.push(line.split(/\s+/).slice(1, 4).map(Number));
  else if (line.startsWith('o ')) objects.push([line.slice(2).trim(), []]);
  else if (line.startsWith('f ')) objects.at(-1)[1].push(line.trim().split(/\s+/).slice(1).map((t) => parseInt(t, 10) - 1));
}

function components(faces) {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  for (const f of faces) for (const i of f.slice(1)) parent.set(find(i), find(f[0]));
  const groups = new Map();
  for (const f of faces) {
    const r = find(f[0]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(f);
  }
  return [...groups.values()];
}

// --- Parts -----------------------------------------------------------------------------------
const PART_OF = { 'Cylinder.929': 'roof', 'Cylinder.599': 'pier', 'Cylinder.001': 'tower', 'Cylinder.478': 'walk' };
export const PARTS = ['body', 'walk', 'roof', 'pier', 'tower', 'cable'];
const out = Object.fromEntries(PARTS.map((p) => [p, { positions: [], indices: [] }]));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
};

/** Copies faces as they are (fan-triangulated) into a part. */
function copy(part, faces) {
  const P = out[part];
  const map = new Map();
  const at = (i) => {
    if (!map.has(i)) {
      map.set(i, P.positions.length / 3);
      P.positions.push(...V[i]);
    }
    return map.get(i);
  };
  for (const f of faces) for (let k = 1; k + 1 < f.length; k++) P.indices.push(at(f[0]), at(f[k]), at(f[k + 1]));
}

/**
 * A 32-sided cylinder (two rings of 32 vertices) as a SIDES-sided prism. The axis is the normal
 * of the plane through the first vertex that holds 32 of the vertices (its ring); the two rings
 * are the vertices either side of the centre along it. False if the piece is not such a cylinder.
 */
function prism(part, verts, slim = 1) {
  const pts = verts.map((i) => V[i]);
  const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
  let best = null;
  const p0 = pts[0];
  for (let a = 1; a < pts.length && !best; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      const n = cross(sub(pts[a], p0), sub(pts[b], p0));
      const l = Math.hypot(...n);
      if (l < 1e-9) continue;
      const nn = n.map((v) => v / l);
      const on = pts.filter((p) => Math.abs(dot(sub(p, p0), nn)) < 1e-4).length;
      if (on === 32) {
        best = nn;
        break;
      }
    }
  }
  if (!best) return false;
  const axis = best;
  const ringA = pts.filter((p) => dot(sub(p, c), axis) < 0), ringB = pts.filter((p) => dot(sub(p, c), axis) >= 0);
  if (ringA.length !== 32 || ringB.length !== 32) return false;
  const centre = (ring) => ring.reduce((a, p) => [a[0] + p[0] / 32, a[1] + p[1] / 32, a[2] + p[2] / 32], [0, 0, 0]);
  const A = centre(ringA), B = centre(ringB);
  const r = (ringA.reduce((s, p) => s + Math.hypot(...sub(p, A)), 0) / 32) * slim;
  const u = norm(sub(ringA[0], A)), v = norm(cross(axis, u));
  const P = out[part];
  const base = P.positions.length / 3;
  for (const C of [A, B]) {
    for (let k = 0; k < SIDES; k++) {
      const t = (k / SIDES) * Math.PI * 2;
      P.positions.push(...[0, 1, 2].map((j) => C[j] + r * (Math.cos(t) * u[j] + Math.sin(t) * v[j])));
    }
  }
  for (let k = 0; k < SIDES; k++) {
    const a = base + k, b = base + ((k + 1) % SIDES), a2 = a + SIDES, b2 = b + SIDES;
    P.indices.push(a, b, b2, a, b2, a2);
  }
  for (let k = 1; k + 1 < SIDES; k++) {
    P.indices.push(base, base + k + 1, base + k); // cap A
    P.indices.push(base + SIDES, base + SIDES + k, base + SIDES + k + 1); // cap B
  }
  return true;
}

let rebuilt = 0;
for (const [name, faces] of objects) {
  if (!faces.length) continue;
  for (const comp of components(faces)) {
    const verts = [...new Set(comp.flat())];
    const ys = verts.map((i) => V[i][1]);
    let extent = 0;
    for (const i of verts) extent = Math.max(extent, Math.hypot(...sub(V[i], V[verts[0]])));
    const isCylinder = verts.length === 64;
    let part = PART_OF[name] ?? 'body';
    if (name === 'Cylinder.466' && isCylinder && Math.max(...ys) > 6 && extent > 8) part = 'cable';
    if (isCylinder && prism(part, verts, part === 'cable' ? CABLE_SLIM : 1)) rebuilt++;
    else copy(part, comp);
  }
}

// --- Write -----------------------------------------------------------------------------------
const all = PARTS.flatMap((p) => out[p].positions);
const min = [0, 1, 2].map((j) => Math.min(...all.filter((_, i) => i % 3 === j)));
const max = [0, 1, 2].map((j) => Math.max(...all.filter((_, i) => i % 3 === j)));
const header = { bounds: [min, max], parts: [] };
const chunks = [];
const align = (buf) => (buf.byteLength % 4 ? Buffer.concat([buf, Buffer.alloc(4 - (buf.byteLength % 4))]) : buf);
let triangles = 0;
for (const p of PARTS) {
  const { positions, indices } = out[p];
  const count = positions.length / 3;
  const q = new Uint16Array(positions.length);
  for (let i = 0; i < positions.length; i++) q[i] = Math.round(((positions[i] - min[i % 3]) / (max[i % 3] - min[i % 3])) * 65535);
  const idx = count > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  chunks.push(align(Buffer.from(q.buffer)), align(Buffer.from(idx.buffer)));
  header.parts.push({ name: p, vertices: count, indices: indices.length, wide: count > 65535 });
  triangles += indices.length / 3;
}
let json = Buffer.from(JSON.stringify(header));
json = align(Buffer.concat([json, Buffer.alloc(0)]));
const head = Buffer.alloc(8);
head.write('DHB1', 0, 'ascii');
head.writeUInt32LE(json.byteLength, 4);
mkdirSync(dirname(OUT), { recursive: true });
const file = Buffer.concat([head, json, ...chunks]);
writeFileSync(OUT, file);
console.log(`${OUT}: ${(file.byteLength / 1024).toFixed(0)} KB, ${triangles} triangles, ${rebuilt} cylinders rebuilt with ${SIDES} sides`);
console.log(Object.fromEntries(header.parts.map((p) => [p.name, p.indices / 3])));
