// The fabrics in the room (interior.js, after room/fabrics.js): settled in Workers while the
// rest loads, then placed with their 512 px photos. A fabric's 2048 px photo loads when its view
// is chosen (showFull), then every other one after it unless only previews are wanted.

import * as THREE from 'three';
import { toonGradient } from '../toon.js';
import { PLAN } from './plan.js';
import { drapeAll, fabricGeometry, partColour, fabricIndex } from './fabrics.js';
import { FURNITURE_LAYER, SIDE_LAYER } from '../layers.js';
import { createTextureStore, fabrics as FABRIC_PHOTOS } from '../../common.js';
import { clayMaterial, FLAT_GREY } from '../debugMaterials.js';

/**
 * Starts settling the fabrics and adds their group to `scene`. `onPlaced(stats)` is called once
 * they are in the room (or with null if that failed); `onFull()` once every full photo is shown.
 * Returns { group, pending, showFull(name), dispose() }.
 */
export function loadFabrics({ renderer, scene, camera, theme, clay, flat, stage, previewsOnly, onPlaced, onFull }) {
  const group = new THREE.Group();
  group.visible = !stage;
  scene.add(group);
  const store = clay ? null : createTextureStore(renderer);
  const meshes = new Map();
  // The room's light ramp, in grey: its bands are tinted (warm lights, rosy darks), which turned a
  // lilac photo yellow-green. The cloth keeps the photo's own hues.
  let gradient = null;
  let pending = true;
  let destroyed = false;
  const at = performance.now();

  drapeAll()
    .then(async (results) => {
      if (destroyed) return;
      const settledMs = performance.now() - at;
      const maps = clay ? [] : await Promise.all(PLAN.fabrics.map((f) => store.get(fabricIndex(f.fabric), 'preview')));
      if (destroyed) return;
      const staged = new THREE.Group();
      gradient = toonGradient(theme.shading.bands.map((b) => Array(3).fill((b[0] + b[1] + b[2]) / 3)), { smooth: theme.shading.smooth });
      PLAN.fabrics.forEach((f, k) => {
        const g = fabricGeometry(results[k], FABRIC_PHOTOS[fabricIndex(f.fabric)].crop, f);
        partColour(g, k);
        const material = clay
          ? clayMaterial({ fog: false, side: THREE.DoubleSide })
          : new THREE.MeshToonMaterial({
              map: flat ? null : maps[k], color: flat ? new THREE.Color(FLAT_GREY) : new THREE.Color(...theme.fabric.balance), gradientMap: gradient, fog: false, side: THREE.DoubleSide,
              transparent: true, opacity: 1, depthWrite: true, // opaque, as in the photos: at 0.95 the chair showed through the black scarf (5% of a lit chair is half the cloth's own value)
              // The photo's own colours (no part tint; the ink still reads the part id from the
              // colour attribute). Alpha 0 in the scene buffer marks the cloth, so the ink, the
              // pigment and the grade leave it close to its photo (theme.fabric).
              blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
              blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor,
            });
        const mesh = new THREE.Mesh(g, material);
        mesh.name = `fabric-${f.name}`;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.layers.enable(FURNITURE_LAYER); // casts the sky's and the side window's shadows, like the furniture
        mesh.layers.enable(SIDE_LAYER);
        staged.add(mesh);
        meshes.set(f.name, mesh);
      });
      // Their shaders are compiled off the frame (in parallel where the driver can) before they
      // join the room: compiled inside a frame, they held the first exposure reading back.
      const compileAt = performance.now();
      await renderer.compileAsync(staged, camera, scene).catch(() => {});
      if (destroyed) return;
      const compileMs = performance.now() - compileAt;
      group.add(...staged.children);
      renderer.shadowMap.needsUpdate = true; // the shadows are drawn once: again, with the fabrics
      pending = false;
      onPlaced({ settledMs: Math.round(settledMs), compileMs: Math.round(compileMs), readyMs: Math.round(performance.now() - at), steps: results.map((r) => r.steps), simMs: results.map((r) => Math.round(r.ms)) });
      // Then every fabric's full photo, one after another, so the room views show them sharp too
      // (the 512 px previews blur at a laptop's 2x).
      if (!previewsOnly)
        (async () => {
          for (const name of meshes.keys()) if (!destroyed) await showFull(name);
          onFull?.();
        })();
    })
    .catch((e) => {
      console.error('fabrics', e);
      pending = false;
      onPlaced(null);
    });

  /** Swaps a fabric's 512 px photo for its full one (once loaded); resolves when it is shown. */
  function showFull(name) {
    const mesh = meshes.get(name);
    if (!store || !mesh || flat) return Promise.resolve();
    const place = PLAN.fabrics.find((f) => f.name === name);
    return store.get(fabricIndex(place.fabric), 'full').then((t) => {
      if (!t || destroyed) return;
      mesh.material.map = t;
      mesh.material.needsUpdate = true;
    });
  }

  return {
    group,
    showFull,
    get pending() {
      return pending;
    },
    dispose() {
      destroyed = true;
      for (const m of meshes.values()) m.material.dispose();
      gradient?.dispose();
      store?.dispose();
    },
  };
}
