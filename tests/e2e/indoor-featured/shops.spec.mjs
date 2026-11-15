import { test, expect } from '@playwright/test'
import { join } from 'node:path'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: supplied by the managed runner.
const output = process.env.DEV_RUNNER_ARTIFACTS
test('restricts the live indoor scene and directory, then restores all shops', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  expect((await page.request.get('/admin')).ok()).toBe(true)
  await page.evaluate(async () => {
    const { mountHarness } = await import('/tests/e2e/indoor-featured/mount.ts')
    mountHarness()
  })
  const scope = page.locator('[data-shop-filter-harness]')
  const shops = scope.locator('[data-shop-id]')
  await expect.poll(() => shops.count()).toBeGreaterThan(1)
  const total = await shops.count()
  const facilities = await scope.locator('[data-facilities]').textContent()
  await scope.getByRole('button', { name: 'Toggle featured shops' }).click()
  await expect(shops).toHaveCount(1)
  await expect(shops).toHaveAttribute(
    'data-shop-id',
    '85dc0347-d11b-4c8c-9686-dc6697050317',
  )
  await expect(scope.locator('[data-facilities]')).toHaveText(facilities)
  await scope.getByRole('button', { name: 'Toggle matching feature' }).click()
  await expect(shops).toHaveCount(0)
  await expect(scope.locator('[data-shop-logo]')).toHaveCount(0)
  await expect(scope.locator('[data-unit-label]')).toHaveCount(0)
  await page.screenshot({ path: join(output, 'indoor-shops-filtered.png') })
  await scope.getByRole('button', { name: 'Toggle featured shops' }).click()
  await expect(shops).toHaveCount(total)
  await expect.poll(() => scope.locator('[data-shop-logo]').count()).toBeGreaterThan(0)
  await page.screenshot({ path: join(output, 'indoor-shops-restored.png') })
})
