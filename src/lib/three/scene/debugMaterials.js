// The debug looks' materials, in one place: the clay render (?theme=clay, themes/clay.js) and the
// flat grey (?debug=flat / ?outside=flat) that shows shapes without their paint.

import * as THREE from 'three';
import { CLAY } from './themes/clay.js';

/** The flat look's grey. */
export const FLAT_GREY = '#bdbdbd';

/** Plain clay, lit as it is (no paint, no shine). `options` are added to the material's own. */
export function clayMaterial(options = {}) {
  return new THREE.MeshStandardMaterial({ color: CLAY.colour, roughness: 1, metalness: 0, ...options });
}
