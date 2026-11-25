// Planting round the house (branch house-exterior, step 2), worked the way a garden designer
// does. ?garden=<layout> (garden-layouts.js: framed | open | drift | tropical) shows its beds and
// a placeholder per plant slot. &grow= then goes on with that layout:
//   plants — the plants in their slots, grown as their generators make them;
//   trim   — the plants cut back to their slots, with some growth left past the cut (`grown`).
// Without ?garden nothing is added. research/tools/garden-plans.mjs draws the layouts as plans.

import * as THREE from 'three';
import { HOUSE } from './interior/exterior.js';
import { LAYOUTS, LAYERS, WALLS } from './garden-layouts.js';
import { plant as bougainvillea } from '../vegetation/plants/bougainvillea.js';
import { plant as aglaonema } from '../vegetation/plants/aglaonema.js';
import { plant as nipah } from '../vegetation/plants/nipah.js';
import { plant as rainTree } from '../vegetation/plants/rainTree.js';

const GH = HOUSE.ground.y; // the terrace (-0.45)
const PLANTS = { bougainvillea, aglaonema, nipah, rainTree };

export const GARDEN = {
  kerb: { w: 0.1, h: 0.12 }, // concrete edging round each bed
  grown: 0.2, // how far past its cut a trimmed plant may grow, as a share of the cut (with noise ±grownNoise)
  grownNoise: 0.1,
};

/** The layout and stage asked for: ?garden=<layout>&grow=plants|trim, or null. */
export function gardenChoice(params) {
  const layout = LAYOUTS[params.get('garden')];
  if (!layout) return null;
  const grow = params.get('grow');
  return { layout, stage: grow === 'plants' || grow === 'trim' ? grow : 'plan' };
}

/** Is a bed edge along a wall of the house (no kerb there)? */
function onWall([ax, az], [bx, bz]) {
  const near = (a, b) => Math.abs(a - b) < 0.05;
  return (near(az, WALLS.Z0 - 0.02) && near(bz, WALLS.Z0 - 0.02)) || (near(ax, WALLS.X1 + 0.02) && near(bx, WALLS.X1 + 0.02)) || (near(ax, WALLS.X0 - 0.02) && near(bx, WALLS.X0 - 0.02));
}

/** Adds the layout's beds (mulch, and a concrete kerb on every edge not against the house) to the house's builder. */
export function buildBeds(b, layout) {
  const K = GARDEN.kerb;
  for (const bed of layout.beds) {
    const shape = new THREE.Shape(bed.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, GH + 0.025, 0);
    b.add('earth', g, 0, false);
    bed.forEach((p, i) => {
      const q = bed[(i + 1) % bed.length];
      if (!onWall(p, q)) b.beam('concrete', new THREE.Vector3(p[0], GH + K.h / 2, p[1]), new THREE.Vector3(q[0], GH + K.h / 2, q[1]), K.w, K.h, 0.04);
    });
  }
}

/** A placeholder per slot: the volume it is cut to, flat-coloured by layer. */
function placeholders(slots, disposables) {
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 20, 12);
  const box = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(sphere, box);
  const mats = Object.fromEntries(Object.entries(LAYERS).map(([k, L]) => [k, new THREE.MeshLambertMaterial({ color: L.colour, transparent: true, opacity: 0.8 })]));
  disposables.push(...Object.values(mats));
  for (const sl of slots) {
    const isBox = sl.shape === 'box';
    const m = new THREE.Mesh(isBox ? box : sphere, mats[sl.layer]);
    m.scale.set(isBox ? sl.w : sl.rx, isBox ? sl.h : sl.h / 2, isBox ? sl.d : sl.rz);
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

/** How far a world point is into a slot's volume: below 1 inside, 1 on its surface. */
function reachOf(sl, p) {
  const cy = GH + sl.h / 2;
  if (sl.shape === 'box') return Math.max(Math.abs(p.x - sl.at[0]) / (sl.w / 2), Math.abs(p.y - cy) / (sl.h / 2), Math.abs(p.z - sl.at[1]) / (sl.d / 2));
  return Math.hypot((p.x - sl.at[0]) / sl.rx, (p.y - cy) / (sl.h / 2), (p.z - sl.at[1]) / sl.rz);
}

const inHouse = (p) => p.x > WALLS.X0 - 0.03 && p.x < WALLS.X1 + 0.03 && p.z > WALLS.Z0 - 0.03 && p.z < WALLS.Z1 + 0.03;

/**
 * Keeps the triangles of `mesh` whose vertices all lie inside the slot's volume grown by
 * `grown` (± noise), out of the house's walls and above the ground. Returns the share kept.
 */
function trim(mesh, sl) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const index = g.index ? g.index.array : [...Array(pos.count).keys()];
  const p = new THREE.Vector3();
  const inside = new Uint8Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v).applyMatrix4(mesh.matrixWorld);
    const reach = 1 + GARDEN.grown + GARDEN.grownNoise * noise(Math.round(p.x * 6), Math.round(p.y * 6), Math.round(p.z * 6));
    inside[v] = reachOf(sl, p) <= reach && p.y >= GH - 0.05 && !inHouse(p) ? 1 : 0;
  }
  const kept = [];
  for (let t = 0; t < index.length; t += 3) if (inside[index[t]] && inside[index[t + 1]] && inside[index[t + 2]]) kept.push(index[t], index[t + 1], index[t + 2]);
  g.setIndex(kept);
  return kept.length / Math.max(1, index.length);
}

/**
 * The garden of a layout at a stage (plan | plants | trim). Returns { group, stats, dispose };
 * the beds go into the house's builder (buildBeds).
 */
export function buildGarden({ layout, stage }) {
  const group = new THREE.Group();
  group.name = 'garden';
  const disposables = [];
  const slots = layout.slots;
  const stats = { layout: layout.label, stage, slots: slots.length, kept: {} };
  if (stage === 'plan') {
    group.add(placeholders(slots, disposables));
    return { group, stats, dispose: () => disposables.forEach((d) => d.dispose()) };
  }
  for (const [n, sl] of slots.entries()) {
    const kind = PLANTS[LAYERS[sl.layer].plant];
    const made = kind.create({ seed: 1 + (n % 5), lod: 'near', leaves: kind === rainTree ? 0.65 : undefined }); // 0.65: the rain tree's smaller clumps for trees seen close (rainTree.js)
    disposables.push(made);
    const plant = made.group;
    plant.traverse((o) => {
      if (o.isMesh) o.geometry = o.geometry.clone(); // each copy its own geometry: trimming changes it
    });
    // Sizes. The bougainvillea keeps its generator's width (its cards are sized for that:
    // flora-stylised.js NATURAL_SIZE), but is drawn taller where its slot is taller than the
    // shrub (~2 m): a climber is the shrub stretched up the wall, then cut narrow. Trees are
    // scaled to fit their slot whole and never cut. The rest are scaled a little over their cut.
    plant.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(plant);
    const top = box.max.y;
    if (kind === bougainvillea) plant.scale.set(1, Math.max(1, (sl.h * 1.1) / top), 1);
    else if (sl.layer === 'tree') plant.scale.setScalar(Math.min(sl.h / top, (2 * sl.rx) / Math.max(box.max.x - box.min.x, box.max.z - box.min.z)));
    else plant.scale.setScalar((sl.h * 1.15) / top);
    plant.rotation.y = n * 1.7;
    plant.position.set(sl.at[0], GH, sl.at[1]);
    plant.updateMatrixWorld(true);
    if (stage === 'trim' && sl.layer !== 'tree') {
      const kept = [];
      plant.traverse((o) => o.isMesh && kept.push(trim(o, sl)));
      stats.kept[`${sl.layer} ${n}`] = +(kept.reduce((a, k) => a + k, 0) / kept.length).toFixed(2);
    }
    plant.traverse((o) => o.isMesh && disposables.push(o.geometry));
    group.add(plant);
  }
  return { group, stats, dispose: () => disposables.forEach((d) => d.dispose()) };
}
