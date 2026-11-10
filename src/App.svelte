<script>
  import { onMount } from 'svelte';
  import { init, destroy } from './lib/three/gallery.js';

  let canvas;

  onMount(() => {
    init(canvas);
    return destroy;
  });
</script>

<canvas bind:this={canvas}></canvas>

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
</style>
