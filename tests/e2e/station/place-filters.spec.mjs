import { test, expect } from '@playwright/test'
import { join } from 'node:path'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: supplied by the managed Chrome runner.
const output = process.env.DEV_RUNNER_ARTIFACTS

for (const width of [1440, 390]) {
  test(`station navigation and place filters at ${width}px`, async ({ page }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/premises/kennedy-town-mtr')
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const nav = page
      .getByRole('navigation')
      .filter({ has: page.getByRole('button', { name: 'Fit', exact: true }) })
    expect(
      (await nav.getByRole('button').allTextContents())
        .map(text => text.trim())
        .slice(0, 3),
    ).toEqual(['Amenities', 'Surroundings', 'Fit'])
    await page.getByRole('button', { name: 'Amenities', exact: true }).click()
    const index = page.locator('#station-location-index')
    await expect(index).toBeVisible()
    await page.getByRole('combobox', { name: 'Station level', exact: true }).click()
    await expect(
      page.getByRole('option', { name: 'All levels', exact: true }),
    ).toHaveCount(0)
    await page.getByRole('option', { name: 'Concourse', exact: true }).click()
    await expect(page.locator('[data-station-scene]')).toHaveAttribute(
      'data-station-scene',
      'plan',
    )
    await page.getByRole('button', { name: 'Show All', exact: true }).click()
    await expect(page.locator('[data-station-scene]')).toHaveAttribute(
      'data-station-scene',
      'exploded',
    )
    await expect(
      page.getByRole('combobox', { name: 'Station level', exact: true }),
    ).toContainText('Choose a level')
    const entries = index.getByRole('region', { name: 'Places', exact: true })
    const circulation = index.getByRole('checkbox', {
      name: 'Circulation',
      exact: true,
    })
    const amenities = index.getByRole('checkbox', { name: 'Amenities', exact: true })
    await expect(circulation).not.toBeChecked()
    await expect(amenities).toBeChecked()
    await expect(
      entries.getByRole('button', {
        name: /^(Corridor|Elevator|Escalator|Stairs|Entry|Faregate)/,
      }),
    ).toHaveCount(0)
    expect(
      await entries.getByRole('button', { name: /Defibrillator/ }).count(),
    ).toBeGreaterThan(0)
    await circulation.check()
    await expect(entries.getByRole('button', { name: /railway track/i })).toHaveCount(0)
    await expect(entries.getByRole('button', { name: /^Cuc /i })).toHaveCount(0)
    expect(
      await entries.getByRole('button', { name: /Customer Service Center/ }).count(),
    ).toBeGreaterThan(0)
    expect(
      await entries.getByRole('button', { name: /^Corridor/ }).count(),
    ).toBeGreaterThan(0)
    await amenities.uncheck()
    await expect(entries.getByRole('button', { name: /Defibrillator/ })).toHaveCount(0)
    expect(
      await entries.getByRole('button', { name: /^Corridor/ }).count(),
    ).toBeGreaterThan(0)
    await circulation.uncheck()
    await expect(entries.getByRole('button')).toHaveCount(0)
    await expect(entries).toContainText('No matching shops or facilities.')
    await amenities.check()
    await index.getByRole('searchbox', { name: 'Search places' }).fill('Corridor')
    await expect(entries.getByRole('button')).toHaveCount(0)
    await circulation.check()
    expect(
      await entries.getByRole('button', { name: /^Corridor/ }).count(),
    ).toBeGreaterThan(0)
    await index.getByRole('searchbox', { name: 'Search places' }).fill('')
    await circulation.uncheck()
    await expect(circulation).not.toBeChecked()
    await expect(amenities).toBeChecked()
    await page.screenshot({ path: join(output, `station-place-filters-${width}.png`) })
    const footer = await index.getByRole('group', { name: 'Place types' }).boundingBox()
    expect(footer.height).toBeLessThan(90)
    expect(footer.y + footer.height).toBeLessThanOrEqual(1000)
  })
}
