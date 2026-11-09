import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1100 },
    permissions: ['geolocation'],
    geolocation: { longitude: 114.142, latitude: 22.285 },
  })
  const page = await context.newPage()
  const errors: string[] = []
  const nearbyRequests: URL[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.includes('/addresses/v1/geocode') && url.searchParams.has('lng'))
      nearbyRequests.push(url)
  })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(
    `${process.env.FEATURE_CHECK_URL ?? 'http://127.0.0.1:4173'}/admin/features/new`,
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  )
  await page
    .locator('canvas.maplibregl-canvas')
    .waitFor({ state: 'attached', timeout: 60000 })
  await page
    .getByRole('button', { name: 'Find an existing Place', exact: true })
    .click()
  const search = page.getByRole('textbox', {
    name: 'Search for a Location',
    exact: true,
  })
  await search.waitFor()
  await page.getByRole('button', { name: 'Shops', exact: true }).click()
  const activeIcon = page.getByRole('button', { name: 'Address', exact: true })
  if (
    (await activeIcon.evaluate(e => getComputedStyle(e).color)) !== 'rgb(255, 255, 255)'
  )
    throw Error('Active icon is not white')
  await search.fill('Sai Ying Pun')
  const rows = page.locator('[data-result-id]')
  await rows.first().waitFor({ timeout: 45000 })
  const id = await rows.first().getAttribute('data-result-id')
  const marker = page.locator(`[data-location-candidate="${id}"]`)
  await marker.waitFor()
  const element = await marker.elementHandle()
  const count = await page.locator('[data-location-candidate]').count()
  if (count < 2) throw Error('Need multiple previews')
  const themed = await marker.evaluate(
    e => e.classList.contains('bg-primary') && !e.className.includes('amber'),
  )
  if (!themed) throw Error('Preview does not follow primary theme')
  await search.focus()
  await page.keyboard.press('Tab')
  if (
    (await page.evaluate(() =>
      document.activeElement?.getAttribute('data-result-id'),
    )) !== id
  )
    throw Error('Tab missed first result')
  await page.keyboard.press('Shift+Tab')
  if (!(await search.evaluate(e => e === document.activeElement)))
    throw Error('Shift Tab missed search')
  await rows
    .first()
    .locator('[data-address-part="locality"]')
    .first()
    .waitFor({ timeout: 15000 })
  const parts = await rows.first().locator('[data-address-part]').allTextContents()
  if (!(await rows.first().locator('[data-address-part="street"]').count()))
    throw Error('Missing street block')
  await rows.first().click()
  await page.waitForTimeout(350)
  if (
    !(await element?.evaluate(
      e => e.isConnected && getComputedStyle(e).opacity === '1',
    ))
  )
    throw Error('Selected marker replaced')
  if ((await page.locator('[data-location-candidate]').count()) !== count)
    throw Error('Preview markers removed')
  const opacity = await page
    .locator('[data-location-candidate]')
    .evaluateAll(elements => elements.map(e => getComputedStyle(e).opacity))
  if (opacity.filter(value => value === '0').length !== count - 1)
    throw Error('Other markers did not fade: ' + JSON.stringify(opacity))
  await page.getByRole('button', { name: 'Back to results', exact: true }).click()
  await page.waitForTimeout(400)
  if (!(await element?.evaluate(e => e.isConnected)))
    throw Error('Back replaced markers')
  if (
    (await page
      .locator('[data-location-candidate]')
      .evaluateAll(elements =>
        elements.every(e => getComputedStyle(e).opacity === '1'),
      )) !== true
  )
    throw Error('Back did not fade markers in')
  await page.getByRole('button', { name: 'Drop Pin', exact: true }).click()
  const nearby = page.getByRole('button', { name: 'Search Nearby', exact: true })
  await nearby.waitFor({ timeout: 20000 })
  const radius = page.getByRole('slider', { name: 'Search radius', exact: false })
  await radius.waitFor()
  await radius.fill('500')
  await nearby.click()
  await rows.first().waitFor({ timeout: 45000 })
  if (
    !nearbyRequests.some(
      url =>
        url.searchParams.get('lng') === '114.142' &&
        url.searchParams.get('lat') === '22.285' &&
        url.searchParams.get('maxDistance') === '500',
    )
  )
    throw Error('Nearby did not use device coordinates and selected radius')
  await page.screenshot({
    path: 'output/playwright/feature-discovery-motion.png',
    fullPage: true,
  })
  if (errors.length) throw Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      retainedMarkers: count,
      themed,
      structuredParts: parts,
      tabOrder: true,
      nearby: true,
      errors,
    }),
  )
} finally {
  await browser.close()
}
