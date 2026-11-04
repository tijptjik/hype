import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Keep worker tests independent of the web app's generated TypeScript config.
  tsconfig: './tsconfig.json',
  test: { environment: 'node', include: ['notifications.test.ts'] },
})
