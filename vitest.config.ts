import { sveltekit } from '@sveltejs/kit/vite';
import * as path from 'node:path';
import process from 'node:process';
import { loadEnv } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { defineConfig } from 'vitest/config';

const env = loadEnv('', process.cwd(), '');

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      $lib: path.resolve(__dirname, './src/lib'),
      $app: path.resolve(__dirname, './src/app')
    }
  },
  plugins: [
    nodePolyfills({
      include: ['buffer', 'process', 'fs', 'path'],
      globals: {
        Buffer: true,
        process: true
      }
    }),
    sveltekit()
  ],
  test: {
    globals: true,
    env: loadEnv('', process.cwd(), ''),
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,ts,svelte}'],
    setupFiles: [
      'vitest-browser-svelte',
      './src/tests/setup.ts'
    ],
    globalSetup: ['./src/tests/globalSetup.ts']
  }
});
