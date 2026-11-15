import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

test('Hysan Place provisional paths serve the published polygons', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin/)
  const pointerResponse = await page.request.get('/api/premises-maps/hysan-place')
  expect(pointerResponse.ok()).toBe(true)
  const pointer = await pointerResponse.json()
  expect(pointer.kind).toBe('building')
  const resource = await page.request.get(pointer.url)
  expect(resource.ok()).toBe(true)
  const bytes = await resource.body()
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(pointer.hash)
  const bundle = JSON.parse(bytes.toString())
  expect(bundle.data.level_polygon.features).toHaveLength(48)
  expect(bundle.data.unit_polygon.features).toHaveLength(2525)
  await page.goto('/buildings/hysan-place')
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  await expect(page.getByRole('navigation', { name: 'Indoor levels' })).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  expect((await page.request.get('/premises/unknown-provisional-map')).status()).toBe(
    404,
  )
  await page.screenshot({
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence directory.
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'hysan-provisional.png'),
  })
})
