// Shared pieces for every showcase style: renderer setup and a texture store.

import * as THREE from 'three';
import { fabrics, createKTX2Loader } from './textures.js';

export { fabrics };

export const wrap = (i, n = fabrics.length) => ((i % n) + n) % n;

/** Shortest distance between two indexes on a loop of n items. */
export const loopDistance = (a, b, n = fabrics.length) => Math.min(wrap(a - b, n), wrap(b - a, n));

/** Width and height of a fabric scaled to fit inside a 1×1 square. */
export function fitSize(i) {
  const { width, height } = fabrics[i];
  const aspect = width / height;
  return aspect >= 1 ? { w: 1, h: 1 / aspect } : { w: aspect, h: 1 };
}

/** Camera distance at which a w×h rectangle fills the view, with some margin. */
export function fitDistance(camera, w, h, margin = 1.2) {
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return margin * Math.max(h / 2 / tan, w / 2 / (tan * camera.aspect));
}

export const easeOutCubic = (p) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;

/**
 * Renderer, scene and perspective camera bound to a canvas that is sized with CSS.
 * Call start(tick) to run tick(seconds) every frame before rendering.
 */
export function createStage(canvas, { fov = 45, background = 0x111111, onResize } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 100);

  const stage = {
    renderer,
    scene,
    camera,
    width: 1,
    height: 1,
    /** Called after the scene is rendered each frame (for overlays). */
    afterRender: null,
    start(tick) {
      renderer.setAnimationLoop((ms) => {
        tick(ms / 1000);
        renderer.render(scene, camera);
        stage.afterRender?.();
      });
    },
    dispose() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      scene.traverse((object) => {
        object.geometry?.dispose();
        for (const m of [].concat(object.material ?? [])) m.dispose();
      });
      renderer.dispose();
    },
  };

  const resize = (notify = true) => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    stage.width = w;
    stage.height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (notify) onResize?.(w, h);
  };
  // onResize first runs from the observer's initial callback, after the style has set up.
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas);
  resize(false);

  return stage;
}

/**
 * Loads and caches fabric textures. Each fabric has a 512px 'preview' and a 2048px 'full'.
 * Textures are shared between meshes; free the ones you no longer need with keep().
 */
export function createTextureStore(renderer) {
  const loader = createKTX2Loader(renderer);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const cache = new Map();
  let disposed = false;

  function get(i, kind) {
    const key = `${i}:${kind}`;
    let entry = cache.get(key);
    if (!entry) {
      entry = {};
      const fabric = fabrics[i];
      entry.promise = loader
        .loadAsync(kind === 'full' ? fabric.fullUrl : fabric.previewUrl)
        .then((texture) => {
          if (disposed || cache.get(key) !== entry) {
            texture.dispose();
            return null;
          }
          texture.anisotropy = anisotropy;
          entry.texture = texture;
          return texture;
        })
        .catch((err) => {
          console.error(fabric.name, err);
          return null;
        });
      cache.set(key, entry);
    }
    return entry.promise;
  }

  return {
    get,

    /** Already-loaded texture, best quality first, or null. */
    peek(i) {
      return cache.get(`${i}:full`)?.texture ?? cache.get(`${i}:preview`)?.texture ?? null;
    },

    /** Calls onTexture with the preview, then again with the full texture. */
    progressive(i, onTexture) {
      let gotFull = false;
      const full = cache.get(`${i}:full`)?.texture;
      if (full) return onTexture(full);
      get(i, 'preview').then((t) => t && !gotFull && onTexture(t));
      get(i, 'full').then((t) => {
        if (!t) return;
        gotFull = true;
        onTexture(t);
      });
    },

    /** Disposes every cached texture for which keepFn(index, kind) is false. */
    keep(keepFn) {
      for (const [key, entry] of cache) {
        const [i, kind] = key.split(':');
        if (keepFn(Number(i), kind)) continue;
        entry.texture?.dispose();
        cache.delete(key);
      }
    },

    dispose() {
      disposed = true;
      for (const entry of cache.values()) entry.texture?.dispose();
      cache.clear();
      loader.dispose();
    },
  };
}

/** Sets a material's map and makes it visible. */
export function setMap(material, texture) {
  if (!texture || material.map === texture) return;
  material.map = texture;
  material.color?.set(0xffffff);
  material.needsUpdate = true;
}
