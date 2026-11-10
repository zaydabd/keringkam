# Best Practices: Vite + Svelte + three.js

Each point links to the official docs it comes from.

## Vite
- **Keep secrets out of client code.** Only variables starting with `VITE_` reach the browser, and they are bundled into the build at build time. Never put API keys in them; keep secrets on a backend. ([docs](https://vite.dev/guide/env-and-mode))
- **Use the dev server for development and `vite build` for production.** The dev server sends files to the browser as needed and updates only what you changed. The build bundles and optimizes everything. ([docs](https://vite.dev/guide/why))

## Svelte (v5)
- **Set up three.js after the component is in the page.** `onMount` runs once the component is mounted. A function it returns runs on unmount, but only if the callback is not `async`. ([docs](https://svelte.dev/docs/svelte/lifecycle-hooks))
- **Use `$effect` sparingly.** It is "something of an escape hatch", for tasks such as working with the DOM or a canvas directly. Use `$derived` for computed values, not an effect that sets state. Return a teardown function to clean up. ([docs](https://svelte.dev/docs/svelte/$effect))

## three.js
- **Dispose of what you no longer use.** Geometries, materials, textures and render targets are **not** freed automatically. Call `.dispose()` on each, for example in your Svelte unmount cleanup. ([docs](https://threejs.org/manual/#en/how-to-dispose-of-objects))
- **Render only when something changes.** For static scenes, render only when input or loaded data changes the scene, not every frame. This saves power and battery. ([docs](https://threejs.org/manual/#en/rendering-on-demand))
- **Handle resizing.** Size the canvas with CSS. When its size changes, update the renderer size and the camera aspect ratio. ([docs](https://threejs.org/manual/#en/responsive))
- **Reduce draw calls when you have many objects.** Each mesh needs at least one draw call, so merging geometry can speed up scenes with many objects. ([docs](https://threejs.org/manual/#en/optimize-lots-of-objects))

## Where to keep code

The **official** parts below are documented rules. The folder layout is **our team's convention**, not an official standard.

**Official:**
- `index.html` is the entry point, and the app is built into `dist/`. ([Svelte docs](https://svelte.dev/docs/svelte/getting-started))
- Put a file in `public/` only if it must keep its exact name or is never imported (e.g. `robots.txt`). Reference it as `/file.png`. Import everything else from `src/` so the build adds a content hash to its file name for caching. ([Vite docs](https://vite.dev/guide/assets))
- Put reusable reactive logic that uses runes in `.svelte.js` / `.svelte.ts` files. ([docs](https://svelte.dev/docs/svelte/svelte-js-files))
- Import three.js addons from `three/addons/...`, e.g. `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';` ([manual](https://threejs.org/manual/#en/installation))

**Team convention:**
```
public/              files that must keep their exact names (favicon, robots.txt)
src/
  main.js            mounts the app
  App.svelte
  lib/
    components/      UI components (.svelte)
    three/           plain JS for three.js: scene, camera, loaders, meshes
    stores/          shared reactive state (.svelte.js)
    utils/           pure helper functions
  assets/            models, textures, images that you import
```

## How to code (team convention)
- **Keep three.js code out of components.** Put scene code in `src/lib/three/` as plain JS that exposes `init(canvas)` and `destroy()`. The component only calls them in `onMount` and its cleanup.
- **Write one component per job,** and keep each component small.
- **Use `$derived` for computed values** rather than `$effect` (see the Svelte section).
- **Dispose of every three.js object you create** (see the three.js section).
- **Never commit secrets** (see the Vite section).
- **Check code before committing** with `npx sv check`. ([docs](https://svelte.dev/docs/svelte/getting-started))
- **Use clear names:** `PascalCase.svelte` for components and `camelCase.js` for modules.

## Typical Svelte + three.js component

```svelte
<script>
  import { onMount } from 'svelte';
  import * as THREE from 'three';

  let canvas;

  onMount(() => {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // ...create the scene, camera and meshes, then render...

    return () => {
      // Dispose of geometries, materials and textures here, then:
      renderer.dispose();
    };
  });
</script>

<canvas bind:this={canvas}></canvas>
```
