// The room's lights (interior.js). The room's only openings are the three back windows and the
// side window, so every light stands for one of them or for what bounces round the room
// (themes/interior.js light):
//   sun    through the back windows: hard patches on the boards just inside them
//   sky    through the back windows: soft, low light towards the viewer, so the room is backlit
//   side   sky through the side window: a pool of soft light across the foreground
//   bounce what the boards and walls give back, from all round (no shadow; the AO pass stands in)

import * as THREE from 'three';
import { PLAN } from '../room/plan.js';
import { V } from '../room/builder.js';
import { neutral } from '../room/helpers.js';
import { FURNITURE_LAYER, SIDE_LAYER } from '../layers.js';

// The sky: one direction stands for the three windows. Only the furniture casts its shadow
// (FURNITURE_LAYER): the window wall would otherwise shut it out, as one direction cannot go
// round the wall the way the whole sky does. Its shadows fall towards the viewer.
// The side window: a lamp outside it, shining in. The wall casts its shadow (SIDE_LAYER: walls,
// frames and furniture, not the curtain that hangs in the opening), so the light keeps the
// window's shape, widens across the room and fades with distance.

/**
 * Adds the four lights to `scene`. `L` is the theme's light section, `level` its overall level,
 * `size` the shadow map sizes ({ sun, sky, side }). ?off=sun,sky,side,bounce (`off`) switches
 * lights off; `clay` turns their colours grey. Returns { sun, sky, side, bounce }.
 */
export function createLights(scene, { L, level, size, off, clay }) {
  const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity * level);
  sun.target.position.set(-1, 0, -4);
  sun.position.set(-4, 11, -14);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(size.sun);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  sun.shadow.radius = L.sun.shadowSoftness;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.004; // small: a larger one opens a gap between a leg and its shadow
  const hemi = new THREE.HemisphereLight(L.bounce.sky, L.bounce.ground, L.bounce.intensity * level);

  const sky = new THREE.DirectionalLight(L.sky.color, L.sky.intensity * level);
  sky.target.position.set(-0.7, 0.4, -3.4); // the middle of the furniture
  sky.position.copy(sky.target.position).addScaledVector(V(...L.sky.from).normalize(), 8);
  sky.castShadow = !off.has('skyshadow');
  sky.shadow.mapSize.setScalar(size.sky); // at 2048, about 2.3 mm a texel over the furniture, so thin legs keep their shadow
  Object.assign(sky.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 0.5, far: 16 });
  sky.shadow.camera.layers.set(FURNITURE_LAYER);
  sky.shadow.radius = L.sky.shadowSoftness;
  sky.shadow.bias = -0.0005;
  sky.shadow.normalBias = 0.004;

  const sw = PLAN.sideWindow;
  const side = new THREE.SpotLight(L.side.color, L.side.intensity * level, L.side.reach, 0.62, 0.5, 2);
  side.position.set(PLAN.room.x1 + L.side.outside, 1.7, (sw.z0 + sw.z1) / 2);
  side.target.position.set(PLAN.room.x1 - 2.2, 0.2, (sw.z0 + sw.z1) / 2 - 0.25);
  side.castShadow = true;
  side.shadow.mapSize.setScalar(size.side);
  side.shadow.camera.near = 0.5;
  side.shadow.camera.far = L.side.reach;
  side.shadow.camera.layers.set(SIDE_LAYER);
  side.shadow.radius = L.side.shadowSoftness;
  side.shadow.bias = -0.0008;
  side.shadow.normalBias = 0.004;

  const lights = { sun, sky, side, bounce: hemi };
  scene.add(sun, sun.target, sky, sky.target, side, side.target, hemi);
  // One alone: the others off, to see what each one does.
  for (const [name, light] of Object.entries(lights)) if (off.has(name)) light.intensity = 0;
  if (clay) for (const c of [sun.color, sky.color, side.color, hemi.color, hemi.groundColor]) neutral(c);
  return lights;
}
