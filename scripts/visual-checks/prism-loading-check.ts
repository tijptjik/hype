import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:5175'
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      const page = await browser.newPage({
        viewport: { width: 1000, height: 900 },
        reducedMotion,
      })
      await page.route('**/__prism-loading.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/prismLoadingCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__prism-loading.html`)
      const sections = page.locator('[data-resource-section]')
      await sections.first().waitFor()
      assert.deepEqual(
        await sections.evaluateAll(nodes =>
          nodes.map(node => node.getBoundingClientRect().height),
        ),
        [56, 56, 56],
      )
      for (const type of ['organisation', 'project', 'layer']) {
        await page.evaluate(() => {
          const samples: number[][] = []
          Object.assign(window, { prismSamples: samples })
          const start = performance.now()
          function sample() {
            samples.push(
              Array.from(
                document.querySelectorAll('[data-resource-section]'),
                node => node.getBoundingClientRect().height,
              ),
            )
            if (performance.now() - start < 450) requestAnimationFrame(sample)
          }
          requestAnimationFrame(sample)
        })
        await page.getByRole('button', { name: `Load ${type}`, exact: true }).click()
        await page.waitForTimeout(500)
        const samples = await page.evaluate(
          () => (window as unknown as { prismSamples: number[][] }).prismSamples,
        )
        const largestStep = Math.max(
          ...samples
            .slice(1)
            .flatMap((heights, index) =>
              heights.map((height, column) =>
                Math.abs(height - samples[index][column]),
              ),
            ),
        )
        if (type !== 'layer') {
          assert.ok(samples.every(heights => heights.every(height => height === 56)))
        } else {
          for (const [index, heights] of samples.entries()) {
            heights.forEach((height, column) => {
              assert.ok(height <= 300.5, `Section ${column} overshot: ${height}`)
              if (index) assert.ok(height >= samples[index - 1][column] - 0.5)
            })
          }
          assert.deepEqual(samples.at(-1), [300, 300, 300])
        }
        if (reducedMotion === 'no-preference')
          assert.ok(
            largestStep < 100,
            `${type} jumped ${largestStep}px: ${JSON.stringify(samples)}`,
          )
        console.log(engine.name(), reducedMotion, type, {
          largestStep,
          final: samples.at(-1),
        })
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
