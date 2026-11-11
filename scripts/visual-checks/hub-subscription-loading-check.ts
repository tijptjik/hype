// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium } from 'playwright'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/hub-subscription-loading'
await mkdir(output, { recursive: true })
const results = []
const browser = await chromium.launch()
try {
  for (const width of [1440, 900, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__subscription', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/descriptorProfileCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__subscription`)
    await page.getByRole('button', { name: 'Hub profile', exact: true }).click()
    await page.evaluate(() => document.fonts.ready)
    const measure = () =>
      page.locator('[data-subscription-comparison]').evaluate(node => {
        const { width, height } = node.getBoundingClientRect()
        return {
          width,
          height,
          sections: Array.from(
            node.querySelectorAll(':scope > section > div:last-child > *'),
          ).map(child => ({
            height: child.getBoundingClientRect().height,
            text: child.textContent?.trim().slice(0, 30),
          })),
        }
      })
    const sections = () =>
      page
        .locator('[data-hub-organisations-comparison], [data-hub-routing-comparison]')
        .evaluateAll(nodes =>
          nodes.map(node => ({
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
        )
    const readySections = await sections()
    const ready = await measure()
    await page.getByRole('button', { name: 'Toggle subscription loading' }).click()
    const pending = await measure()
    await page
      .locator('[data-subscription-comparison]')
      .screenshot({ path: `${output}/${width}-pending.png` })
    results.push({ width, ready, pending })
    console.log(JSON.stringify(results.at(-1)))
    assert.equal(pending.height, ready.height)
    const pendingSections = await sections()
    console.log(JSON.stringify({ width, readySections, pendingSections }))
    assert.deepEqual(pendingSections, readySections)
    assert.deepEqual(errors, [])
    await page.close()
  }
} finally {
  await writeFile(`${output}/measurements.json`, JSON.stringify(results, null, 2))
  await browser.close()
}
