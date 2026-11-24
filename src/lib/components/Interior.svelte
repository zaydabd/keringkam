<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { createInterior, FABRIC_VIEWS } from '../three/scene/interior.js';
  import { THEMES, THEME_NAME, DEFAULT_THEME } from '../three/scene/themes/index.js';
  import { OPTIONS, PRESETS, loadQuality, saveQuality, presetOf, presetSettings, loadShowFps, saveShowFps, loadWalk, saveWalk } from '../three/scene/quality.js';

  let canvas;
  let ready = $state(false);
  let shot = $state('seat');
  let scene;
  const fabricView = $derived(FABRIC_VIEWS.find((v) => v.shot === shot));
  // Graphics settings (quality.js), kept in this browser. Texture detail is made at load, so
  // changing it reloads the page; the rest apply at once.
  let quality = $state(loadQuality());
  let settingsOpen = $state(false);
  let drawn = $state(null);
  // The frame-rate counter beside the Graphics button: a switch in the panel, kept in this browser.
  let showFps = $state(loadShowFps());
  let frameRate = $state(null);
  function toggleFps(on) {
    showFps = on;
    saveShowFps(on);
    if (!on) frameRate = null;
  }
  // Walking with WASD and the arrow keys: the Walk button beside Graphics, kept in this browser.
  let walking = $state(loadWalk());
  function toggleWalk() {
    walking = !walking;
    saveWalk(walking);
    scene?.setWalk(walking);
  }
  const preset = $derived(presetOf(quality));
  function applyQuality(next) {
    const reload = next.textures !== quality.textures;
    quality = next;
    saveQuality(next);
    if (reload) window.location.reload();
    else scene?.setQuality(next);
  }
  // The theme (?theme=, themes/index.js) is picked when the page loads: choosing another reloads
  // the page, since every texture and material is built at load.
  function pickTheme(name) {
    const url = new URL(window.location.href);
    if (name === DEFAULT_THEME) url.searchParams.delete('theme');
    else url.searchParams.set('theme', name);
    window.location.assign(url);
  }

  onMount(() => {
    scene = createInterior(canvas, {
      quality: $state.snapshot(quality),
      onReady: () => (ready = true),
      onShot: (name) => (shot = name),
      onResolution: (r) => (drawn = r),
      onFrameRate: (r) => showFps && (frameRate = r),
    });
    shot = scene.getShot();
    scene.setWalk(walking);
    return () => scene.destroy();
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (settingsOpen = false)} />

<div class="interior">
  <canvas bind:this={canvas}></canvas>

  <header>
    <a class="mark" href="#/">Keringkam</a>
    <div class="tools">
      {#if showFps && frameRate}
        <span class="fps" aria-hidden="true">{frameRate.fps} fps · {frameRate.ms} ms</span>
      {/if}
      <button class="settings-toggle walk" type="button" aria-pressed={walking} title="Move with W A S D or the arrow keys; Shift is faster" onclick={toggleWalk}>
        Walk: {walking ? 'on' : 'off'}
      </button>
      <button class="settings-toggle" type="button" aria-expanded={settingsOpen} aria-controls="graphics" onclick={() => (settingsOpen = !settingsOpen)}>
        Graphics
      </button>
    </div>
  </header>

  {#if settingsOpen}
    <section id="graphics" class="settings" aria-label="Graphics settings" transition:fade={{ duration: 150 }}>
      <label>
        Preset
        <select value={preset} onchange={(e) => applyQuality(presetSettings(e.currentTarget.value))}>
          {#each Object.entries(PRESETS) as [name, p] (name)}
            <option value={name}>{p.label}</option>
          {/each}
          {#if preset === 'custom'}<option value="custom" disabled>Custom</option>{/if}
        </select>
      </label>
      {#each Object.entries(OPTIONS) as [key, o] (key)}
        <label>
          {o.label}
          <select value={quality[key]} onchange={(e) => applyQuality({ ...quality, [key]: e.currentTarget.value })}>
            {#each Object.entries(o.values) as [value, text] (value)}
              <option {value}>{text}</option>
            {/each}
          </select>
        </label>
      {/each}
      <label>
        Show FPS
        <input type="checkbox" checked={showFps} onchange={(e) => toggleFps(e.currentTarget.checked)} />
      </label>
      {#if drawn}
        <p class="note">Drawing {drawn.width} × {drawn.height} for a {drawn.cssWidth} × {drawn.cssHeight} window.</p>
      {/if}
      <p class="note">Resolution: the most pixels drawn; a bigger screen is stretched. Ambient occlusion Auto: half while the view moves, full when it stops. Outlines Light: no lines on the view outside, lighter creases. Anti-aliasing auto: off at 2× and above. Texture detail reloads the page. FPS: frames a second, and the time between frames.</p>
    </section>
  {/if}

  <button class="shot" type="button" onclick={() => scene?.setShot(shot === 'seat' ? 'window' : 'seat')}>
    {shot === 'seat' ? 'Look out of the window' : 'Back to the seat'}
  </button>

  <!-- Every view: the seat, the window and the six fabrics. A native list, so it works with the keyboard. -->
  <label class="shot fabrics">
    Fabrics
    <select value={shot} onchange={(e) => scene?.setShot(e.currentTarget.value)}>
      <option value="seat">Back to the seat</option>
      <option value="window">Look out of the window</option>
      <optgroup label="Fabrics">
        {#each FABRIC_VIEWS as v (v.shot)}
          <option value={v.shot}>{v.label}: {v.fabric}</option>
        {/each}
      </optgroup>
    </select>
  </label>

  {#if fabricView}
    <p class="caption" transition:fade={{ duration: 400 }}>
      <span>{fabricView.label}</span>
      {fabricView.fabric}
    </p>
  {/if}

  <label class="shot theme">
    Theme
    <select value={THEME_NAME} onchange={(e) => pickTheme(e.currentTarget.value)}>
      {#each Object.entries(THEMES) as [name, theme] (name)}
        <option value={name}>{theme.label}</option>
      {/each}
    </select>
  </label>

  <p class="credit">
    A hand-drawn style rendition of a sitting room in a Sarawak Malay house, after a reference photo, with the
    Sarawak River, the Darul Hana Bridge and the State Legislative Assembly building outside. Sizes and positions
    are estimated; it is not a real viewpoint.
  </p>

  {#if !ready}
    <div class="veil" out:fade={{ duration: 1200 }}><span>Keringkam</span></div>
  {/if}
</div>

<style>
  .interior {
    position: fixed;
    inset: 0;
    background: #e9dcc3;
    color: #3a2418;
    font-family: var(--soft);
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 24px 32px;
    /* cream on the dark roof */
    color: #f6ead2;
    text-shadow: 0 1px 6px rgba(40, 22, 12, 0.7);
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  a:focus-visible {
    outline: 1px solid currentColor;
    outline-offset: 4px;
  }
  .mark {
    font-family: var(--serif);
    font-size: 26px;
  }
  .shot {
    position: absolute;
    right: 32px;
    bottom: 64px;
    padding: 10px 18px;
    border: 1px solid rgba(246, 234, 210, 0.7);
    border-radius: 999px;
    background: rgba(58, 36, 24, 0.55);
    color: #f6ead2;
    font: inherit;
    font-size: 13px;
    letter-spacing: 0.04em;
    cursor: pointer;
  }
  .shot:hover {
    background: rgba(58, 36, 24, 0.8);
  }
  .theme {
    bottom: 160px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .fabrics {
    bottom: 112px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .fabrics select {
    max-width: 16em;
  }
  .tools {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .walk[aria-pressed='true'] {
    background: rgba(246, 234, 210, 0.9);
    color: #3a2418;
  }
  .fps {
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(58, 36, 24, 0.55);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-shadow: none;
    white-space: nowrap;
  }
  .settings-toggle {
    padding: 6px 14px;
    border: 1px solid rgba(246, 234, 210, 0.7);
    border-radius: 999px;
    background: rgba(58, 36, 24, 0.55);
    color: inherit;
    font: inherit;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-shadow: none;
    cursor: pointer;
  }
  .settings-toggle:hover,
  .settings-toggle[aria-expanded='true'] {
    background: rgba(58, 36, 24, 0.8);
  }
  .settings-toggle:focus-visible {
    outline: 2px solid #f6ead2;
    outline-offset: 3px;
  }
  .settings {
    position: absolute;
    top: 72px;
    right: 32px;
    width: 280px;
    display: grid;
    gap: 10px;
    padding: 16px 18px;
    border: 1px solid rgba(246, 234, 210, 0.5);
    border-radius: 14px;
    background: rgba(58, 36, 24, 0.88);
    color: #f6ead2;
    font-size: 13px;
  }
  .settings label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .settings select {
    min-width: 7.5em;
    padding: 4px 6px;
    border: 1px solid rgba(246, 234, 210, 0.5);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .settings select:focus-visible {
    outline: 2px solid #f6ead2;
    outline-offset: 2px;
  }
  .settings option {
    color: #3a2418;
  }
  .settings input[type='checkbox'] {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: #f6ead2;
    cursor: pointer;
  }
  .settings input[type='checkbox']:focus-visible {
    outline: 2px solid #f6ead2;
    outline-offset: 2px;
  }
  .settings .note {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    opacity: 0.85;
  }
  .theme select,
  .fabrics select {
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .theme option,
  .fabrics option,
  .fabrics optgroup {
    color: #3a2418; /* the open list is drawn by the browser, on a light background */
  }
  .theme:focus-within,
  .fabrics:focus-within {
    outline: 2px solid #f6ead2;
    outline-offset: 3px;
  }
  .shot:focus-visible {
    outline: 2px solid #f6ead2;
    outline-offset: 3px;
  }
  .caption {
    position: absolute;
    top: 76px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 8px 18px;
    border-radius: 999px;
    background: rgba(58, 36, 24, 0.55);
    color: #f6ead2;
    font-size: 14px;
    text-align: center;
    white-space: nowrap;
  }
  .caption span {
    font-family: var(--serif);
    margin-right: 0.5em;
  }
  .credit {
    position: absolute;
    left: 32px;
    right: 32px;
    bottom: 20px;
    margin: 0;
    font-size: 11px;
    color: #f6ead2;
    text-shadow: 0 1px 4px rgba(40, 22, 12, 0.85);
    opacity: 0.9;
  }
  .veil {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: #e9dcc3;
  }
  .veil span {
    font-family: var(--serif);
    font-size: clamp(36px, 6vw, 72px);
  }
  @media (max-width: 700px) {
    header {
      padding: 18px 20px;
    }
    .settings {
      top: 64px;
      left: 20px;
      right: 20px;
      width: auto;
    }
    .credit {
      left: 20px;
      right: 20px;
    }
    .shot {
      right: 20px;
      bottom: 84px;
    }
    .fabrics {
      bottom: 132px;
    }
    .theme {
      bottom: 180px;
    }
    .caption {
      top: 64px;
      font-size: 12px;
      white-space: normal;
      width: max-content;
      max-width: calc(100% - 40px);
    }
  }
</style>
