import { test, expect } from '@playwright/test'
import { join } from 'node:path'

for (const height of [1000, 600]) {
  test(`level dropdown uses available height at ${height}px`, async ({ page }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width: 1440, height })
    await page.goto('/buildings/hysan-place')
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    await page.getByRole('button', { name: 'Amenities', exact: true }).click()
    const select = page.getByRole('combobox', { name: 'Venue level', exact: true })
    await select.click()
    const menu = page.getByRole('listbox')
    await expect(menu).toBeVisible()
    const bounds = await menu.boundingBox()
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height)
    if (height === 1000) expect(bounds.height).toBeGreaterThan(400)
    const visible = await menu.getByRole('option').evaluateAll(
      options =>
        options.filter(option => {
          const box = option.getBoundingClientRect()
          const menu = option.closest('[role="listbox"]').getBoundingClientRect()
          return box.top >= menu.top && box.bottom <= menu.bottom
        }).length,
    )
    if (height === 1000) expect(visible).toBeGreaterThan(7)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect(menu).not.toBeVisible()
    await expect(page.locator('[data-station-scene]')).toBeVisible()
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: supplied by managed runner.
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `level-dropdown-${height}.png`),
    })
  })
}
