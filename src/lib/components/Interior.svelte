<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { createInterior } from '../three/scene/interior.js';
  import { loadQuality, saveQuality, loadShowFps, saveShowFps, loadWalk, saveWalk } from '../three/scene/quality.js';
  import GraphicsPanel from './interior/GraphicsPanel.svelte';
  import ViewMenus from './interior/ViewMenus.svelte';

  let canvas;
  let ready = $state(false);
  let shot = $state('seat');
  let scene;
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
  function applyQuality(next) {
    const reload = next.textures !== quality.textures;
    quality = next;
    saveQuality(next);
    if (reload) window.location.reload();
    else scene?.setQuality(next);
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

  <GraphicsPanel open={settingsOpen} {quality} {drawn} {showFps} onapply={applyQuality} ontogglefps={toggleFps} />

  <ViewMenus {shot} onshot={(name) => scene?.setShot(name)} />

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
