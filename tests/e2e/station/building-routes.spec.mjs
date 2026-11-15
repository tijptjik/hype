import { test, expect } from '@playwright/test'
import { join } from 'node:path'

for (const width of [1440, 390]) {
  test(`building canonical entry and history at ${width}px`, async ({ page }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/buildings/hysan-place?pitch=60&mapTracking=true')
    await expect(page).toHaveURL(/\/buildings\/hysan-place\?pitch=60&mapTracking=true/)
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    await page.getByRole('button', { name: 'Surroundings', exact: true }).click()
    await expect(page.locator('[data-map-visual-ready="true"]')).toBeVisible({
      timeout: 60000,
    })
    await expect(page).toHaveURL(url => url.pathname === '/', { timeout: 60000 })
    await page.goBack()
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    await expect(page).toHaveURL(/\/buildings\/hysan-place/)
    await page.reload()
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner artifact directory.
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `building-route-${width}.png`),
    })
    const invalid = await page.request.get('/buildings/kennedy-town-mtr')
    expect(invalid.status()).toBe(404)
    const unknown = await page.request.get('/buildings/not-a-map')
    expect(unknown.status()).toBe(404)
    const place = '00000000-0000-0000-0000-000000000000'
    for (const path of [
      '/premises/hysan-place',
      `/premises/hysan-place/places/${place}?pitch=45`,
    ]) {
      const oldLink = await page.request.get(path, { maxRedirects: 0 })
      expect(oldLink.status()).toBe(404)
      expect(oldLink.headers().location).toBeUndefined()
    }
  })
}
