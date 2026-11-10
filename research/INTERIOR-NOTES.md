# Interior scene notes (`#/interior`)

Notes for `src/lib/three/scene/interior.js` (+ `toon.js`, `paint.js`, `landscape.js`).

## Reference

- **R1**: the sitting room of a Sarawak Malay house. The user supplied the photo. It is **not in the repo**, because its licence is unknown.
- It probably shows the Malay house at the Sarawak Cultural Village. This is **unconfirmed**. Compare [williamnyk's exterior photo](https://www.flickr.com/photos/92481623@N00/3430062533) (CC BY 2.0).
- Rule from the user: **Sarawak Malay houses only.** H1–H6 (Orang Ulu/Bidayuh, [scv.com.my](https://scv.com.my/about-us/)) and the peninsula houses (H7–H15) are no longer used.
- **R2**: a watercolour-style painting of the same room, supplied by the user. Source and licence unknown, so it is **not in the repo**. Only its *look* is copied (shading, texture, colour). Layout and items stay as in R1, at the user's request.
- Background reading on the house type: [UNIMAS, Analysis of Design Character and Typology of Sarawak Traditional Malay House](https://ir.unimas.my/id/eprint/33200/).

## Visual contract (read from R1)

These are estimates from one photo, not survey data.

- **Camera.** Eye 0.9 m (seated), looking straight at the window wall, 6.7° down.
  - Vertical FOV 46.8°, horizontal 62°, aspect 1.387.
  - Horizon at about 38% from the top.
  - Wider screens keep the vertical view. Narrower screens keep the horizontal view (capped at 80°).
- **Room.**
  - Window wall 5.5 m away. Right wall 1.34 m to the right.
  - Walls are dark red-brown vertical boards.
- **Windows.**
  - Three full-height windows (0–2.25 m) in the back wall.
    - Lattice panel 0–1.1 m.
    - Red-orange floral pleated valance 2.1–2.45 m.
    - Sheer pink curtains tied back at about 1.2 m.
  - One more window in the right wall, near the camera, with a white sheer.
- **Furniture.** Golden wood: a settee with a carved back, two armchairs and two tables with dark tops.
- **Foreground.** A red cloth on an embroidery frame (pemidang). It is plain, with no keringkam motif yet.
- **Light.** Backlit. The windows are blown out to white, the room is dark, and the floor reflects the windows.
- All sizes are in `PLAN` at the top of `interior.js`.

## Structure

The structure follows `.claude/skills/threejs-procedural-architecture`, `threejs-camera-direction` and `threejs-visual-validation`.

- `PLAN` (data) → `build*` functions (parts) → `Builder` (one merged mesh per material).
- Debug views:
  - `/?debug=nopost#/interior`: no ink pass.
  - `/?debug=flat#/interior`: no textures.
  - Both log the triangle and draw-call counts to the console.
- The lattice and the carved chair backs are alpha-cut planes. A `customDepthMaterial` gives their shadows the same holes. They sit on layer 1, so they get no ink outline.
- The room materials have fog off. Only the landscape outside is fogged (1–16 m, cream), which blows the windows out.
- `toon.js` has a new `split` uniform. The interior uses 0.18, so dark wood is not tinted blue.

## Pass log (R1)

Comparison screenshots are 1240×894 (R1's aspect), next to R1.

| Pass | What was off vs R1 | What changed |
|---|---|---|
| m1 blockout + toon | Camera and layout matched already. The windows showed green jungle. The frame was too big and too close. The floor was too orange | First full build |
| m2 | Windows | Room materials have fog off. The fog is cream at 1–16 m, so the outside goes white. The frame is smaller, further away, and turned more (−0.42 rad). The floor is greyer |
| m3 | Too bright and too orange. The cloth was too dark. The white curtain looked flat | Darker walls, a less red toon ramp, a lower hemisphere light, a cloth glow, less emissive on the white sheer, longer floor sheen |
| m4 | Chair backs were plain slats | Carved panels (alpha lattice) in the armchair backs, a carved band on the settee |

## Look (R2, branches `r2-painterly-look` → `r2-final-tweaks`)

Only R2's look is copied: shading, colour, texture. Layout, camera and items stay as in R1.

The skill pack has no watercolour/NPR skill. This section follows the ones that apply: `threejs-skill-router` (acceptance gate), `threejs-procedural-fields`, `threejs-exposure-color-grading`, `threejs-image-pipeline`, `threejs-visual-validation`, and `threejs-lighting` (painted contact shadows).

### Visual contract (R2 look)

- **Subject.** The R1 room, drawn as an ink-and-watercolour illustration.
- **Identity** (the mechanisms that make R2 look like R2):
  1. Polished boards: the floor and table tops mirror the windows as warm, broken streaks along the boards.
  2. Warm brown darks, cream lights, low saturation. Nothing is pure black or pure white.
  3. Thin, dark brown, uneven ink lines. Every plank seam is drawn.
  4. Washes are uneven: pigment pools at the edges of a wash and grains in the paper.
  5. Soft painted shadows under every piece of furniture.
  6. Hand-painted batik cloth; crimson cloth with gold bands across its ends.
  7. Pale daylight with green foliage in the windows.
- **Invariants** (each one can be checked in a capture):
  - The room reads without any post pass (`debug=nopost`): materials, reflections and shadows are in the scene, not in the post.
  - The mirror streaks sit below the windows and move with the camera (`debug=gloss`, `look=-1,0` against `look=1,0`).
  - Ink, pigment and grade can each be switched off alone (`off=`).
  - A different seed changes the washes and cloth patterns, not the room's identity (`seed=1`, `seed=2`).
  - The same image comes back for the same URL (fixed seeds, fixed camera, `look=` fixes the pointer).
- **Measured targets.** Mean lightness, saturation and hue (HLS) of ten regions of R2 against the wide capture; see the sign-off below.
- **Deliberate divergences.** Wide framing (R1) instead of R2's tall one; no ceiling lamps, palm or carved wall panels; the frame, hangings and plate keep their R1 place and shape.
- **Free camera for close-ups.** `eye=x,y,z`, `yaw=deg` (positive turns right), `pitch=deg`, `fov=deg`, added to the design view.
- **Camera envelope.** `cam=near` (1.4 m forward), design, `cam=far` (0.9 m back); wide 1240×894 and phone 437×946.

### Pass graph

Every signal has one producer; every pass has a way to switch it off.

| Pass | Reads | Writes | Space | Size | Off switch |
|---|---|---|---|---|---|
| scene (`RenderPass`) | scene, shadow map 2048² | HDR colour | linear | full, half-float | – |
| edge buffer (`toon.js`) | scene, layer 0 only | normals + part id, depth | – | full, half-float + depth | `off=ink` |
| ink (`toon.js`) | HDR colour, edge buffer | HDR colour | linear | full | `off=ink` |
| pigment (`watercolour.js`) | HDR colour | HDR colour | linear | full | `off=pigment` |
| meter (`meter.js`) | scene, drawn again at 64×36 | one number: average luminance | linear → encoded bytes | 64×36 | fixed at build: `EXPOSURE_EV` |
| finish (`watercolour.js`) | HDR colour, exposure | screen | exposure → Neutral tone map → sRGB → grade | full | `off=grade` (grade only) |

- **Exposure has one owner.** The meter takes a weighted log-average of the scene's linear luminance (the skill's formula). Exposure is `0.18 / average × 2^EV`, clamped to 0.45–1.85. `EXPOSURE_EV` is 0. The room never changes, so it is measured once per framing (first frame and after a resize), with no adaptation over time. The renderer's own `toneMappingExposure` is set to the same value and only matters for `debug=nopost`.
- **Tone mapping happens once,** in the finish pass. The grade works on sRGB-encoded values, after the tone map, inside the same pass.
- The split-tone and paper grain that `toon.js` already had stay in the ink pass; `off=ink` removes them with the lines.

### Fields

| Field | Coordinates | Why these | Drives | Filter | Debug |
|---|---|---|---|---|---|
| pigment density | screen pixels | the paper is the screen | wash, granulation, edge darkening, bleed | none needed (lowest band ~45 px) | `debug=paint-pigment` |
| wet edge | screen pixels | derived from the image itself | edge darkening | – | `debug=paint-edge` |
| bleed | screen pixels | derived from pigment | soft edges | – | `debug=paint-bleed` |
| window mirror | world position + view ray | a reflection belongs to the room | floor and table-top streaks, red tint | fine streaks fade when under a pixel (`fwidth`) | `debug=gloss` |
| wall height shade | world height | light falls from the high windows | wall value | – | – |
| brush streaks, blots | texture space of each board | paint sits on the object | colour of boards and cloth | mipmaps | `debug=flat` removes them |

- **Known compromise.** The pigment field is in screen space, so it stays still while the room sways a little with the pointer. The skill prefers coordinates that follow the object. Screen space is right for paper grain; the large washes are mostly carried by the board textures, which do follow the room.
- Seeds: `seed=n` moves the pigment field and the painted textures. The room's geometry keeps its own fixed seed.

### What was changed for R2 (by group)

- **Floor.** Mirror streaks of the windows (warm, broken along the boards), darker towards the viewer, a red tint beside the frame, contact shadows with a dark core.
- **Wood and walls.** Mid-brown `brushy` wall boards with strong board-to-board variation, darker low down; browner furniture; tan polished table tops; a lower hemisphere ground colour, so undersides go dark and top edges stay light.
- **Cloth.** Batik curtains and valances with large shapes; a faint batik sheer on the side window; crimson cloth with creases and gold bands across its ends.
- **Windows, lattice, vines.** Pale green-white daylight, fog 3–38 m so the foliage shows; cream lattice; small light leaves.
- **Lines and brushwork.** Dark brown ink at line width 1 (was 1.3), uneven pressure; stronger brush streaks in the board textures.
- **Camera near plane** 0.05 → 0.2: at 0.05 the 400 m ground plane drew over the near floor on tall screens.

### Validation

`node research/tools/interior-captures.cjs <outdir> [all|quick|name]` takes 16 fixed views (final, no-post, each stage off, each field, near, far, phone, two seeds, look left and right) and prints the meter and metrics for each. It needs Playwright and the dev server.

### Sign-off record (2026-11-10)

- **Backend.** three 0.187, WebGL2 under SwiftShader (software) in headless Chromium. **No real GPU was available**: frame times below are not device numbers.
- **Views.** 1240×894 and 437×946 at DPR 1; cameras design, near, far; seeds 0, 1, 2; pointer fixed at centre, left and right.
- **Captures inspected.** All 16 once. Then three fixes went in (light level, sub-floor, metrics for the `look` views) and only `final`, `far` and `phone` were captured again.
- **What the captures showed.**
  - No-post reads: boards, reflections, cloth and shadows are all there without ink, pigment or grade.
  - Each of `off=ink`, `off=pigment`, `off=grade` removes only its own stage.
  - Seeds 1 and 2 change the washes and cloth patterns; the room is the same.
  - Look left against look right: the mirror streaks move across the floor with the camera, as a reflection should.
  - Found and fixed: the meter was pinned at its 1.85 limit in every view (lights raised by 1.75, so the design view now meters 1.09); a bright line through a floor-board gap in the far view (dark sub-floor added).
- **Exposure, metered.** Design 1.09 (average luminance 0.165), far 1.37, phone 1.85 (at the limit: the phone view is mostly dark ceiling).
- **Colour against R2** (mean of each region, HLS; R2 → render):

  | Region | Lightness | Saturation | Hue |
  |---|---|---|---|
  | whole image | 0.38 → 0.39 | 0.27 → 0.31 | 23 → 26 |
  | back wall | 0.27 → 0.30 | 0.27 → 0.35 | 20 → 23 |
  | floor, middle | 0.53 → 0.45 | 0.27 → 0.29 | 30 → 27 |
  | floor, foreground | 0.27 → 0.34 | 0.25 → 0.37 | 17 → 21 |
  | furniture wood | 0.33 → 0.36 | 0.39 → 0.37 | 25 → 25 |
  | table top | 0.59 → 0.54 | 0.40 → 0.36 | 29 → 30 |
  | red cloth | 0.46 → 0.47 | 0.60 → 0.48 | 0 → 2 |
  | window | 0.88 → 0.85 | 0.45 → 0.61 | 64 → 48 |
  | valance | 0.47 → 0.49 | 0.31 → 0.33 | 25 → 24 |
  | curtain | 0.45 → 0.50 | 0.23 → 0.17 | 28 → 31 |
  | lattice | 0.45 → 0.38 | 0.25 → 0.33 | 29 → 32 |

  The regions are hand-picked boxes in two different framings, so treat differences under about 0.05 as noise.
- **Budget.** 440,551 triangles and 55 draw calls per frame over all passes (37 calls without post); 26 textures. Render targets: two full-size half-float composer buffers, one full-size half-float edge buffer with depth, a 2048² shadow map, and the meter's 64×36 pair. Script time per frame 1–3 ms. GPU time: **not measured**.
- **Not checked.** Motion (only still frames were compared); a real GPU or a phone; other three.js versions.
- **Known defects.**
  - The pigment field is fixed to the screen (see Fields).
  - Foreground floor lighter and middle floor darker than R2.
  - Wall boards vary less than R2's.
  - The bag on the frame is a plain dark ball (seen in `cam=far`). It is an R1 item with no counterpart in R2.
  - On phones the exposure sits at its limit.

## Open issues
- [ ] R2 look: see "Known defects" in the sign-off record above.

- [ ] The floor sheen is still weaker than in R1, where the reflections dominate the left half of the floor.
- [ ] The wall hangings are a neat diamond grid. In R1 they are a looser cluster, with greenery tucked in.
- [ ] R1's left armchair has a solid curved back. Ours are the same as the right chair.
- [ ] No tested phone view yet. The resize logic keeps the horizontal FOV on narrow screens.
- [ ] Source and licence of R1, for credit.
- [ ] No keringkam on the cloth yet (on purpose).


# Archive: the longhouse veranda (replaced 2026-11-10)

The old scene was built from H1–H6. Those photos show Orang Ulu and Bidayuh houses, not Malay houses, so the scene was replaced. The notes below are kept for the method only.

Running notes for `src/lib/three/scene/interior.js` (+ `toon.js`, `paint.js`, `landscape.js`).
Reference photos H1–H15 are listed with credits in `CREDITS.md` (contact sheet `kampung-house-inside.jpg`).
The style is our own hand-drawn look, inspired by Ghibli backgrounds. No Ghibli assets or images are copied.

## What comes from where

| Detail | Source | Photo |
|---|---|---|
| Open veranda, plank rails, benches along the rails | Sarawak | H1, H2 |
| Steep thatch roof seen from below, round rafters, thin laths, hip and ridge poles | Sarawak | H1, H6 |
| Thick cream posts with red-brown scroll bands | Sarawak | H1, H2 |
| Lowered mat section with a step edge, front-right of the viewer | Sarawak | H1 |
| Woven bamboo mat in the lowered section | Sarawak | H1, H4 |
| Basket lamps (not built yet) | Sarawak | H3 |
| Jungle, coconut palms and bananas outside | Sarawak | H1, H5 |
| Red-brown board wall with window, louvred shutters, door, shelf (x = 5, out of shot) | Peninsula | H7–H13 |
| Kekisi lattice, vent panel, gold curtain (not built yet) | Peninsula | H14, H15 |

The layout is a composite, so it is not a copy of one real house.

## Techniques and references

| Technique | Where | Reference |
|---|---|---|
| Ink outlines from depth, normals and surface ids (post pass) | `toon.js` | [Omar Shehata, webgl-outlines](https://github.com/OmarShehata/webgl-outlines), [article](https://omar-shehata.medium.com/better-outline-rendering-using-surface-ids-with-webgl-e13cdab1fd94), [three.js forum thread](https://discourse.threejs.org/t/how-to-render-full-outlines-as-a-post-process-tutorial/22674) |
| Wobbly hand-drawn lines, paper grain | `toon.js` | [Maxime Heckel, Moebius-style post-processing (2024)](https://blog.maximeheckel.com/posts/moebius-style-post-processing/) |
| Leaf-clump cards on a dark core for foliage | `landscape.js` | [craftzdog/ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader) |
| Merge geometry, dispose everything | `interior.js` | [three.js: optimize lots of objects](https://threejs.org/manual/#en/optimize-lots-of-objects), [how to dispose](https://threejs.org/manual/#en/how-to-dispose-of-objects) |

Textures are painted on canvases in code (`paint.js`). No photo textures.

## Palette (current values)

- Thatch `#c29a66`, timber `#a6845e`, rafter `#cfae7c`, lath `#d2b07a`, rail `#b0a089`, bench `#b39878`.
- Floor `#bba98d`: cooler and greyer than before, to match H1. Bamboo mat `#d9bd84`. Wall `#7a3f34`.
- Sun `#ffe2b8` at 3.4. Hemi light `#d4d6e6` / `#a08670` at 2.4. Fog `#d3dec6`, 24–125 m.
- Shadows are cooled in the post pass (a split-tone to blue-grey of the same value). The post pass then adds paper grain.

## Pass log

| Pass | What was off vs H1 | What changed |
|---|---|---|
| p1 blockout | — | Room, roof, posts, rails, benches, peninsula wall |
| p2 toon + ink | Looked flat | 3-band toon, ink outlines from depth, normals and ids |
| p3 textures + light | Shadows grey or purple; bananas too big and yellow | Painted planks, thatch, mat and posts. Split-tone shadows. Jungle, palms and bananas |
| p4a–h detail | Roof too plain; trees were flat lime blobs; log ends hollow | Laths and round rafters, leaf-clump foliage with dark cores, aged posts, weathered rails, paper grain, capped poles |
| p5 floor | Floor was not like H1 (see below) | See below |

### p5: floor (2026-11-10)

What was different from H1:
1. Layout. In H1 the lowered mat section is in front of the viewer, front-right, and its step edge runs diagonally across the view. Ours ran along the front rail, with a lowered rail and bench.
2. Colour. H1's boards are a cool grey-tan with low contrast. Ours were warm brown.
3. Joints. Our seams between boards had heavy ink lines. In H1 they are faint.

What changed:
- `SUNK` is now a pit inside the room: x −1.75…2.6, z −2.9…0.8, 0.22 m down. The boards are cut around it.
- The pit has step faces on all four sides and a nosing board around the top edge.
- The front rail is one run at floor level. The front benches are broken at the posts, and so is the left bench.
- The floor colour is cooler (`#bba98d`).
- The ink between parts (id edges) is lighter: weight 0.85 → 0.5 in `toon.js`. Silhouette and crease lines stay the same.
- The landscape has its own seed (`mulberry32(21)`), so floor edits no longer reshuffle the trees. I tested seeds 3 and 21. Seed 21 shows more trunks and light gaps.

Still different: H1 is overcast, so its floor has no hard sun stripes. Ours has the rail shadows. I kept them on purpose, for the painted look.

### p6: landscape (2026-11-10)

What was off vs H1: no sky, palms hidden, trunks plain grey. The cause was the layout. Trees stood 12 m from the house and reached above the eave line, so they walled off the view. The palm crowns were higher than the eave, so the roof hid them.

What changed (`landscape.js`, `paint.js`):
- The house now stands on a rise. The ground falls away from 9 m out (0.19 m per metre, 10 m at most).
- The broadleaf tree line starts 24 m out. Between it and the house is a clearing with grass, palms and bananas, as in H1.
- Palms are shorter (3.4–5.8 m, taller further down the slope), so the crowns show under the eave. Fronds are narrower and less yellow.
- Tree trunks taper and lean a little. New painted bark texture (`paintBark`) with moss at the foot. Palm trunks have leaf-scar rings (`paintPalmTrunk`).
- Fog starts further out (24–125 m), so the far trees keep more colour.

Result: sky shows above the far trees at the left, and palms are the main shapes in the mid-ground.

### p7: posts and header (2026-11-10)

What was off vs H1: the post scrollwork was sparse and thin, and looked crimson (the cool shadow tone shifts dark reds toward blue). The header was unreadable over the roof.

What changed:
- `paintPost`: two chains of bold S-scrolls, half a turn apart, with leaf-shaped fillers. Fewer turns and thicker strokes, so they read as scrolls and not as roses.
- The motif colour is terracotta `#a8683a` on warmer cream `#e4d0a2`. Rain drips, rubbing marks and algae at the foot are added.
- The scrollwork is our own. It is not a copy of a specific Orang Ulu motif. H1's carved face on the left post is left out on purpose.
- Header and credit text are cream with a soft shadow (`Interior.svelte`).

## Open issues / to do

- [ ] Sky shows only at the left. H1 also has a sky gap in the centre.
- [ ] Palm fronds look like fern leaves close up. They need separate leaflets.
- [ ] Far trees are still hazy compared with H1.

- [ ] The peninsula wall (H7–H15) is out of shot. Add drag-to-look.
- [ ] Props: basket lamps (H3), H9 items, kekisi lattice and vent panel (H14, H15), gold curtain (H14), a sheer curtain that moves.
- [ ] Atmosphere: light shafts, dust motes.
- [ ] No keringkam in the scene yet (on purpose).

## Performance notes

- Geometry is merged per material. The shadow map renders once (`autoUpdate = false`).
- pixelRatio is capped. The landscape is on layer 1, so the outline pass skips it.
- I have not measured frame rate on a real phone yet. Screenshots are from a headless browser using software rendering (SwiftShader).
