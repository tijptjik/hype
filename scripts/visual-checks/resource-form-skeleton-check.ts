// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium } from 'playwright'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/resource-form-skeletons'
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const measurements: unknown[] = []
try {
  for (const width of [1440, 390]) {
    for (const resource of ['hub', 'organisation', 'project', 'layer', 'user']) {
      for (const facet of resource === 'user'
        ? ['core']
        : [
            'core',
            'fields',
            'advanced',
            ...(resource === 'hub'
              ? ['layers', 'policies', 'location', 'images', 'updates']
              : resource === 'project'
                ? ['layers', 'capabilities', 'location']
                : resource === 'organisation'
                  ? ['capabilities']
                  : ['location']),
          ]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: 'reduce',
        })
        const errors: string[] = []
        page.on('pageerror', error => {
          errors.push(error.message)
          console.error(error.message)
        })
        await page.route('**/__resource-skeleton*', route =>
          route.fulfill({
            contentType: 'text/html',
            body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceFormSkeletonCheck.ts"></script></body></html>',
          }),
        )
        await page.goto(
          `${origin}/__resource-skeleton?resource=${resource}&facet=${facet}`,
        )
        await page
          .locator('[data-form-surface], [role="status"]')
          .first()
          .waitFor({ timeout: 60000 })
        await page.evaluate(() => document.fonts.ready)
        assert.deepEqual(errors, [])
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          `${resource}/${facet}/${width} overflow`,
        )
        const headers = await page
          .locator('.bits-form__section-header')
          .evaluateAll(nodes =>
            nodes.map(node => {
              const { x, y, width, height } = node.getBoundingClientRect()
              return {
                text: node.textContent?.trim().slice(0, 100),
                x,
                y,
                width,
                height,
              }
            }),
          )
        measurements.push({ resource, facet, width, headers })
        await page.screenshot({
          path: `${output}/${resource}-${facet}-${width}.png`,
          fullPage: true,
        })
        console.log(
          `${resource}/${facet}/${width}: ${headers.length} sections; no overflow`,
        )
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
}
await writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2))
