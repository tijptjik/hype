// VITE
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
// TRANSLATION
import { paraglideVitePlugin } from '@inlang/paraglide-js';
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
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
      cookieName: 'lang',
      disableAsyncLocalStorage: true
    }),
    seedDrizzle(),
    sveltekit()

  ],
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      sourcemap: true
    }
  },
  build: {
    target: 'es2020'
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    },
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '192.168.1.100',
      '192.168.1.100.nip.io',
      'dove-main-tapir.ngrok-free.app'
    ]
  }
});
