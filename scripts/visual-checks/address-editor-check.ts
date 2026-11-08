import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.on('console', message => {
    if (message.type() === 'error') console.log('CONSOLE', message.text())
  })
  page.on('requestfailed', request =>
    console.log('FAILED', request.url(), request.failure()?.errorText),
  )
  page.on('response', response => {
    if (response.status() >= 400) console.log('HTTP', response.status(), response.url())
  })
  page.on('pageerror', error => console.log('PAGE ERROR', error.message))
  await page.route('**/__address-editor.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html data-theme="hype-light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/addressEditorCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__address-editor.html')
  const display = page.getByRole('textbox', { name: 'Display address', exact: true })
  await display.waitFor({ timeout: 60000 })
  await page.screenshot({
    path: 'output/playwright/address-editor.png',
    fullPage: true,
  })
  const bounds = await page
    .locator('[data-address-details], [data-address-divisions]')
    .evaluateAll(elements =>
      elements.map(element => element.getBoundingClientRect().toJSON()),
    )
  if (bounds.length !== 2 || bounds[1].x <= bounds[0].x)
    throw Error('Expected two columns')
  await page.getByRole('button', { name: 'Write a custom display address' }).click()
  await display.fill('My entrance')
  await page.getByRole('button', { name: 'Generate from components' }).click()
  if ((await display.inputValue()) !== '25 LYNDHURST TERRACE')
    throw Error('Display reset failed')
  await page.getByRole('button', { name: 'Street name', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Street name: Search names' })
    .fill('Lyndhurst')
  await page.getByRole('button', { name: /LYNDHURST TERRACE.*CW/ }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: 'output/playwright/address-editor-mobile.png',
    fullPage: true,
  })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  )
  if (overflow) throw Error('Mobile horizontal overflow')
  console.log(
    JSON.stringify({
      columns: bounds,
      customDisplay: true,
      streetCatalogue: true,
      mobileOverflow: false,
    }),
  )
} finally {
  await browser.close()
}
