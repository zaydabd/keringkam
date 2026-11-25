# The scene

`index.js` (`createScene`) sets up the renderer, adds the two items, runs the frame loop and
frees everything on `destroy()`.

- **stage/**: what frames the scene. Lights, camera shots, controls and frame pacing.
- **world/**: the shared layout. `PLAN` (the room), `HOUSE` (its shell), `SITE` and `WINDOW_EYE`
  (the riverside).
- **Items.** Each one returns `{ group, update(t, dt), dispose() }`:
  - **house/** (`createHouse`): the room, furniture, curtains, fabrics, the house's shell, its
    paint, and `garden/` (the garden and the house's plant placement).
  - **riverside/** (`createRiverside`): from where the garden ends to the far bank. That covers
    the waterfront, forecourt, river, boats, bridge, the Assembly building, the banks and the far
    bank's grass and plants, plus its own paint and sky.
- **post/**: the passes on the finished image. AO, ink, watercolour pigment, the exposure meter,
  the finish and anti-aliasing.

Shared by all of them:
- `themes/`: colours and looks
- `layers.js`: render layers
- `toon.js`: toon ramp and outline
- `quality.js`: settings
- `debugMaterials.js`
- `paint/core.js`: the brush tools
- `../vegetation/`: the plants, and `stylised.js`, the plant builder both items use
- `../../utils/`: random, noise and URL options
