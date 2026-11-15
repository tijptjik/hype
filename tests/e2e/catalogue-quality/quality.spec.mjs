import { test, expect } from '@playwright/test'
import { join } from 'node:path'
test('quality filters apply to records and survive reload and detail navigation', async ({
  page,
}) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/catalogue?kind=brand&logo-svg=yes')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const grid = page.locator('[data-catalogue-grid]')
  await expect(grid).toHaveAttribute('aria-busy', 'false', { timeout: 60000 })
  await expect(grid.locator('article').first()).toBeVisible()
  expect(await grid.locator('[aria-label="SVG: Yes"]').count()).toBe(
    await grid.locator('article').count(),
  )
  await page.getByRole('button', { name: 'Show filters', exact: true }).click()
  await expect(page.getByText('Image quality', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Image quality', exact: true }).click()
  await page.getByRole('button', { name: 'Origin', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Catalogue origin:/ })).toBeVisible()
  await page.getByRole('button', { name: /^Catalogue origin:/ }).click()
  await page.getByRole('option', { name: 'MTR', exact: true }).click()
  await expect(page).toHaveURL(/catalogue-origin=/)
  await expect(grid).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: /^Catalogue origin:/ }).click()
  await page.getByRole('option', { name: 'Any origin', exact: true }).click()
  await expect(page).not.toHaveURL(/catalogue-origin=/)
  await page.getByRole('button', { name: 'Origin', exact: true }).click()
  await page.getByRole('button', { name: 'Image quality', exact: true }).click()
  for (const name of [
    'Translation',
    'Status',
    'Content',
    'Images',
    'Licence',
    'Categories',
    'Freeform',
  ]) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  }
  const svg = page.getByRole('group', { name: 'SVG', exact: true })
  await svg.getByRole('button', { name: 'No', exact: true }).click()
  await expect(page).toHaveURL(/logo-svg=no/)
  await expect(grid).toHaveAttribute('aria-busy', 'false')
  await expect(grid.locator('[aria-label="SVG: Yes"]')).toHaveCount(0)
  await page.reload()
  await expect(grid).toHaveAttribute('aria-busy', 'false', { timeout: 60000 })
  await expect(grid.locator('[aria-label="SVG: Yes"]')).toHaveCount(0)
  await grid.locator('article').first().click()
  await expect(page).toHaveURL(/\/admin\/catalog\/brand\//)
  await page.goBack()
  await expect(page).toHaveURL(/logo-svg=no/)
  await expect(grid).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'Show filters', exact: true }).click()
  await page.setViewportSize({ width: 1200, height: 1000 })
  await expect(page.getByRole('group', { name: 'SVG', exact: true })).toBeVisible()
  await page.screenshot({
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence directory.
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'catalogue-quality.png'),
  })
})

test('feature filter groups do not survive returning to the catalogue', async ({
  page,
}) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/catalogue?kind=brand')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await page
    .locator('[data-catalogue-grid] article')
    .filter({ hasText: '7-Eleven' })
    .first()
    .click()
  await page.getByRole('button', { name: 'Features', exact: true }).first().click()
  await expect(page).toHaveURL(/facet=features/)
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await expect(page.locator('.bits-resource-filter-bar__filter-trigger')).toBeVisible()
  await page.getByRole('link', { name: 'Catalog', exact: true }).click()
  await expect(page.locator('[data-catalogue-grid]')).toBeVisible()
  await page.getByRole('button', { name: 'Show filters', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Image quality', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Image quality', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Origin', exact: true })).toBeVisible()
  for (const name of [
    'Translation',
    'Status',
    'Content',
    'Images',
    'Licence',
    'Categories',
    'Freeform',
  ]) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  }
})
