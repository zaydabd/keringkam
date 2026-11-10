<script>
  import { onMount } from 'svelte';
  import { blur, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { createGallery } from '../three/gallery/gallery.js';
  import { fabrics, pieceInfo } from '../three/common.js';

  let canvas;
  let gallery = null;
  let index = $state(0);
  let ready = $state(false);
  let indexOpen = $state(false);
  let hint = $state(true);

  const info = $derived(pieceInfo(index));

  // Pieces grouped by collection, in file order, for the index view.
  const collections = [];
  fabrics.forEach((fabric, i) => {
    const piece = pieceInfo(i);
    let group = collections.find((c) => c.title === piece.title);
    if (!group) collections.push((group = { title: piece.title, items: [] }));
    group.items.push({ i, number: piece.number, thumb: fabric.thumbUrl });
  });

  onMount(() => {
    gallery = createGallery(canvas, {
      onChange: (i) => (index = i),
      onReady: () => (ready = true),
    });
    const hintTimer = setTimeout(() => (hint = false), 8000);
    return () => {
      clearTimeout(hintTimer);
      gallery.destroy();
    };
  });

  function go(i) {
    gallery?.go(i);
    indexOpen = false;
  }

  function onkeydown(event) {
    if (indexOpen) {
      if (event.key === 'Escape') indexOpen = false;
      return;
    }
    if (event.key === 'ArrowRight') gallery?.next();
    if (event.key === 'ArrowLeft') gallery?.prev();
  }
</script>

<svelte:window {onkeydown} />

<div class="gallery">
  <canvas bind:this={canvas} onpointerdown={() => (hint = false)}></canvas>

  <header>
    <a class="mark" href="#/">Keringkam</a>
    <nav>
      <button type="button" onclick={() => (indexOpen = true)}>Index</button>
      <a href="#/studies">Studies</a>
    </nav>
  </header>

  <div class="caption" aria-live="polite">
    {#key index}
      <div class="caption-inner" in:blur={{ amount: 10, duration: 900, delay: 350, easing: cubicOut }} out:blur={{ amount: 10, duration: 450 }}>
        <h1>{info.title} <em>No. {info.number}</em></h1>
        <p>{Number(info.index)} of {fabrics.length}</p>
      </div>
    {/key}
  </div>

  <div class="controls">
    <button type="button" class="arrow" aria-label="Previous piece" onclick={() => gallery?.prev()}>
      <svg viewBox="0 0 40 12" aria-hidden="true"><path d="M40 6H2M7 1 2 6l5 5" /></svg>
    </button>
    <div class="progress" aria-hidden="true">
      <span style={`transform: translateX(${index * 100}%); width: ${100 / fabrics.length}%`}></span>
    </div>
    <button type="button" class="arrow" aria-label="Next piece" onclick={() => gallery?.next()}>
      <svg viewBox="0 0 40 12" aria-hidden="true"><path d="M0 6h38M33 1l5 5-5 5" /></svg>
    </button>
  </div>

  {#if hint && ready}
    <p class="hint" transition:fade={{ duration: 900 }}>Hold and pull the cloth · swipe or scroll to browse</p>
  {/if}

  {#if !ready}
    <div class="veil" out:fade={{ duration: 1400 }}>
      <span>Keringkam</span>
    </div>
  {/if}

  {#if indexOpen}
    <div class="index" role="dialog" aria-modal="true" aria-label="All pieces" transition:fade={{ duration: 450 }}>
      <div class="index-head">
        <span class="mark">Index</span>
        <button type="button" onclick={() => (indexOpen = false)}>Close</button>
      </div>
      {#each collections as collection (collection.title)}
        <section>
          <h2>{collection.title}</h2>
          <ul>
            {#each collection.items as item (item.i)}
              <li>
                <button type="button" class:current={item.i === index} onclick={() => go(item.i)}>
                  <img src={item.thumb} alt={`${collection.title}, No. ${item.number}`} loading="lazy" />
                  <span>No. {item.number}</span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .gallery {
    --ivory: #ece5da;
    --ink: #3a322b;
    --muted: #8b7f72;
    --gold: #a8834a;
    position: fixed;
    inset: 0;
    background: var(--ivory);
    color: var(--ink);
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
    letter-spacing: 0.01em;
  }
  nav {
    display: flex;
    gap: 28px;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  nav > * {
    opacity: 0.7;
    transition: opacity 400ms ease;
  }
  nav > *:hover {
    opacity: 1;
  }

  .caption {
    position: absolute;
    left: 32px;
    bottom: 32px;
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
    font-size: clamp(34px, 4.6vw, 64px);
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
    color: var(--muted);
  }

  .controls {
    position: absolute;
    right: 32px;
    bottom: 38px;
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .arrow {
    width: 44px;
    height: 32px;
    display: grid;
    place-items: center;
    opacity: 0.65;
    transition: opacity 400ms ease, transform 400ms ease;
  }
  .arrow:hover {
    opacity: 1;
  }
  .arrow:first-child:hover {
    transform: translateX(-3px);
  }
  .arrow:last-child:hover {
    transform: translateX(3px);
  }
  .arrow svg {
    width: 40px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
  }
  .progress {
    width: 120px;
    height: 1px;
    background: rgba(58, 50, 43, 0.18);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--ink);
    transition: transform 1200ms cubic-bezier(0.65, 0, 0.35, 1);
  }

  .hint {
    position: absolute;
    left: 50%;
    top: 26px;
    transform: translateX(-50%);
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.06em;
    color: var(--muted);
    white-space: nowrap;
    pointer-events: none;
  }

  .veil {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--ivory);
  }
  .veil span {
    font-family: var(--serif);
    font-size: clamp(36px, 6vw, 72px);
    animation: breathe 2.4s ease-in-out infinite;
  }
  @keyframes breathe {
    50% {
      opacity: 0.45;
    }
  }

  .index {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    background: rgba(236, 229, 218, 0.94);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    padding: 24px 32px 64px;
  }
  .index-head {
    position: sticky;
    top: -24px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 24px 0 16px;
    margin-top: -24px;
    background: rgba(236, 229, 218, 0.94);
    z-index: 1;
  }
  .index-head button {
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.7;
  }
  section {
    margin-top: 28px;
  }
  h2 {
    margin: 0 0 14px;
    font-family: var(--serif);
    font-weight: 400;
    font-size: 26px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 20px;
  }
  ul button {
    display: grid;
    gap: 8px;
    width: 100%;
    text-align: left;
  }
  ul img {
    width: 100%;
    aspect-ratio: 3 / 4;
    object-fit: contain;
    transition: transform 600ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  ul button:hover img {
    transform: translateY(-4px);
  }
  ul span {
    font-size: 12px;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  ul button.current span {
    color: var(--gold);
  }

  @media (max-width: 700px) {
    header {
      padding: 18px 20px;
    }
    .caption {
      left: 20px;
      bottom: 88px;
    }
    .caption-inner {
      max-width: 88vw;
    }
    .controls {
      left: 20px;
      right: 20px;
      bottom: 28px;
      justify-content: space-between;
    }
    .progress {
      flex: 1;
    }
    .hint {
      top: auto;
      bottom: 180px;
      white-space: normal;
      width: 80vw;
      text-align: center;
    }
    .index {
      padding: 18px 20px 48px;
    }
    ul {
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .veil span {
      animation: none;
    }
  }
</style>
