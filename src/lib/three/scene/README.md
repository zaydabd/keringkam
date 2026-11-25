# The scene

Three layers, in the order a frame is made:

1. **The scene** (`interior.js`): wires the parts together, runs the frame loop and frees
   everything on `destroy()`. `stage/` holds what frames the scene: lights, camera shots,
   controls and frame pacing.
2. **The items in the scene**:
   - `room/`: the room, its furniture, curtains and fabrics
   - `outside/`: the river view
   - `garden/`: the garden and the plants' layout, built from `../vegetation/`
   - `paint/` (via `paint.js`): the painted textures these items use
3. **Post** (`post/`): the passes on the finished image: AO, ink, watercolour pigment, exposure
   meter, finish and anti-aliasing.

All three layers use the shared modules:
- `themes/` for colours and looks
- `layers.js` for render layers
- `toon.js` for the toon ramp and outline
- `quality.js` for settings
- `debugMaterials.js` for the debug materials
- `../../utils/` for random, noise and URL options
