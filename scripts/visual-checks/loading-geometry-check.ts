// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:5175'
await mkdir('output/playwright/loading-geometry', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [390, 1000]) {
      for (const kind of ['feature', 'button', 'policy', 'account', 'choice']) {
        for (const layout of kind === 'feature' ? ['card', 'table'] : ['card']) {
          const page = await browser.newPage({
            viewport: { width, height: 900 },
            reducedMotion: 'reduce',
          })
          const errors: string[] = []
          page.on('pageerror', error => errors.push(error.message))
          await page.route('**/__loading-geometry.html*', route =>
            route.fulfill({
              contentType: 'text/html',
              body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/loadingGeometryCheck.ts"></script></body></html>',
            }),
          )
          await page.goto(
            `${origin}/__loading-geometry.html?kind=${kind}&layout=${layout}`,
          )
          await page.locator('[data-footprint]').waitFor()
          await page.evaluate(() => document.fonts.ready)
          const box = () => page.locator('[data-footprint]').boundingBox()
          const before = await box()
          const pendingItem =
            kind === 'feature'
              ? await page
                  .locator('[data-resource-skeleton-item]')
                  .first()
                  .boundingBox()
              : null
          assert(before)
          await page.screenshot({
            path: `output/playwright/loading-geometry/${name}-${width}-${kind}-${layout}-pending.png`,
          })
          await page.getByRole('button', { name: 'Resolve next' }).click()
          if (kind === 'feature') {
            await page
              .locator('[data-scoped-feature-skeleton]')
              .waitFor({ state: 'detached' })
            const intermediate = await box()
            assert.deepEqual(
              intermediate,
              before,
              'Chunk and data loader footprints differ',
            )
            await page.getByRole('button', { name: 'Resolve next' }).click()
            await page.locator('[data-geometry-item]').first().waitFor()
          }
          const after = await box()
          assert(after)
          if (pendingItem) {
            const loadedItem = await page
              .locator('[data-geometry-item]')
              .first()
              .boundingBox()
            assert(loadedItem)
            assert(
              Math.abs(pendingItem.height - loadedItem.height) < 1,
              `${name} ${width} ${layout}: item height ${pendingItem.height} → ${loadedItem.height}`,
            )
            assert(
              Math.abs(pendingItem.width - loadedItem.width) < 1,
              `${name} ${width} ${layout}: item width ${pendingItem.width} → ${loadedItem.width}`,
            )
          }
          assert(
            Math.abs(before.height - after.height) < 1,
            `${name} ${width} ${kind}: height ${before.height} → ${after.height}`,
          )
          assert(
            Math.abs(before.width - after.width) < 1,
            `${name} ${width} ${kind}: width changed`,
          )
          await page.screenshot({
            path: `output/playwright/loading-geometry/${name}-${width}-${kind}-${layout}-ready.png`,
          })
          assert.deepEqual(errors, [])
          console.log(
            JSON.stringify({
              browser: name,
              width,
              kind,
              layout,
              pendingHeight: before.height,
              readyHeight: after.height,
            }),
          )
          if (kind === 'feature') {
            for (const task of [false, true]) {
              await page.goto(
                `${origin}/__loading-geometry.html?kind=feature&layout=${layout}&tall=1&task=${task ? '1' : '0'}`,
              )
              const pending = page.locator('[data-footprint] [role="status"]').first()
              await pending.waitFor()
              await page.waitForFunction(() => {
                const viewport = document.querySelector('[data-footprint]')
                const status = viewport?.querySelector('[role="status"]')
                const grid = status?.lastElementChild
                return (
                  viewport &&
                  grid?.lastElementChild &&
                  grid.lastElementChild.getBoundingClientRect().bottom >=
                    viewport.getBoundingClientRect().bottom
                )
              })
              await page.setViewportSize({
                width: Math.max(390, width - 200),
                height: 1600,
              })
              await page.waitForFunction(() => {
                const viewport = document.querySelector('[data-footprint]')
                const grid =
                  viewport?.querySelector('[role="status"]')?.lastElementChild
                return (
                  viewport &&
                  grid?.lastElementChild &&
                  grid.lastElementChild.getBoundingClientRect().bottom >=
                    viewport.getBoundingClientRect().bottom
                )
              })
            }
          }
          await page.close()
        }
      }
    }
  } finally {
    await browser.close()
  }
}
