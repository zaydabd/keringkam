// The Sarawak State Legislative Assembly building (Dewan Undangan Negeri), seen across the river.
// Built the way .claude/skills/threejs-procedural-architecture asks: settings -> a serialisable
// plan (tiers and module placements, checked) -> registered module builders -> triangles per
// material slot. Nothing here makes triangles while deciding the building.
//
// Sourced: 114 m tall, a nine-pointed-star plan, an umbrella ("payung negara") roof
// (https://en.wikipedia.org/wiki/New_Sarawak_State_Legislative_Assembly_Building).
// Shapes and sizes are measured on 15 screenshots (24 degrees apart) of the user's photogrammetry
// model "Dewan Undangan Negeri (DUN) Sarawak" by dpmedia on Sketchfab
// (https://sketchfab.com/3d-models/dewan-undangan-negeri-dun-sarawak-80cf19aaf40a4f4895862a80395e6e47),
// shown through a 1 degree lens (nearly orthographic) and scaled by the sourced height: 9.15 px per
// metre. Every size below except the height and the star is such a measurement, i.e. an estimate,
// not survey data. Bottom to top:
//   - an arcade of white "tree" columns whose arms flare out to carry the brim (0-28.4 m);
//   - a thick star-shaped brim (28.4-32.6 m) with a raised edge, its points about 70 m out;
//   - nine gold pyramids on it, one per point of the star, about 24 m square, 41.5 m high;
//   - a deep dark bowl, the roof's underside, from the brim (r 29.5 m) out to the eave (r 47 m),
//     with gold struts crossing over it to carry the eave (pass e15c, photos);
//   - a grey zigzag rim at the eave (52.5-58.5 m) and the gold folded roof, 18 folds, rising
//     concave to a gold neck (89.5-96.8 m), a dark ribbed cone (96.8-109 m) and a needle;
//   - kiosks on a terrace in front and at the sides (placed after the painting, not the model).
// Placement and framing follow the painting (R3); colours follow the photos (Fabio Achilli, Flickr,
// CC BY 2.0; research/CREDITS.md): gold roof, warm cream columns, dark brown glass, salmon floor
// bands, a dark underside (pass e15). The glass and the concrete's weathering are painted
// (paint.js paintAssembly); each quad here maps a whole half of that map (u round, v up).
//
// The parts: assembly/plan.js (settings and plan), assembly/geometry.js (helpers),
// assembly/modules.js (the module builders); this file compiles a plan and checks it.

import { createContract } from './contract.js';
import { MODULES } from './assembly/modules.js';
import { star, roofTipRadius } from './assembly/geometry.js';
export { ASSEMBLY, planAssembly } from './assembly/plan.js';
export { star, roofTipRadius } from './assembly/geometry.js';

/**
 * Compiles a plan into triangles per slot (gold, rib, glass, stone), in the building's own frame
 * (origin at the centre of its base; the front, towards the river, is +z). Returns a report.
 */
export function compileAssembly(plan, writer) {
  const s = plan.settings;
  const C = s.colors;
  const usage = {};
  const before = writer.triangles();
  const missing = [...new Set(plan.placements.map((p) => p.module))].filter((id) => !MODULES[id]);
  if (missing.length) throw new Error(`assembly: no builder for ${missing.join(', ')}`);
  if (plan.diagnostics.duplicateSurfaceOwners.length) throw new Error(`assembly: duplicate owners ${plan.diagnostics.duplicateSurfaceOwners.join(', ')}`);
  const n9 = s.points;
  const shape = {
    podium: star(n9, s.podium.tip, s.podium.valley),
    ring: star(n9, s.arcade.tip, s.arcade.valley),
    infill: star(n9, s.arcade.tip - s.arcade.inset, s.arcade.valley - s.arcade.inset),
    brim: star(n9, s.brim.tip, s.brim.valley),
  };
  const ctx = { s, C, writer, shape };
  for (const p of plan.placements) {
    usage[p.module] = (usage[p.module] ?? 0) + 1;
    MODULES[p.module](ctx, p);
  }

  const after = writer.triangles();
  const triangles = {};
  for (const k of Object.keys(after)) triangles[k] = after[k] - (before[k] ?? 0);
  const R = s.roof;
  const H = s.height;
  const contract = createContract('assembly');
  contract.is('height (sourced: 114 m)', plan.tiers.at(-1).y1, 114);
  contract.is('pyramids = points of the star (sourced: 9)', usage.pyramid, 9);
  contract.is('duplicate surface owners', plan.diagnostics.duplicateSurfaceOwners.length, 0);
  contract.is('roof folds = 2 x points (model: a pyramid under every second tip)', R.folds, 2 * s.points);
  // proportions measured on the Sketchfab model (estimates), each with a few % tolerance
  contract.range('arcade top / height (model 0.249)', s.arcade.top / H, 0.23, 0.27);
  contract.range('brim top / height (model 0.286)', s.brim.top / H, 0.27, 0.3);
  contract.range('pyramid apex / height (model 0.36)', s.pyramid.apex / H, 0.34, 0.38);
  contract.range('rim bottom at a tip / height (model 0.46)', (R.tip[1] - R.fascia) / H, 0.44, 0.48);
  contract.range('gold folds meet the neck / height (model 0.785)', R.top / H, 0.76, 0.81);
  contract.range('dark cone base / height (model 0.85)', s.neck.top / H, 0.83, 0.87);
  contract.range('rim radius / brim point radius (model 0.67)', (R.tip[0] + R.rim) / s.brim.tip, 0.63, 0.71);
  contract.range('brim star: point / valley (model 1.3)', s.brim.tip / s.brim.valley, 1.15, 1.4);
  contract.near('roof outline radius 70 m up (model 18.1 m)', roofTipRadius(R, 70), 18.1, 1.5);
  contract.near('roof outline radius 80 m up (model 9.5 m)', roofTipRadius(R, 80), 9.5, 1.2);
  contract.near('bowl bottom radius (model 29 m)', s.bowl.profile[0][0], 29, 1.5);
  // every pyramid's base stays on the brim, and inside the bowl's foot it would cut the bowl
  let worst = Infinity;
  for (let k = 0; k < s.points; k++) {
    const a = (k / s.points) * Math.PI * 2;
    for (const [cu, cv] of [[-1, 1], [1, 1]]) {
      const x = Math.sin(a) * s.pyramid.radius + (Math.cos(a) * cu + Math.sin(a) * cv) * (s.pyramid.base / 2);
      const z = Math.cos(a) * s.pyramid.radius + (-Math.sin(a) * cu + Math.cos(a) * cv) * (s.pyramid.base / 2);
      worst = Math.min(worst, shape.brim(Math.atan2(x, z)) - 0.7 - Math.hypot(x, z));
    }
  }
  contract.min('pyramid corners inside the brim lip (m)', worst, 0.5);
  contract.min('pyramid inner edge outside the bowl foot (m)', s.pyramid.radius - s.pyramid.base / 2 - s.bowl.profile[0][0], 0);
  // no triangle limit since pass e16b (the user: "get rid of the limit"; it was 14,000); the count is still reported
  return { tiers: plan.tiers, moduleUsage: usage, triangles, contract: contract.assert() };
}
