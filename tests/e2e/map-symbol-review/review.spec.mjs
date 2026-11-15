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
    const preview = page.getByRole('checkbox', { name: 'Preview proposed colours' })
    const atm = list
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'ATM', exact: true }) })
    await expect(atm.locator('path')).toHaveAttribute('stroke', '#0369a1')
    await preview.check()
    await expect(atm.locator('path')).toHaveAttribute('stroke', '#92400e')
    await preview.uncheck()
    await expect(atm.locator('path')).toHaveAttribute('stroke', '#0369a1')
    const total = await list.locator('li').count()
    const atmReference = await atm.locator('span').innerText()
    const shopping = page.getByRole('button', {
      name: 'Shopping & transactions',
      exact: true,
    })
    await shopping.click()
    await expect(shopping).toHaveAttribute('aria-pressed', 'true')
    const filtered = page.getByRole('list', {
      name: 'Shopping & transactions map symbols',
    })
    await expect(filtered.locator('li')).toHaveCount(6)
    await expect(
      filtered.getByRole('heading', { name: 'Ticket machine', exact: true }),
    ).toBeVisible()
    await expect(
      filtered.getByRole('heading', { name: 'Police', exact: true }),
    ).toHaveCount(0)
    await expect(
      filtered.getByRole('heading', { name: 'Paid area', exact: true }),
    ).toHaveCount(0)
    const filteredAtm = filtered
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'ATM', exact: true }) })
    await expect(filteredAtm.locator('span')).toHaveText(atmReference)
    await preview.check()
    await expect(filtered.locator('li')).toHaveCount(6)
    await expect(filteredAtm.locator('path')).toHaveAttribute('stroke', '#92400e')
    const police = page.getByRole('button', { name: 'Police & security', exact: true })
    await police.click()
    const policeList = page.getByRole('list', { name: 'Police & security map symbols' })
    await expect(policeList.locator('li')).toHaveCount(3)
    await expect(
      policeList.getByRole('heading', { name: 'Police sign-in box', exact: true }),
    ).toBeVisible()
    await police.press('Enter')
    await expect(list.locator('li')).toHaveCount(total)
    await shopping.click()
    await page.getByRole('button', { name: 'All categories', exact: true }).click()
    await expect(list.locator('li')).toHaveCount(total)
    await preview.uncheck()
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
