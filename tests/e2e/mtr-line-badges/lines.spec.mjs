import { test, expect } from '@playwright/test'
import { join } from 'node:path'

for (const width of [1440, 390]) {
  test(`station line squares align right at ${width}px`, async ({ page }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/premises/kennedy-town-mtr')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const input = page.locator('#omni-search-bar')
    await expect(input).toBeVisible({ timeout: 90000 })
    await input.fill('ADM')
    const row = page
      .locator('[data-omni-section="station"] [data-omni-entry]')
      .filter({ hasText: 'Admiralty' })
    await expect(row).toBeVisible()
    await expect(row).not.toContainText('ADM')
    const squares = row.locator('[data-station-line]')
    await expect(squares).toHaveCount(4)
    expect(
      await squares.evaluateAll(nodes => nodes.map(node => node.dataset.stationLine)),
    ).toEqual(['TWL', 'ISL', 'SIL', 'EAL'])
    await expect(row.getByRole('img', { name: 'Tsuen Wan Line' })).toHaveCSS(
      'background-color',
      'rgb(226, 35, 26)',
    )
    const button = await row.getByRole('button').boundingBox()
    const badges = await row.locator('[data-station-lines]').boundingBox()
    expect(Math.abs(button.x + button.width - badges.x - badges.width)).toBeLessThan(2)
    const square = await squares.first().boundingBox()
    expect(square.width).toBe(square.height)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed Chrome evidence directory.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `mtr-lines-${width}.png`),
    })
    await row.getByRole('button').click()
    await expect(page).toHaveURL(/premises\/admiralty-mtr/)
  })
}
