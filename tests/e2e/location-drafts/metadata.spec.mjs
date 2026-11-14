import { test, expect } from '@playwright/test'
import { join } from 'node:path'
// Managed runner supplies the evidence directory.
const output = process.env.DEV_RUNNER_ARTIFACTS

test('shared canonical draft metadata changes to published without changing its identity', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/admin(?:\/|$)/)
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await page.route('**/__canonical-draft.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en" data-theme="hype-dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/canonicalDraftMetadataCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('/__canonical-draft.html')
  await expect(page.getByText('Upstream draft', { exact: true })).toBeVisible()
  await expect(page.getByText('Not yet published', { exact: true })).toBeVisible()
  await page.screenshot({ path: join(output, 'canonical-draft-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('Upstream draft', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
  await page.screenshot({ path: join(output, 'canonical-draft-mobile.png') })
  await page.getByRole('button', { name: 'Simulate publication' }).click()
  await expect(page.getByText('Upstream draft', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Not yet published', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Matched', { exact: true })).toBeVisible()
})

test('onboarded station is a real shared editable draft', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/locations/fCrC6I7ziH9W', { waitUntil: 'domcontentloaded' })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page.getByText('Upstream draft', { exact: true })).toBeVisible({
    timeout: 60000,
  })
  await expect(page.getByText('Not yet published', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await page.screenshot({ path: join(output, 'canonical-draft-real-station.png') })
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('Upstream draft', { exact: true })).toBeVisible()
})
