// Planting round the house: the bougainvillea layout (layouts.js), each plant cut back to
// its slot with some growth left past the cut (`grown`). On by default; ?garden=off leaves it
// out. research/tools/garden-plans.mjs draws the layout as a plan.

import * as THREE from 'three';
import { HOUSE } from '../../world/house.js';
import { LAYOUTS, LAYERS, WALLS } from './layouts.js';
import { plant as bougainvillea, createBushFoliage } from '../../../vegetation/plants/bougainvillea.js';
import { mulberry32 } from '../../../../utils/rng.js';
import { NO_INK_LAYER, CARD_MASK_LAYER } from '../../layers.js';
import { plant as kuchingTree } from '../../../vegetation/plants/kuchingTree.js';
// The garden's tree: main's new Kuching tree in its rain-tree design (treeStudies.js rainRoadside).
const rainTree = { id: 'rainTree', create: (o) => kuchingTree.create({ ...o, variant: 'rainRoadside' }) };
import { createVineCurtain, VINE_CURTAIN } from '../../../vegetation/vineCurtain.js';
import { createHangingVine, HANGING_VINE } from '../../../vegetation/hangingVine.js';

const GH = HOUSE.ground.y; // the terrace (-0.45)
// Garden copies of the vines, for the window shot (about 1.5 m off, where a pixel is about
// 1.4 mm). The generators' tendrils (0.4-1.2 mm) and thin side shoots go below a pixel there and
// alias into a web of thin lines, and 16 strands per panel read too dense. So: no tendrils, fewer
// strands, every stem at least ~2.5 mm thick. ESTIMATED from the lens, not measured.
const MIN_R = 0.0025;
const thick = (o) => ({ ...o, radius: Math.max(o.radius, MIN_R), tipRadius: Math.max(o.tipRadius, MIN_R * 0.6) });
const GARDEN_CURTAIN = {
  ...VINE_CURTAIN,
  strand: { ...thick(VINE_CURTAIN.strand), count: 9, tendril: 0, sideShoots: [0, 1] },
  shoot: { ...thick(VINE_CURTAIN.shoot), tendril: 0 },
};
const GARDEN_HANGING = { ...HANGING_VINE, strand: { ...thick(HANGING_VINE.strand), count: 6, tendril: 0 } };
// The vine generators made into plants: create({ seed }) -> { group, stats, dispose }.
const vineCurtain = { id: 'vineCurtain', create: ({ seed }) => createVineCurtain({ seed, species: GARDEN_CURTAIN }) };
const hangingVine = { id: 'hangingVine', create: ({ seed }) => createHangingVine({ seed, species: GARDEN_HANGING }) };
const PLANTS = { bougainvillea, rainTree, vineCurtain, hangingVine };

export const GARDEN = {
  kerb: { w: 0.1, h: 0.12 }, // concrete edging round each bed
  grown: 0.2, // how far past its cut a trimmed plant may grow, as a share of the cut (with noise ±grownNoise)
  grownNoise: 0.1,
  // The bougainvillea's leaf and bract cards are sized for a shrub seen from across the room or
  // further; at the window they read as big flat stickers (the user: "the plants look weird").
  // Garden copies draw them at this share of their size.
  cardScale: 0.6,
  // A bougainvillea slot is a thick bush from the soil up (the user: "they should be thick bushes",
  // not clumps floating on bare stems). Its outside is covered in clumps of leaf and bract cards
  // `spacing` apart, on rings from just above the bed to the top of the dome. Sizes are guesses.
  // `core`: a solid body of this share of the slot that only the AO sees (see bushCore).
  bush: { spacing: 0.13, clump: 0.2, card: 0.22, cards: 18, core: 0.85 },
};

const baseOf = (sl) => sl.base ?? GH; // where a slot stands

/** The garden's layout (the user's choice, 25 Nov 2026), or null for ?garden=off. */
export function gardenChoice(params) {
  return params.get('garden') === 'off' ? null : { layout: LAYOUTS.bougainvillea };
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

/** A cheap hash noise in [-1, 1] for a point: the uneven edge of a cut. */
function noise(x, y, z) {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

/**
 * How far a world point is into a slot's volume: below 1 inside, 1 on its surface. The volume is
 * a dome on straight sides: full width from the ground to half height, then rounding over the top,
 * so a trimmed bush stays full down to the soil.
 */
function reachOf(sl, p) {
  const cy = baseOf(sl) + sl.h / 2;
  const up = Math.max(0, p.y - cy);
  return Math.hypot((p.x - sl.at[0]) / sl.rx, up / (sl.h / 2), (p.z - sl.at[1]) / sl.rz);
}

/** Leaf and bract cards: drawn without ink, and hiding the ink of what is behind them (toon.js masks). */
function cardsMaskInk(mesh) {
  mesh.layers.set(NO_INK_LAYER);
  mesh.layers.enable(CARD_MASK_LAYER);
}

/** The slot's shape (straight sides to half height, then a dome) as a unit lathe: radius 1, height 1. */
const BUSH_SHAPE = (() => {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 0.5)];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a), 0.5 + 0.5 * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, 20);
})();

/**
 * A solid body inside a bougainvillea bush, the slot's shape shrunk, that only the AO's depth and
 * normal render sees (post/ao.js): it draws no colour, no depth and no ink. The AO's render does
 * not turn the cards to the camera, so without it the AO saw the stems and the wall behind the
 * leaves and shaded their shapes through them (the user: "how come it is see through?").
 */
function bushCore(sl, material) {
  const k = GARDEN.bush.core;
  const mesh = new THREE.Mesh(BUSH_SHAPE, material);
  mesh.name = 'bush core';
  mesh.layers.set(NO_INK_LAYER);
  mesh.scale.set(sl.rx * k, sl.h * k, sl.rz * k);
  mesh.position.set(sl.at[0], baseOf(sl), sl.at[1]);
  return mesh;
}

/**
 * The clumps covering a bougainvillea slot's outside (world space): rings up its straight sides
 * and over its dome. None close enough to the house for a card to show through the wall into the
 * room (the cards turn to face the camera, so they reach a clump and a card from their centre). More bracts higher up and on the outside (guess).
 */
function bushClumps(sl, seed) {
  const rand = mulberry32(seed);
  const B = GARDEN.bush;
  const base = baseOf(sl);
  const half = sl.h / 2;
  const out = [];
  const p = new THREE.Vector3();
  const clear = B.clump + B.card * 0.75;
  for (let y = base + B.clump * 0.4; y <= base + sl.h; y += B.spacing * 0.8) {
    const up = Math.max(0, y - base - half) / half;
    const f = Math.sqrt(Math.max(0, 1 - up * up));
    const ex = sl.rx * f;
    const ez = sl.rz * f;
    const n = Math.max(1, Math.round((2 * Math.PI * Math.hypot(ex, ez) * Math.SQRT1_2) / B.spacing));
    const turn = rand() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = turn + ((k + 0.3 * rand()) / n) * Math.PI * 2;
      const r = 0.95 + 0.1 * rand();
      p.set(sl.at[0] + ex * r * Math.cos(a), y + (rand() - 0.5) * B.spacing * 0.3, sl.at[1] + ez * r * Math.sin(a));
      if (inHouse(p, clear)) continue;
      const height = (p.y - base) / sl.h;
      out.push({ centre: p.clone(), b: 0.15 + 0.6 * THREE.MathUtils.smoothstep(height, 0.25, 1) });
    }
  }
  return out;
}

const inHouse = (p, m = 0.03) => p.x > WALLS.X0 - m && p.x < WALLS.X1 + m && p.z > WALLS.Z0 - m && p.z < WALLS.Z1 + m;

/**
 * Keeps the triangles of `mesh` whose vertices all lie inside the slot's volume grown by
 * `grown` (± noise), out of the house's walls and above the ground. Returns the share kept.
 */
function trim(mesh, sl, grown = GARDEN.grown) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const index = g.index ? g.index.array : [...Array(pos.count).keys()];
  const p = new THREE.Vector3();
  const inside = new Uint8Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v).applyMatrix4(mesh.matrixWorld);
    const reach = 1 + grown + GARDEN.grownNoise * noise(Math.round(p.x * 6), Math.round(p.y * 6), Math.round(p.z * 6));
    inside[v] = reachOf(sl, p) <= reach && p.y >= baseOf(sl) - 0.05 && !inHouse(p) ? 1 : 0;
  }
  const kept = [];
  for (let t = 0; t < index.length; t += 3) if (inside[index[t]] && inside[index[t + 1]] && inside[index[t + 2]]) kept.push(index[t], index[t + 1], index[t + 2]);
  g.setIndex(kept);
  return kept.length / Math.max(1, index.length);
}

/** Places a vine in its hanging panel: scaled to the panel's height, its top centre at the top. */
function hang(vine, sl) {
  const holder = new THREE.Group();
  vine.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(vine);
  const size = box.getSize(new THREE.Vector3());
  const k = sl.h / size.y;
  vine.scale.setScalar(k);
  vine.position.set(-((box.min.x + box.max.x) / 2) * k, -box.max.y * k, -((box.min.z + box.max.z) / 2) * k);
  holder.add(vine);
  holder.rotation.y = sl.yaw ?? 0;
  holder.position.set(sl.at[0], sl.top, sl.at[1]);
  return holder;
}

/**
 * The garden of a layout, trimmed. Returns { group, stats, dispose };
 * the beds go into the house's builder (buildBeds).
 */
export function buildGarden({ layout }) {
  const group = new THREE.Group();
  group.name = 'garden';
  const disposables = [];
  const slots = layout.slots;
  const stats = { layout: layout.label, slots: slots.length, kept: {} };
  const coreMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }); // seen by the AO only (bushCore)
  disposables.push(coreMaterial);
  for (const [n, sl] of slots.entries()) {
    const kind = PLANTS[LAYERS[sl.layer].plant];
    const made = kind.create({ seed: 1 + (n % 5), lod: 'near', leaves: kind === rainTree ? 0.65 : undefined }); // 0.65: the rain tree's smaller clumps for trees seen close (kuchingTree.js)
    if (sl.shape === 'hang') {
      // A vine hangs whole in its panel: scaled to its height, its top at the panel's top, uncut.
      group.add(hang(made.group, sl));
      disposables.push(made);
      continue;
    }
    disposables.push(made);
    const plant = made.group;
    plant.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry = o.geometry.clone(); // each copy its own geometry: trimming changes it
      const corner = o.geometry.attributes.corner; // a card's offset from its centre (bougainvillea)
      if (corner && kind === bougainvillea) {
        for (let i = 0; i < corner.array.length; i++) corner.array[i] *= GARDEN.cardScale;
        corner.needsUpdate = true;
      }
    });
    // Sizes. The bougainvillea keeps its generator's width (its cards are sized for that:
    // vegetation/stylised.js NATURAL_SIZE), but is drawn taller where its slot is taller than the
    // shrub (~2 m): a climber is the shrub stretched up the wall, then cut narrow. Trees are
    // scaled to fit their slot whole and never cut. The rest are scaled a little over their cut.
    plant.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(plant);
    const top = box.max.y;
    if (kind === bougainvillea) plant.scale.set(1, Math.max(1, (sl.h * 1.1) / top), 1);
    else if (sl.layer === 'tree') plant.scale.setScalar(Math.min(sl.h / top, (2 * sl.rx) / Math.max(box.max.x - box.min.x, box.max.z - box.min.z)));
    else plant.scale.setScalar((sl.h * 1.15) / top);
    plant.rotation.y = n * 1.7;
    plant.position.set(sl.at[0], baseOf(sl), sl.at[1]);
    plant.updateMatrixWorld(true);
    if (sl.layer !== 'tree') {
      const kept = [];
      // A bougainvillea's stems stay inside its leaves (the bush's cards sit on the slot's surface).
      const stemsIn = kind === bougainvillea ? -0.2 : GARDEN.grown;
      plant.traverse((o) => o.isMesh && kept.push(trim(o, sl, o.name === 'stems' ? stemsIn : GARDEN.grown)));
      stats.kept[`${sl.layer} ${n}`] = +(kept.reduce((a, k) => a + k, 0) / kept.length).toFixed(2);
    }
    plant.traverse((o) => o.isMesh && disposables.push(o.geometry));
    if (kind === bougainvillea) {
      plant.traverse((o) => o.isMesh && o.geometry.attributes.corner && cardsMaskInk(o));
      // Out of the AO's depth and normal render (post/ao.js): its cards face the camera, which that
      // render does not do, so the AO saw the stems behind them and drew them through the leaves.
      plant.traverse((o) => o.isMesh && (o.userData.noAO = true));
    }
    group.add(plant);
    if (kind === bougainvillea) {
      const B = GARDEN.bush;
      const leaves = createBushFoliage(1 + n, bushClumps(sl, 101 + n), { radius: B.clump, card: B.card, count: B.cards });
      leaves.mesh.name = `bush ${n}`;
      cardsMaskInk(leaves.mesh);
      leaves.mesh.userData.noAO = true;
      group.add(leaves.mesh, bushCore(sl, coreMaterial));
      disposables.push(leaves);
    }
  }
  return { group, stats, dispose: () => disposables.forEach((d) => d.dispose()) };
}
