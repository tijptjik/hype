// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const output = 'output/playwright/header-view-switch'
await mkdir(output, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 500 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('requestfailed', request =>
      errors.push(`${request.url()}: ${request.failure()?.errorText}`),
    )
    await page.route('**/__header-view-switch.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/headerViewSwitchCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__header-view-switch.html')
    await page
      .getByRole('status')
      .filter({ hasText: 'ready' })
      .waitFor({ timeout: 15000 })
      .catch(error => {
        throw new Error(errors.join('; '), { cause: error })
      })
    const header = page.locator('header > [data-adaptive-toolbar-right-group]')
    for (const [label, facet] of [
      ['History', 'updates'],
      ['Users', 'users'],
      ['Features', 'features'],
      ['Share map', 'share'],
      ['History', 'updates'],
    ] as const) {
      await header.getByRole('button', { name: label, exact: true }).click()
      const samples = await header.evaluate(async node => {
        const frames: { width: number; controls: number; navigation: number }[] = []
        const started = performance.now()
        while (performance.now() - started < 430) {
          const input = node.querySelector('input')
          frames.push({
            width: input?.getBoundingClientRect().width ?? 0,
            controls: node.querySelectorAll('[data-header-view-actions] button').length,
            navigation: [...node.querySelectorAll('button')].filter(button =>
              ['Features', 'Users', 'History', 'Share map'].includes(
                button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
              ),
            ).length,
          })
          await new Promise(requestAnimationFrame)
        }
        return frames
      })
      if (facet !== 'share')
        assert(
          samples.every(frame => frame.controls >= 2),
          `${name} ${facet}: empty control frame ${JSON.stringify(samples)}`,
        )
      await page.screenshot({ path: `${output}/${name}-${facet}.png` })
      console.log(
        `${name} ${facet}: control count ${Math.min(...samples.map(frame => frame.controls))}–${Math.max(...samples.map(frame => frame.controls))}, search widths ${[...new Set(samples.map(frame => Math.round(frame.width)))].join(',')}`,
      )
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
}
