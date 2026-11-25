// Camera shots (after .claude/skills/threejs-camera-direction): each is an authored frame with its
// own lens, its own limits on how far the pointer may turn the view, and its own exposure
// compensation. `seat` is the design view (R1). `window` stands at the middle window and looks
// out over the lattice, framed by the curtains (R3).

import { PLAN } from '../room/plan.js';
import { fabricIndex } from '../room/fabrics.js';
import { fabrics as FABRIC_PHOTOS } from '../../common.js';

export const SHOTS = {
  seat: { look: [0.06, 0.03], ev: 0 }, // eye, pitch and lens come from PLAN.camera
  window: { eye: [-0.475, 1.5, -4.62], pitch: 4.3, fov: 54, look: [0.36, 0.1], ev: 1.3 }, // +1.3 stops: outdoors is meant to read as full daylight
};
// One shot per fabric (PLAN.fabrics), 'fabric-<name>': standing or sitting where a person would
// look at it, aimed at it (`at`), the cloth filling about half the frame.
const FABRIC_SHOTS = {
  armchair: { eye: [0.0, 1.1, -0.55], at: [0.45, 0.6, -1.62] },
  settee: { eye: [-0.7, 1.45, -3.7], at: [-0.8, 0.8, -4.9], fov: 45 },
  table: { eye: [-0.3, 1.45, -2.1], at: [-0.95, 0.35, -3.4] },
  'left-chair': { eye: [-0.55, 1.1, -3.35], at: [-1.6, 0.6, -4.0] },
  'right-chair': { eye: [-1.25, 1.1, -3.35], at: [-0.1, 0.6, -4.0] },
  window: { eye: [-2.47, 1.3, -4.3], at: [-2.47, 0.85, -5.5] },
};
for (const f of PLAN.fabrics) SHOTS[`fabric-${f.name}`] = { fov: 50, look: [0.12, 0.06], ev: 0, ...FABRIC_SHOTS[f.name], fabric: f.name };

/** The fabric views for the menu: shot name, place, and the photo's real name (from its file name). */
export const FABRIC_VIEWS = PLAN.fabrics.map((f) => {
  const photo = FABRIC_PHOTOS[fabricIndex(f.fabric)];
  const words = photo.group.split('-').join(' ');
  return { shot: `fabric-${f.name}`, label: f.label, fabric: `${words.replace(/^./, (c) => c.toUpperCase())}, no. ${Number(photo.name.split('-').pop())}` };
});

export const SHOT_MOVE_SECONDS = 2.2;
