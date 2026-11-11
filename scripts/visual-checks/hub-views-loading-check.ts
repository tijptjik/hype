// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:5175'
const output = 'output/playwright/hub-views-loading'
await mkdir(output, { recursive: true })
const results = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 900, 390])
      for (const facet of ['layers', 'advanced']) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: 'reduce',
        })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        let queries = 0
        await page.exposeFunction('recordPolicyQuery', () => {
          queries++
        })
        await page.route('**/*imageIntents.remote*', route =>
          route.fulfill({
            contentType: 'application/javascript',
            body: `export const getImageIntentSettings = () => { window.recordPolicyQuery(); return new Promise(resolve => window.addEventListener('resolve-image-policy', event => resolve(event.detail), {once:true})); };`,
          }),
        )
        await page.route('**/api/mapRenders/**', route =>
          route.fulfill({ status: 404, body: '' }),
        )
        await page.route('**/__hub-loading*', route =>
          route.fulfill({
            contentType: 'text/html',
            body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/hubViewsLoadingCheck.ts"></script></body></html>',
          }),
        )
        await page.goto(`${origin}/__hub-loading?facet=${facet}`)
        await page.locator('[data-comparison] li').first().waitFor()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(200)
        const measure = () =>
          page
            .locator(
              '[data-comparison] .bits-form__section-header, [data-comparison] h3, [data-comparison] li',
            )
            .evaluateAll(nodes =>
              nodes.map(node => {
                const { x, y, width, height } = node.getBoundingClientRect()
                return { x, y, width, height, tag: node.tagName }
              }),
            )
        const pending = await measure()
        assert.equal(queries, 0)
        await page.screenshot({
          path: `${output}/${name}-${facet}-${width}-pending.png`,
          fullPage: true,
        })
        await page.getByRole('button', { name: 'Resolve next' }).click()
        await page.waitForTimeout(250)
        const policyPending = await measure()
        if (facet === 'advanced') {
          assert.equal(queries, 1)
          await page.getByRole('button', { name: 'Resolve next' }).click()
          await page
            .locator('[aria-label="Image intents"][aria-busy="false"]')
            .waitFor()
        }
        await page.waitForTimeout(250)
        const ready = await measure()
        results.push({ name, facet, width, pending, policyPending, ready })
        await page.screenshot({
          path: `${output}/${name}-${facet}-${width}-ready.png`,
          fullPage: true,
        })
        if (facet === 'layers' && width === 390) {
          // Unknown organisation names may wrap after loading. Only those header heights may differ.
          let wrappedHeaderHeight = 0
          assert.equal(pending.length, ready.length)
          for (let index = 0; index < pending.length; index++) {
            const before = pending[index],
              after = ready[index]
            assert.equal(before.x, after.x)
            assert.equal(before.width, after.width)
            assert.equal(before.y + wrappedHeaderHeight, after.y)
            if (before.tag === 'H3') wrappedHeaderHeight += after.height - before.height
            else assert.equal(before.height, after.height)
          }
        } else
          assert.deepEqual(
            pending,
            ready,
            'Resource fallback differs from loaded geometry',
          )
        if (facet === 'advanced')
          assert.deepEqual(policyPending, ready, 'Policy fallback differs')
        assert.deepEqual(errors, [])
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        )
        console.log(`${name}/${facet}/${width}: matched heading, groups and rows`)
        await page.close()
      }
  } finally {
    await browser.close()
    await writeFile(`${output}/measurements.json`, JSON.stringify(results, null, 2))
  }
}
