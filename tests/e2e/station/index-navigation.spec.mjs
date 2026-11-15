import { publishedMap, currentMapArtwork } from './map-data.mjs'
import { test, expect } from '@playwright/test'

test('map index focuses facilities and cycles each match before wrapping', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/buildings/tko-plaza')
  const index = page.getByRole('list', { name: 'Map symbol legend' })
  await expect(index).toBeVisible({ timeout: 60000 })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const source = (await publishedMap(page, 'tko-plaza')).data.amenity_point
  const count = source.features.filter(
    f => f.properties.amenity_category === 'restroom.male',
  ).length
  const ids = []
  for (let i = 0; i <= count; i++) {
    const previous = page.url()
    await index.getByRole('button', { name: 'Find Male toilet', exact: true }).click()
    await expect(page).not.toHaveURL(previous)
    await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
    await expect(page.locator('[data-station-scene="plan"]')).toHaveAttribute(
      'data-camera-animating',
      'false',
    )
    await expect(
      page.getByRole('region', { name: 'Station place details' }),
    ).toContainText('Male Toilet')
    ids.push(page.url().split('/').at(-1))
  }
  expect(new Set(ids.slice(0, count)).size).toBe(count)
  expect(ids[count]).toBe(ids[0])
  await index.getByRole('button', { name: 'Find Information', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Station place details' }),
  ).toContainText('Information')
  const single = page.url()
  await index.getByRole('button', { name: 'Find Information', exact: true }).click()
  await expect(page).toHaveURL(single)
  await page.goto('/premises/kennedy-town-mtr')
  await expect(
    index.getByRole('button', { name: 'Paid area', exact: true }),
  ).toBeVisible()
  await index.getByRole('button', { name: 'Paid area', exact: true }).click()
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Station place details' }),
  ).toContainText('Paid area')
  await index.getByRole('button', { name: 'Level change', exact: true }).click()
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
})

test('selected shop outline stays above its artwork', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/buildings/tko-plaza')
  const bundle = await publishedMap(page, 'tko-plaza')
  const unit = bundle.data.unit_polygon.features.find(
    f => f.properties.unit_unitnumbername === 'L1-141',
  )
  const artwork = await currentMapArtwork(page, 'tko-plaza')
  test.skip(
    !artwork[unit?.properties.unit_id],
    'Requires a current canonical occupancy with approved brand artwork',
  )
  await expect(page.locator('[data-shop-logo="L1-141"]')).toBeVisible({
    timeout: 60000,
  })
  await page.locator('path[role="button"][aria-label="L1-141"]').click()
  const outline = page.locator('[data-selection-outline]')
  await expect(outline).toHaveCount(1)
  await expect(outline).toHaveAttribute('fill', 'none')
  expect(
    await outline.evaluate(el => {
      const floor = el.closest('[data-station-level]')
      const artwork = floor.querySelector('[data-shop-logo="L1-141"]')
      return Boolean(
        artwork.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
      )
    }),
  ).toBe(true)
})
