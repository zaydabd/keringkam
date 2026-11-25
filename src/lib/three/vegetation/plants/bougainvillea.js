// Bougainvillea (Bougainvillea glabra type), a stylised procedural shrub in the style of the
// oak, birch and bushes in ../tree.js. Original design: no geometry or texture is copied.
//
// Sourced shape facts:
//   - Arching, cascading, climbing, multi-trunked, spreading; evergreen flowering vine.
//     https://plants.ces.ncsu.edu/plants/bougainvillea-glabra
//   - Stems carry long thin thorns, often at the leaf axils.
//     https://plants.ces.ncsu.edu/plants/bougainvillea
//   - Colour comes from papery bracts around small flowers; B. glabra's bracts are short.
//     https://plants.ces.ncsu.edu/plants/bougainvillea-spectabilis
//   - Maximum height 4–8 m. https://www.rhs.org.uk/plants/91850/bougainvillea-glabra/details
//   - Technically a vine, can be trained to a shrub or small tree; leaves "broadly ovate to
//     nearly round, to 3 inches"; flowers "small and white, subtended by 3 very showy papery
//     bracts", "most commonly magenta".
//     https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=875
//
// Design choices (guess), tuned by eye: trained mounded shrub ~2 m tall; 3–5 trunks; cane,
// twig and clump sizes; leaf card ~9 cm and bract card ~11 cm; bracts concentrated on the outer
// cane ends; all colours (magenta from the source, exact tones guessed); far clump and card
// sizes and the spray layouts;
// switchAt 30 m. Thorns are left out (sourced, but too small to read at this card scale).
//
// Levels: near = tube stems + camera-facing leaf and bract cards (2 draw calls);
//         far  = thin stems + fewer, larger cards, each a painted spray of leaves or bracts
//                (2 draw calls, same shader as near).

import * as THREE from 'three';
import { mulberry32, range } from '../../../utils/rng.js';
import { addTube, createMeshWriter } from '../tube.js';
import { FOLIAGE_SUN } from '../celFoliage.js';
import { growSkeleton } from './bougainvillea/skeleton.js';
import { createAtlas, createCardMaterial } from './bougainvillea/materials.js';

const LEAF_TONES = ['#1d4521', '#3c7a32', '#93c95e']; // (guess)
const BRACT_TONES = ['#6e1048', '#c21f7f', '#f27ac0']; // (guess) magenta, per VT
const FOLIAGE = { radius: 0.2, merge: 0.75, density: 1.0, leafCard: 0.09, bractCard: 0.11 }; // (guess)
const FAR = { merge: 0.4, radius: 0.24, cards: 16, card: 0.34 }; // (guess)

const barkColor = (() => {
  const old = new THREE.Color('#6b5640');
  const young = new THREE.Color('#5f7a3a');
  const out = new THREE.Color();
  return (level, t) => out.copy(old).lerp(young, Math.min(1, level * 0.45 + t * 0.4));
})();

/** Bract share of a foliage anchor: bracts sit on the outer ends of the canes (guess). */
const bractShare = (tip) => (tip.level === 2 ? 0.3 + 0.5 * tip.t : 0.85 * THREE.MathUtils.smoothstep(tip.t, 0.5, 1));

function boundsOf(group) {
  return new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
}

/** Merges close anchors into clumps; each keeps the mean bract share of its members. */
function clumps(tips, radius) {
  const out = [];
  for (const tip of tips) {
    const b = bractShare(tip);
    const c = tip.point.clone().addScaledVector(tip.dir, radius * 0.3);
    const hit = out.find((o) => o.centre.distanceTo(c) < radius);
    if (hit) {
      hit.sum.add(c);
      hit.n++;
      hit.b += b;
    } else out.push({ centre: c, sum: c.clone(), n: 1, b });
  }
  for (const o of out) {
    o.centre.copy(o.sum).divideScalar(o.n);
    o.b /= o.n;
  }
  return out;
}

function crownFrame(centres, pad) {
  const box = new THREE.Box3().setFromPoints(centres).expandByScalar(pad);
  return { centre: box.getCenter(new THREE.Vector3()), half: box.getSize(new THREE.Vector3()).multiplyScalar(0.5) };
}

function writeStems(stems, { radial, every = 1 }) {
  const w = createMeshWriter();
  let tris = 0;
  for (const s of stems) {
    const pick = (a) => a.filter((_, i) => i % every === 0 || i === a.length - 1);
    const pts = every > 1 ? pick(s.points) : s.points;
    const rad = every > 1 ? pick(s.radii) : s.radii;
    tris += addTube(w, pts, rad, { radial: radial[s.level], colorAt: (v, u, t) => barkColor(s.level, t), closeStart: s.level === 0 });
  }
  const geometry = w.toGeometry();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'stems';
  return { mesh, tris, dispose: () => (geometry.dispose(), material.dispose()) };
}

/**
 * Camera-facing cards on round clumps (after tree.js): most on the shell, a sparse fill inside.
 * `cells` = [leaf cell, bract cell] in the atlas. Bracts go on the outward, upper side of a
 * clump, in proportion to its bract share (guess).
 */
function writeCards(rand, list, { radius, count, leafCard, bractCard, cells, aoScale = 1, bractBias = 1 }) {
  const frame = crownFrame(list.map((c) => c.centre), radius);
  const A = { position: [], normal: [], uv: [], corner: [], centre: [], color: [], ao: [], kind: [] };
  const indices = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const q = new THREE.Vector3();
  const out = new THREE.Vector3();
  const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  let leaves = 0;
  let bracts = 0;
  for (const c of list) {
    const r = radius * range(rand, 0.8, 1.2);
    out.copy(c.centre).sub(frame.centre).divide(frame.half);
    const depth = Math.min(1, out.length());
    const away = out.lengthSq() > 1e-6 ? out.clone().normalize().dot(FOLIAGE_SUN) * 0.5 + 0.5 : 0.5;
    const clumpAo = (0.6 + 0.25 * depth + 0.15 * away) * aoScale;
    out.normalize();
    const hue = range(rand, 0.94, 1.06);
    const m = count(r);
    for (let k = 0; k < m; k++) {
      const zz = range(rand, -1, 1);
      const az = range(rand, 0, Math.PI * 2);
      const sn = Math.sqrt(1 - zz * zz);
      n.set(sn * Math.cos(az), zz, sn * Math.sin(az));
      const shell = rand() < 0.85 ? range(rand, 0.82, 1) : range(rand, 0.3, 0.82);
      p.copy(c.centre).addScaledVector(n, r * shell);
      const facing = 0.55 + 0.45 * (n.dot(out) * 0.6 + n.y * 0.4);
      const isBract = shell > 0.8 && rand() < c.b * facing * 1.3 * bractBias;
      const size = (isBract ? bractCard : leafCard) * range(rand, 0.8, 1.2);
      const roll = range(rand, 0, Math.PI * 2);
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      const tint = hue * range(rand, 0.93, 1.07);
      const ao = clumpAo * (0.7 + 0.3 * shell) * (isBract ? 1.1 : 1);
      const kind = cells[isBract ? 1 : 0];
      q.copy(p).sub(frame.centre).divide(frame.half).normalize();
      const base = A.position.length / 3;
      for (const [u, v] of CORNERS) {
        A.position.push(p.x, p.y, p.z);
        A.corner.push((u * cr - v * sr) * size, (u * sr + v * cr) * size);
        A.centre.push(c.centre.x, c.centre.y, c.centre.z);
        A.normal.push(q.x, q.y, q.z);
        A.uv.push(u + 0.5, v + 0.5);
        A.color.push(tint, tint, tint);
        A.ao.push(ao);
        A.kind.push(kind);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      if (isBract) bracts++;
      else leaves++;
    }
  }
  const geometry = new THREE.BufferGeometry();
  const size = { position: 3, normal: 3, uv: 2, corner: 2, centre: 3, color: 3, ao: 1, kind: 1 };
  for (const [k, v] of Object.entries(A)) geometry.setAttribute(k, new THREE.Float32BufferAttribute(v, size[k]));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += bractCard * 1.7;
  const atlas = createAtlas();
  const material = createCardMaterial(atlas, LEAF_TONES, BRACT_TONES);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'leaves and bracts';
  return {
    mesh,
    leaves,
    bracts,
    tris: indices.length / 3,
    dispose: () => (geometry.dispose(), material.dispose(), atlas.dispose()),
  };
}

function build(seed, lod, stems, cards, clumpCount) {
  const group = new THREE.Group();
  group.name = `bougainvillea ${lod}`;
  group.add(stems.mesh, cards.mesh);
  return {
    group,
    stats: {
      seed,
      lod,
      leaves: cards.leaves,
      bracts: cards.bracts,
      clumps: clumpCount,
      triangles: { stems: stems.tris, leaves: cards.tris, total: stems.tris + cards.tris },
      bounds: boundsOf(group),
    },
    dispose() {
      stems.dispose();
      cards.dispose();
    },
  };
}

function createNear(seed) {
  const skel = growSkeleton(mulberry32(seed));
  const F = FOLIAGE;
  const stems = writeStems(skel.stems, { radial: [7, 5, 3] });
  const list = clumps(skel.tips, F.radius * F.merge);
  const cards = writeCards(mulberry32(seed * 7919 + 13), list, {
    radius: F.radius,
    count: (r) => Math.max(20, Math.round((F.density * 4 * Math.PI * r * r) / (F.leafCard * F.leafCard))),
    leafCard: F.leafCard,
    bractCard: F.bractCard,
    cells: [0, 1],
  });
  return build(seed, 'near', stems, cards, list.length);
}

function createFar(seed) {
  // Same skeleton (same seed stream) as near, so the silhouette matches. Fewer, larger clumps of
  // big cards; each card is a painted spray of leaves or bracts, so the edge stays leafy.
  const skel = growSkeleton(mulberry32(seed));
  // Trunks plus the lower half of each cane; the rest is inside the foliage.
  const cut = (s) => {
    const n = s.level === 0 ? s.points.length : Math.max(2, Math.ceil(s.points.length * 0.5));
    return { ...s, points: s.points.slice(0, n), radii: s.radii.slice(0, n) };
  };
  const stems = writeStems(skel.stems.filter((s) => s.level < 2).map(cut), { radial: [3, 3], every: 3 });
  const list = clumps(skel.tips, FAR.merge);
  const cards = writeCards(mulberry32(seed * 7919 + 29), list, {
    radius: FAR.radius,
    count: () => FAR.cards,
    leafCard: FAR.card,
    bractCard: FAR.card,
    cells: [2, 3],
    // A spray card hides more of the clump than one leaf, so bracts need a larger share (guess).
    bractBias: 1.35,
  });
  return build(seed, 'far', stems, cards, list.length);
}

/**
 * Foliage for a trimmed bush (the garden round the house): leaf and bract spray cards on the given
 * clumps, in whatever space they are given (world space for the garden). Each clump is
 * { centre: Vector3, b: bract share 0..1 }. `card` is the card size; `count` cards per clump.
 * Same shader and atlas as the far level, so a clump reads as a mass of leaves, not single cards.
 */
export function createBushFoliage(seed, list, { radius = FAR.radius, card = FAR.card, count = FAR.cards } = {}) {
  return writeCards(mulberry32(seed * 7919 + 41), list, {
    radius,
    count: () => count,
    leafCard: card,
    bractCard: card,
    cells: [2, 3],
    bractBias: 1.35,
  });
}

export const plant = {
  id: 'bougainvillea',
  label: 'Bougainvillea',
  create: ({ seed = 1, lod = 'near' } = {}) => (lod === 'far' ? createFar(seed) : createNear(seed)),
  switchAt: 30, // (guess)
  target: [0, 1, 0],
  distance: 8.5,
  background: '#1d2a33',
};
