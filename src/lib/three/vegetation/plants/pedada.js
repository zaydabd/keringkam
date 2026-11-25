// Pedada (Sonneratia caseolaris), a mangrove tree at the water's edge. Original stylised design.
//
// Sourced shape facts:
//   - Tree up to 20 m tall, up to 50 cm diameter; tidal mud flats and muddy river banks.
//     https://forestry.sarawak.gov.my/web/subpage/webpage_view/708
//   - Usually up to 15 m tall; branches droop so the crown resembles a weeping willow;
//     plant shape "Irregular, Weeping / Pendulous, Open"; deep green leathery leaves, oval to
//     drop-shaped, 4.5–13 × 1.5–7 cm; upright pneumatophores up to 1.5 m at its base;
//     bark brown to grey, slightly fissured.
//     https://www.nparks.gov.sg/florafaunaweb/flora/3/3/3343
//   - 5–15(–20) m; trunk not buttressed; crown lax; branches horizontal or drooping; leaf blade
//     elliptical, ovate or obovate, 4–13 × 2–7 cm; numerous erect, often branched, cone-shaped
//     pneumatophores 0.2–2.5 m above the substrate; bark flaky, greyish pale brown.
//     https://plantuse.plantnet.org/en/Sonneratia_caseolaris_(PROSEA)
//   Note: "narrow leaves" was NOT supported by these sources (adult leaves are elliptic–ovate),
//   so the leaf cards keep the shared oval stroke shape.
//
// Guesses (stylised choices, not from sources): tree height ~11 m, crown spread, branch angles
// and amount of droop, clump sizes, the exact colours, root ring radius (≤ 4.5 m), root count,
// root heights used (0.15–0.8 m, inside the sourced range), share of branched roots,
// switchAt 60 m.
//
// Built with createTree (tree.js) and a species preset; pneumatophores are tapered tubes merged
// into the branch mesh, so each level is two draw calls. Far: trunk + main limbs at low detail,
// the near crown's leaf cards thinned (1 in 6) and enlarged, and fewer, cruder roots.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTree } from '../tree.js';
import { addTube, createMeshWriter } from '../tube.js';
import { mulberry32, range } from '../rng.js';

const TONES = ['#163a2a', '#2f6a3c', '#8fbf6a']; // deep green ramp (colour sourced, values guess)

const pedadaBark = (() => {
  const pale = new THREE.Color('#8d8172');
  const grey = new THREE.Color('#6a6258');
  const dark = new THREE.Color('#3f3a33');
  const out = new THREE.Color();
  const hash = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  // Greyish pale brown with flaky patches (sourced colour/texture; the pattern is a guess).
  return (v, u, t, level) => {
    const flake = hash(Math.floor(v * 4), Math.floor(u * 6));
    out.copy(pale).lerp(grey, flake * 0.6);
    if (flake > 0.8 && level < 2) out.lerp(dark, 0.5);
    return out;
  };
})();

// Species preset in TREE_SPECIES format. Negative `up` makes the outer branches droop.
export const PEDADA_SPECIES = {
  bark: pedadaBark,
  barkPattern: 'scaly',
  levels: [
    // Shape after the user's photo of a pedada standing in water (not in the repo): a slender
    // trunk, limbs rising steeply, leaves in clumps at the branch ends, a crown taller than wide
    // and open. All numbers are guesses set by eye against that photo.
    { length: [7.5, 8.5], radius: 0.2, tip: 0.07, sections: 16, radial: 12, gnarl: 0.04, up: 0.1, lean: 0.06 },
    { count: 7, emerge: [0.22, 1], angle: [0.6, 0.95], length: [0.6, 0.74], radius: 0.6, tip: 0.03, sections: 10, radial: 7, gnarl: 0.08, up: 0.06, shorten: 0.55 },
    { count: 6, emerge: [0.25, 1], angle: [0.55, 0.9], length: [0.45, 0.58], radius: 0.55, tip: 0.012, sections: 7, radial: 5, gnarl: 0.1, up: 0.06, shorten: 0.35 },
    // Twigs end pointing up or out, so each leaf clump sits on top of its branch.
    { count: 4, emerge: [0.35, 1], angle: [0.5, 0.9], length: [0.35, 0.5], radius: 0.6, tip: 0.004, sections: 4, radial: 3, gnarl: 0.1, up: 0.06, shorten: 0.3 },
  ],
  foliage: { radius: 0.5, merge: 0.85, density: 1.0, card: 0.22, mask: { curve: 0.03 }, tones: TONES },
};

const rootColor = new THREE.Color('#5a5145');
const rootTip = new THREE.Color('#9a8e7c');

/** Ring of cone-shaped pneumatophores around the trunk, written into `writer`. */
function addRoots(writer, seed, { count, radial, sections, branched }) {
  const rand = mulberry32(seed * 7919 + 13);
  let tris = 0;
  const col = new THREE.Color();
  const cone = (base, h, r0, tilt, az) => {
    const pts = [];
    const radii = [];
    for (let i = 0; i <= sections; i++) {
      const t = i / sections;
      pts.push(new THREE.Vector3(base.x + Math.cos(az) * tilt * t * h, base.y + t * h, base.z + Math.sin(az) * tilt * t * h));
      radii.push(r0 * (1 - t) ** 1.1 + 0.002);
    }
    tris += addTube(writer, pts, radii, { radial, colorAt: (v, u, t) => col.copy(rootColor).lerp(rootTip, t) });
  };
  for (let i = 0; i < count; i++) {
    const az = range(rand, 0, Math.PI * 2);
    // Denser near the trunk (sqrt bias reversed), from 0.5 m out to 4.5 m.
    const d = 0.5 + 4 * rand() ** 0.8;
    const base = new THREE.Vector3(Math.cos(az) * d, -0.05, Math.sin(az) * d);
    const h = range(rand, 0.15, 0.8) * (1.1 - d / 6);
    const r0 = h * range(rand, 0.14, 0.2);
    cone(base, h, r0, range(rand, -0.15, 0.15), range(rand, 0, Math.PI * 2));
    if (branched && rand() < 0.2) {
      // A smaller side cone, "often branched" (sourced); the share is a guess.
      const b = base.clone().add(new THREE.Vector3(0, h * 0.3, 0));
      cone(b, h * 0.5, r0 * 0.55, 0.6, range(rand, 0, Math.PI * 2));
    }
  }
  return tris;
}

/** Replace a tree's branch geometry with branches + roots in one mesh. */
function mergeRootsInto(mesh, rootWriter) {
  const roots = rootWriter.toGeometry();
  const merged = mergeGeometries([mesh.geometry, roots]);
  mesh.geometry.dispose();
  roots.dispose();
  merged.computeBoundingSphere();
  mesh.geometry = merged;
}

function trisOf(geometry) {
  return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
}

function boundsOf(group) {
  return new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
}

function createNear(seed) {
  const tree = createTree({ seed, kind: 'pedada', species: PEDADA_SPECIES });
  const stems = tree.group.getObjectByName('branches');
  const writer = createMeshWriter();
  const rootTris = addRoots(writer, seed, { count: 70, radial: 6, sections: 4, branched: true });
  mergeRootsInto(stems, writer);
  tree.group.name = 'pedada near';
  const s = tree.stats;
  s.kind = 'pedada';
  s.lod = 'near';
  s.triangles.roots = rootTris;
  s.triangles.stems += rootTris;
  s.triangles.total = s.triangles.stems + s.triangles.leaves;
  s.drawCalls = tree.group.children.length;
  s.bounds = boundsOf(tree.group);
  return tree;
}

/**
 * Thin a near leaf-card geometry: keep one card in `keep`, enlarged by `grow`, so the far crown
 * has the same clumps, colours, shading and leaf shape with far fewer cards.
 */
function thinCards(geometry, keep, grow) {
  const out = new THREE.BufferGeometry();
  const cards = geometry.index.count / 6;
  const kept = [];
  for (let c = 0; c < cards; c += keep) kept.push(c);
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const size = attr.itemSize;
    const data = new Float32Array(kept.length * 4 * size);
    kept.forEach((c, j) => data.set(attr.array.subarray(c * 4 * size, (c + 1) * 4 * size), j * 4 * size));
    if (name === 'corner') for (let i = 0; i < data.length; i++) data[i] *= grow;
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  const index = [];
  kept.forEach((_, j) => {
    const v = j * 4;
    index.push(v, v + 1, v + 2, v, v + 2, v + 3);
  });
  out.setIndex(index);
  out.computeBoundingSphere();
  out.boundingSphere.radius += PEDADA_SPECIES.foliage.card * grow * 1.7;
  return out;
}

// Far: 1 card in 6 kept, 2.2× bigger (about the same leaf cover; values tuned by eye).
const FAR_KEEP = 6;
const FAR_GROW = 2.2;

function createFar(seed) {
  // Trunk and main limbs: the first two levels grow identically to near's (same seed, same
  // sections), so only the radial detail drops.
  const L = PEDADA_SPECIES.levels;
  const lowSpecies = {
    ...PEDADA_SPECIES,
    levels: [{ ...L[0], radial: 6 }, { ...L[1], radial: 3 }],
  };
  const low = createTree({ seed, kind: 'pedada', species: lowSpecies });
  const stemMesh = low.group.getObjectByName('branches');
  const writer = createMeshWriter();
  addRoots(writer, seed, { count: 30, radial: 4, sections: 1, branched: false });
  mergeRootsInto(stemMesh, writer);
  const lowLeaves = low.group.getObjectByName('leaves');
  lowLeaves.geometry.dispose();
  lowLeaves.material.uniforms.map.value.dispose();
  lowLeaves.material.dispose();

  // Crown: the near crown's own leaf cards, thinned. Its material (and leaf mask) is reused.
  const full = createTree({ seed, kind: 'pedada', species: PEDADA_SPECIES });
  const fullLeaves = full.group.getObjectByName('leaves');
  const leafGeometry = thinCards(fullLeaves.geometry, FAR_KEEP, FAR_GROW);
  const leafMaterial = fullLeaves.material;
  const fullStems = full.group.getObjectByName('branches');
  fullStems.geometry.dispose();
  fullStems.material.dispose();
  fullLeaves.geometry.dispose();
  const leafMesh = new THREE.Mesh(leafGeometry, leafMaterial);
  leafMesh.name = 'leaves';

  const group = new THREE.Group();
  group.name = 'pedada far';
  group.add(stemMesh, leafMesh);
  const stems = trisOf(stemMesh.geometry);
  const leaves = trisOf(leafGeometry);
  const stats = {
    seed,
    kind: 'pedada',
    lod: 'far',
    leaves: leaves / 2,
    clumps: full.stats.clumps,
    drawCalls: group.children.length,
    triangles: { stems, leaves, total: stems + leaves },
    bounds: boundsOf(group),
  };
  return {
    group,
    stats,
    dispose() {
      stemMesh.geometry.dispose();
      stemMesh.material.dispose();
      leafGeometry.dispose();
      leafMaterial.uniforms.map.value.dispose();
      leafMaterial.dispose();
    },
  };
}

export const plant = {
  id: 'pedada',
  label: 'Pedada (mangrove)',
  create: ({ seed = 1, lod = 'near' } = {}) => (lod === 'far' ? createFar(seed) : createNear(seed)),
  switchAt: 60, // guess; tune
  target: [0, 6, 0],
  distance: 35,
  background: '#1d2a33',
};
