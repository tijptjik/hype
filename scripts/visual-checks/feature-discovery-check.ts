import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(
    `${process.env.FEATURE_CHECK_URL ?? 'http://127.0.0.1:4173'}/admin/features/new`,
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  )
  await page
    .locator('canvas.maplibregl-canvas')
    .waitFor({ state: 'attached', timeout: 60000 })
  const find = page.getByRole('button', { name: 'Find an existing Place', exact: true })
  const avatar = page.locator('.bits-feature-visual__controls--left article img')
  if ((await avatar.evaluate(e => getComputedStyle(e).zIndex)) !== '10')
    throw Error('Avatar stacking order')
  await find.click()
  const search = page.getByRole('textbox', {
    name: 'Search for a Location',
    exact: true,
  })
  await search.waitFor({ timeout: 10000 })
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') === 'Search for a Location',
  )
  for (const controls of await page.locator('.bits-feature-visual__controls').all()) {
    await controls.evaluate(e => {
      if (!e.hasAttribute('inert')) throw Error('Overlay remains interactive')
    })
  }
  await page.waitForTimeout(250)
  for (const controls of await page.locator('.bits-feature-visual__controls').all()) {
    if ((await controls.evaluate(e => getComputedStyle(e).opacity)) !== '0')
      throw Error('Overlay remains visible')
  }
  await search.fill('lego')
  const rows = page.locator('[data-result-kind="establishment"]')
  await rows.first().waitFor({ timeout: 45000 })
  const titles = await rows.locator('span.font-semibold').allTextContents()
  if (titles.some(title => !title.trim())) throw Error('Blank result title')
  const selected = rows.filter({ hasText: 'LEGO Certified Store Times Square' })
  await selected.waitFor({ timeout: 10000 })
  const id = await selected.getAttribute('data-result-id')
  await selected.hover()
  const marker = page.locator(`[data-location-candidate="${id}"]`)
  await page.waitForFunction(
    id =>
      document
        .querySelector(`[data-location-candidate="${id}"]`)
        ?.getAttribute('data-highlighted') === 'true',
    id,
  )
  const outline = await marker.evaluate(e => getComputedStyle(e).outlineWidth)
  if (outline !== '4px') throw Error(`Marker outline ${outline}`)
  await selected.click()
  await page
    .getByText('Address supplied by the selected place.', { exact: true })
    .waitFor()
  const address = await page.locator('[data-source-address]').textContent()
  if (!address?.includes('Shop 902-3C, 9/F, Times Square, 1 Matheson St'))
    throw Error('Missing selected establishment address: ' + address)
  await page.getByRole('button', { name: 'Set Profile', exact: true }).waitFor()
  await page.waitForTimeout(1000)
  await page.screenshot({
    path: 'output/playwright/feature-place-selected.png',
    fullPage: true,
  })
  if (errors.length) throw Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      buttonNavigatesAndFocuses: true,
      overlaysInert: true,
      titles,
      hoverMarker: true,
      establishmentAddressVisible: true,
      footerProfile: true,
      errors,
    }),
  )
} finally {
  await browser.close()
}
