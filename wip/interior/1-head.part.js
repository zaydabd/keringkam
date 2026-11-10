// The Sarawak Malay house interior (#/interior): a hand-drawn rendition of one room, built from a
// reference photo the user supplied (R1, research/INTERIOR-NOTES.md): the sitting room of a
// Sarawak Malay house, looking at the window wall. Dark red-brown board walls, full-height windows
// with lattice panels at the bottom, pleated floral valances and tied-back sheer curtains, golden
// wood settee, armchairs and tables, woven hangings on the side wall, and a red cloth stretched on
// an embroidery frame in the foreground (plain cloth: no keringkam motif yet).
// It is a rendition, not a copy. Sizes are estimated from the photo (see PLAN).
//
// Structure (after .claude/skills/threejs-procedural-architecture): PLAN holds every size in
// metres and can be serialised; the build* functions turn it into parts; the Builder merges the
// parts into one mesh per material. Debug views: ?debug=nopost (no ink pass) or ?debug=flat
// (no textures), e.g. /?debug=flat#/interior. Both log the triangle count.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { toonGradient, createOutline } from './toon.js';
import { paintPlanks, paintLattice, paintCurtain, paintCloth, paintDecor, paintGlow } from './paint.js';
import { createLandscape } from './landscape.js';

// Colours picked from R1, then lifted a little for the painted look.
export const PALETTE = {
  wall: '#5c2c20', // dark red-brown boards
  frame: '#6a3a24', // window frames, dado rail
  floor: '#8f6348', // brown floor boards
  wood: '#d0904a', // golden furniture
  top: '#3c2418', // dark table tops
  lattice: '#4a2a18',
  cloth: '#d8283a', // red cloth on the frame
  leaf: '#4f7a3a',
  ink: '#2e1a10',
};

// Everything in metres. The camera stands at the origin and looks along -z at the window wall.
export const PLAN = {
  camera: { eye: [0, 0.9, 0], pitch: -6.7, fov: 46.8, aspect: 1.387 }, // from R1's horizon and vanishing point
  room: { x0: -4.2, x1: 1.34, z0: -5.5, z1: 1.2, top: 2.7 },
  backWindows: [
    { x0: -3.02, x1: -1.92 },
    { x0: -1.0, x1: 0.05 },
    { x0: 0.72, x1: 1.2 },
  ],
  window: { y1: 2.25, lattice: 1.1, valance: [2.1, 2.45], tie: 1.2 },
  sideWindow: { z0: -2.45, z1: -1.45, y0: 0.3 }, // on the right wall, near the camera
  dado: 0.85,
  hangings: { z: -3.2, y: 1.52, size: 0.27 },
  plate: { x: 0.38, y: 1.78, r: 0.15 },
  settee: { x: -0.8, z: -5.08, ry: 0, w: 1.45, d: 0.55, back: 1.0 },
  chairs: [
    { x: -1.85, z: -4.0, ry: Math.PI / 2, w: 0.6, d: 0.55, back: 0.98 },
    { x: 0.15, z: -4.0, ry: -Math.PI / 2, w: 0.6, d: 0.55, back: 0.98 },
  ],
  tables: [
    { x0: -1.68, x1: -0.36, z0: -4.5, z1: -4.1, h: 0.46 },
    { x0: -1.9, x1: -0.45, z0: -3.8, z1: -3.0, h: 0.45, stretcher: true },
  ],
  frame: { x: 0.42, z: -1.6, ry: -0.12, w: 0.78, d: 0.72, front: 0.36, back: 0.5 }, // embroidery frame
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = (rx = 0, ry = 0, rz = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
const ONE = V(1, 1, 1);
const M = (x, y, z, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), Q(rx, ry, rz), ONE);

