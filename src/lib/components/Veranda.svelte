<script>
  import { onMount } from 'svelte';
  import { blur, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { createVeranda, MOODS } from '../three/scene/veranda.js';
  import { fabrics, pieceInfo } from '../three/common.js';

  let canvas;
  let scene = null;
  let index = $state(0);
  let mood = $state(0);
  let ready = $state(false);
  const info = $derived(pieceInfo(index));

  onMount(() => {
    scene = createVeranda(canvas, { onChange: (i) => (index = i), onReady: () => (ready = true) });
    return () => scene.destroy();
  });

  function pickMood(k) {
    mood = k;
    scene?.setMood(k);
  }

  function onkeydown(event) {
    if (event.key === 'ArrowRight') scene?.next();
    if (event.key === 'ArrowLeft') scene?.prev();
  }
</script>

<svelte:window {onkeydown} />

<div class="veranda">
  <canvas bind:this={canvas}></canvas>

  <header>
    <a class="mark" href="#/">Keringkam</a>
    <nav><a href="#/">Gallery</a></nav>
  </header>

  <div class="caption" aria-live="polite">
    {#key index}
      <div class="caption-inner" in:blur={{ amount: 10, duration: 900, delay: 300, easing: cubicOut }} out:blur={{ amount: 10, duration: 400 }}>
        <h1>{info.title} <em>No. {info.number}</em></h1>
        <p>{Number(info.index)} of {fabrics.length}</p>
      </div>
    {/key}
  </div>

  <div class="views" role="group" aria-label="Time of day">
    {#each MOODS as m, k (m.name)}
      <button type="button" aria-pressed={k === mood} onclick={() => pickMood(k)}>{m.name}</button>
    {/each}
  </div>

  <div class="controls">
    <button type="button" class="arrow" aria-label="Previous piece" onclick={() => scene?.prev()}>
      <svg viewBox="0 0 40 12" aria-hidden="true"><path d="M40 6H2M7 1 2 6l5 5" /></svg>
    </button>
    <button type="button" class="arrow" aria-label="Next piece" onclick={() => scene?.next()}>
      <svg viewBox="0 0 40 12" aria-hidden="true"><path d="M0 6h38M33 1l5 5-5 5" /></svg>
    </button>
  </div>

  <p class="credit">A 3D rendition of a kampung veranda over the Sarawak River. Not to scale.</p>

  {#if !ready}
    <div class="veil" out:fade={{ duration: 1400 }}><span>Keringkam</span></div>
  {/if}
</div>

<style>
  .veranda {
    --ivory: #f3ece2;
    --gold: #e6c48a;
    position: fixed;
    inset: 0;
    background: #2a2019;
    color: var(--ivory);
    font-family: var(--soft);
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
  a,
  button {
    color: inherit;
    font: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    text-decoration: none;
  }
  :is(a, button):focus-visible {
    outline: 1px solid var(--gold);
    outline-offset: 4px;
  }
  header,
  .caption,
  .views,
  .controls,
  .credit {
    text-shadow: 0 1px 12px rgba(0, 0, 0, 0.45);
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
    pointer-events: none;
  }
  header > * {
    pointer-events: auto;
  }
  .mark {
    font-family: var(--serif);
    font-size: 26px;
  }
  nav {
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.8;
  }
  .caption {
    position: absolute;
    left: 32px;
    bottom: 64px;
    pointer-events: none;
  }
  .caption-inner {
    position: absolute;
    left: 0;
    bottom: 0;
    width: max-content;
    max-width: 60vw;
  }
  h1 {
    margin: 0;
    font-family: var(--serif);
    font-weight: 400;
    font-size: clamp(32px, 4.4vw, 60px);
    line-height: 1;
  }
  h1 em {
    color: var(--gold);
  }
  .caption p {
    margin: 10px 0 0;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.8;
  }
  .views {
    position: absolute;
    right: 32px;
    bottom: 96px;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px 18px;
    font-size: 13px;
    letter-spacing: 0.04em;
  }
  .views button {
    opacity: 0.6;
    padding-bottom: 3px;
    border-bottom: 1px solid transparent;
    transition: opacity 400ms ease, border-color 400ms ease;
  }
  .views button[aria-pressed='true'] {
    opacity: 1;
    border-color: currentColor;
  }
  .controls {
    position: absolute;
    right: 32px;
    bottom: 52px;
    display: flex;
    gap: 22px;
  }
  .arrow {
    width: 44px;
    height: 28px;
    display: grid;
    place-items: center;
    opacity: 0.75;
  }
  .arrow:hover {
    opacity: 1;
  }
  .arrow svg {
    width: 40px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
  }
  .credit {
    position: absolute;
    left: 32px;
    right: 32px;
    bottom: 18px;
    margin: 0;
    font-size: 11px;
    opacity: 0.7;
  }
  .veil {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: #ece5da;
    color: #3a322b;
  }
  .veil span {
    font-family: var(--serif);
    font-size: clamp(36px, 6vw, 72px);
  }
  @media (max-width: 700px) {
    header {
      padding: 18px 20px;
    }
    .caption {
      left: 20px;
      bottom: 150px;
    }
    .caption-inner {
      max-width: 88vw;
    }
    .views {
      left: 20px;
      right: 20px;
      bottom: 88px;
      justify-content: flex-start;
    }
    .controls {
      left: 20px;
      right: 20px;
      bottom: 46px;
      justify-content: space-between;
    }
    .credit {
      left: 20px;
      right: 20px;
    }
  }
</style>
