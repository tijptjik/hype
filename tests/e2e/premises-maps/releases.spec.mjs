import { test, expect } from '@playwright/test'

test('published R2 releases and authenticated connection editing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/premises-maps')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(
    page.getByRole('heading', { name: 'Premises maps', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toBeEnabled()
  const catalogue = await (await page.request.get('/api/premises-maps')).json()
  expect(catalogue.length).toBeGreaterThan(0)
  const map = catalogue.find(m => m.kind === 'station') ?? catalogue[0]
  const pointer = await page.request.get(`/api/premises-maps/${map.id}`)
  expect(pointer.headers()['cache-control']).toBe('no-store')
  const current = await pointer.json()
  const release = await page.request.get(current.url)
  expect(release.ok()).toBe(true)
  expect(release.headers()['cache-control']).toContain('immutable')
  const bundle = await release.json()
  expect(bundle.schemaVersion).toBe(1)
  expect(Array.isArray(bundle.data.connections)).toBe(true)
  await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption(map.id)
  await expect(
    page.getByRole('heading', { name: 'Floor connections', exact: true }),
  ).toBeVisible()
  await expect(page.locator('[data-connection-map]')).toBeVisible()
  await page.locator('[data-facility][data-state="Linked"]').first().click()
  const enabled = page.getByRole('checkbox', { name: 'Enabled', exact: true }).first()
  await expect(enabled).toBeVisible()
  await enabled.uncheck()
  await expect(
    page.getByRole('button', { name: 'Save draft', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: 'Publish saved draft', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Discard unsaved edits', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save draft', exact: true }),
  ).toBeDisabled()
  // Exercise a new cross-floor pair without saving changes to the user's draft.
  await page.locator('[data-facility][data-state="Linked"]').first().click()
  const floor = page.getByRole('combobox', { name: 'Floor', exact: true })
  const availableFloor = await floor
    .locator('option')
    .evaluateAll(
      options =>
        options.find(option => /\([1-9]\d* available\)/.test(option.textContent))
          ?.value,
    )
  expect(availableFloor).toBeTruthy()
  await floor.selectOption(availableFloor)
  await page.locator('[data-facility][data-state="Available"]').first().click()
  await expect(
    page.getByText('Connection added to draft. Publish to verify it.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save draft', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Discard unsaved edits', exact: true }).click()
  await page.goto(`/premises/${map.id}`)
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  const legacy = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter(r => new URL(r.name).pathname.startsWith('/indoor/'))
      .map(r => r.name),
  )
  expect(legacy).toEqual([])
})
