// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:5175'
const output = 'output/playwright/feature-intent-loading'
await mkdir(output, { recursive: true })
const results = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1280, 900, 390])
      for (const resource of ['hub', 'project', 'layer']) {
        const page = await browser.newPage({
          viewport: { width, height: 1100 },
          reducedMotion: 'reduce',
        })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        let queries = 0
        await page.exposeFunction('recordPolicyQuery', () => {
          queries++
        })
        await page.route('**/*featureIntents.remote*', route =>
          route.fulfill({
            contentType: 'application/javascript',
            body: `export const getFeatureIntentSettings = () => { window.recordPolicyQuery(); return new Promise(resolve => window.addEventListener('resolve-feature-policy', event => resolve(event.detail), {once:true})); }; export const getFeatureNameProperties = async () => []; export const getFeatureNameFieldsProject = async () => null; export const getFeatureIntentOptions = async () => [];`,
          }),
        )
        await page.route('**/__intent-loading*', route =>
          route.fulfill({
            contentType: 'text/html',
            body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/featureIntentLoadingCheck.ts"></script></body></html>',
          }),
        )
        await page.goto(`${origin}/__intent-loading?resource=${resource}`)
        await page.locator('[data-feature-type-section]').first().waitFor()
        await page.evaluate(() => document.fonts.ready)
        const measure = () =>
          page
            .locator('[data-feature-type-toolbar], [data-feature-type-section]')
            .evaluateAll(nodes =>
              nodes.map(node => {
                const { x, y, width, height } = node.getBoundingClientRect()
                return { x, y, width, height }
              }),
            )
        await page.waitForTimeout(250)
        const resourcePending = await measure()
        assert.equal(queries, 0, 'Resource fallback must not query')
        await page.screenshot({
          path: `${output}/${name}-${resource}-${width}-pending.png`,
          fullPage: true,
        })
        await page.getByRole('button', { name: 'Resolve next' }).click()
        await page.waitForTimeout(250)
        const policyPending = await measure()
        assert.equal(queries, 1)
        await page.getByRole('button', { name: 'Resolve next' }).click()
        await page.locator('[data-type-list]').waitFor()
        await page.waitForTimeout(250)
        const ready = await measure()
        await page.screenshot({
          path: `${output}/${name}-${resource}-${width}-ready.png`,
          fullPage: true,
        })
        results.push({ name, resource, width, resourcePending, policyPending, ready })
        assert.deepEqual(resourcePending, ready, 'Resource fallback geometry differs')
        assert.deepEqual(policyPending, ready, 'Policy fallback geometry differs')
        assert.deepEqual(errors, [])
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        )
        console.log(
          `${name}/${resource}/${width}: both loading stages match loaded geometry`,
        )
        await page.close()
      }
  } finally {
    await browser.close()
    await writeFile(`${output}/measurements.json`, JSON.stringify(results, null, 2))
  }
}
