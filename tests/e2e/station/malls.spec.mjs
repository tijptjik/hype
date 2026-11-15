import { publishedMap } from './map-data.mjs'
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: managed Chrome evidence directory.
const output = process.env.DEV_RUNNER_ARTIFACTS

test('Hysan floors and exact places, TKO official fallback, and MTR regression', async ({
  page,
}) => {
  test.setTimeout(240000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/buildings/hysan-place')
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible({
    timeout: 90000,
  })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(
    page.getByRole('heading', { name: 'Hysan Place', exact: true }),
  ).toBeVisible()
  const floor = page.getByRole('combobox', { name: 'Venue level' })
  await expect(floor.locator('option:checked')).toHaveText('Ground Floor')
  await page.screenshot({ path: join(output, 'hysan-ground.png') })
  await floor.selectOption({ label: '1st Floor' })
  await expect(page.locator('[data-station-level]')).toHaveCount(1)
  const bundle = await publishedMap(page, 'hysan-place')
  const unit = bundle.data.occupant_point.features[0].properties.unit_id
  await page.goto(`/buildings/hysan-place/places/${unit}`)
  await expect(page.getByRole('region', { name: 'Station place details' })).toBeVisible(
    { timeout: 90000 },
  )
  await page.reload()
  await expect(page.getByRole('region', { name: 'Station place details' })).toBeVisible(
    { timeout: 90000 },
  )
  await floor.selectOption('all')
  await expect(page.locator('[data-station-level]')).toHaveCount(48, { timeout: 60000 })
  await page.screenshot({ path: join(output, 'hysan-exploded.png') })
  await floor.selectOption({ label: 'Ground Floor' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Close station panel', exact: true }).click()
  await page.screenshot({ path: join(output, 'hysan-mobile.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
  await page.goto('/buildings/tko-plaza')
  await expect(
    page.getByRole('link', { name: 'Official floor directory' }).first(),
  ).toHaveAttribute('href', 'https://www.tkoplaza.com.hk/en/find-us?submenu=floor', {
    timeout: 60000,
  })
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible({
    timeout: 60000,
  })
  await page.screenshot({ path: join(output, 'tko-official-directory.png') })
  await page.goto('/premises/kennedy-town-mtr')
  await expect(page.locator('[data-station-level]')).toHaveCount(6, { timeout: 60000 })
})
