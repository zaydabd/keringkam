<script>
  import Showcase from './lib/components/Showcase.svelte';
  import StylePicker from './lib/components/StylePicker.svelte';
  import { styles } from './lib/three/styles/index.js';

  // Hash routes (#/cloth, #/carousel, ...) work on GitHub Pages without server setup.
  let route = $state(location.hash.replace(/^#\/?/, ''));
  const style = $derived(styles.find((s) => s.id === route));
</script>

<svelte:window onhashchange={() => (route = location.hash.replace(/^#\/?/, ''))} />

{#if style}
  {#key style.id}
    <Showcase {style} />
  {/key}
{:else}
  <StylePicker />
{/if}

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    background: #111;
  }
</style>
