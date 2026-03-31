// VITE
import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import Icons from 'unplugin-icons/vite'
import tailwindcss from '@tailwindcss/vite'
// CLOUDFLARE
import { cloudflare } from '@cloudflare/vite-plugin'
// TRANSLATION
import { paraglideVitePlugin } from '@inlang/paraglide-js'
// MAP
import { mapStyleArtifactsPlugin } from './src/lib/map/styles/build'
// DATA
// import seed from './src/lib/db/seed';
// TYPES
import type { PluginOption } from 'vite'

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

const getLocalCloudflarePlugins = (): PluginOption[] => {
  // Keep default local dev on native Vite. Cloudflare-local dev is opt-in because
  // the adapter output path is not reliably available in the standard dev flow.
  const isCI = process.env.CI === 'true'
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST
  const isDisabled = process.env.DISABLE_LOCAL_CLOUDFLARE === '1'

  if (isCI || isTest || isDisabled) {
    return [
      {
        name: 'skip-cloudflare-plugin',
        apply: 'serve',
      },
    ]
  }

  return cloudflare({
    configPath: './wrangler.toml',
  })
}

// CONFIG
export default defineConfig(({ command }) => ({
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
    mapStyleArtifactsPlugin(),
    // seedDrizzle(),
    sveltekit(),
    Icons({
      compiler: 'svelte',
    }),
    tailwindcss(),
    ...(command === 'serve' ? getLocalCloudflarePlugins() : []),
  ],
  build: {
    target: 'baseline-widely-available',
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
