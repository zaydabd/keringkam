<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { createInterior } from '../three/scene/interior.js';

  let canvas;
  let ready = $state(false);
  let shot = $state('seat');
  let scene;
  // ?theme=off: the scene as a clay render, without its look (interior.js). Read once: the button
  // reloads the page, since every texture and material is built at load.
  const themeOff = new URLSearchParams(window.location.search).get('theme') === 'off';

  function toggleTheme() {
    const url = new URL(window.location.href);
    if (themeOff) url.searchParams.delete('theme');
    else url.searchParams.set('theme', 'off');
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
    <nav><a href="#/">Gallery</a><a href="#/veranda">Veranda</a></nav>
  </header>

  <button class="shot" type="button" onclick={() => scene?.setShot(shot === 'seat' ? 'window' : 'seat')}>
    {shot === 'seat' ? 'Look out of the window' : 'Back to the seat'}
  </button>

  <button class="shot theme" type="button" aria-pressed={themeOff} onclick={toggleTheme}>
    {themeOff ? 'Theme on' : 'Theme off'}
  </button>

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
  nav {
    display: flex;
    gap: 28px;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  nav a {
    opacity: 0.75;
  }
  nav a:hover {
    opacity: 1;
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
    bottom: 112px;
  }
  .shot:focus-visible {
    outline: 2px solid #f6ead2;
    outline-offset: 3px;
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
    .theme {
      bottom: 132px;
    }
  }
</style>
