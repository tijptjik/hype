import { test, expect } from '@playwright/test'
import { join } from 'node:path'
test('local catalogue shows candidate logos, provenance and editable fallback controls', async ({
  page,
}) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(30000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/catalogue?id=mtr-brand-mos-burger', {
    waitUntil: 'domcontentloaded',
  })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/admin\/catalogue/)
  const library = page.getByRole('region', { name: 'Logo library' })
  await expect(library).toBeVisible({ timeout: 60000 })
  await expect(library).toContainText('Needs review')
  const source = library.locator('[data-artwork-slot="logo"] img')
  await expect(source).toBeVisible()
  const originalSrc = await source.getAttribute('src')
  expect(await source.evaluate(img => img.complete && img.naturalWidth === 512)).toBe(
    true,
  )
  await library.getByText('Research sources', { exact: true }).click()
  await expect(library.getByRole('link', { name: 'ownership ↗' })).toBeVisible()
  await library.getByText('Marker fallback preview', { exact: true }).click()
  await library.getByLabel('Theme code').fill('null-space')
  await library
    .getByRole('combobox', { name: 'Mode', exact: true })
    .selectOption('dark')
  await expect(library.locator('img[data-white-ring]')).toHaveCount(0)
  await page.screenshot({
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner artifact directory.
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'catalogue-logo-review.png'),
  })
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(library.getByLabel('Variant code')).toBeVisible()
  await library.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(library.locator('img[data-white-ring="true"]')).toBeVisible()
  await library.getByRole('button', { name: 'Mark for review', exact: true }).click()
  await expect(library.locator('img[data-white-ring]')).toHaveCount(0)
  await page.reload()
  await expect(library).toContainText('Needs review', { timeout: 60000 })
  await expect(library.locator('[data-artwork-slot="logo"] img')).toHaveAttribute(
    'src',
    originalSrc,
  )
})
