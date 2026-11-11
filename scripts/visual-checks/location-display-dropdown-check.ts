import { chromium, firefox } from 'playwright'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 1000, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__rule-title.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/locationDisplayChoiceCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${process.argv[2] ?? 'http://127.0.0.1:4173'}/__rule-title.html`)
      page.setDefaultTimeout(15000)
      const trigger = page.getByRole('button', {
        name: 'Display location using: Automatic',
      })
      await trigger.waitFor()
      await trigger.click()
      await page.getByRole('menu').waitFor()
      await page.getByRole('menuitemradio', { name: /^Address/ }).click()
      const next = page.getByRole('button', { name: 'Display location using: Address' })
      await next.click()
      await page.getByRole('menu').waitFor()
      await page.keyboard.press('Escape')
      await page.mouse.move(0, 0)
      await next.hover()
      await page.getByRole('tooltip').waitFor()
      await next.click()
      await page.getByRole('menu').waitFor()
      await page.getByRole('tooltip').waitFor({ state: 'hidden' })
      await page.getByRole('menuitemradio', { name: /^Plus Code/ }).click()
      const finalTrigger = page.getByRole('button', {
        name: 'Display location using: Plus Code',
      })
      await finalTrigger.focus()
      await page.keyboard.press('Enter')
      await page.getByRole('menu').waitFor()
      await page.keyboard.press('Escape')
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute('aria-label') ===
          'Display location using: Plus Code',
      )
      if (errors.length) throw Error(errors.join('\n'))
      console.log(name, width, 'direct, repeated, hover-then-click and keyboard passed')
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
