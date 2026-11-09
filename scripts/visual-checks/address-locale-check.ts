import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    const errors: string[] = []
    page.on('pageerror', error => {
      errors.push(error.message)
      console.log('PAGE ERROR', error.message)
    })
    await page.route('**/__address-locale.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="hype-light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/addressLocaleCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__address-locale.html')
    await page
      .getByRole('button', { name: 'Replace: Test Building', exact: true })
      .waitFor({ timeout: 60000 })
    await page
      .getByRole('button', { name: 'Traditional Chinese', exact: true })
      .press('Alt+ArrowLeft')
    await page.waitForTimeout(250)
    const order = await page
      .locator('[data-address-group="unitPortion"] [data-address-locale]')
      .evaluateAll(rows => rows.map(row => row.getAttribute('data-address-locale')))
    if (order[0] !== 'zhHant' || order[1] !== 'en')
      throw Error(`Unexpected row order: ${order}`)
    await page
      .getByRole('button', { name: 'Replace: Test Building', exact: true })
      .hover()
    await page
      .getByRole('button', { name: 'Clear: Test Building · EN', exact: true })
      .click()
    if (
      await page
        .getByRole('button', { name: 'Replace: Test Building', exact: true })
        .count()
    )
      throw Error('Building name was restored')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('combobox', { name: 'Search languages' }).fill('Japanese')
    await page.getByRole('option', { name: /Japanese/ }).click()
    const japanesePart = page
      .locator('[data-address-group="unitPortion"]')
      .getByRole('textbox', { name: 'Part', exact: true })
      .last()
    await japanesePart.fill('裏口')
    if ((await japanesePart.inputValue()) !== '裏口')
      throw Error('Added language did not retain its text')
    await page.waitForTimeout(250)
    await page.screenshot({
      path: `output/playwright/address-locales-${name}.png`,
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: `output/playwright/address-locales-${name}-narrow.png`,
      fullPage: true,
    })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )
    console.log(JSON.stringify({ name, order, overflow, errors }))
    if (errors.length || overflow) throw Error('Browser layout or runtime failure')
  } finally {
    await browser.close()
  }
}
