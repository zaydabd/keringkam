// The Assembly building's settings and its plan: tiers and module placements, checked
// (assembly.js). Nothing here makes triangles.

import { OUTSIDE_THEME } from '../../themes/index.js';

export const ASSEMBLY = {
  height: 114, // sourced
  points: 9, // sourced: nine-pointed star; its points carry the pyramids
  // The plan is a nine-pointed star (sourced), points at 0, 40, 80 ... degrees, point 0 facing
  // the river. Radii are estimates from the model's silhouettes.
  podium: { tip: 60, valley: 51, height: 2 },
  arcade: { tip: 58, valley: 49, inset: 2.5, top: 28.4, columns: 45, spring: 0.5, reach: 2, floors: 3 }, // 5 columns per point
  brim: { tip: 70, valley: 53, inner: 27, top: 32.6, lip: 0.8 }, // slab from arcade.top to top, a lip on its edge
  pyramid: { radius: 42.5, base: 24, apex: 41.5 }, // square, edges along and across the radius
  // the bowl under the roof: its outline at the fold tips, (radius, height), bottom to top
  bowl: { profile: [[29.5, 32.6], [29.5, 34.5], [33.6, 37.8], [37.9, 41.2], [42.3, 45.6], [46, 50]], valleyRatio: [0.95, 0.87] },
  // gold struts over the dark bowl, carrying the eave (pass e15c, after the photos: two crossing
  // struts per roof fold, an X lattice, and a rib up each fold's tip). ESTIMATES from the photos:
  // width and depth (m), how far they stand out from the bowl (m), straight pieces per strut.
  struts: { perFold: 2, width: 0.9, depth: 0.6, out: 0.7, segments: 6, posts: true },
  // Worn, sculpted edges (pass e16b, after Abhishek Maity's hand-painted environment, 80.lv: edges
  // sculpted with Clay Buildup and Flatten, then baked). ESTIMATES: members at least `minWidth`
  // wide (all of them since the triangle limit went) get their front corners cut by `chamfer` of their half width, varied by up to `wear`
  // either way at each joint (seeded by its position, so joined pieces agree); the brim's two
  // outer edges and the roof rim's top edge are cut by `slab` metres.
  edges: { minWidth: 0, chamfer: 0.35, wear: 0.45, slab: 0.6 },
  roof: {
    folds: 18,
    tip: [42.5, 56], // where a fold's tip meets the rim: radius, height
    valley: [36.5, 58.5], // where a fold's valley meets it (the tips hang down and out)
    top: 89.5, // where the folds meet the neck
    neck: 6.3, // radius there
    rim: 4.5, // how far the grey rim reaches out past the gold
    fascia: 3.5, // its height
    rings: 16,
  },
  neck: { top: 96.8, r1: 5.0, bands: [[89.5, 0.4], [96.3, 0.4]] }, // gold, ribbed; light bands
  cone: { top: 109, r0: 4.4, r1: 0.7, ribs: 16 }, // dark, ribbed
  needle: { r: 0.5 },
  kiosk: { folds: 8, rValley: 3.4, rTip: 4.4, eave: 3.4, top: 6.2, spire: 7.4, legs: 2.6 },
  kioskRow: { half: 3.4, eave: 3.4, rise: 2.6, fork: 1.6 }, // the front five: about 7 m square
  kiosks: { row: [-22, -11, 0, 11, 22], rowZ: 82, sides: [-72, 72], sideZ: 42, sideScale: 1.7 },
  terrace: { z: 82, halfX: 30, halfZ: 7, height: 0.8 },
  colors: OUTSIDE_THEME.assembly, // linear vertex colours (themes/outside.js)
};

/** Tiers (bottom to top) and module placements. Pure data: no geometry. */
export function planAssembly(settings = ASSEMBLY) {
  const s = settings;
  const R = s.roof;
  const tiers = [
    { name: 'podium', y0: 0, y1: s.podium.height },
    { name: 'arcade', y0: s.podium.height, y1: s.arcade.top },
    { name: 'brim', y0: s.arcade.top, y1: s.brim.top + s.brim.lip },
    { name: 'bowl', y0: s.brim.top, y1: R.tip[1] - R.fascia },
    { name: 'roof', y0: R.tip[1] - R.fascia, y1: R.top },
    { name: 'neck', y0: R.top, y1: s.neck.top },
    { name: 'cone', y0: s.neck.top, y1: s.cone.top },
    { name: 'needle', y0: s.cone.top, y1: s.height },
  ];
  const placements = [];
  const add = (module, tier, extra = {}) => placements.push({ module, tier, ...extra });
  for (let i = 0; i < s.arcade.columns; i++) add('tree-column', 'arcade', { index: i });
  for (let i = 0; i < s.points; i++) add('pyramid', 'brim', { index: i });
  s.kiosks.row.forEach((x, i) => add('kiosk', 'podium', { index: i, x, z: s.kiosks.rowZ, scale: 1 }));
  s.kiosks.sides.forEach((x, i) => add('kiosk', 'podium', { index: s.kiosks.row.length + i, x, z: s.kiosks.sideZ, scale: s.kiosks.sideScale }));
  for (const [module, tier] of [['podium', 'podium'], ['terrace', 'podium'], ['infill', 'arcade'], ['brim', 'brim'], ['bowl', 'bowl'], ['payung', 'roof'], ['neck', 'neck'], ['cone', 'cone'], ['needle', 'needle']]) add(module, tier);
  // Each surface region has one owner.
  const seen = new Set();
  const duplicates = [];
  for (const p of placements) {
    const key = [p.module, p.tier, p.index ?? ''].join(':');
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }
  return { settings: s, tiers, placements, diagnostics: { duplicateSurfaceOwners: duplicates } };
}
