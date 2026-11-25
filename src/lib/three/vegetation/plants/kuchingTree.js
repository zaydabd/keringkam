// The far bank's trees, after the user's photos of Kuching trees (see treeStudies.js for the
// designs and sources): each copy is one of four designs, picked by its seed, so a row of trees
// mixes them. near: createTree (2 draw calls). far: the same limbs and a low-poly blob crown
// (farTree.js createFar, 2 draw calls).
// The seed → design order is a design choice: rain trees most often (they line Malaysian
// roads), then the kapoks and the trumpet tree.

import { createTree } from '../tree.js';
import { createFar } from '../farTree.js';
import { TREE_STUDIES } from './treeStudies.js';

export const DESIGN_BY_SEED = ['rainRoadside', 'kapokOld', 'tabebuia', 'rainRoadside', 'kapokTall'];

export const plant = {
  id: 'kuchingTree',
  label: 'Kuching tree (mixed)',
  // `leaves`: a factor on the near crown's leaf clumps (radius and card size). `variant`: force a design.
  create: ({ seed = 1, lod = 'near', leaves = 1, variant } = {}) => {
    const name = variant && TREE_STUDIES[variant] ? variant : DESIGN_BY_SEED[(seed - 1) % DESIGN_BY_SEED.length];
    const base = TREE_STUDIES[name];
    const F = base.foliage;
    const species = leaves === 1 ? base : { ...base, foliage: { ...F, radius: F.radius * leaves, card: F.card * leaves } };
    const tree = lod === 'far' ? createFar(seed, base) : createTree({ seed, kind: name, species });
    tree.group.name = `${name} (${lod})`;
    tree.stats.kind = name;
    tree.stats.lod = lod;
    return tree;
  },
  switchAt: 60, // guess
  target: [0, 7, 0],
  distance: 40,
  background: '#1d2a33',
};
