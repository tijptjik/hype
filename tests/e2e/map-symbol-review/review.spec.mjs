import { test, expect } from '@playwright/test'
import { join } from 'node:path'
for (const width of [1440, 390]) {
  test(`complete symbol review at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/map-symbols/review')
    await expect(page.getByRole('heading', { name: 'Map symbol review' })).toBeVisible()
    const list = page.getByRole('list', { name: 'All map symbols' })
    expect(await list.locator('li').count()).toBeGreaterThan(45)
    for (const label of [
      'ATM',
      'Corridor',
      'Accessible toilet',
      'Room',
      'Swimming pool',
      'Police',
      'Bank',
    ]) {
      await expect(
        list.getByRole('heading', { name: label, exact: true }),
      ).toBeVisible()
    }
    await list
      .getByRole('heading', { name: 'Unpaid area', exact: true })
      .scrollIntoViewIfNeeded()
    await expect(
      list.getByRole('heading', { name: 'Unpaid area', exact: true }),
    ).toBeInViewport()
    await page.locator('main').evaluate(el => {
      el.scrollTop = 0
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed evidence directory.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `symbol-review-${width}.png`),
      fullPage: true,
    })
  })
}
test('source corrections and Quarry Bay link resolve', async ({ page }) => {
  for (const [id, entity, expected] of [
    ['kwun-tong-mtr', '8cab49f4-dc48-4bb4-8d16-91c4233d4acc', 'corridor'],
    ['hung-hom-mtr', 'EF29CD20-3A03-4C8F-8466-ED7C4BFCD011', 'platform'],
  ]) {
    const meta = await (await page.request.get(`/api/premises-maps/${id}`)).json()
    const bundle = await (await page.request.get(meta.url)).json()
    expect(
      bundle.data.amenity_point.features.find(f => f.properties.amenity_id === entity)
        .properties.amenity_category,
    ).toBe(expected)
  }
  await page.goto(
    '/premises/quarry-bay-mtr/places/4be8db61-a107-42e7-b3a6-1823a0b55b68',
  )
  await expect(
    page.getByRole('region', { name: 'Station place details' }).getByRole('heading'),
  ).toHaveText('Stairs', { timeout: 60000 })
})
