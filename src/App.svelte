<script>
  import { onMount } from 'svelte';
  import { init, destroy, next, prev } from './lib/three/viewer.js';

  let canvas;

  onMount(() => {
    init(canvas);
    return destroy;
  });

  function onkeydown(event) {
    if (event.key === 'ArrowRight') next();
    if (event.key === 'ArrowLeft') prev();
  }
</script>

<svelte:window {onkeydown} />

<canvas bind:this={canvas}></canvas>
<button class="prev" aria-label="Previous" onclick={prev}>‹</button>
<button class="next" aria-label="Next" onclick={next}>›</button>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
    background: #111;
  }
  canvas {
    display: block;
    width: 100vw;
    height: 100vh;
    touch-action: none;
  }
  button {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    width: 56px;
    height: 96px;
    border: 0;
    background: none;
    color: #fff;
    opacity: 0.45;
    font-size: 56px;
    line-height: 1;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button:hover,
  button:focus-visible {
    opacity: 0.9;
    outline: none;
  }
  .prev {
    left: 4px;
  }
  .next {
    right: 4px;
  }
</style>
