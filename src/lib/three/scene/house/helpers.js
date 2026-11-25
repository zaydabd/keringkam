// Small helpers for the interior scene (scene/index.js).

import * as THREE from 'three';

/** A white copy of a cut-out texture with the same alpha: keeps the holes, drops the paint (clay render). */
export function maskOf(texture) {
  const src = texture.image;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = texture.wrapS;
  t.wrapT = texture.wrapT;
  t.repeat.copy(texture.repeat);
  t.anisotropy = texture.anisotropy;
  return t;
}
