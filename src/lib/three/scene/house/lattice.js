// The carved lattice panels at the bottom of the back windows (PLAN.backWindows, window.lattice),
// after the user's photo W1 (paintWindowLattice). Material: lattice (cut out by its texture).

import * as THREE from 'three';
import { PLAN } from '../world/plan.js';
import { M } from './builder.js';

const BOTTOM = 0.09; // the panel starts above the bottom rail (room.js)

/**
 * The painted tile (paintWindowLattice), in metres: one motif wide, the whole panel tall, and the
 * heights of its rails and plaited bands, measured on W1 (research/INTERIOR-NOTES.md).
 */
export const LATTICE_TILE = {
  unit: 0.4, // one motif; each window shows a whole number of them
  height: PLAN.window.lattice - BOTTOM,
  rail: 0.022, // each rail (W1: about 3 px of a 55 px motif)
  band: 0.11, // each plaited band between two rails (W1: about 0.27 of a motif)
};

/**
 * Lattice panels in the lower part of each window: alpha-cut planes (own mesh, see createInterior).
 * Each panel shows a whole number of motifs, so both edges end on the same part of the pattern.
 */
export function buildLattice(b) {
  const { z0 } = PLAN.room;
  const h = LATTICE_TILE.height;
  for (const w of PLAN.backWindows) {
    const ww = w.x1 - w.x0;
    const n = Math.max(1, Math.round(ww / LATTICE_TILE.unit));
    const g = new THREE.PlaneGeometry(ww, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * n); // the tile has a diamond at 0 and ½: one sits mid-panel
    b.place('lattice', g, M((w.x0 + w.x1) / 2, BOTTOM + h / 2, z0 - 0.02), 0.04, false);
  }
}
