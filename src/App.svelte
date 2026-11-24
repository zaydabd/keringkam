<script>
  import Interior from './lib/components/Interior.svelte';
  import VegetationPreview from './lib/components/VegetationPreview.svelte';

  // #/vegetation  procedural plant preview (query: plant, seed, lod, az, el, d, clean)
  // every other route is the kampung house interior (including #/ and #/interior).
  const read = () => location.hash.replace(/^#\/?/, '');
  let route = $state(read());
</script>

<svelte:window onhashchange={() => (route = read())} />

{#if route.split('?')[0] === 'vegetation'}
  {#key route}
    <VegetationPreview />
  {/key}
{:else}
  <Interior />
{/if}
