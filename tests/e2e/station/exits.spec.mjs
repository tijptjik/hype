import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { selectIndoorLevel } from './map-data.mjs'

for (const width of [1440, 390]) {
  test(`Kowloon Tong exit labels select source places at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/premises/kowloon-tong-mtr')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const admin = await page.request.get('/admin')
    expect(admin.ok()).toBe(true)
    expect(new URL(admin.url()).pathname).toMatch(/^\/admin(?:\/|$)/)
    const scene = page.locator('[data-station-scene]')
    await expect(scene).toBeVisible({ timeout: 60000 })
    await selectIndoorLevel(page, 'Concourse')
    await expect(scene).toHaveAttribute('data-station-transition', 'settled')
    const marker = page.locator('[data-station-exit][data-exit-label="H"]')
    await expect(marker).toBeVisible()
    await expect(marker).toHaveAttribute('aria-label', 'Exit H')
    await expect(marker.locator('[data-exit-background]')).toHaveAttribute(
      'fill',
      '#28786a',
    )
    await expect(marker.locator('image')).toHaveCount(0)
    await expect(marker.locator('text').first()).toHaveAttribute(
      'font-family',
      'Geologica, sans-serif',
    )
    const sourceId = await marker.getAttribute('data-station-exit')
    await marker.click()
    await expect(page).toHaveURL(new RegExp(`/${sourceId}$`))
    await expect(
      page.getByRole('region', { name: 'Station place details' }),
    ).toContainText('Exit H')
    await page.reload()
    await expect(page.locator(`[data-station-exit="${sourceId}"]`)).toBeVisible({
      timeout: 60000,
    })
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence directory.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `station-exits-${width}.png`),
    })
  })
}

test('Tsim Sha Tsui uses equal-width D, D3 and R exit signs', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/premises/tsim-sha-tsui-mtr')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const admin = await page.request.get('/admin')
  expect(admin.ok()).toBe(true)
  expect(new URL(admin.url()).pathname).toMatch(/^\/admin(?:\/|$)/)
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  await selectIndoorLevel(page, 'Concourse')
  const backgrounds = []
  for (const label of ['D', 'D3', 'R']) {
    const marker = page.locator(`[data-station-exit][data-exit-label="${label}"]`)
    await expect(marker).toBeVisible()
    backgrounds.push(
      await marker.locator('[data-exit-background]').getAttribute('width'),
    )
    await expect(marker.locator('text').first()).toHaveAttribute(
      'font-family',
      'Geologica, sans-serif',
    )
  }
  expect(new Set(backgrounds).size).toBe(1)
  await expect(page.locator('[data-exit-label="D3"] [data-exit-suffix]')).toHaveText(
    '3',
  )
  await page.screenshot({
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence directory.
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'tsim-sha-tsui-green-exits.png'),
  })
})
