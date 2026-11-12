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

## Outside the windows (branch `window-view`)

`src/lib/three/scene/outside/` draws what is outside the windows of `#/interior`. The old jungle backdrop (`landscape.js`) is still used by the veranda scene.

### Reference and facts

- **R3**: a painting supplied by the user, a view from a window over the Sarawak River at Kuching. Source and licence unknown, so it is **not in the repo**. It gives the view and its look; the room keeps its own windows (R1).
- **What R3 shows**: a wide muddy river with two roofed boats; the Darul Hana Bridge on the left; trees and a small skyline in the middle; the State Legislative Assembly building with its gold roof on a green lawn on the right; blue sky with cumulus. (R3 also has a cat on a wall and a cloth on the sill; the user did not want the cat, and the sill and casement belong to another window.)
- **Darul Hana Bridge**: an S-shaped, cable-stayed footbridge over the Sarawak River, opened in November 2017. Its total length is 276 m according to [Wikipedia](https://en.wikipedia.org/wiki/Darul_Hana_Bridge) and about 335 m according to its [consulting engineers](https://ktas.com.my/?p=531); its towers are given as 48 m or 50 m. The model is 277.9 m long with 48 m towers.
- **Assembly building** (Dewan Undangan Negeri Sarawak): 114 m tall, on a nine-pointed-star plan, with an umbrella ("payung negara") roof, on the river bank in Petra Jaya ([Wikipedia](https://en.wikipedia.org/wiki/New_Sarawak_State_Legislative_Assembly_Building)). The model keeps the height and the nine points; every other size is estimated from R3.
- **Not a real viewpoint.** The Assembly building is on the north bank, so R3's viewpoint looks like the south bank. Whether a Malay house stands there was not checked. Every position in `SITE` is a design choice, made so that the bridge towers fall in the left and middle windows and the Assembly building in the right one when seen from the seat.
- The first version of this branch (a river kampung after the Commons photos of Kampung Bako) was replaced at the user's request.

### Visual contract (R3 view)

- **Identity:** the leaning bridge towers with their fans of cables; the gold umbrella roof over a ring of tall pointed ribs; a tan river; fresh green banks; blue sky with white clouds. Clear and colourful, but still paint: no ink lines outside, soft edges, the same paper and grade as the room.
- **Invariants** (each has a capture or a check):
  - The building and the bridge read as untextured grey and as a pure outline (`outside-flat`, `outside-silhouette`).
  - The bridge is supported: tower feet below the water, deck ends on both banks, every cable ending on the deck edge (contract in `bridge.js`; it throws if not).
  - The building's plan has no surface claimed twice, and all its modules have builders (contract in `assembly.js`).
  - From the seat, each window shows its landmark; from the window shot, the whole view shows.
  - The outside costs under 95,000 triangles and 10 draw calls (checked at build; it throws if not). It was 40,000 at first, 60,000 after pass w2, and 95,000 since pass w7 (the detailed near bank).
- **Deliberate divergences from R3:** the room's tall lattice windows instead of a casement; no cat, no cloth on the sill; distances are real-sized, so the far bank is smaller in the frame than R3 paints it.

### Parts, and the skill each follows

| Part | File | Skill | How |
|---|---|---|---|
| Assembly building | `assembly.js` | `threejs-procedural-architecture` | Settings → a plan (5 tiers, 85 module placements, checked for double ownership) → module builders in the frame of their face → triangles per slot (gold, rib, glass, stone). 5,208 triangles. |
| Bridge | `bridge.js` | `threejs-procedural-geometry` | One sweep for the deck along an S-curve, two for the rails; each tower a tapered loft on a pier; 28 cables from the same curve as the deck. Nine measured checks. 2,616 triangles. |
| River | `water.js` | `threejs-water-optics` | The "normal-only wave bundle" tier: a flat plane, four wave bands, Fresnel mix of water colour and an analytic mirror of the sky, each band switched off below a pixel. |
| Trees | `trees.js` | `threejs-procedural-vegetation` | A species table for three branch levels, growth from a queue, children in stratified slots with shuffled directions, leaves along every twig with rounded normals. Two tiers: near (832 triangles) and far (448). |
| Haze and sky | `index.js`, `paintSoftSky` | `threejs-atmosphere-aerial-perspective` | Small-scene tier: distance fog. The fog, the sky's horizon and the river's mirror of the sky share one colour and one brightness. |
| Camera | `SHOTS` in `interior.js` | `threejs-camera-direction` | Two authored shots, each with a lens, pointer limits and exposure compensation. A move is one eased interpolation of position, direction and lens (2.2 s), with nothing smoothed on top. |
| Banks, boats, skyline | `index.js` | – | Banks are profiles swept along the river; boats are lofted hulls with a canopy; the skyline is plain boxes far behind the trees. |

Stated limits, as the skills require:

- **Water.** The surface is flat (no crest parallax). It is opaque, as silt-laden water is. It mirrors the sky's gradient only: not the clouds, the bridge or the far bank; the pale patches that suggest cloud reflections are painted in its texture. The Fresnel curve is scaled to 0.32, by eye, to keep the water tan.
- **Clouds.** The pack's cloud skill is for volumetric weather clouds. These are painted on the sky dome, as R3's are.
- **Trees.** Three branch levels instead of the skill's four, single leaf cards instead of crossed pairs, a low-poly crown volume behind the cards, and no wind.
- **Outdoor key.** The room is exposed for shade, so sunlit paint outside would burn out. Outdoor colours are keyed down (`OUTSIDE_KEY = 0.3` for surfaces, `SKY_KEY = 0.3` for the sky, fog and water mirror). This is a painter's choice, not physics. The outdoor colours are also authored more saturated than they should look, because the room's grade removes about a third of the colour.
- **Building shell.** The star prism behind the ribs is a plain dark surface standing in for glass; the ribs are boxes set proud of it, not openings cut in a wall.


### Pass w1: composition after R3 (2026-11-11, branch `opus-medium-new-skills`)

Method: `.claude/skills/painting-to-scene` (layout first, then forms, then look). Captures were compared with R3 from the window shot (`view=window&look=0,0`) and from the seat.

| Object | Before | Change | Why (R3) |
|---|---|---|---|
| Assembly building | 32° right of the window shot, behind the curtain | Moved to bearing +11°, 300 m (`SITE.assembly` 57, −300) | R3 has it in the right third of the view |
| Assembly roof | Near-straight cone | Concave tent: radius falls evenly, height rises as f^1.7; radius 40, eave kick 6 m | R3's roof is steep under the spire and flat and upturned at the eave |
| Bridge | Towers 110 m apart; only one in the window | Towers at bearings −18° and −9°, 30 m apart, near the far bank; north landing behind the trees, left of the Assembly; ~286 m along the deck (contract 270–340 holds) | R3 paints both towers together left of centre, and the deck does not cross the building |
| Boats | Flat board canopy on four posts | Arched roof over open sides, shaded cabin, posts per bay, darker red-brown hull | R3's tambang have a long, low, curved roof |
| Skyline | White boxes far left | Between the towers and the building (x −70 to 75, z −470); grey to grey-blue; a few taller | R3 |
| River | Pale cream (`body #ecd2a2`) | Tan (`body #cf9a5c`, film `#f4d8a2`) | R3's river reads tan-brown after the grade |

### Pass w2: forms from photos, clouds (2026-11-11)

Reference photos from Flickr (Commons and Openverse refused downloads from the build machine); credits in `CREDITS.md`.

| Object | Photo shows | Change |
|---|---|---|
| Bridge towers | Each tower is an A-frame: two legs spread along the deck, meeting at the top; the two towers lean away from each other | Two tapered legs per tower (half-spread 5.5 m, estimated) on one footing. The lean was already right; R3's "two masts" are one A-frame |
| Bridge rings | A round walkway at each tower with an arched shade roof | Ring of radius 10 m and width 3 m (estimated) beside each tower, rail inside, shade over the half away from the deck |
| Bridge deck | A triangulated truss under the deck | Lower chord and diagonals, one bay per 7 m; clearance raised to 10 m so the truss clears the water |
| Assembly roof | Deep scallops: the points reach out past the valleys at the eave | Tips 14% further out at the eave, valleys 24% in |
| Boats | White fenders hung along the hull | Seven per side |
| Clouds (R3) | Wide cumulus banks with flat grey bases | `paintSoftSky` vivid mode: 8 banks of many small lobes over a shaded base, plus 10 small clouds low on the horizon. The non-vivid sky (veranda) is unchanged |

Checks: the outside's contracts (bridge, assembly, river, budget under 60,000 triangles and 10 meshes) all pass; the window frame draws 185,979 triangles in 37 calls (was 180,795). `svelte-check` has no errors. Frame time was not measured: the captures come from a software renderer.

Open:
- The window shot's clouds are magnified from a 2048 px sky texture, so they stay soft; a 4096 px sky would cost 32 MB more.
- Tower and ring sizes other than height are estimates; no drawing of the bridge was found.

### Pass w3: the Assembly building rebuilt from two photos (2026-11-11)

Two photos supplied by the user: P1 a front view from the river, P2 a raised view (source and licence unknown, so not in the repo). They were measured in pixels and scaled by the sourced 114 m height; every size except the height is an estimate. The first attempt misread P1 (a smooth cone roof, a second white ring); it was redone against both photos with fixed comparison cameras (P1: eye 300 m in front at 3 m, 33° lens; P2: raised, 380 m off, to the left).

| Part | Photos | Model |
|---|---|---|
| Arcade | white "tree" columns that split halfway up; each arm reaches the brim two bays away, so neighbouring arms cross (interlaced pointed arches, the point about two thirds up); the arms flare out to carry the brim; dark red-brown infill with floor bands | 45 columns (5 per point) on a shallow star (63 m at the points, 53 m between), split at 50% of the height; quarter-ellipse arms reach two bays and flare out to 1.5 m inside the brim's edge, far out under each point; a thin mullion per bay up to the crossing; infill 2.5 m inside the columns, 3 floors; 0-26 m |
| Brim | one thin white slab well past the columns. From the river its near edge looks higher than its sides, which can read as a second ring. A scale model (TVS) shows its plan: a deep nine-pointed star | star with points 76 m out and valleys 56 m, 1.3 m thick |
| Pyramids | nine big gold pyramids, one on each point of the brim, the white tip running out beyond it; one front and centre | 24 m square, 10.5 m tall, centred 47 m out; the contract checks every corner stays on the brim |
| Strut cone | an inverted cone of crossing white struts round a dark core | 36 + 36 struts from r 27 m (27 m up) to r 35 m (49 m up) |
| Roof | a folded plate: 18 folds running from the eave all the way up to the spire, tips hanging down and out at the eave inside a grey zigzag fascia, concave | valleys r 37 m at 51 m, tips r 45 m and 3.5 m lower, valley profile r = 31.5 (1-f)^2 + 5.5 (checked against P1 at 61 m and 73 m); fold depth 22% of the radius at the eave, 12% at the top; 2.2 m fascia; gold to 82 m |
| Spire | a ribbed bronze cone with two rings, then a needle | 82-100 m, then to 114 m |
| Kiosks | five in front: square, slightly concave pyramid roofs on a white post that branches into four arms; two larger at the sides: small copies of the main roof on legs | front: 6.8 m square, two-pitch pyramid, Y support; sides: 8 folds, 4 legs, a small spire |

- The gold is authored deep (0.92, 0.63, 0.08) and plain (the corrugated-zinc texture made it read as thatch); alternate facets are a shade darker so the ink pass draws the folds.
- The tree clump on the far bank moved 12 m left so it stands between the bridge and the building (R3) instead of in front of the arcade.
- Placed at bearing +8°, 380 m from the window shot, so the star-shaped brim fits inside the window opening.
- 8,958 triangles (contract limit 14,000). The contract checks the height, nine pyramids, and five ratios measured on the photos.
- The two photos disagree on the upper heights by up to 10 m (P1 from low down, P2 from above); the model sits between them.

### Camera shots

| Shot | Eye | Lens (vertical) | Pointer may turn it | Exposure |
|---|---|---|---|---|
| `seat` | 0, 0.9, 0 (R1) | 46.8° on wide screens | ±3.4° / ±1.7° | metered |
| `window` | −0.475, 1.5, −4.62 | 54° (68° on tall screens) | ±20.6° / ±5.7° | metered + 1.3 stops |

- The button in `Interior.svelte` moves between them; `view=window` starts at the window.
- Exposure is metered from the destination frame when the move starts and then eases towards it (faster towards bright than towards dark), so the light changes during the move.
- From the seat, the open part of each window only shows what is above eye level: tower tops, cables, tree crowns, the skyline, the building's ribs. The river and boats show through the lattice.

### Debug views

`debug=flat`, `debug=silhouette` (outside as outline), `debug=water-normal`, `water-fresnel`, `water-filter`, `off=outside`, `seed=n` (trees, skyline, clouds, painted textures).

OUTSIDE_SIGNOFF

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

### Pass w4: the Assembly building back where R3 has it (2026-11-11)

The user said the curtain may cover the buildings, so the Assembly building no longer moves to stay
inside the opening. Measured on R3 (opening mapped onto the window shot, 54° lens): spire about
31° right of the view, top about 440 px above the horizon in a 1240 × 894 frame, which puts the
centre about 220 m ahead and 254 m away. `SITE.assembly` is now (127, −225), near the first
placement (150, −245). In the window shot the right curtain covers the roof; the arcade shows at the
right edge. The 'behind' tree row moved left, out of the building's brim. All numbers are read off the
painting, not surveyed.

### Pass w5: the Assembly building rebuilt from the user's Sketchfab model (2026-11-11)

Reference: 15 screenshots of "Dewan Undangan Negeri (DUN) Sarawak" by dpmedia
(https://sketchfab.com/3d-models/dewan-undangan-negeri-dun-sarawak-80cf19aaf40a4f4895862a80395e6e47),
the user's own photogrammetry model, taken in the plain embed viewer, 24 degrees apart, 1 degree
lens, about 7.9 degrees above level. Scaled by the sourced 114 m height (9.15 px per metre).
Screenshots are kept out of the repo. All sizes except the height and the nine-point star are
read off the screenshots: estimates, not survey data.

Gate: the building alone, orthographic, same angle and scale, overlaid on the screenshot at the
spire tip (views 0, 96 and 336 degrees; 336 is nearest the window's angle).

| Part | Before | Model (measured) | Now |
| --- | --- | --- | --- |
| Arcade top | 26 m | ~28.4 m | 28.4 m |
| Brim | 1.3 m thin, points 76 m | ~4 m thick (28.4-32.6), points ~70 m | 28.4-32.6 + 0.8 m lip, points 70 m |
| Pyramids | r 47, apex 37.8 m | r ~42.5, ~24-27 m, apex ~41-42 m | r 42.5, 24 m, apex 41.5 m |
| Under the roof | strut lattice + glass drum | deep dark bowl, r 29 at 34.5 m to r ~47 at the eave | dark bowl after the measured outline |
| Eave | 51 m, thin fascia | rim ~52.5-56 m at the tips, ~3.5 m, tips ~45-47 m out | rim 52.5-56 (tips), 4 m higher at valleys |
| Gold roof | to 82 m | to ~89.5 m, outline r = 6.3 + 36.2 ((89.5 - y) / 33.5)^2 | as measured, 18 folds |
| Spire | gold/dark cone to 100 m | gold neck to ~96.8 m, dark ribbed cone to ~109 m, needle | as measured |
| Star points | arches only | the column under each point flares out to it | flared support added |

Remaining differences, kept on purpose: colours follow the painting (cream columns, deep gold,
red-brown glass), not the model's grey; kiosks follow the painting's placement; the arcade's
arches stay as in the user's photos. In the window view the right curtain covers most of the
building, as agreed with the user. 9,226 triangles (limit 14,000).

### Pass w6: river taxis (penambang) rebuilt like the Assembly building (2026-11-12)

`src/lib/three/scene/outside/boats.js` replaces the old `buildBoat` in `index.js`. Same pattern as
`assembly.js`: settings (`PENAMBANG`) -> plan (`planBoat`, parts in build order) -> part builders
(hull, deck, cabin, porch, roof, hatch, boatman) -> `compileBoat` with a checks contract.

Sourced: covered sampans carrying about 10-12 passengers
([Borneo Post, 2024-05-29](https://www.theborneopost.com/2024/05/29/iconic-sarawak-perahu-tambang-boats-embrace-modern-tech/),
[Malay Mail, 2025-08-31](https://www.malaymail.com/news/malaysia/2025/08/31/kuchings-iconic-river-boat-goes-green-with-electric-powered-penambang-fleet-under-smart-city-plan/189520)).
No published dimensions were found. Every size is read off photos B1-B4 (`CREDITS.md`), scaled by the
boatman's head: estimates, not measured data. Length 6.2 m, beam 1.5 m, roof 0.92 m above the
water over the middle, 1.8 m at the bow.

Contract (each boat, values from the B3 broadside photo unless noted):

| Check | Photo | Model |
| --- | --- | --- |
| beam / length | ~0.25 (B1, B2) | 0.242 |
| roof over the middle / length | 0.15 | 0.148 |
| roof at the bow / roof over the middle | 2.0 (traced) | 2.0 |
| roof length / boat length | 0.98 | 0.977 |
| cabin length / boat length | 0.67 | 0.666 |
| boatman's head / roof over the middle | 1.95 | 2.01 |
| ridge rise / roof half-width | 0.47 (B3), ~0.75 (B1) | 0.53 |
| roof clearance over the gunwale | >= 0.3 m | 0.59 m |
| triangles | <= 1600 | 836 |
| colour values that are not finite numbers | 0 | 0 |

Gate (`gate-boat.html`, not committed): the boat alone on water, perspective camera, aligned to the
photo on the bow and stern tips, then the roof and hull edges traced column by column.
- Pass 1, B3 (broadside, camera about 6 degrees above level, estimated): roof, sheer and waterline
  within about 5-10 px along the whole length.
- Pass 2, B1 (three-quarter): compared by eye only. B1's boat has a taller gable (rise about 0.65
  against 0.45) and a closed bow. Boats differ from each other, so the model keeps B3's shape.
- Which roof slopes carry the hatch is a guess (noted in the code).

Colour schemes, read off the photos: `red` (B1), `orange` (B3), `green` (B2). The window view uses
`red` for the near boat and `orange` for the far one (`SITE.boats`).

Fix: the first build drew black blobs in the window view because some colours were hex strings
(NaN on the GPU). All colours now go through `rgb()`, and the contract counts non-finite colours.

### Pass w7: the near bank in detail (2026-11-12, branch `fix-near-bank`)

`src/lib/three/scene/outside/nearbank.js` replaces the old `buildNearBank` in `banks.js`, which now
builds the far bank only. Reference: R3's foreground (mud flat, bush mass on the left, grass, fern).
**Every size, density and colour here is a design choice read off R3 by eye, not measured data.**

- Ground: one swept grid along `SITE.nearLine`, 17 bands per section (under, lip, berm, track,
  shoulder, level). The zone edges wander with value noise, and each edge sits on a grid column, so
  the boundaries are ragged without slivers. Ruts on the track, fbm bumps (<= 0.15 m), smoothed normals.
- Textures: `paintMud` and `paintTurf` (`paint.js`), 512 px tileable, mapped by world x/z. The mud has
  mottling, wet hollows, streaks, clods and pebbles; the turf has patches and blade strokes.
  Detail goes into textures, not vertex colours, because the ink pass reads every colour change as a
  part edge (`toon.js`) and would draw a seam around each speck.
- Plants and props: lumpy shrubs with leaf cards (the left bush mass), curved-blade grass clumps,
  weeds on the mud, two ferns (`SITE.near.ferns`), clods, stones, driftwood, puddles. Only placed
  inside the window's view cone; simpler versions past 25 m. Blades face the eye (double-sided material).
- Contract (throws if not met): no fold, faces up, no slivers; waterline at the water level; 17 bands;
  shoulder 15-42 degrees; zone edges in order; level grass 1-2 m above the water; relief <= 0.15 m;
  every plant and stone above the water; >= 12 shrubs, >= 300 clumps; triangle ranges below.

| Measure (seed 0) | Value |
| --- | --- |
| ground triangles | 7,632 |
| plant triangles | 21,537 |
| near bank total | 31,837 |
| outside total / meshes | 85,300 / 7 |
| window frame | 285,411 triangles, 43 calls |

Seeds 0, 1 and 2 pass every check. Frame time was not measured (software renderer).
Remaining divergences from R3: the bush mass is smaller and sits further left; R3's mud is a
warmer, darker brown in its shadowed parts; the seat view does not show the near bank.
