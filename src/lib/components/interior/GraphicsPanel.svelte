<script>
  // The Graphics panel (quality.js): the preset, each setting, and the FPS switch.
  import { fade } from 'svelte/transition';
  import { OPTIONS, PRESETS, presetOf, presetSettings } from '../../three/scene/quality.js';

  let { open, quality, drawn, showFps, onapply, ontogglefps } = $props();
  const preset = $derived(presetOf(quality));
</script>

{#if open}
  <section id="graphics" class="settings" aria-label="Graphics settings" transition:fade={{ duration: 150 }}>
    <label>
      Preset
      <select value={preset} onchange={(e) => onapply(presetSettings(e.currentTarget.value))}>
        {#each Object.entries(PRESETS) as [name, p] (name)}
          <option value={name}>{p.label}</option>
        {/each}
        {#if preset === 'custom'}<option value="custom" disabled>Custom</option>{/if}
      </select>
    </label>
    {#each Object.entries(OPTIONS) as [key, o] (key)}
      <label>
        {o.label}
        <select value={quality[key]} onchange={(e) => onapply({ ...quality, [key]: e.currentTarget.value })}>
          {#each Object.entries(o.values) as [value, text] (value)}
            <option {value}>{text}</option>
          {/each}
        </select>
      </label>
    {/each}
    <label>
      Show FPS
      <input type="checkbox" checked={showFps} onchange={(e) => ontogglefps(e.currentTarget.checked)} />
    </label>
    {#if drawn}
      <p class="note">Drawing {drawn.width} × {drawn.height} for a {drawn.cssWidth} × {drawn.cssHeight} window.</p>
    {/if}
    <p class="note">Resolution: the most pixels drawn; a bigger screen is stretched. Ambient occlusion Auto: half while the view moves, full when it stops. Outlines Light: no lines on the view outside, lighter creases. Anti-aliasing auto: off at 2× and above. Texture detail reloads the page. FPS: frames a second, and the time between frames.</p>
  </section>
{/if}

<style>
  .settings {
    position: absolute;
    top: 72px;
    right: 32px;
    width: 280px;
    display: grid;
    gap: 10px;
    padding: 16px 18px;
    border: 1px solid rgba(246, 234, 210, 0.5);
    border-radius: 14px;
    background: rgba(58, 36, 24, 0.88);
    color: #f6ead2;
    font-size: 13px;
  }
  .settings label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .settings select {
    min-width: 7.5em;
    padding: 4px 6px;
    border: 1px solid rgba(246, 234, 210, 0.5);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .settings select:focus-visible {
    outline: 2px solid #f6ead2;
    outline-offset: 2px;
  }
  .settings option {
    color: #3a2418;
  }
  .settings input[type='checkbox'] {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: #f6ead2;
    cursor: pointer;
  }
  .settings input[type='checkbox']:focus-visible {
    outline: 2px solid #f6ead2;
    outline-offset: 2px;
  }
  .settings .note {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    opacity: 0.85;
  }
  @media (max-width: 700px) {
    .settings {
      top: 64px;
      left: 20px;
      right: 20px;
      width: auto;
    }
  }
</style>
