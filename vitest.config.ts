import { configDefaults, defineConfig } from 'vitest/config'
import { resolve } from 'path'

const isWatch = process.env.CI !== 'true' && process.env.VITEST_MODE !== 'run'

export default defineConfig({
  resolve: {
    alias: {
      $lib: resolve(__dirname, 'src/lib'),
      '$app/server': resolve(__dirname, 'src/tests/mocks/app-server.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: 'lcov',
      exclude: ['docs/**', '.trunk/**', '.svelte-kit/**', 'tests/**', 'src/routes/**'],
    },
    pool: 'forks',
    execArgv: ['--expose-gc'],
    isolate: false,
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
