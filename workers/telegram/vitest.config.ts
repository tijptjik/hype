import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-plugin'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TELEGRAM_API_ID: '1',
          TELEGRAM_API_HASH: 'synthetic-not-a-real-key',
        },
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
})
