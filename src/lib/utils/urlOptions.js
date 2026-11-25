// The one place the app reads its URL options. All are optional: the plain address
// (http://localhost:5173/) shows the full scene.
//
// Scene (query before the #, read by scene/interior.js unless noted):
//   garden  = off                      hide the planting round the house (garden.js)
//   flora   = off                      hide the stylised plants and the far bank's trees (floraLayout.js)
//   theme   = original | detailed | clay (themes/index.js; off = clay)
//   asm     = c | d | cd | none        the Assembly building's look (themes/outside.js; default d)
//   quality = low | medium | high      a graphics preset for this load, not saved (quality.js)
//   view    = seat | window | fabric-<name>     the camera shot to start in
//   fabrics = which fabric set         eye/yaw/pitch/fov = a free camera; look = x,y; cam = near | far
//   debug, off, set, seed, t, perf, dpr, aa, stage, shot, maxpx: inspection (see interior.js's header)
// Plant preview (#/vegetation?…, read by VegetationPreview.svelte):
//   plant, seed, lod, az, el, d, ty, leaves, bare, variant, clean

const NO_WINDOW = typeof window === 'undefined'; // tools under Node import the scene modules

/** The scene's options: the query string before the #. Empty under Node. */
export function sceneOptions() {
  return new URLSearchParams(NO_WINDOW ? '' : window.location.search);
}

/** The plant preview's options: the query string after `#/vegetation?`. */
export function hashOptions() {
  return new URLSearchParams(NO_WINDOW ? '' : (window.location.hash.split('?')[1] ?? ''));
}
