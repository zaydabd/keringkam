// Small three.js helpers shared across the scene (house/, stage/, scene/index.js).

import * as THREE from 'three';

/** A THREE.Vector3 from x, y, z. */
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Turns a colour grey in place, keeping its luminance (Rec. 709). Returns it. */
export function neutral(color) {
  const y = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return color.setRGB(y, y, y);
}
