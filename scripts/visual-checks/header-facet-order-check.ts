import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const base = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
await mkdir('output/playwright/organisations-review', { recursive: true })
const evidence: unknown[] = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/__review_header.html', r =>
      r.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/headerFacetOrderCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(base + '/__review_header.html')
    await page.locator('[data-review-header] button').first().waitFor()
    for (const destination of ['hub', 'organisation', 'project', 'hub']) {
      await page
        .getByRole('button', { name: 'Switch to ' + destination, exact: true })
        .click()
      const geometry = await page
        .locator('[data-review-header] li')
        .evaluateAll(items =>
          items.map(item => ({
            width: item.getBoundingClientRect().width,
            opacity: getComputedStyle(item).opacity,
            duration: getComputedStyle(item).transitionDuration,
          })),
        )
      assert.ok(
        geometry.every(
          item => item.width > 0 && item.opacity === '1' && item.duration === '0s',
        ),
        'Tabs must appear fully expanded without a transition',
      )
      const actual = await page
        .locator('[data-review-header] li[aria-hidden="false"] button')
        .allTextContents()
        .then(values => values.map(value => value.trim()))
      const expected = JSON.parse(
        (await page.locator('[data-review-header]').getAttribute('data-expected'))!,
      )
      assert.deepEqual(
        actual,
        expected,
        `${name}: canonical ${destination} facet order`,
      )
      assert.equal(
        await page.locator('[data-review-header] li[aria-hidden="true"]').count(),
        0,
        'Exited facets must be removed',
      )
      evidence.push({ browser: name, destination, expected, actual, matches: true })
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
}
console.log(JSON.stringify(evidence, null, 2))
await writeFile(
  'output/playwright/organisations-review/facet-order.json',
  JSON.stringify(evidence, null, 2),
)
