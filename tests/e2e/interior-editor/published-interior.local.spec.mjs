import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('published South Mansion floor index opens the flat on its own floor', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const maps = await (await page.request.get('/api/premises-maps')).json()
  const map = maps.find(
    item => item.name === 'South Mansion' && item.kind === 'building',
  )
  expect(map?.publishedHash).toBeTruthy()
  await page.goto('/buildings/' + map.id, { waitUntil: 'domcontentloaded' })
  const levels = page.getByRole('navigation', { name: 'Indoor levels' })
  const selectFloor = levels.getByRole('button', { name: '2/F', exact: true })
  await expect(levels).toBeVisible({ timeout: 90_000 })
  if (!(await selectFloor.isVisible()))
    await levels.getByText('Levels', { exact: true }).click()
  await selectFloor.click()
  await expect(page.locator('[data-unit-label="Flat A, 2/F"]')).toBeVisible()
  await expect(
    page
      .locator('[data-floor-transition]')
      .filter({ has: page.locator('[data-station-level="ground"]') }),
  ).toHaveCount(0)
  const scene = page.locator(
    '[data-station-scene="plan"] [data-station-level="second"]',
  )
  for (const label of ['UP', 'DN'])
    await expect(scene.locator('[data-stair-flight="' + label + '"]')).toBeVisible()
  await expect(
    scene.locator('g[role=button][aria-label="Flat A · Kitchen"]'),
  ).toBeVisible()
  await expect(
    scene.locator('g[role=button][aria-label="Flat B · Lavatory"]'),
  ).toBeVisible()
  const index = page.getByRole('region', { name: 'Building parts' })
  const unit = index.getByRole('button', {
    name: 'Flat B · Living and dining room',
    exact: true,
  })
  if (!(await unit.isVisible())) await index.getByText('Floor index').click()
  await expect(index.locator('li')).toHaveCount(15)
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'published-interior.png'),
    })
  await unit.click()
  await expect(page).toHaveURL(/\/places\/[^/]+-right-living$/)
  await expect(
    page
      .locator('[data-station-scene="plan"]')
      .locator('[data-selection-outline$="-right-living"]'),
  ).toBeVisible()
})

test('narrow public viewer switches floors and opens the floor index', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const maps = await (await page.request.get('/api/premises-maps')).json()
  const map = maps.find(
    item => item.name === 'South Mansion' && item.kind === 'building',
  )
  expect(map?.publishedHash).toBeTruthy()
  await page.goto('/buildings/' + map.id, { waitUntil: 'domcontentloaded' })
  const levels = page.getByRole('navigation', { name: 'Indoor levels' })
  const level = levels.getByRole('button', { name: '3/F', exact: true })
  await expect(levels).toBeVisible({ timeout: 90_000 })
  if (!(await level.isVisible()))
    await levels.getByText('Levels', { exact: true }).click()
  await level.click()
  await expect(level).toHaveAttribute('aria-pressed', 'true')
  await expect(levels.locator('details').first()).not.toHaveAttribute('open', '')
  const floor = page.locator('[data-station-level="third"]')
  await expect(floor.locator('[data-unit-label="Flat B, 3/F"]')).toBeVisible()
  await expect(floor.locator('[data-stair-flight="DN"]')).toBeVisible()
  await expect(page.locator('[data-floor-transition="ground"]')).toHaveCount(0)
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'south-mansion-mobile.png'),
    })
  const index = page.getByRole('region', { name: 'Building parts' })
  const unit = index.getByRole('button', { name: 'Flat A · Kitchen' })
  if (!(await unit.isVisible())) await index.getByText('Floor index').click()
  await unit.click()
  await expect(page).toHaveURL(/\/places\/third-left-kitchen$/)
  await expect(
    page.locator('[data-selection-outline="third-left-kitchen"]'),
  ).toBeVisible()
})
