import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import catalogue from '../../../src/lib/routing/mtr-catalog.json' with { type: 'json' }

for (const width of [1440, 390]) {
  test(`MTR walk and separate premises results at ${width}px`, async ({ page }) => {
    test.setTimeout(180000)
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/premises/kennedy-town-mtr')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const input = page.locator('#omni-search-bar')
    await expect(input).toBeVisible({ timeout: 90000 })
    await input.fill('MTR')
    await expect(
      page.getByRole('button', { name: /^MTR stations/ }).first(),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /Stations & malls/ })).toHaveCount(0)
    await page.getByRole('button', { name: /^Walks/ }).click()
    await page
      .getByRole('button', { name: /MTR stations/ })
      .last()
      .click()
    await expect(page).toHaveURL(/walk=mtr-stations/)
    const nav = page.locator('#omni-nav-bar')
    await expect(nav).toContainText(`1 of ${catalogue.stations.length}`)
    await expect(
      page.getByRole('button', { name: 'Previous', exact: true }),
    ).toBeDisabled()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(nav).toContainText(`2 of ${catalogue.stations.length}`)
    await page.reload()
    await expect(nav).toContainText(`2 of ${catalogue.stations.length}`, {
      timeout: 90000,
    })
    await page.getByRole('button', { name: 'Previous', exact: true }).click()
    await expect(nav).toContainText(`1 of ${catalogue.stations.length}`)
    await page.goBack()
    await expect(nav).toContainText(`2 of ${catalogue.stations.length}`)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    await nav.getByRole('button', { name: /MTR stations.*2 of/ }).click()
    const last = catalogue.stations.at(-1)
    await page
      .getByRole('button', { name: `${last.name} · ${last.nameZh}`, exact: true })
      .click()
    await expect(nav).toContainText(
      `${catalogue.stations.length} of ${catalogue.stations.length}`,
    )
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    await nav
      .getByRole('button', { name: /MTR stations/ })
      .filter({ hasText: `of ${catalogue.stations.length}` })
      .click()
    await page
      .getByRole('button', { name: 'Kennedy Town · 堅尼地城', exact: true })
      .click()
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 90000 })
    await expect(page.locator('[data-station-surface]')).toHaveAttribute(
      'aria-label',
      /Kennedy Town/,
    )
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed Chrome evidence directory.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `mtr-walk-${width}.png`),
    })
    await nav.locator('.omnibar-close-button').click()
    await expect(input).toBeVisible()
    await input.fill('Hysan')
    await expect(page.getByRole('button', { name: /^Malls/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^MTR stations/ })).toHaveCount(0)
  })
}
