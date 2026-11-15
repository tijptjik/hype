import { test, expect } from '@playwright/test'
import { join } from 'node:path'

for (const width of [1440, 390]) {
  test(`facility labels use consistent title case at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    await expect(page).toHaveURL(/\/admin/)
    await page.goto('/premises/kowloon-tong-mtr', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    await page.getByRole('button', { name: 'Amenities', exact: true }).click()
    const search = page.getByRole('searchbox', { name: 'Search places' })
    await expect(search).toBeVisible({ timeout: 60000 })
    await page.getByRole('checkbox', { name: 'Circulation', exact: true }).check()
    const list = page.getByRole('region', { name: 'Places', exact: true })
    for (const term of ['ramp', 'platform']) {
      await search.fill(term)
      const labels = list.locator('button > span.font-medium')
      await expect(labels.first()).toBeVisible()
      const names = await labels
        .filter({ hasText: new RegExp(`^${term}`, 'i') })
        .allTextContents()
      expect(names.length).toBeGreaterThan(0)
      for (const name of names) {
        expect(name).toMatch(term === 'ramp' ? /^Ramp(?:\b|$)/ : /^Platform(?:\b|$)/)
        expect(name).not.toMatch(/RAMP|PLATFORM/)
      }
    }
    await search.fill('ramp')
    await list.getByRole('button').first().click()
    await expect(
      page.getByRole('region', { name: 'Station place details' }).getByRole('heading'),
    ).toHaveText('Ramp')
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence directory.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `facility-labels-${width}.png`),
    })
  })
}
