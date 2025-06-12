// VITE
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
// CLOUDFLARE
import { cloudflare } from '@cloudflare/vite-plugin';
// TRANSLATION
import { paraglideVitePlugin } from '@inlang/paraglide-js';
// DATA
// import seed from './src/lib/db/seed';
// TYPES
import type { Plugin } from 'vite';

// Load env file based on `mode` in the current working directory.
// Set the third parameter to '' to load all env regardless of the
// `VITE_` prefix.
// const env = loadEnv('development', process.cwd(), '');

// PLUGIN :: SEED DRIZZLE
// const seedDrizzle = async (): Promise<Plugin> => {
//   if (env.VITE_WRANGLER_ENV !== 'local') {
// return {
// name: 'no-seed-on-prod',
// apply: 'build'
// } satisfies Plugin;
//   } else {
//     return {
//       name: 'seed-drizzle',
//       apply: 'serve',
//       buildStart() {
//         seed(env);
//       }
//     } satisfies Plugin;
//   }
// };

const localCloudflare = async (): Promise<Plugin[]> => {
  // Only load Cloudflare plugin in dev mode, skip in CI/build/test environments
  const isDev = process.env.NODE_ENV === 'development' || process.env.DEV;
  const isCI = process.env.CI === 'true';
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;
  
  if (isDev && !isCI && !isTest) {
    return cloudflare({
      configPath: './wrangler.toml'
    });
  } else {
    return [{
      name: 'skip-cloudflare-plugin',
      apply: 'build',
      buildStart() {
        console.log('🚀 Skipping Cloudflare plugin in CI/build environment');
      }
    }];
  }
};

// CONFIG
export default defineConfig({
  envPrefix: ['VITE_', 'PUBLIC_'],
  environments: {
    hype_prod: {},
    hype_preview: {}
  },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
      cookieName: 'lang'
    }),
    // seedDrizzle(),
    sveltekit(),
    localCloudflare()
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
