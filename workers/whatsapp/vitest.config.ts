import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-plugin'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      additionalExports: { VoiceGateway: 'WorkerEntrypoint' },
      miniflare: {
        workers: [
          {
            name: 'hype-whatsover-relay-prod',
            compatibilityDate: '2026-11-02',
            modules: true,
            script:
              'export default { fetch() { return new Response("Synthetic relay unavailable", { status: 503 }); } };',
          },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    // Each test worker owns a workerd tree; keep local memory use bounded.
    maxWorkers: 1,
    fileParallelism: false,
  },
})
