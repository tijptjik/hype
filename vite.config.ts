import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { defineConfig, type Plugin } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import seed from './src/lib/db/seed';
import { svelteTesting } from '@testing-library/svelte/vite';

const seedDrizzle = async (): Promise<Plugin> => {
  if (process.env.VITE_WRANGLER_ENV !== 'local') {
    return {
      name: 'no-seed-on-prod',
      apply: 'build'
    } satisfies Plugin;
  } else {
    return {
      name: 'seed-drizzle',
      apply: 'serve',
      buildStart() {
        seed();
      }
    } satisfies Plugin;
  }
};

export default defineConfig(({ mode }) => ({
  plugins: [
    paraglide({
      project: './project.inlang',
      outdir: './src/lib/paraglide'
    }),
    seedDrizzle(),
    svelteTesting(),
    sveltekit(),
    svelteTesting()

  ],
  resolve: {
    // The default would be [ 'svelte', 'node' ]
    // as set by vite-plugin-svelte and vitest.
    // This sets [ 'browser', 'svelte', 'node' ]
    conditions: mode === 'test' ? ['browser'] : []
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    target: 'es2020'
  }
}));
