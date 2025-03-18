// VITE
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
// TRANSLATION
import { paraglide } from '@inlang/paraglide-sveltekit/vite';
// DATA
import seed from './src/lib/db/seed';
// TYPES
import type { Plugin } from 'vite';

// PLUGIN :: SEED DRIZZLE
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

// CONFIG
export default defineConfig({
  plugins: [
    paraglide({
      project: './project.inlang',
      outdir: './src/lib/paraglide'
    }),
    seedDrizzle(),
    sveltekit()

  ],
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    target: 'es2020'
  },
  server: {
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      'dove-main-tapir.ngrok-free.app '
    ]
  }
});
