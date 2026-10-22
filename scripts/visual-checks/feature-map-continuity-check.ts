import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 1050 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(
    `${process.env.FEATURE_CHECK_URL ?? 'http://127.0.0.1:4173'}/admin/features/new`,
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  )
  const find = page.getByRole('button', { name: 'Find an existing Place', exact: true })
  await find.waitFor({ timeout: 60000 })
  const preview = page.locator('.bits-feature-editor__visual')
  const map = preview.locator('[data-testid="map"]')
  await map.waitFor({ state: 'attached', timeout: 60000 })
  await map
    .locator('canvas.maplibregl-canvas')
    .waitFor({ state: 'attached', timeout: 60000 })
  const element = await map.elementHandle()
  const canvas = await map.locator('canvas.maplibregl-canvas').elementHandle()
  const height = await preview.evaluate(e => e.getBoundingClientRect().height)
  await page.getByRole('button', { name: 'Location', exact: true }).click()

  await page
    .getByRole('textbox', { name: 'Search for a Location', exact: true })
    .waitFor({ timeout: 5000 })
  const locationHeight = await preview.evaluate(e => e.getBoundingClientRect().height)
  if (height !== locationHeight)
    throw Error(`Map height changed: ${height} -> ${locationHeight}`)
  if (!(await element?.evaluate(e => e.isConnected)))
    throw Error('Map was unmounted on Location')
  if ((await page.locator('[data-testid="map"]').count()) !== 1)
    throw Error('Duplicate map containers')
  const transition = await page
    .locator('[data-facet-id="address"]')
    .evaluate(e => ({
      properties: getComputedStyle(e).transitionProperty,
      duration: getComputedStyle(e).transitionDuration,
    }))
  if (!transition.properties.includes('transform') || transition.duration !== '0.3s')
    throw Error(JSON.stringify(transition))
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Search for a Location', exact: true })
    .waitFor({ state: 'hidden' })
  if (
    !(await element?.evaluate(e => e.isConnected)) ||
    !(await canvas?.evaluate(e => e.isConnected))
  )
    throw Error('Map or canvas was unmounted on Profile')
  await page.screenshot({
    path: 'output/playwright/shared-feature-map.png',
    fullPage: true,
  })
  if (errors.length) throw Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      authenticated: true,
      height,
      locationHeight,
      sameMapElement: true,
      transition,
      errors,
    }),
  )
} finally {
  await browser.close()
}
