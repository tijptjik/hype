import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const isWatch = process.env.CI !== 'true' && process.env.VITEST_MODE !== 'run';

export default defineConfig({
  resolve: {
    alias: {
      $lib: resolve(__dirname, 'src/lib'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    setupFiles: [],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    fileParallelism: false,
    testTimeout: 10000,
    hookTimeout: 5000,
    teardownTimeout: 1000,
    logHeapUsage: false,
    watch: isWatch,
    // Disable server completely for tests
    server: {
      deps: {
        inline: true
      }
    },
    // Exclude problematic files that might keep handles open
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/src/lib/db/**', // Exclude database files that might keep connections open
      '**/src/hooks.server.ts', // Exclude server hooks
      '**/src/app.html'
    ]
  }
}); 