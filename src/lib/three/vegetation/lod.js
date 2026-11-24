// Two-level detail for one plant: `near` is the full build, `far` the cheap one.
// Each argument is a plant build {group, stats, dispose}; the result has the same shape.
// switchAt is the camera distance in metres where far takes over.

import * as THREE from 'three';

export function makeLOD(near, far, switchAt) {
  const lod = new THREE.LOD();
  lod.addLevel(near.group, 0);
  lod.addLevel(far.group, switchAt);
  return {
    group: lod,
    stats: { ...near.stats, near: near.stats, far: far.stats, switchAt },
    dispose() {
      near.dispose();
      far.dispose();
    },
  };
}
