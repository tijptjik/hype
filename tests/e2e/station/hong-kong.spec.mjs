import { test, expect } from '@playwright/test'
import { join } from 'node:path'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: managed Chrome evidence directory.
const output = process.env.DEV_RUNNER_ARTIFACTS

test('Hong Kong station loads, drills down, shares and survives station switching', async ({
  page,
}) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/premises/hong-kong-mtr', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-station-level]')).toHaveCount(9, { timeout: 60000 })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(
    page.getByRole('heading', { name: 'Hong Kong', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: join(output, 'hong-kong-exploded.png') })
  await page.getByRole('searchbox', { name: 'Search station directory' }).fill('HOK4')
  await page
    .getByRole('button', { name: /HOK 4 / })
    .first()
    .click()
  await expect(page).toHaveURL(
    /\/premises\/hong-kong-mtr\/places\/f78b733e-3d9f-4674-b974-11cdc2dbc65a$/,
  )
  const details = page.getByRole('region', { name: 'Station place details' })
  await expect(details).toContainText('HOK 4')
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async text => {
          window.__copied = text
        },
      },
    }),
  )
  await page.getByRole('button', { name: 'Copy link', exact: true }).click()
  expect(await page.evaluate(() => window.__copied)).toBe(page.url())
  await page.reload()
  await expect(details).toContainText('HOK 4', { timeout: 60000 })
  await page.screenshot({ path: join(output, 'hong-kong-place.png') })
  await page.goto('/premises/kennedy-town-mtr')
  await expect(page.locator('[data-station-level]')).toHaveCount(6, { timeout: 60000 })
  await page.goBack()
  await expect(details).toContainText('HOK 4', { timeout: 60000 })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(output, 'hong-kong-mobile.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
})

test('Hong Kong outdoor footprint opens its own station', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto(
    '/?mapTracking=true&lng=114.1581&lat=22.2847&zoom=18&bearing=0&pitch=0',
  )
  const link = page.getByRole('link', { name: 'Open Hong Kong indoor map' })
  await expect(link).toBeAttached({ timeout: 60000 })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const closePanel = page.getByRole('button', { name: 'Close panel', exact: true })
  if (await closePanel.isVisible()) await closePanel.click()
  await expect(page.getByTestId('map')).toHaveAttribute('data-map-visual-ready', 'true')
  await expect(page.getByTestId('map')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: join(output, 'hong-kong-outdoor.png') })
  await page.mouse.click(600, 450)
  await expect(page).toHaveURL(/\/premises\/hong-kong-mtr$/, { timeout: 20000 })
  await expect(page.locator('[data-station-level]')).toHaveCount(9, { timeout: 60000 })
})

test('shared route planner resets between stations and reports missing connections', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/premises/hong-kong-mtr')
  await expect(page.locator('[data-station-level]')).toHaveCount(9, { timeout: 60000 })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await page.getByText('Route preview', { exact: true }).click()
  const origin = page.getByRole('combobox', { name: 'Route entrance' })
  const destination = page.getByRole('combobox', { name: 'Route destination' })
  await expect(origin.locator('option')).toHaveCount(8)
  await origin.selectOption('34cd14cc-e3a8-4488-9b75-70fb8b7af889')
  await destination.selectOption('f78b733e-3d9f-4674-b974-11cdc2dbc65a')
  await page.getByRole('button', { name: 'Highlight route', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('No verified route available', {
    timeout: 30000,
  })
  await expect(page.locator('[data-indoor-route]')).toHaveCount(0)
  await page.goto('/premises/kennedy-town-mtr')
  await expect(page.locator('[data-station-level]')).toHaveCount(6, { timeout: 60000 })
  await page.getByText('Route preview', { exact: true }).click()
  await expect(origin.locator('option')).toHaveCount(6)
  await expect(origin).toHaveValue('62bc962b-4b35-4b28-acc3-27a5e601b802')
  await destination.selectOption('85dc0347-d11b-4c8c-9686-dc6697050317')
  await page.getByRole('button', { name: 'Highlight route', exact: true }).click()
  await expect(page.locator('[data-indoor-route]')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[data-route-status]')).toContainText('Exit A → 7-Eleven')
})
