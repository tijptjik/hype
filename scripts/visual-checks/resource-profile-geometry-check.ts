// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/resource-profile-geometry'
await mkdir(output, { recursive: true })
const results: unknown[] = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  if (process.env.HYPE_TEST_BROWSER && process.env.HYPE_TEST_BROWSER !== name) continue
  const browser = await engine.launch()
  try {
    for (const width of [1440, 900, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => {
        errors.push(error.message)
        console.error(error.message)
      })
      await page.route('**/__profile-geometry', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/formProfileGeometryCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__profile-geometry`)
      await page.locator('[data-profile-skeleton-row]').first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      const measure = () =>
        page
          .locator('[data-form-surface] .bits-form__section-header')
          .evaluateAll(nodes =>
            nodes.map(node => {
              const { x, y, width, height } = node.getBoundingClientRect()
              return { x, y, width, height }
            }),
          )
      const pending = await measure()
      assert.equal(await page.locator('[data-profile-skeleton-row]').count(), 3)
      await page.screenshot({
        path: `${output}/${name}-${width}-pending.png`,
        fullPage: true,
      })
      await page.evaluate(() =>
        (
          window as unknown as { profileGeometryFixture: { resolve(): void } }
        ).profileGeometryFixture.resolve(),
      )
      await page.locator('form').waitFor()
      await page.waitForTimeout(150)
      const ready = await measure()
      console.log(JSON.stringify({ name, width, pending, ready }))
      results.push({ name, width, pending, ready })
      assert.deepEqual(pending, ready)
      assert.deepEqual(errors, [])
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
      await page.screenshot({
        path: `${output}/${name}-${width}-ready.png`,
        fullPage: true,
      })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(`${output}/measurements.json`, JSON.stringify(results, null, 2))
