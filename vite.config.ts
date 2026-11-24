// NODE
import { resolve } from 'node:path'
// ADAPTERS
import adapterStatic from '@sveltejs/adapter-static'
import adapterCloudflare from '@sveltejs/adapter-cloudflare'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// VITE
import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import Icons from 'unplugin-icons/vite'
import { FileSystemIconLoader } from 'unplugin-icons/loaders'
import tailwindcss from '@tailwindcss/vite'
// TRANSLATION
import { paraglideVitePlugin } from '@inlang/paraglide-js'
// LOCAL DEVELOPMENT
import { getDevPersona } from './scripts/dev/config.ts'
import { getDevOutput, getParaglideOutput } from './scripts/dev/output.ts'
import { manualBrowserUpdates } from './scripts/dev/manual-browser-updates.ts'
// DATA
// import seed from './src/lib/db/seed';
// TYPES
import type { Plugin } from 'vite'

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

const suppressOptimizedKyselyMigrationWarning = (): Plugin => ({
  name: 'suppress-optimized-kysely-migration-warning',
  enforce: 'pre',
  transform(code, id) {
    if (
      !id.includes('/.svelte-kit/vite/deps_hype/') ||
      !code.includes('this.#props.path.join(this.#props.migrationFolder, fileName)')
    ) {
      return null
    }

    // Kysely intentionally resolves migration modules from disk at runtime.
    return code.replace(
      '/* webpackIgnore: true */',
      '/* webpackIgnore: true */ /* @vite-ignore */',
    )
  },
})

// Build an SSR version of the app for Cloudflare, or a static web version when explicitly selected.
const selectAdapter = () => {
  if (process.env.SVELTE_ADAPTER === 'static') {
    return adapterStatic({
      fallback: 'index.html',
      pages: 'build-static',
      assets: 'build-static',
    })
  } else {
    return adapterCloudflare({
      // Adapter 8 owns the dev binding proxy; the separate asset worker still runs
      // through Wrangler. Preserve local R2 and named environment selection here.
      config:
        process.env.HYPE_LOCAL_R2 === '1' ? './wrangler.local.toml' : './wrangler.toml',
      platformProxy: {
        environment: process.env.CLOUDFLARE_ENV,
        // Allow local development while Cloudflare preview sessions are unavailable.
        ...(process.env.HYPE_LOCAL_R2 === '1' &&
        process.env.HYPE_REMOTE_BINDINGS === '0'
          ? { remoteBindings: false }
          : {}),
        ...(getDevPersona(process.env) && process.env.HYPE_DEV_STATE
          ? { persist: { path: process.env.HYPE_DEV_STATE } }
          : {}),
      },
      // The Workers adapter takes routing from the Wrangler configuration.
    })
  }
}

// CONFIG
export default defineConfig(async ({ command }) => ({
  define: {
    'import.meta.env.HYPE_PLACE_SOURCE_URL': JSON.stringify(
      command === 'serve' ? (process.env.HYPE_PLACE_SOURCE_URL ?? '') : '',
    ),
    'import.meta.env.HYPE_STATIC_BUILD': process.env.SVELTE_ADAPTER === 'static',
    'import.meta.env.HYPE_DEV_PERSONA': JSON.stringify(
      command === 'serve' ? getDevPersona(process.env) : null,
    ),
  },
  envPrefix: ['VITE_', 'PUBLIC_'],
  resolve: {
    alias: {
      // Keep the runtime and messages together, outside CLI-generated translations.
      '#lib/paraglide': resolve(getParaglideOutput(process.argv, command)),
    },
  },
  environments: {
    hype_prod: {},
    hype_preview: {},
  },
  plugins: [
    manualBrowserUpdates(),
    suppressOptimizedKyselyMigrationWarning(),
    paraglideVitePlugin({
      project: './project.inlang',
      // CLI scripts own src/lib/paraglide; each Vite process owns its translations.
      outdir: getParaglideOutput(process.argv, command),
      // Keep physical output; v3 otherwise defaults to virtual modules.
      // Group dev translations by locale to avoid Firefox linking a module per message.
      outputStructure: command === 'serve' ? 'locale-modules' : 'message-modules',
    }),
    {
      // These generated ES modules are already browser source. Vite would otherwise
      // append an inline identity map several times larger than each translation file.
      name: 'generated-message-source-maps',
      apply: 'serve',
      applyToEnvironment: environment => environment.name === 'client',
      transform: {
        filter: {
          id: /[/\\]generated[/\\]paraglide-dev[/\\]messages[/\\][^/\\]+\.js$/,
        },
        handler(code) {
          return { code, map: { mappings: '' } }
        },
      },
    } satisfies Plugin,
    // seedDrizzle(),
    sveltekit({
      outDir: getDevOutput(process.argv, command).outDir,
      // Consult https://kit.svelte.dev/docs/integrations#preprocessors
      // for more information about preprocessors
      compilerOptions: {
        experimental: { async: true },
        runes: true,
        // disable all warnings coming from node_modules and all accessibility warnings
        warningFilter: warning =>
          !warning.filename?.includes('node_modules') &&
          !warning.code.startsWith('a11y') &&
          !warning.message.startsWith('State referenced in its own') &&
          !warning.message.startsWith('Unused CSS selector') &&
          !warning.message.startsWith('You are using Svelte 5.0.0') &&
          warning.code !== 'css-unused-selector',
      },
      preprocess: vitePreprocess(),
      // Svelte plugin options are top-level in SvelteKit 3.

      // Required to avoid runes mode being enforce for all node_modules
      // https://github.com/sveltejs/svelte/issues/9632#issuecomment-1825498213
      dynamicCompileOptions({ filename }) {
        if (filename.includes('node_modules')) {
          return { runes: undefined } /* or false, check what works */
        }
      },
      adapter: selectAdapter(),
      csrf: { trustedOrigins: ['*'] },
      experimental: { remoteFunctions: true },
    }),
    Icons({
      compiler: 'svelte',
      customCollections: {
        // Compile the reviewed division SVGs into inline, theme-aware components.
        'hype-divisions': FileSystemIconLoader('./static/icons/divisions'),
      },
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    // Keep MapLibre and its worker query out of dependency optimization.
    exclude: ['maplibre-gl'],
  },
  ssr: {
    // Keep the dev SSR context singleton outside Vite's reloadable module graph.
    // Production still bundles Svelte for the Cloudflare runtime.
    external: command === 'serve' ? ['svelte'] : [],
    optimizeDeps: { exclude: ['svelte'] },
  },
  build: {
    target: 'es2020',
  },
  // Enable build caching for CI environments
  cacheDir: `${getDevOutput(process.argv, command).outDir}/vite`,
  server: {
    // Keep local binding storage and independent workspace apps out of web HMR and translation scans.
    watch: {
      ignored: [
        '**/.wrangler/**',
        '**/apps/recorder/**',
        // Editing migration notes and browser checks must not invalidate a live form request.
        '**/migrations/pending/**',
        '**/scripts/visual-checks/**',
        ...getDevOutput(process.argv, command).ignored,
      ],
    },
    port: 5175,
    strictPort: true,
    // Keep SSR invalidation enabled; the plugin preserves manual browser refresh.
    hmr: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'hype.localhost',
      'fi.tailb49776.ts.net',
      '0.0.0.0',
    ],
  },
}))
