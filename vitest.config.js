import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadEnv } from 'vite';
import * as path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib')
    }
  },
  plugins: [svelte()],
  test: {
    globals: true,
    env: loadEnv('', process.cwd(), ''),
    environment: 'jsdom',
    browser: {
      provider: 'webdriverio', // or 'webdriverio'
      enabled: true,
      name: 'firefox' // browser name is required
    },
    setupFiles: ['vitest-browser-svelte']
  }
});
