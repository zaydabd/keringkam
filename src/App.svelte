<script>
  import Gallery from './lib/components/Gallery.svelte';
  import Showcase from './lib/components/Showcase.svelte';
  import StylePicker from './lib/components/StylePicker.svelte';
  import { styles } from './lib/three/styles/index.js';

  // Hash routes work on GitHub Pages without server setup:
  //   #/          the gallery
  //   #/studies   the list of design studies
  //   #/<style>   one study
  const read = () => location.hash.replace(/^#\/?/, '');
  let route = $state(read());
  const style = $derived(styles.find((s) => s.id === route));
</script>

<svelte:window onhashchange={() => (route = read())} />

{#if style}
  {#key style.id}
    <Showcase {style} />
  {/key}
{:else if route === 'studies'}
  <StylePicker />
{:else}
  <Gallery />
{/if}
