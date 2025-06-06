import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    // Mark this as server-side code
    'import.meta.env.SSR': true
  },
  ssr: {
    // Allow server-side modules
    external: [],
    noExternal: true
  },
  resolve: {
    alias: {
      // Ensure proper alias resolution
      '$lib': new URL('../src/lib', import.meta.url).pathname,
      '$env/static/private': new URL('../.svelte-kit/ambient.d.ts', import.meta.url).pathname,
      '$env/static/public': new URL('../.svelte-kit/ambient.d.ts', import.meta.url).pathname,
    }
  }
}); 