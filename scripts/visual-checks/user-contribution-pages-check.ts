// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/user-contribution-pages'
await mkdir(directory, { recursive: true })
const origin = process.argv[2] ?? 'http://hype.localhost'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1560, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route(/fixtures(?:%2F|\/)photo-/, route =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#abd3b8"/></svg>',
        }),
      )
      await page.route('**/__contribution-pages.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/userContributionPagesCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__contribution-pages.html`)
      await page.locator('#contributed-features [role="status"]').waitFor()
      await page.locator('#contributed-images [role="status"]').waitFor()
      await page.screenshot({ path: `${directory}/${name}-${width}-loading.png` })
      await page.getByRole('button', { name: 'Finish loading' }).click()
      await page.locator('#contributed-images a').first().waitFor()
      if ((await page.locator('#contributed-features a').count()) !== 20)
        throw new Error('Feature page is not bounded')
      if ((await page.locator('#contributed-images a').count()) !== 24)
        throw new Error('Photo page is not bounded')
      if (
        (await page.locator('[data-calls]').textContent()) !==
        '1 feature / 1 photo calls'
      )
        throw new Error('Unexpected requests')
      await page
        .locator('#contributed-images')
        .getByRole('button', { name: 'Load more' })
        .click()
      await page.waitForFunction(
        () => document.querySelectorAll('#contributed-images a').length === 30,
      )
      if (
        (await page.locator('[data-calls]').textContent()) !==
        '1 feature / 2 photo calls'
      )
        throw new Error('Photo continuation refetched features')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error('Horizontal overflow')
      await page.locator('#contributed-images img').first().scrollIntoViewIfNeeded()
      await page.waitForFunction(() => {
        const image = document.querySelector(
          '#contributed-images img',
        ) as HTMLImageElement
        return image?.complete && image.naturalWidth > 0
      })
      await page.screenshot({ path: `${directory}/${name}-${width}-loaded.png` })
      if (errors.length) throw new Error(errors.join('; '))
      console.log(
        `${name} ${width}px: skeletons, bounded pages, continuation and overflow passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
