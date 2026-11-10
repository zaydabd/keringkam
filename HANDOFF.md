# Handoff: Sarawak Malay house interior (`#/interior`)

Status: **work in progress, on branch `wip/sarawak-malay-interior`.** Main is untouched and still shows the old longhouse veranda.

## What the user asked

- Only **Sarawak Malay houses** as references ("rumah melayu sarawak nowhere else").
- The old references H1–H6 are Orang Ulu/Bidayuh houses at the Sarawak Cultural Village, so they are **not Malay** and are dropped.
  Source: [scv.com.my](https://scv.com.my/about-us/), [malaysia.travel](https://malaysia.travel/explore/sarawak-cultural-village).
- Build the three.js interior from **the user's own photo** (R1: a Sarawak Malay sitting room), using the three.js skills in `.claude/skills` (router, procedural-architecture, camera-direction, visual-validation).
- Short answers. No invented facts. Give links.

## R1 photo

- R1 is **not in the repo**, because the repo is public and the licence is unknown. Ask the user to upload it again, and ask for its source/licence for `CREDITS.md`.
- R1 probably shows the Malay house at the Sarawak Cultural Village. This is **unconfirmed**. The guess is based on [williamnyk's exterior photo](https://www.flickr.com/photos/92481623@N00/3430062533) (CC BY 2.0).

## Done (on this branch)

1. `src/lib/three/scene/paint.js`:
   - Removed `paintThatch`, `paintMat` and `paintPost` (longhouse only).
   - Added `paintLattice`, `paintCurtain(seed, 'valance'|'sheer')`, `paintCloth`, `paintDecor` (a 4×2 atlas) and `paintGlow('round'|'sheen')`.
2. `src/lib/three/scene/toon.js`: added a `split` uniform (default 0.7) that controls the blue shadow tone. The interior should set it to about 0.15–0.2, so the dark wood stays warm.
3. Parts of the new `interior.js` are in `wip/interior/`. Concatenate them in order:
   - `1-head.part.js`: header comment, imports, `PALETTE`, `PLAN` (all sizes in metres, measured from R1), and the matrix helpers `V`/`Q`/`M`.
   - `2-builder.part.js`: `mulberry32`, `Builder` (now with `place(key, geom, matrix, tint, jitterUV)`) and `boxWithGrainUVs`.
   - `3-build.part.js`:
     - `buildRoom` (board walls with window openings, floor, ceiling, frames, dado)
     - `buildLattice`, `valance`, `curtain`, `buildCurtains`
     - `turnedLeg`, `buildSeat`, `buildTable`
     - `buildEmbroideryFrame` (pemidang, plain red cloth, no keringkam motif)
     - `buildHangings`, `buildVines`, `buildGlows`

**`src/lib/three/scene/interior.js` is still the OLD file.** It imports the removed paint functions, so **this branch does not build** until step 1 below is done.

## Next steps

1. Write `4-create.part.js`: `export function createInterior(canvas, { onReady })`. Copy the old file's renderer setup, composer, resize, timer and destroy. Then change:
   - **Camera:** eye `PLAN.camera.eye`, pitch −6.7°, vertical FOV 46.8.
     - If aspect < 1.387, widen the vertical FOV to keep a 62° horizontal view (cap 80).
     - Pointer look: yaw ±0.06, pitch ±0.03.
   - **Materials:** MeshToonMaterial with a warm gradient, e.g. `[[0.42,0.34,0.3],[0.85,0.78,0.7],[1,0.96,0.88]]`. Keys:
     - `floor`, `wall`, `frame`, `ceiling`, `wood` (planks texture)
     - `top`, `lattice`, `valance`, `sheer`, `white`, `cloth`, `decor`, `plate`, `leaf`, `tape`, `bag`
     - Curtain, leaf and lattice materials: `side: DoubleSide`.
     - Valance, sheer and white curtains: a little emissive, so they glow when backlit.
   - **Lattice mesh:** `alphaTest: 0.5`. Set `customDepthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map, alphaTest: 0.5 })`, so the lattice casts patterned shadows. Put it on layer 1 (no ink). Texture repeat about 1.6.
   - **Lights:**
     - Sun behind the back wall, about 47° up: position offset (−3, 11, −10) from target (−1, 0, −4). Add `sun.target` to the scene. Shadow box ±7.
     - Warm hemisphere light, about 1.2.
     - A soft front fill without shadows, about 0.5.
   - **Outside:**
     - Use `createLandscape(...)` as before, but hide the sky dome (the BackSide mesh).
     - Background and fog `#f8f2e2`, fog distance 8–40 m, so the windows look blown out as in R1.
   - **Debug:**
     - `?debug=nopost` renders without the composer.
     - `?debug=flat` removes the maps.
     - Both log `renderer.info.render.triangles`.
   - Set `outline.material.uniforms.split.value = 0.18`.
2. Concatenate the parts into `src/lib/three/scene/interior.js`. Run `npm run build`.
3. Update the credit text in `src/lib/components/Interior.svelte`: "after a photo of a Sarawak Malay house".
4. Render the comparison:
   ```
   npx vite --port 5173 --strictPort &
   node wip/interior/in.cjs <outdir> m1
   python3 wip/interior/side.py <outdir> m1 <R1.png>
   ```
   Compare at aspect 1.387 (e.g. 1240×894). Fix layout first, then colour, then detail.
5. Update the notes (one pass per log entry):
   - `research/INTERIOR-NOTES.md`: H1–H6 dropped as not Malay; R1 is the new reference; pass log.
   - `research/CREDITS.md`
   - `research/PHOTO-TO-THREEJS.md`
6. Delete `wip/` and `HANDOFF.md`, merge to main, and push. Main deploys to GitHub Pages.

## Measured from R1 (estimates, not surveyed)

- **Camera:** horizon at about 38% from the top; the right wall's vanishing point is near the centre.
- **Back wall:** about 5.5 m from the camera.
- **Windows:** full height, 0–2.25 m.
  - Lattice 0–1.1 m.
  - Valance 2.1–2.45 m.
  - Curtains tied back at about 1.2 m.
- **Furniture:** golden wood, about `#c98b45`. Tables have dark tops.
- **Embroidery frame:** red cloth about 0.75 × 0.75 m, 1.3–2.1 m in front of the camera.
