// Run with the app on port 4173. Set CHROMIUM_EXECUTABLE_PATH if needed.
import { chromium } from 'playwright'

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-web-security'],
})
try {
  const results: Record<string, unknown> = {}
  for (const mode of ['rich', 'native']) {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__profile.html*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/featureStatsProfile.ts"></script></body></html>',
      }),
    )
    await page.goto(`http://127.0.0.1:4173/__profile.html?mode=${mode}`)
    await page.waitForFunction(
      () => document.body.dataset.results,
      {},
      { timeout: 60000 },
    )
    if (errors.length) throw new Error(errors.join('\n'))
    const raw = await page.locator('body').getAttribute('data-results')
    if (!raw) throw new Error('Missing measurements')
    const samples = JSON.parse(raw) as Record<string, number[]>
    results[mode] = {
      samples,
      medianMs: Object.fromEntries(
        Object.entries(samples).map(([name, values]) => [
          name,
          [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)],
        ]),
      ),
    }
    await page.close()
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
