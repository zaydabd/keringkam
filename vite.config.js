import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Treat KTX2 textures as assets so they get hashed file names (long-term caching).
  assetsInclude: ['**/*.ktx2'],
});
