import { browserCases } from './lib/browser-cases'
import { mkdir } from 'node:fs/promises'

const base = process.env.FEATURE_CHECK_URL ?? 'http://localhost:5175'
const directory = 'output/playwright/task-visual-height'
await mkdir(directory, { recursive: true })
for await (const { name, browser } of browserCases({ map: true })) {
  for (const viewport of [
    { width: 1536, height: 1000 },
    { width: 1536, height: 1500 },
    { width: 390, height: 1000 },
  ]) {
    for (const missing of [false, true]) {
      for (const long of [false, true]) {
        const page = await browser.newPage({ viewport })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.route('**/__task-height.html*', route =>
          route.fulfill({
            contentType: 'text/html',
            body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/newFeatureReviewCheck.ts"></script></body></html>',
          }),
        )
        await page.route('**/review-fixture/**', route =>
          route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#557766"/></svg>',
          }),
        )
        await page.route('https://tiles.saanseoi.hk/**', route =>
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              tilejson: '3.0.0',
              tiles: ['https://review-map.invalid/{z}/{x}/{y}.pbf'],
              minzoom: 0,
              maxzoom: 14,
            }),
          }),
        )
        await page.route('https://review-map.invalid/**', route =>
          route.fulfill({ status: 204, body: '' }),
        )
        await page.goto(
          `${base}/__task-height.html?legacy${missing ? '&missing' : ''}${long ? '&long' : ''}`,
        )
        const details = page.locator('[data-task-review-details]')
        await details.waitFor()
        await page.locator('.bits-feature-visual').waitFor()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(550)
        const bounds = await page.evaluate(() => {
          const root = document.querySelector<HTMLElement>('[data-form-surface]')!
          const details = document.querySelector<HTMLElement>(
            '[data-task-review-details]',
          )!
          const visual = document.querySelector<HTMLElement>('.bits-feature-visual')!
          return {
            available: root.clientHeight,
            details: details.getBoundingClientRect().height,
            visual: visual.getBoundingClientRect().height,
            scroll: root.scrollHeight,
            width: root.scrollWidth,
            clientWidth: root.clientWidth,
          }
        })
        if (bounds.width > bounds.clientWidth + 1)
          throw Error(`Horizontal overflow: ${JSON.stringify(bounds)}`)
        if (
          viewport.width > 900 &&
          !long &&
          Math.abs(bounds.available - bounds.details - bounds.visual) > 2
        )
          throw Error(`Unused review space: ${JSON.stringify(bounds)}`)
        if (long && bounds.scroll <= bounds.available)
          throw Error('Long text must remain scrollable')
        await page.locator('[data-form-surface]').evaluate(node => {
          node.scrollTop = node.scrollHeight
        })
        const bottomGap = await details.evaluate(
          node =>
            node.parentElement!.parentElement!.getBoundingClientRect().bottom -
            node.getBoundingClientRect().bottom,
        )
        if (Math.abs(bottomGap) > 2)
          throw Error(`Blank area below review details: ${bottomGap}`)
        if (errors.length) throw Error(errors.join('\n'))
        const scenario = `${name}-${viewport.width}x${viewport.height}-${missing ? 'missing' : 'new'}-${long ? 'long' : 'short'}`
        await page.screenshot({ path: `${directory}/${scenario}.png` })
        console.log(JSON.stringify({ scenario, ...bounds, bottomGap }))
        await page.close()
      }
    }
  }
}
