<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { createInterior, FABRIC_VIEWS } from '../three/scene/interior.js';
  import { THEMES, THEME_NAME, DEFAULT_THEME } from '../three/scene/themes/index.js';

  let canvas;
  let ready = $state(false);
  let shot = $state('seat');
  let scene;
  const fabricView = $derived(FABRIC_VIEWS.find((v) => v.shot === shot));
  // The theme (?theme=, themes/index.js) is picked when the page loads: choosing another reloads
  // the page, since every texture and material is built at load.
  function pickTheme(name) {
    const url = new URL(window.location.href);
    if (name === DEFAULT_THEME) url.searchParams.delete('theme');
    else url.searchParams.set('theme', name);
    window.location.assign(url);
  }

  onMount(() => {
    scene = createInterior(canvas, { onReady: () => (ready = true), onShot: (name) => (shot = name) });
    shot = scene.getShot();
    return () => scene.destroy();
  });
</script>

<div class="interior">
  <canvas bind:this={canvas}></canvas>

  <header>
    <a class="mark" href="#/">Keringkam</a>
  </header>

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
