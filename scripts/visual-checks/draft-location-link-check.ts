import { chromium, firefox } from 'playwright'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 600 } })
    await page.route('**/__location-link.html*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/draftLocationLinkCheck.ts"></script></body></html>',
      }),
    )
    await page.route('**/admin/locations/bakery', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Location details target</h1>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__location-link.html')
    const link = page.getByRole('link', { name: 'A1 Bakery' })
    await link.waitFor()
    if ((await link.getAttribute('href')) !== '/admin/locations/bakery')
      throw new Error('Wrong Location identity')
    if (
      !(
        await link
          .locator('span')
          .evaluate(element => getComputedStyle(element).textDecorationLine)
      ).includes('underline')
    )
      throw new Error('Missing link affordance')
    await link.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL('**/admin/locations/bakery')
    await page.route('**/admin/locations/building/garden?*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Building details target</h1>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__location-link.html?building=1')
    const building = page.getByRole('link', { name: 'Garden Bakery' })
    await building.waitFor()
    if (
      (await building.getAttribute('href')) !==
      '/admin/locations/building/garden?release=r1&address=second'
    )
      throw new Error('Building target lost its source identity')
    await building.click()
    await page.waitForURL(
      '**/admin/locations/building/garden?release=r1&address=second',
    )
    console.log(
      `${name}: existing Location and building-catalogue names both navigate to details`,
    )
  } finally {
    await browser.close()
  }
}
