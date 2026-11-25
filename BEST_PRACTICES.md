# Best Practices: Vite + Svelte + three.js

Each rule is labelled with where it comes from:

- **[Official]**: from the official docs, linked under the rule.
- **[Team]**: our own convention. It is a sensible choice, not an official standard.
- **[Reference]**: from a well-known book, style guide or linter, linked under the rule.

---

## Quick checklist

Before you commit, check that:

- [ ] There are no secrets (API keys, passwords) in the code or in `VITE_` variables.
- [ ] three.js code lives in `src/lib/three/`, not inside components.
- [ ] Every three.js object you created is disposed when its component is removed.
- [ ] Computed values use `$derived`, not `$effect`.
- [ ] `npx sv check` passes.
- [ ] No value or helper is copied into a second file: it is imported from the one place that owns it (section 6).
- [ ] A number with a meaning has a name, not a bare literal (section 6).
- [ ] `npm test` passes (tests/guards.test.mjs: seeds, garden layout, furniture, Assembly geometry; update a value there only when the change is meant).

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

## 6. Structure, reuse and isolation

### One place for each piece of knowledge (DRY) [Reference]
- **Do:** Keep each value, rule or helper in one module and import it everywhere it is needed.
- **Don't:** Copy a function or a constant into a second file "to keep it local". The copies drift apart.
- **Why:** "Every piece of knowledge must have a single, unambiguous, authoritative representation within a system" (Hunt and Thomas, *The Pragmatic Programmer*).
- **Source:** https://en.wikipedia.org/wiki/Don%27t_repeat_yourself

### Extract shared code at the third copy [Reference]
- **Do:** Two similar pieces of code may stay apart. When a third appears, or when the copies must always change together, move it into a shared module.
- **Why:** Extracting too early makes a helper with too many options; extracting too late leaves copies to drift.
- **Source:** https://en.wikipedia.org/wiki/Rule_of_three_(computer_programming)

### Name your numbers [Reference]
- **Do:** Give a number with a meaning a named constant (`const FURNITURE_LAYER = 4`), with a comment on where the value comes from (sourced, measured or a design choice).
- **Don't:** Write the same bare literal in several places (`layers.set(1)`, `value / 1.85`).
- **Why:** A "magic number" is a literal whose meaning is unclear to the reader; a name says what it is, and changing it changes it everywhere.
- **Naming:** constants in `CONSTANT_CASE` (Google JavaScript Style Guide, 6.2.5).
- **Sources:** https://en.wikipedia.org/wiki/Magic_number_(programming), https://eslint.org/docs/latest/rules/no-magic-numbers, https://google.github.io/styleguide/jsguide.html#625-constant-names

### Shared values live in one config module [Team]
- **Do:** A value used by more than one file goes in the module that owns it, and the others import it:
  - looks and colours: `src/lib/three/scene/themes/`
  - graphics settings: `src/lib/three/scene/quality.js`
  - URL options: `src/lib/utils/urlOptions.js`
  - the room's sizes: `src/lib/three/scene/interior/plan.js`; the house's: `interior/exterior.js` (`HOUSE`); the site's: `outside/site.js` (`SITE`)
  - render layers and other engine-wide numbers: one constants module, not literals
  - UI colours: CSS custom properties (`--name`), not the same hex in every component
- A value used in one file only stays there, as a named constant near the top.

### One concern per module, with a small interface [Reference]
- **Do:** Split code by concern (lights, controls, post-processing, a plant, a building), each in its own module. A module exports a small interface, for example `createX(options) → { …, dispose() }`, and keeps its internals private.
- **Don't:** Reach into another module's internals, or let one module do several unrelated jobs.
- **Why:** Separation of concerns: each part can be read, changed and tested on its own.
- **Sources:** https://en.wikipedia.org/wiki/Separation_of_concerns, https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules (named exports; "aggregating modules" for a file that re-exports a folder, like `paint.js`)

### Pass options in; don't read globals deep inside [Team]
- **Do:** Read the URL, `window` and settings at the top (`urlOptions.js`, the component), and pass the values into the modules as arguments.
- **Why:** A module that takes its inputs as arguments can run under Node, so `npm test` can check it without a browser.

### Shared helpers go in `src/lib/utils/` [Team]
- **Do:** Put small helpers that any part could use (random numbers, vector maths, noise) in `src/lib/utils/`. Helpers for one area stay next to it (`vegetation/plants/pottedKit.js`).

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
