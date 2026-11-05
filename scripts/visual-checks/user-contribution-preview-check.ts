// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/user-contribution-previews'
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
        viewport: { width, height: 600 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      // Hold only the fixture's preview request so its real loading UI remains inspectable.
      await page.route('**/getUserContributionPreviews?**', () => {})
      await page.route('**/__contribution-preview.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/userContributionPreviewCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__contribution-preview.html`)
      const strip = page.getByLabel('Contribution previews', { exact: true })
      await page.getByRole('status').waitFor()
      const loadingBox = await strip.boundingBox()
      const skeleton = strip.locator('.animate-pulse, [class*="animate-pulse"]')
      if ((await skeleton.count()) < 3) throw new Error('Missing skeleton tiles')
      if (
        (await page
          .getByRole('status')
          .evaluate(element => element.getBoundingClientRect().width)) > 2
      )
        throw new Error('Loading text is visibly replacing the skeleton')
      await page.screenshot({ path: `${directory}/${name}-${width}-loading.png` })
      await page.getByRole('button', { name: 'Show previews', exact: true }).click()
      await strip.getByRole('button').first().waitFor()
      const loadedBox = await strip.boundingBox()
      if (loadingBox?.height !== loadedBox?.height)
        throw new Error('Strip height shifted on load')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error('Horizontal overflow')
      await page.screenshot({ path: `${directory}/${name}-${width}-loaded.png` })
      if (errors.length) throw new Error(errors.join('; '))
      console.log(`${name} ${width}px: skeletons, stable height and overflow passed`)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
