// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      page.setDefaultTimeout(20000)
      page.on('pageerror', error => console.error(error.message))
      await page.route('**/__feature-toolbar.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: `<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/featureProfileCheck.ts"></script></body></html>`,
        }),
      )
      await page.goto(
        'http://127.0.0.1:4173/__feature-toolbar.html?toolbarIssue=Attempted%20to%20set%20forbidden%20field.',
      )
      const message = page.getByText('Attempted to set forbidden field.', {
        exact: true,
      })
      await message.waitFor()
      const a = await message.boundingBox()
      const b = await page
        .getByRole('button', { name: 'Multilingual', exact: true })
        .boundingBox()
      if (!a || !b || Math.abs(a.y + a.height / 2 - b.y - b.height / 2) > 1)
        throw new Error(
          `Toolbar alignment failed: ${JSON.stringify({ name, width, a, b })}`,
        )
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error('Horizontal overflow')
      console.log(
        `${name} ${width}px: messages and Multilingual vertically aligned; no overflow`,
      )
      await page.screenshot({ path: `/tmp/feature-toolbar-${name}-${width}.png` })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
