# Interior scene notes (`#/interior`)

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
