import { expect, test } from '@playwright/test'
import path from 'node:path'

for (const width of [1440, 1200]) {
  test(`inherited title opens its location at ${width}px`, async ({ page }) => {
    const artifacts = process.env.DEV_RUNNER_ARTIFACTS
    if (!artifacts) throw new Error('Run through dev-remote')
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/admin/features/blD6165d33e4')
    const session = await (await page.request.get('/api/auth/get-session')).json()
    expect(session.user.id).toBe('hype-local-agent-admin')
    const link = page
      .locator('[data-profile-field="title"] a[href^="/admin/locations/"]')
      .first()
    await expect(link).toBeVisible({ timeout: 60000 })
    await expect(link).toContainText('7-Eleven')
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^\/admin\/locations\/[^/]+$/)
    await link.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: path.join(artifacts, `title-link-${width}.png`),
    })
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(
      page.getByRole('heading', { name: 'Address', exact: true }).first(),
    ).toBeVisible()
  })
}
