import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

for (const width of [1440, 390]) {
  test(`Quarry Bay selection has no blank overscroll at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(
      '/premises/quarry-bay-mtr/places/4be8db61-a107-42e7-b3a6-1823a0b55b68',
    )
    const card = page.getByRole('region', { name: 'Station place details' })
    await expect(card).toContainText('Stairs', { timeout: 60000 })
    const scroll = page.locator('[data-place-scroll]')
    await expect(async () => {
      const a = await card.boundingBox(),
        b = await scroll.boundingBox()
      expect(a.y).toBeGreaterThanOrEqual(b.y - 1)
      expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.height + 1)
    }).toPass()
    await scroll.evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }))
    await expect(async () => {
      const gap = await scroll.evaluate(
        el =>
          el.querySelector('[data-place-row]').getBoundingClientRect().top -
          el.getBoundingClientRect().top,
      )
      expect(gap).toBeGreaterThanOrEqual(-1)
      expect(gap).toBeLessThan(8)
    }).toPass()
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `quarry-scroll-top-${width}.png`),
    })
  })
}

test('covered polygons are absent from the directory and SVG targets', async ({
  page,
}) => {
  const pointer = await (
    await page.request.get('/api/premises-maps/quarry-bay-mtr')
  ).json()
  const bundle = await (await page.request.get(pointer.url)).json()
  const unit = bundle.data.unit_polygon.features.find(
    f => f.properties.unit_id === '74867253-712c-4bdd-abec-92d1e608f2e1',
  )
  const covered = structuredClone(unit)
  covered.properties.unit_id = 'covered-regression-polygon'
  covered.properties.unit_name_en = 'Covered regression polygon'
  covered.properties.unit_category = 'room'
  bundle.data.unit_polygon.features.unshift(covered)
  const body = JSON.stringify(bundle)
  const hash = createHash('sha256').update(body).digest('hex')
  await page.route('**/api/premises-maps/quarry-bay-mtr', route =>
    route.fulfill({ json: { ...pointer, hash } }),
  )
  await page.route(pointer.url, route =>
    route.fulfill({ body, contentType: 'application/json' }),
  )
  await page.goto(
    '/premises/quarry-bay-mtr/places/4be8db61-a107-42e7-b3a6-1823a0b55b68',
  )
  await expect(
    page.getByRole('region', { name: 'Station place details' }),
  ).toContainText('Stairs', { timeout: 60000 })
  await expect(
    page.locator('[data-unit-target="74867253-712c-4bdd-abec-92d1e608f2e1"]'),
  ).toHaveCount(1)
  await expect(
    page.locator('[data-unit-target="covered-regression-polygon"]'),
  ).toHaveCount(0)
  await expect(
    page.locator('[data-place-row="covered-regression-polygon"]'),
  ).toHaveCount(0)
})
