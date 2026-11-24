import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test.use({
  viewport: { width: 1440, height: 900 },
  launchOptions: {
    args: [
      '--ozone-platform=x11',
      `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`,
      '--disable-web-security',
    ],
  },
})

test('Flat B opens its linked first-floor polygon beside the street map', async ({
  page,
}) => {
  test.setTimeout(300_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/admin(?:\/features)?\/?$/)
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  let streetTiles = 0
  page.on('response', response => {
    if (response.ok() && new URL(response.url()).pathname.endsWith('.mvt'))
      streetTiles++
  })
  await page.goto('/admin/locations/6gHhJVZ2NKwB', { waitUntil: 'domcontentloaded' })
  const indoor = page.locator('[data-location-indoor-map]')
  const selected = indoor.locator(
    '[data-station-level="first"] [data-selection-outline="first-right-well"]',
  )
  const outdoor = page.locator('[data-location-context-map]')
  await expect(selected).toBeVisible({ timeout: 120_000 })
  await expect.poll(() => streetTiles, { timeout: 90_000 }).toBeGreaterThan(0)
  await expect(outdoor.getByTestId('map')).toHaveCSS('opacity', '1')
  await expect(outdoor.locator('.maplibregl-marker').first()).toBeInViewport()
  const left = await indoor.boundingBox()
  const right = await outdoor.boundingBox()
  expect(left.width).toBeGreaterThan(0)
  expect(right.width).toBeGreaterThan(0)
  expect(left.x + left.width).toBeCloseTo(right.x, 0)
  expect(left.y).toBeCloseTo(right.y, 0)
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'flat-b.png'),
    })
  await page.getByRole('button', { name: 'Expand indoor map' }).click()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(indoor.locator('[data-station-scene="exploded"]')).toBeVisible()
  await page.getByRole('button', { name: 'Collapse indoor map' }).click()
  await expect(indoor.locator('[data-station-scene="plan"]')).toBeVisible()
  await expect(selected).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/locations\/6gHhJVZ2NKwB$/)
})
