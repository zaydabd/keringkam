// Planting round the house (branch house-exterior, step 2), worked the way a garden designer
// does, in three stages chosen with ?garden=:
//   plan   — the beds, and a placeholder volume for every plant slot (no plants);
//   plants — the plants in their slots, grown as their generators make them;
//   trim   — the plants cut back to their slots, with some growth left past the cut (`grown`).
// Without ?garden nothing is added. Every place and size here is a design choice: ESTIMATES.
//
// The design: a bed along the river wall and an L down the right side. Low Chinese evergreens
// fill the bed under the windows (kept below 0.55 m, so the floor-length windows stay open);
// bougainvillea is trained into columns on the wall between the windows and at the corners, so
// it frames each window instead of covering it; the side wall has the same two layers.

import * as THREE from 'three';
import { HOUSE } from './interior/exterior.js';
import { PLAN } from './interior/plan.js';
import { plant as bougainvillea } from '../vegetation/plants/bougainvillea.js';
import { plant as aglaonema } from '../vegetation/plants/aglaonema.js';

const GH = HOUSE.ground.y; // the terrace (-0.45)
const R = PLAN.room;
const X0 = R.x0 - HOUSE.out, X1 = R.x1 + HOUSE.out, Z0 = R.z0 - HOUSE.out; // the cladding's faces
const s = PLAN.sideWindow;

export const GARDEN = {
  bedDepth: 0.95, // the river bed, out from the wall
  sideDepth: 0.85, // the side bed
  sideEnd: -0.2, // where the side bed stops (z), short of the door corner
  kerb: { w: 0.1, h: 0.12 }, // concrete edging
  grown: 0.2, // how far past its cut a trimmed plant may grow, as a share of the cut (with noise ±grownNoise)
  grownNoise: 0.1,
  // the placeholders' colours, by layer
  colours: { low: '#9ccf6a', column: '#d9579b', corner: '#f0974a' },
};

const bedZ = Z0 - GARDEN.bedDepth;
const sideX = X1 + GARDEN.sideDepth;

/** The beds as rectangles [x0, x1, z0, z1] (mulch), and their kerbs. */
function beds() {
  return [
    [X0 - 0.6, sideX, bedZ, Z0 - 0.02], // along the river wall, past both corners
    [X1 + 0.02, sideX, Z0 - 0.02, GARDEN.sideEnd], // down the right side
  ];
}

/**
 * Every plant slot: where it stands and the volume it is cut to (an upright ellipsoid on the
 * ground: radii rx, rz across, height h). layer: low | column | corner.
 */
export function gardenSlots() {
  const slots = [];
  const low = (x, z, i) => slots.push({ layer: 'low', plant: aglaonema, at: [x, z], rx: 0.27, rz: 0.27, h: 0.55, seed: 1 + (i % 5), yaw: i * 1.7 });
  const column = (x, z, rx, rz, h, i, layer = 'column') => slots.push({ layer, plant: bougainvillea, at: [x, z], rx, rz, h, seed: 1 + (i % 5), yaw: 0.4 + i * 1.3 });
  // Low layer: under each river window, spaced about 0.4 m, staggered in two rows.
  let i = 0;
  for (const w of PLAN.backWindows) {
    const n = Math.max(1, Math.round((w.x1 - w.x0) / 0.38));
    for (let k = 0; k < n; k++) low(w.x0 + ((k + 0.5) * (w.x1 - w.x0)) / n, Z0 - 0.42 + (k % 2 ? -0.16 : 0.08), i++);
  }
  // ...and under the side window.
  for (let k = 0; k < 3; k++) low(X1 + 0.4 + (k % 2 ? 0.14 : -0.06), s.z0 + ((k + 0.5) * (s.z1 - s.z0)) / 3, i++);
  // Columns on the wall between the river windows: as wide as the wall between the window surrounds.
  const [w1, w2, w3] = PLAN.backWindows;
  column((w1.x1 + w2.x0) / 2, Z0 - 0.42, (w2.x0 - w1.x1) / 2 - 0.16, 0.36, 2.5, 0);
  column((w2.x1 + w3.x0) / 2, Z0 - 0.42, (w3.x0 - w2.x1) / 2 - 0.16, 0.34, 2.5, 1);
  // Corners: rounder, a little lower.
  column(X0 - 0.12, Z0 - 0.48, 0.55, 0.45, 2.2, 2, 'corner');
  column(X1 + 0.38, Z0 - 0.48, 0.5, 0.42, 2.2, 3, 'corner');
  // Side wall: a column each side of the side window.
  column(X1 + 0.42, (Z0 + s.z0) / 2 - 0.2, 0.36, 0.6, 2.4, 4);
  column(X1 + 0.42, (s.z1 + GARDEN.sideEnd) / 2, 0.36, 0.5, 2.4, 5);
  return slots;
}

/** Adds the beds (mulch and kerbs) to the house's builder, in its materials. */
export function buildBeds(b) {
  const K = GARDEN.kerb;
  for (const [x0, x1, z0, z1] of beds()) b.box('earth', x1 - x0, 0.04, z1 - z0, (x0 + x1) / 2, GH + 0.02, (z0 + z1) / 2, 0, 0, 0, 0);
  // kerbs on the open edges: the river bed's front and left end, the side bed's outer edge and end
  const kerb = (ax, az, bx, bz) => b.box('concrete', Math.max(K.w, Math.abs(bx - ax)), K.h, Math.max(K.w, Math.abs(bz - az)), (ax + bx) / 2, GH + K.h / 2, (az + bz) / 2, 0, 0, 0, 0.04);
  const L = X0 - 0.6;
  kerb(L, bedZ, sideX, bedZ);
  kerb(L, bedZ, L, Z0);
  kerb(sideX, bedZ, sideX, GARDEN.sideEnd);
  kerb(X1, GARDEN.sideEnd, sideX, GARDEN.sideEnd);
}

/** A placeholder per slot: its cut volume, flat-coloured by layer. */
function placeholders(slots, disposables) {
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 20, 12);
  disposables.push(sphere);
  const mats = Object.fromEntries(Object.entries(GARDEN.colours).map(([k, c]) => [k, new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.8 })]));
  disposables.push(...Object.values(mats));
  for (const sl of slots) {
    const m = new THREE.Mesh(sphere, mats[sl.layer]);
    m.scale.set(sl.rx, sl.h / 2, sl.rz);
    m.position.set(sl.at[0], GH + sl.h / 2, sl.at[1]);
    group.add(m);
  }
  return group;
}

/** A cheap hash noise in [-1, 1] for a point: the uneven edge of a cut. */
function noise(x, y, z) {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

/**
 * Keeps the triangles of `mesh` whose vertices all lie inside the slot's volume grown by
 * `grown` (± noise), in world space. Returns the share of triangles kept.
 */
function trim(mesh, sl) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const index = g.index ? g.index.array : [...Array(pos.count).keys()];
  const cy = GH + sl.h / 2;
  const p = new THREE.Vector3();
  const inside = new Uint8Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v).applyMatrix4(mesh.matrixWorld);
    const d = Math.hypot((p.x - sl.at[0]) / sl.rx, (p.y - cy) / (sl.h / 2), (p.z - sl.at[1]) / sl.rz);
    const reach = 1 + GARDEN.grown + GARDEN.grownNoise * noise(Math.round(p.x * 6), Math.round(p.y * 6), Math.round(p.z * 6));
    inside[v] = d <= reach && p.y >= GH - 0.05 ? 1 : 0;
  }
  const kept = [];
  for (let t = 0; t < index.length; t += 3) if (inside[index[t]] && inside[index[t + 1]] && inside[index[t + 2]]) kept.push(index[t], index[t + 1], index[t + 2]);
  g.setIndex(kept);
  return kept.length / Math.max(1, index.length);
}

/**
 * The garden for a stage (plan | plants | trim). Returns { group, stats, dispose }; the beds are
 * built separately into the house (buildBeds).
 */
export function buildGarden(stage) {
  const group = new THREE.Group();
  group.name = 'garden';
  const disposables = [];
  const slots = gardenSlots();
  const stats = { stage, slots: slots.length, kept: {} };
  if (stage === 'plan') {
    group.add(placeholders(slots, disposables));
    return { group, stats, dispose: () => disposables.forEach((d) => d.dispose()) };
  }
  for (const [n, sl] of slots.entries()) {
    const made = sl.plant.create({ seed: sl.seed, lod: 'near' });
    disposables.push(made);
    const plant = made.group;
    plant.updateMatrixWorld(true);
    // Each copy its own geometry: trimming changes it.
    plant.traverse((o) => {
      if (o.isMesh) o.geometry = o.geometry.clone();
    });
    // The evergreens are scaled to a little over their cut (they grow past it); the bougainvillea
    // keeps the size its generator gives (its cards are sized for that: flora-stylised.js).
    if (sl.plant === aglaonema) {
      const top = new THREE.Box3().setFromObject(plant).max.y;
      plant.scale.setScalar((sl.h * 1.15) / top);
    }
    plant.rotation.y = sl.yaw;
    plant.position.set(sl.at[0], GH, sl.at[1]);
    plant.updateMatrixWorld(true);
    if (stage === 'trim') {
      const kept = [];
      plant.traverse((o) => {
        if (o.isMesh) kept.push(trim(o, sl));
      });
      stats.kept[`${sl.layer} ${n}`] = +(kept.reduce((a, k) => a + k, 0) / kept.length).toFixed(2);
    }
    plant.traverse((o) => {
      if (o.isMesh) disposables.push(o.geometry);
    });
    group.add(plant);
  }
  return { group, stats, dispose: () => disposables.forEach((d) => d.dispose()) };
}

/** The stage asked for with ?garden=, or null. */
export function gardenStage(params) {
  const g = params.get('garden');
  return ['plan', 'plants', 'trim'].includes(g) ? g : null;
}
