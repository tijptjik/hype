import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('optional source network routes from Exit G1 across floors and clears on policy change', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/premises/kowloon-tong-mtr')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const admin = await page.request.get('/admin')
  expect(admin.ok()).toBe(true)
  expect(new URL(admin.url()).pathname).toMatch(/^\/admin(?:\/|$)/)
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  await page.getByRole('button', { name: 'Route preview', exact: true }).click()
  const enabled = page.getByRole('checkbox', {
    name: 'Use detailed station paths (experimental)',
  })
  await expect(enabled).not.toBeChecked()
  await enabled.check()
  await page
    .getByRole('combobox', { name: 'Route entrance' })
    .selectOption('fa23dc3f-79c5-4e7d-bed2-6a831676a827')
  await page
    .getByRole('combobox', { name: 'Route destination' })
    .selectOption('85cb0252-e378-45d9-9cfd-7cfb76f3f309')
  await page.getByRole('button', { name: 'Show route', exact: true }).click()
  await expect(page.locator('[data-route-status]')).toContainText('Exit G1', {
    timeout: 30000,
  })
  await expect(page.locator('[data-route-status]')).toContainText('LBuy')
  await expect(page.locator('[data-indoor-route]').first()).toBeVisible()
  await page.screenshot({
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence directory.
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'source-network-route.png'),
  })
  await page
    .getByRole('combobox', { name: 'Paid-area policy' })
    .selectOption('unpaid-only')
  await expect(page.locator('[data-route-status]')).toHaveCount(0)
})
