# From a photo to a three.js scene

How to get a three.js render that looks like a reference photo. Every rule here comes from the interior
scene (`#/interior`), which we built from photo H1 in 7 passes. The pass log is in `INTERIOR-NOTES.md`.
These are lessons from one scene, not measured results from many.

## Why pass 1 and pass 7 look so different

Pass 1 was a blockout: plain boxes in the right places, with no shading, lines, textures or landscape.
Each later pass added one layer. But the biggest jumps did not come from adding detail. They came from
fixing things that were in the wrong place:

| Pass | Problem | Cause | Type |
|---|---|---|---|
| p5 | Floor did not match H1 | The lowered mat section was against the rail. In H1 it is in front of the viewer | Layout |
| p6 | No sky, palms hidden | Trees stood 12 m away and rose above the eave line. Palm crowns were higher than the eave | Layout |
| p7 | Post motifs looked crimson | The cool shadow tone in the post pass shifted dark reds toward blue | Colour |
| p4 | Trees were flat lime blobs | One flat colour per blob, no leaf shapes on the edge | Detail |

Three of the four were found late, because we added detail before the layout matched the photo.
That is the main lesson: **match the layout first, then add detail.**

## The method

### 1. Read the photo before you write code

Write these down from the photo:

- **Camera.** Eye height, view direction, and how wide the view is. (Ours: eye 1.5 m, FOV 55.)
- **Bands.** What fills the frame from top to bottom, in rough percent. H1 is about: roof 45%, view out 20%, rail 15%, floor 20%.
- **Layers outside.** Near, middle, far. H1: banana leaves, then palms, then a tree line, then sky.
- **Light.** Sunny or overcast, and where the light comes from. H1 is overcast.
- **Palette.** 6 to 8 colours picked from the photo, for the largest surfaces.
- **Wear.** Stains, chips, moss, uneven boards. Clean surfaces look fake.

### 2. Check the sight lines with numbers

Before you place things outside, work out what the camera can see.

Example from p6: the eye is at 1.5 m and the eave edge is 0.52 m higher, 6.5 m away.
So the eave line rises 0.08 m for each metre of distance. A tree 13 m away is hidden above 2.5 m.
A palm crown at 5 m height, 15 m away, is behind the roof. This sum takes one minute.
We skipped it and lost a full pass.

### 3. Block out with real sizes, and match the camera

Use metres. Use boxes only. Put the camera where the photographer stood.
Do not continue until the big shapes sit in the same places as in the photo.

### 4. Compare side by side after every change

- Take a screenshot at a fixed size and place it next to the photo at the same height.
- Name the three biggest differences. Fix the biggest one first.
- Order of importance: layout, then big colour areas, then light, then detail.
- Zoom in on a crop when you judge detail. A small side-by-side hides problems.

We used Playwright for the screenshot and a short Python script (Pillow) to join the two pictures.

### 5. One layer per pass, in this order

1. Blockout (layout and camera)
2. Shading (toon bands)
3. Lines (ink outlines)
4. Textures
5. Light and shadow colour
6. The view outside
7. Wear and stains
8. Props and atmosphere

Do not start a layer while the layer before it is still wrong.

### 6. Compose the background. Do not scatter it

Random scatter gave us a wall of trees. What worked:

- Set distances for each layer (clearing to 24 m, tree line after that).
- Shape the ground (our house stands on a rise), so the far layer shows over the near one.
- Give the landscape its own random seed. Before that, a change to the floor reshuffled the trees.

### 7. Judge colours in the final render, not in the code

- The post pass changes colours. Our terracotta turned crimson in shadow.
- Check each colour in light and in shadow, after all effects.
- Fog washes out far objects. Check the far layer against the photo.

### 8. Make detail from many small parts and painted textures

- Density reads as detail: laths, rafters, rail planks of uneven width and height.
- Use round logs where the photo has round logs, and cap the ends.
- Paint textures in code, sized in metres. Shift the UVs per part, so boards do not repeat.
- For foliage, put leaf-shaped cards on a dark core. A plain blob looks flat.
- Make the ink lines between boards lighter than the lines around objects.

### 9. Keep it fast while you add detail

Follow `BEST_PRACTICES.md`: merge geometry per material, dispose everything, cap pixelRatio,
render the shadow map once. Check on a real phone. Our screenshots come from a software renderer,
so they tell us nothing about frame rate.

### 10. Stay legal and respectful

- Use photos with a clear licence, and credit them (`CREDITS.md`). Do not commit copyrighted pictures.
- Draw your own motifs. Do not copy a specific cultural motif or another studio's assets.

## Checklist for the next scene

- [ ] Camera, bands, layers, light and palette are written down from the photo.
- [ ] Sight lines are checked with numbers.
- [ ] The blockout matches the photo's big shapes.
- [ ] Every pass has a side-by-side picture and a list of what is off.
- [ ] Layout problems are fixed before detail is added.
- [ ] Colours are checked in light and shadow, after the post pass.
- [ ] The background has its own seed and fixed layer distances.
- [ ] Notes are kept per pass (problem, cause, fix).
- [ ] Tested on a real phone.

## References

- Outlines from depth, normals and surface ids: [Omar Shehata, webgl-outlines](https://github.com/OmarShehata/webgl-outlines), [article](https://omar-shehata.medium.com/better-outline-rendering-using-surface-ids-with-webgl-e13cdab1fd94)
- Hand-drawn post-processing: [Maxime Heckel, Moebius-style post-processing](https://blog.maximeheckel.com/posts/moebius-style-post-processing/)
- Leaf-card foliage: [craftzdog/ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader)
- Performance: [three.js manual: optimize lots of objects](https://threejs.org/manual/#en/optimize-lots-of-objects), [how to dispose of objects](https://threejs.org/manual/#en/how-to-dispose-of-objects)
