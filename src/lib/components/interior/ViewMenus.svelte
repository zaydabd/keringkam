<script>
  // The view controls at the bottom right: the seat/window button, the list of every view, the
  // theme picker, and the caption of a fabric's view.
  import { fade } from 'svelte/transition';
  import { FABRIC_VIEWS } from '../../three/scene/interior.js';
  import { THEMES, THEME_NAME, DEFAULT_THEME } from '../../three/scene/themes/index.js';

  let { shot, onshot } = $props();
  const fabricView = $derived(FABRIC_VIEWS.find((v) => v.shot === shot));

  // The theme (?theme=, themes/index.js) is picked when the page loads: choosing another reloads
  // the page, since every texture and material is built at load.
  function pickTheme(name) {
    const url = new URL(window.location.href);
    if (name === DEFAULT_THEME) url.searchParams.delete('theme');
    else url.searchParams.set('theme', name);
    window.location.assign(url);
  }
</script>

<button class="shot" type="button" onclick={() => onshot(shot === 'seat' ? 'window' : 'seat')}>
  {shot === 'seat' ? 'Look out of the window' : 'Back to the seat'}
</button>

<!-- Every view: the seat, the window and the six fabrics. A native list, so it works with the keyboard. -->
<label class="shot fabrics">
  Fabrics
  <select value={shot} onchange={(e) => onshot(e.currentTarget.value)}>
    <option value="seat">Back to the seat</option>
    <option value="window">Look out of the window</option>
    <optgroup label="Fabrics">
      {#each FABRIC_VIEWS as v (v.shot)}
        <option value={v.shot}>{v.label}: {v.fabric}</option>
      {/each}
    </optgroup>
  </select>
</label>

{#if fabricView}
  <p class="caption" transition:fade={{ duration: 400 }}>
    <span>{fabricView.label}</span>
    {fabricView.fabric}
  </p>
{/if}

<label class="shot theme">
  Theme
  <select value={THEME_NAME} onchange={(e) => pickTheme(e.currentTarget.value)}>
    {#each Object.entries(THEMES) as [name, theme] (name)}
      <option value={name}>{theme.label}</option>
    {/each}
  </select>
</label>

<style>
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
    bottom: 160px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .fabrics {
    bottom: 112px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .fabrics select {
    max-width: 16em;
  }
  .theme select,
  .fabrics select {
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .theme option,
  .fabrics option,
  .fabrics optgroup {
    color: #3a2418; /* the open list is drawn by the browser, on a light background */
  }
  .theme:focus-within,
  .fabrics:focus-within {
    outline: 2px solid #f6ead2;
    outline-offset: 3px;
  }
  .shot:focus-visible {
    outline: 2px solid #f6ead2;
    outline-offset: 3px;
  }
  .caption {
    position: absolute;
    top: 76px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 8px 18px;
    border-radius: 999px;
    background: rgba(58, 36, 24, 0.55);
    color: #f6ead2;
    font-size: 14px;
    text-align: center;
    white-space: nowrap;
  }
  .caption span {
    font-family: var(--serif);
    margin-right: 0.5em;
  }
  @media (max-width: 700px) {
    .shot {
      right: 20px;
      bottom: 84px;
    }
    .fabrics {
      bottom: 132px;
    }
    .theme {
      bottom: 180px;
    }
    .caption {
      top: 64px;
      font-size: 12px;
      white-space: normal;
      width: max-content;
      max-width: calc(100% - 40px);
    }
  }
</style>
