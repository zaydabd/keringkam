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
export function createStage(canvas, { fov = 45, background = 0x111111, transparent = false, onResize } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  if (!transparent) scene.background = new THREE.Color(background);
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

export const easeOutBack = (p) => {
  const c = 1.70158;
  const x = Math.min(1, Math.max(0, p)) - 1;
  return 1 + (c + 1) * x ** 3 + c * x ** 2;
};
export const easeInOutCubic = (p) => {
  const x = Math.min(1, Math.max(0, p));
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};

/**
 * Real facts about a piece, taken only from the file names and image files:
 * collection title, plate number, position in the set, source size and detected detail areas.
 */
export function pieceInfo(i) {
  const f = fabrics[i];
  const words = f.group.split('-');
  const title = words.join(' ').replace(/^./, (c) => c.toUpperCase());
  const number = f.name.split('-').pop();
  return {
    title,
    number,
    plate: `SPECIMEN_${number}`,
    index: String(i + 1).padStart(2, '0'),
    total: String(fabrics.length).padStart(2, '0'),
    width: f.width,
    height: f.height,
    size: `${f.width} × ${f.height} px`,
    details: f.details,
  };
}

/** Plain-language position of a texture coordinate, e.g. "Upper left". */
export function positionName(u, v) {
  const row = v > 0.66 ? 'Upper' : v < 0.33 ? 'Lower' : 'Middle';
  const col = u < 0.33 ? 'left' : u > 0.66 ? 'right' : 'centre';
  return row === 'Middle' && col === 'centre' ? 'Centre' : `${row} ${col}`;
}

/** Screen position (CSS pixels) of a world-space point. */
export function toScreen(stage, point) {
  const p = point.clone().project(stage.camera);
  return { x: (p.x + 1) / 2 * stage.width, y: (1 - p.y) / 2 * stage.height };
}

/** Width and height of the visible area at distance d from a perspective camera. */
export function viewSize(camera, d) {
  const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return { w: h * camera.aspect, h };
}

/** Tiny tween runner: add({ duration, delay, ease, update(p), done }) and call tick(now) each frame. */
export function createTweens() {
  let list = [];
  return {
    add({ duration = 500, delay = 0, ease = (p) => p, update, done }) {
      const t = { start: performance.now() + delay, duration, ease, update, done };
      list.push(t);
      return t;
    },
    clear() {
      list = [];
    },
    tick(now = performance.now()) {
      list = list.filter((t) => {
        if (now < t.start) return true;
        const p = Math.min(1, (now - t.start) / t.duration);
        t.update?.(t.ease(p));
        if (p < 1) return true;
        t.done?.();
        return false;
      });
    },
  };
}
