import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

test('all 98 published MTR maps have valid resources and render locally', async ({
  page,
}) => {
  test.setTimeout(240000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin/)
  const catalogue = await (await page.request.get('/api/premises-maps')).json()
  const stations = catalogue.filter(map => map.kind === 'station')
  expect(stations).toHaveLength(98)
  for (let offset = 0; offset < stations.length; offset += 4) {
    await Promise.all(
      stations.slice(offset, offset + 4).map(async map => {
        const pointer = await (
          await page.request.get(`/api/premises-maps/${map.id}`)
        ).json()
        expect(pointer.hash).toBe(map.publishedHash)
        const response = await page.request.get(pointer.url)
        expect(response.ok(), map.id).toBe(true)
        const bytes = await response.body()
        expect(createHash('sha256').update(bytes).digest('hex'), map.id).toBe(
          pointer.hash,
        )
        const bundle = JSON.parse(bytes.toString())
        expect(bundle.data.level_polygon.features.length, map.id).toBeGreaterThan(0)
        expect(bundle.data.correctionIssues ?? [], map.id).toEqual([])
        if (map.code === 'KOT') {
          expect(
            bundle.data.level_polygon.features.find(
              level =>
                level.properties.level_id === 'd6e6d0d5-0ade-4999-9cb8-6f9166f92fcd',
            ).properties.level_name_en,
          ).toBe('Exit B Staircase')
          expect(bundle.data.connections).toHaveLength(12)
        }
      }),
    )
  }
  await page.goto('/premises/admiralty-mtr')
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  await expect(page.getByRole('navigation', { name: 'Indoor levels' })).toBeVisible()
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'mtr-admiralty-published.png'),
  })
  await page.goto('/premises/kowloon-tong-mtr')
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  await expect(
    page
      .locator('[data-floor-labels]')
      .getByRole('button', { name: 'Open Exit B Staircase', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'mtr-kowloon-tong-published.png'),
  })
})
