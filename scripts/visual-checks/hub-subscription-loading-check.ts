// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import { mkdir } from 'node:fs/promises'

await mkdir('output/playwright', { recursive: true })
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch()
  try {
    for (const width of [390, 1000]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      let release!: () => void
      const gate = new Promise<void>(resolve => {
        release = resolve
      })
      await page.route('**/__orbit-photo/*', async route => {
        await gate
        await route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#517d87"/><text x="40" y="130" fill="white" font-size="40">招牌</text></svg>',
        })
      })
      await page.route('**/__subscription.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/hubSubscriptionLoadingCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__subscription.html', {
        waitUntil: 'domcontentloaded',
      })
      const heading = page.getByRole('heading', { name: 'Stay in the loop' })
      await heading.waitFor()
      await page.waitForFunction(() => {
        const card = document.querySelector('h3')?.closest('[style]')
        return card && getComputedStyle(card).opacity === '1'
      })
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await page.getByText('Dismissed', { exact: true }).waitFor()
      release()
      await page.reload({ waitUntil: 'networkidle' })
      await heading.waitFor()
      await page.screenshot({
        path: `output/playwright/subscription-${engine.name()}-${width}.png`,
      })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector('h3')!.closest('[style]')!)
            .transitionProperty === 'none',
      )
      const duration = await heading.evaluate(
        el => getComputedStyle(el.closest('[style]')!).transitionProperty,
      )
      if (duration !== 'none' || errors.length)
        throw new Error(JSON.stringify({ duration, errors }))
      console.log(
        `${engine.name()} ${width}: prompt dismissible with all photos pending; loaded and reduced-motion states passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
