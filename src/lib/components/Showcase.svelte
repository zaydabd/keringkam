<script>
  import { onMount } from 'svelte';

  let { style } = $props();
  let canvas;
  let showcase = null;

  onMount(() => {
    let cancelled = false;
    style.load().then((module) => {
      if (!cancelled) showcase = module.create(canvas);
    });
    return () => {
      cancelled = true;
      showcase?.destroy();
    };
  });

  function onkeydown(event) {
    if (event.key === 'ArrowRight') showcase?.next();
    if (event.key === 'ArrowLeft') showcase?.prev();
    if (event.key === 'Escape') location.hash = '';
  }
</script>

<svelte:window {onkeydown} />

<canvas bind:this={canvas}></canvas>
<a class="back" href="#/" aria-label="All styles">←</a>
<button class="prev" aria-label="Previous" onclick={() => showcase?.prev()}>‹</button>
<button class="next" aria-label="Next" onclick={() => showcase?.next()}>›</button>

<style>
  canvas {
    display: block;
    width: 100vw;
    height: 100vh;
    touch-action: none;
  }
  .back,
  button {
    position: fixed;
    border: 0;
    background: none;
    color: #fff;
    opacity: 0.45;
    cursor: pointer;
    text-decoration: none;
    line-height: 1;
    -webkit-tap-highlight-color: transparent;
  }
  .back:hover,
  .back:focus-visible,
  button:hover,
  button:focus-visible {
    opacity: 0.9;
    outline: none;
  }
  .back {
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
