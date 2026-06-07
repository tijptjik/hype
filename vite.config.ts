// VITE
import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import Icons from 'unplugin-icons/vite'
import tailwindcss from '@tailwindcss/vite'
// CLOUDFLARE
import { cloudflare } from '@cloudflare/vite-plugin'
// TRANSLATION
import { paraglideVitePlugin } from '@inlang/paraglide-js'
// DATA
// import seed from './src/lib/db/seed';
// TYPES
import type { ConfigEnv, Plugin } from 'vite'

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

const localCloudflare = async (command: ConfigEnv['command']): Promise<Plugin[]> => {
  // Only load Cloudflare plugin when explicitly requested, because the default local
  // app dev flow runs the asset worker as a separate Wrangler process.
  const isServe = command === 'serve'
  const isCI = process.env.CI === 'true'
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST
  const enableCloudflareVite = process.env.HYPE_ENABLE_CLOUDFLARE_VITE === '1'
  const useLocalR2 = process.env.HYPE_LOCAL_R2 === '1'

  if (enableCloudflareVite && isServe && !isCI && !isTest) {
    return cloudflare({
      configPath: useLocalR2 ? './wrangler.local.toml' : './wrangler.toml',
      auxiliaryWorkers: [
        {
          configPath: useLocalR2
            ? './workers/asset-service/wrangler.local.toml'
            : './workers/asset-service/wrangler.toml',
        },
      ],
    })
  } else {
    return [
      {
        name: 'skip-cloudflare-plugin',
        apply: 'build',
        buildStart() {
          console.log(
            'Skipping Cloudflare plugin without HYPE_ENABLE_CLOUDFLARE_VITE=1',
          )
        },
      },
    ]
  }
}

// CONFIG
export default defineConfig(async ({ command }) => ({
  envPrefix: ['VITE_', 'PUBLIC_'],
  environments: {
    hype_prod: {},
    hype_preview: {},
  },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
      cookieName: 'lang',
    }),
    // seedDrizzle(),
    sveltekit(),
    Icons({
      compiler: 'svelte',
    }),
    tailwindcss(),
    ...(await localCloudflare(command)),
  ],
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      sourcemap: true,
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      cache: true,
    },
  },
  // Enable build caching for CI environments
  cacheDir: '.svelte-kit/vite',
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '192.168.1.100',
      '192.168.1.100.traefik.me',
      'dove-main-tapir.ngrok-free.app',
      'timri-58-153-118-141.a.free.pinggy.link',
    ],
  },
}))
