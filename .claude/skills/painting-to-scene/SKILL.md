---
name: painting-to-scene
description: Turn a painting (or photo) into a three.js scene object by object, the way a 3D artist works from a reference, without Blender. Use when building or improving a scene part that must match a supplied painting, when modelling a landmark or prop from standalone reference photos, or when judging whether a render matches its reference.
license: MIT
---

# Painting to scene

A method, not a library. The phases and the gate come from the `blender-image-to-3d` skill
(github.com/majidmanzarpour/blender-game-skills @ f0ef2938, MIT), moved from Blender to three.js
code. The project's own lessons are in `research/PHOTO-TO-THREEJS.md`; read it first.

## Two kinds of reference

- **The painting** (scene reference): decides layout, camera, framing, palette, the look and how
  much detail each object gets. Never measure real proportions from it: painters cheat scale.
- **Standalone photos** (object references): one subject each, from Wikimedia Commons or another
  source with a clear licence. They decide the object's proportions, parts and silhouette.
  Credit each in `research/CREDITS.md`. Do not commit copyrighted images.

When they disagree: the photo wins for shape, the painting wins for colour, detail level and
placement. Write down which was used where.

## Phase 0: read and write the brief

Before code, write one brief per object in the scene notes:

```text
OBJECT      name, file
REFS        painting crop (where in the frame, % of frame height) + photo links
SCALE       real sizes with a source link; anything estimated is marked "estimated"
PROPORTIONS 4 to 8 ratios measured from the photos (tower lean, height to width, roof tiers)
SILHOUETTE  the 3 to 5 features that make it read at its size in the frame
PARTS       in build order, which ones merge into one draw call
LOOK        palette from the painting (light and shadow), edge softness, detail level
INFERRED    every side or size no reference shows, and the guess used
```

## Phase 1: calibrate

Match the camera to the painting (eye height, direction, lens) and lock it as a named shot.
Work out sight lines with numbers (what each window shows) before placing anything.

## Phase 2: blockout, silhouette gate

Primary masses only, real sizes, in place. Render the shot flat or as a silhouette next to the
painting crop. Do not add detail until the big shapes sit where the painting has them.

## Phase 3: forms and detail

Add the parts from the brief. Detail level follows the object's size in the frame: a feature
under 2 px in the final shot is not modelled.

## Phase 4: look

Materials and painted textures after the painting's palette, then check every colour in the final
render, after fog and the post pass, in light and in shade.

## Phase 5: compose, post-process, optimize

Framing, haze, grade and bloom are judged on the whole frame against the whole painting. Then
measure: triangles, draw calls, texture memory, frame time. Keep the scene's stated budget.

## The gate (end of every phase)

1. Capture the fixed shot at a fixed size (Playwright), next to the painting crop at the same height.
2. Write mismatches as measurements, not adjectives: "tower 15% too short in frame",
   "roof gold too green", "boat 30 px left". Fix the biggest first: layout, then big colour
   areas, then light, then detail.
3. Repeat until nothing obvious is left, then record the remaining divergences and why.
4. Keep the capture next to the notes so the next pass can see where it started.
