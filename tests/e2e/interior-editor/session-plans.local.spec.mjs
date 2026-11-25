import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('selects a residential floor and its kitchen in a published building on mobile', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const catalog = await (await page.request.get('/api/premises-maps')).json()
  const building = catalog.find(
    row => row.name === '30 Tak Ku Ling Road' && row.kind === 'building',
  )
  expect(building?.publishedHash).toBeTruthy()
  const pointer = await (
    await page.request.get('/api/premises-maps/' + building.id)
  ).json()
  const release = await (await page.request.get(pointer.url)).json()
  const units = release.data.unit_polygon.features
  const level = release.data.level_polygon.features.find(
    f => f.properties.level_name_en === '3/F',
  )
  const kitchen = units.find(
    f =>
      f.properties.level_id === level.properties.level_id &&
      f.properties.unit_category === 'kitchen',
  )
  expect(kitchen?.properties.canonical_location_id).toBeTruthy()
  await page.goto('/buildings/' + building.id, { waitUntil: 'domcontentloaded' })
  const levels = page.getByRole('navigation', { name: 'Indoor levels' })
  await expect(levels).toBeVisible({ timeout: 90_000 })
  const button = levels.getByRole('button', { name: '3/F', exact: true })
  if (!(await button.isVisible()))
    await levels.getByText('Levels', { exact: true }).click()
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  const parts = page.getByRole('region', { name: 'Building parts' })
  const select = parts.getByRole('button', {
    name: kitchen.properties.unit_name_en,
    exact: true,
  })
  if (!(await select.isVisible())) await parts.getByText('Floor index').click()
  await select.click()
  await expect(page).toHaveURL(
    new RegExp('/places/' + kitchen.properties.unit_id + '$'),
  )
  await expect(
    page.locator('[data-selection-outline="' + kitchen.properties.unit_id + '"]'),
  ).toBeVisible()
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'tak-ku-ling-mobile.png'),
    })
})

test('a fresh zoom-out at the floor limit returns the building to its exploded stack', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const catalog = await (await page.request.get('/api/premises-maps')).json()
  const building = catalog.find(
    row => row.name === '30 Tak Ku Ling Road' && row.kind === 'building',
  )
  await page.goto('/buildings/' + building.id, { waitUntil: 'domcontentloaded' })
  const levels = page.getByRole('navigation', { name: 'Indoor levels' })
  await expect(levels).toBeVisible({ timeout: 90_000 })
  await levels.getByRole('button', { name: '3/F', exact: true }).click()
  const scene = page.locator('[data-station-scene]')
  await expect(scene).toHaveAttribute('data-station-scene', 'plan')
  await scene.dispatchEvent('wheel', { deltaY: 10000 })
  await scene.dispatchEvent('wheel', { deltaY: 100 })
  await expect(scene).toHaveAttribute('data-station-scene', 'plan')
  await page.waitForTimeout(300)
  await scene.dispatchEvent('wheel', { deltaY: 100 })
  await expect(scene).toHaveAttribute('data-station-scene', 'exploded')
  await expect(
    levels.getByRole('button', { name: 'All', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await levels.getByRole('button', { name: '3/F', exact: true }).click()
  await expect(scene).toHaveAttribute('data-station-scene', 'plan')
})

test('freely orbits, pans and zooms an exploded building', async ({ page }) => {
  test.setTimeout(120_000)
  const catalog = await (await page.request.get('/api/premises-maps')).json()
  const building = catalog.find(
    row => row.name === '30 Tak Ku Ling Road' && row.kind === 'building',
  )
  await page.goto('/buildings/' + building.id, { waitUntil: 'domcontentloaded' })
  const scene = page.locator('[data-station-scene]')
  await page
    .getByRole('navigation', { name: 'Indoor levels' })
    .getByRole('button', { name: 'All', exact: true })
    .click({ timeout: 90_000 })
  await expect(scene).toHaveAttribute('data-station-scene', 'exploded', {
    timeout: 90_000,
  })
  await expect(scene).toHaveAttribute('data-station-transition', 'settled')
  const box = await scene.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const bearing = await scene.getAttribute('data-bearing')
  const tilt = await scene.getAttribute('data-tilt')
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 80, y + 40, { steps: 8 })
  await page.mouse.up()
  await expect(scene).not.toHaveAttribute('data-bearing', bearing)
  await expect(scene).not.toHaveAttribute('data-tilt', tilt)
  await expect(scene).toHaveAttribute('data-station-scene', 'exploded')
  const rotated = await scene.getAttribute('data-bearing')
  const view = await scene.getAttribute('viewBox')
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.move(x + 130, y + 60, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(scene).not.toHaveAttribute('viewBox', view)
  await expect(scene).toHaveAttribute('data-bearing', rotated)
  const panned = await scene.getAttribute('viewBox')
  await page.mouse.wheel(0, -200)
  await expect(scene).not.toHaveAttribute('viewBox', panned)
})
