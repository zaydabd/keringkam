<script>
  import { onMount } from 'svelte';
  import { PLANTS, init } from '../three/vegetation/preview.js';

  // #/vegetation?plant=vine&seed=1&lod=near&az=0&el=4&d=2.6 (the fixed views use these)
  // lod: near | far | auto (auto switches at the plant's switchAt distance)
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const num = (k, d) => (params.has(k) ? Number(params.get(k)) : d);

  let canvas;
  let stats = $state(null);
  let seed = $state(num('seed', 1));
  let view = null;
  const plant = PLANTS[params.get('plant')] ? params.get('plant') : 'vine';
  const def = PLANTS[plant];

  onMount(() => {
    view = init(canvas, {
      plant,
      seed,
      lod: params.get('lod') ?? 'near',
      azimuth: num('az', 0),
      elevation: num('el', 4),
      onStats: (s) => (stats = s),
    });
    if (params.has('d')) view.setView(num('az', 0), num('el', 4), num('d', 2.6));
    return () => view.destroy();
  });

  function reseed(step) {
    seed = Math.max(1, seed + step);
    view?.grow(seed);
  }
</script>

<div class="vegetation" style:background={def.background ?? '#dcdcdc'} class:dark={!!def.background}>
  <canvas bind:this={canvas}></canvas>
  {#if !params.has('clean')}
    <aside>
      <a href="#/">Gallery</a>
      <p>{def.label} · seed {seed} · lod {params.get('lod') ?? 'near'}</p>
      <button onclick={() => reseed(-1)}>Previous seed</button>
      <button onclick={() => reseed(1)}>Next seed</button>
      {#if stats}
        <p>
          {stats.leaves} leaves · {stats.triangles.total.toLocaleString()} triangles<br />
          {stats.bounds.join(' × ')} m
          {#if stats.far}<br />far: {stats.far.triangles.total.toLocaleString()} triangles · switch at {stats.switchAt} m{/if}
        </p>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .vegetation {
    position: fixed;
    inset: 0;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
  aside {
    position: absolute;
    top: 16px;
    left: 16px;
    font: 13px/1.4 var(--mono);
    color: #222;
  }
  .dark aside,
  .dark aside a {
    color: #e8e8e8;
  }
  aside p {
    margin: 6px 0;
  }
  button {
    font: inherit;
    margin-right: 4px;
  }
</style>
