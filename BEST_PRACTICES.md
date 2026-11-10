# Best Practices: Vite + Svelte + three.js

Each rule is labelled with where it comes from:

- **[Official]**: from the official docs, linked under the rule.
- **[Team]**: our own convention. It is a sensible choice, not an official standard.

---

## Quick checklist

Before you commit, check that:

- [ ] There are no secrets (API keys, passwords) in the code or in `VITE_` variables.
- [ ] three.js code lives in `src/lib/three/`, not inside components.
- [ ] Every three.js object you created is disposed when its component is removed.
- [ ] Computed values use `$derived`, not `$effect`.
- [ ] `npx sv check` passes.

---

## 1. Vite

### Never put secrets in `VITE_` variables [Official]
- **Do:** Keep API keys on a backend server.
- **Why:** Any variable that starts with `VITE_` is copied into the browser code at build time, so anyone can read it.
- **Source:** https://vite.dev/guide/env-and-mode

### Use the dev server while coding, and `vite build` for release [Official]
- **Do:** Run `npm run dev` while working and `npm run build` to make the release version.
- **Why:** The dev server is fast and updates only the file you changed. The build bundles and optimizes the code for production.
- **Source:** https://vite.dev/guide/why

---

## 2. Svelte (v5)

### Start three.js in `onMount`, and clean it up in the function it returns [Official]
- **Do:** Create the renderer inside `onMount`. Return a function from it that cleans up.
- **Why:** `onMount` runs once the component is on the page, and the function it returns runs when the component is removed.
- **Watch out:** Do not make the `onMount` callback `async`, or the cleanup function will not run.
- **Source:** https://svelte.dev/docs/svelte/lifecycle-hooks

### Use `$derived` for computed values, and `$effect` only when you have to [Official]
- **Do:** Use `$derived` when one value is calculated from another.
- **Don't:** Use `$effect` to set state.
- **Why:** The docs call `$effect` "something of an escape hatch", meant for things like working with the DOM or a canvas directly.
- **Source:** https://svelte.dev/docs/svelte/$effect

---

## 3. three.js

### Dispose of objects you no longer need [Official]
- **Do:** Call `.dispose()` on geometries, materials, textures and render targets when you are done with them.
- **Why:** three.js does **not** free their memory automatically. If you skip this, memory leaks.
- **Source:** https://threejs.org/manual/#en/how-to-dispose-of-objects

### Render only when something changes [Official]
- **Do:** If the scene is not animating, render only after something changes (user input, a model finishing loading).
- **Why:** Rendering every frame wastes power and battery.
- **Source:** https://threejs.org/manual/#en/rendering-on-demand

### Handle resizing [Official]
- **Do:** Size the canvas with CSS. When its size changes, update the renderer size and the camera's aspect ratio.
- **Why:** Otherwise the scene looks stretched or blurry.
- **Source:** https://threejs.org/manual/#en/responsive

### Merge objects when you have many of them [Official]
- **Do:** Merge geometry when you draw lots of objects.
- **Why:** Each mesh is at least one draw call, and fewer draw calls render faster.
- **Source:** https://threejs.org/manual/#en/optimize-lots-of-objects

### Import addons from `three/addons/` [Official]
- **Do:** `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';`
- **Source:** https://threejs.org/manual/#en/installation

---

## 4. Where to keep code

### Folder layout [Team]

```
index.html           where the app starts                     [Official]
public/              files that must keep their exact names    [Official]
src/
  main.js            starts the app
  App.svelte         top-level component
  lib/
    components/      UI components (.svelte)
    three/           three.js code: scene, camera, loaders, meshes
    stores/          shared reactive state (.svelte.js)
    utils/           small helper functions
  assets/            models, textures and images you import
```

### Rules behind the layout [Official]
- **`index.html`** is where the app starts. Source: https://vite.dev/guide/
- **`public/`** is only for files that must keep their exact name or are never imported, such as `robots.txt`. Refer to them as `/file.png`. Put everything else in `src/` and import it, so the build adds a hash to the file name for caching. Source: https://vite.dev/guide/assets
- **`.svelte.js` files** hold reusable reactive logic that uses runes. Source: https://svelte.dev/docs/svelte/svelte-js-files
- **`dist/`** is where `npm run build` puts the release version. Source: https://svelte.dev/docs/svelte/getting-started

---

## 5. How to code [Team]

1. **Keep three.js code out of components.** Put it in `src/lib/three/` as plain JS with two functions, `init(canvas)` and `destroy()`. The component only calls them.
2. **Give each component one job,** and keep it small.
3. **Name files clearly:** `PascalCase.svelte` for components (`SceneView.svelte`) and `camelCase.js` for modules (`createScene.js`).
4. **Run `npx sv check` before committing.** (The command comes from https://svelte.dev/docs/svelte/getting-started)

---

## Example: a Svelte component that uses three.js

```svelte
<script>
  import { onMount } from 'svelte';
  import * as THREE from 'three';

  let canvas;

  onMount(() => {
    // 1. Set up the scene
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // ...create the scene, camera and meshes, then render...

    // 2. Clean up when the component is removed
    return () => {
      // Dispose of geometries, materials and textures here, then:
      renderer.dispose();
    };
  });
</script>

<canvas bind:this={canvas}></canvas>
```
