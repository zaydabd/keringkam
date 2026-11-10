<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { createInterior } from '../three/scene/interior.js';

  let canvas;
  let ready = $state(false);

  onMount(() => {
    const scene = createInterior(canvas, { onReady: () => (ready = true) });
    return () => scene.destroy();
  });
</script>

<div class="interior">
  <canvas bind:this={canvas}></canvas>

  <header>
    <a class="mark" href="#/">Keringkam</a>
    <nav><a href="#/">Gallery</a><a href="#/veranda">Veranda</a></nav>
  </header>

  <p class="credit">
    A hand-drawn style rendition of a kampung house, after photos of the Sarawak Cultural Village, P. Ramlee House
    (Penang) and Istana Satu (KL). Not to scale.
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
  }
</style>
