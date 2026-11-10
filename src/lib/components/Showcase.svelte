<script>
  import { onMount } from 'svelte';

  let { style } = $props();
  let root;
  let back;
  let canvas;
  let front;
  let showcase = null;

  onMount(() => {
    let cancelled = false;
    style.load().then((module) => {
      if (!cancelled) showcase = module.create(canvas, { root, back, front });
    });
    return () => {
      cancelled = true;
      showcase?.destroy();
      back.replaceChildren();
      front.replaceChildren();
    };
  });

  function onkeydown(event) {
    if (event.key === 'ArrowRight') showcase?.next();
    if (event.key === 'ArrowLeft') showcase?.prev();
    if (event.key === 'Escape') location.hash = '';
  }
</script>

<svelte:window {onkeydown} />

<!-- Styles can set --ui on the root to recolour the controls for light backgrounds. -->
<div class="showcase" bind:this={root}>
  <div class="kk-layer back" bind:this={back}></div>
  <canvas bind:this={canvas}></canvas>
  <div class="kk-layer front" bind:this={front}></div>
  <a class="back-link" href="#/" aria-label="All styles">←</a>
  <button class="prev" aria-label="Previous" onclick={() => showcase?.prev()}>‹</button>
  <button class="next" aria-label="Next" onclick={() => showcase?.next()}>›</button>
</div>

<style>
  .showcase {
    --ui: #fff;
    position: fixed;
    inset: 0;
  }
  /* Painted in DOM order: back layer, canvas, front layer. */
  canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .back-link,
  button {
    position: fixed;
    z-index: 3;
    border: 0;
    background: none;
    color: var(--ui);
    opacity: 0.5;
    cursor: pointer;
    text-decoration: none;
    line-height: 1;
    -webkit-tap-highlight-color: transparent;
  }
  .back-link:hover,
  .back-link:focus-visible,
  button:hover,
  button:focus-visible {
    opacity: 1;
    outline: none;
  }
  .back-link {
    top: 12px;
    left: 16px;
    font-size: 24px;
    padding: 4px;
  }
  button {
    top: 50%;
    transform: translateY(-50%);
    width: 56px;
    height: 96px;
    font-size: 56px;
  }
  .prev {
    left: 4px;
  }
  .next {
    right: 4px;
  }
</style>
