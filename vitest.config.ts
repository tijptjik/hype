import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { sveltekit } from '@sveltejs/kit/vite'

const isWatch = process.env.CI !== 'true' && process.env.VITEST_MODE !== 'run'

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __SVELTEKIT_PATHS_BASE__: '""',
    __SVELTEKIT_PATHS_ASSETS__: '""',
    __SVELTEKIT_PATHS_RELATIVE__: 'true',
  },
  resolve: {
    conditions: ['browser'],
    alias: [
      {
        find: /^\$lib$/,
        replacement: resolve(__dirname, 'src/tests/mocks/lib-root.ts'),
      },
      {
        find: /^\$lib\/(.*)$/,
        replacement: `${resolve(__dirname, 'src/lib')}/$1`,
      },
      {
        find: '$app/server',
        replacement: resolve(__dirname, 'src/tests/mocks/app-server.ts'),
      },
      {
        find: '$app/navigation',
        replacement: resolve(__dirname, 'src/tests/mocks/app-navigation.ts'),
      },
      {
        find: '@sveltejs/kit/src/runtime/app/paths/internal/server.js',
        replacement: resolve(
          __dirname,
          'src/tests/mocks/sveltekit-paths-internal-server.ts',
        ),
      },
      {
        find: '$env/static/public',
        replacement: resolve(__dirname, 'src/tests/mocks/env-static-public.ts'),
      },
      {
        find: '$lib/context/form.svelte',
        replacement: resolve(__dirname, 'src/tests/mocks/form-context.ts'),
      },
      {
        find: /^virtual:icons\/.*$/,
        replacement: resolve(__dirname, 'src/tests/mocks/svelte-component.svelte'),
      },
      {
        find: '$lib/components/forms/fields/Property.svelte',
        replacement: resolve(__dirname, 'src/tests/mocks/svelte-component.svelte'),
      },
      {
        find: '$lib/components/forms/fields/Input.svelte',
        replacement: resolve(__dirname, 'src/tests/mocks/svelte-component.svelte'),
      },
      {
        find: '$lib/components/forms/fields/Textarea.svelte',
        replacement: resolve(__dirname, 'src/tests/mocks/svelte-component.svelte'),
      },
      {
        find: '$lib/components/forms/fields/Select.svelte',
        replacement: resolve(__dirname, 'src/tests/mocks/svelte-component.svelte'),
      },
      {
        find: '$lib/components/forms/fields/Range.svelte',
        replacement: resolve(__dirname, 'src/tests/mocks/svelte-component.svelte'),
      },
      {
        find: '$lib/components/forms/fields/Users.svelte',
        replacement: resolve(__dirname, 'src/tests/mocks/svelte-component.svelte'),
      },
      {
        find: '$lib/components/forms/fields/Toggle.svelte',
        replacement: resolve(__dirname, 'src/tests/mocks/svelte-component.svelte'),
      },
      {
        find: '$lib/components/forms/fields/Display.svelte',
        replacement: resolve(__dirname, 'src/tests/mocks/svelte-component.svelte'),
      },
      {
        find: /^sveltekit-superforms\/adapters$/,
        replacement: resolve(
          __dirname,
          'src/tests/mocks/sveltekit-superforms-adapters.ts',
        ),
      },
      {
        find: /^sveltekit-superforms\/client$/,
        replacement: resolve(
          __dirname,
          'src/tests/mocks/sveltekit-superforms-client.ts',
        ),
      },
      {
        find: /^sveltekit-superforms$/,
        replacement: resolve(__dirname, 'src/tests/mocks/sveltekit-superforms.ts'),
      },
      {
        find: 'svelte-sonner',
        replacement: resolve(__dirname, 'src/tests/mocks/svelte-sonner.ts'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['src/tests/*.remote.test.ts', 'node'],
      ['src/tests/authorization*.test.ts', 'node'],
      ['src/tests/*.services.test.ts', 'node'],
      ['src/tests/image-analytics.server.test.ts', 'node'],
    ],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: 'lcov',
      exclude: ['docs/**', '.trunk/**', '.svelte-kit/**', 'tests/**', 'src/routes/**'],
    },
    pool: 'forks',
    execArgv: ['--expose-gc'],
    isolate: true,
    maxWorkers: 1,
    vmMemoryLimit: '300Mb',
    fileParallelism: false,
    testTimeout: 10000,
    hookTimeout: 5000,
    teardownTimeout: 1000,
    logHeapUsage: false,
    watch: isWatch,
    // Use custom tsconfig for tests
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    // Disable server completely for tests
    server: {
      deps: {
        inline: true,
      },
    },
    // Exclude problematic files that might keep handles open
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/libs/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/src/lib/db/**', // Exclude database files that might keep connections open
      '**/src/hooks.server.ts', // Exclude server hooks
      '**/src/app.html',
    ],
  },
})
