// PLAYWRIGHT
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 60000 })
const origin = process.env.PLAYWRIGHT_BASE_URL
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  await page.goto(`${origin}/admin/catalog/brand/arome?facet=locations`, {
    timeout: 120000,
  })
  const filters = page.getByRole('group', { name: 'Location filters', exact: true })
  await expect(filters).toBeVisible({ timeout: 120000 })
  await page.locator('input[placeholder="Search locations"]:visible').fill('Chun Fai')
  const sourceToggle = filters
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ has: page.getByText('Record @ SaanSeoi', { exact: true }) })
  await sourceToggle
    .getByRole('button', { name: 'No', exact: true })
    .click({ force: true })
  await filters
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ has: page.getByText('Record @ HYPE', { exact: true }) })
    .getByRole('button', { name: 'Yes', exact: true })
    .click({ force: true })
  const view = page.locator('[data-brand-locations]')
  await expect(
    view.getByRole('link', { name: 'Show Location', exact: true }).first(),
  ).toBeVisible()
  await expect(
    view.getByRole('button', { name: 'Available in Hype', exact: true }).first(),
  ).toBeVisible()
  await expect(
    view
      .getByRole('button', { name: /Available in SaanSeoi|No SaanSeoi record/ })
      .first(),
  ).toBeVisible()
  await expect(
    view
      .getByRole('button', { name: /Has linked features|No linked features/ })
      .first(),
  ).toBeVisible()
  await page.screenshot({
    path: `${process.env.DEV_RUNNER_ARTIFACTS}/category-status-icons.png`,
  })
  const input = filters.getByRole('combobox', { name: 'Filter by category' })
  await input.click()
  const option = page.getByRole('option', {
    name: 'Abuse and addiction treatment center',
    exact: true,
  })
  await expect(option).toBeVisible()
  const bounds = await option.boundingBox()
  expect(bounds!.width).toBeGreaterThan(280)
  expect(await option.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)
  await page.screenshot({
    path: `${process.env.DEV_RUNNER_ARTIFACTS}/category-wide-options.png`,
  })
  await input.fill('3d printing')
  const requested = page.waitForRequest(
    r =>
      r.url().includes('getBrandLocations') &&
      atob(new URL(r.url()).searchParams.get('payload') ?? '').includes(
        '3d_printing_service',
      ),
  )
  await page.getByRole('option', { name: '3d printing service', exact: true }).click()
  await requested
  const token = filters.getByRole('button', {
    name: 'Filter by category: 3d printing service',
    exact: true,
  })
  await expect(token).toBeVisible()
  await expect(
    filters.getByRole('combobox', { name: 'Filter by category' }),
  ).toHaveCount(0)
  await expect(view.getByLabel('No matching locations')).toBeVisible()
  await expect(
    view.getByRole('link', { name: 'Show Location', exact: true }),
  ).toHaveCount(0)
  await page.screenshot({
    path: `${process.env.DEV_RUNNER_ARTIFACTS}/category-local-empty.png`,
  })
  await token.click()
  await expect(
    page.getByRole('option', { name: 'All categories', exact: true }),
  ).toBeVisible()
  await expect(input).toHaveValue('')
  await page.getByRole('option', { name: 'All categories', exact: true }).click()
  await expect(
    view.getByRole('link', { name: 'Show Location', exact: true }).first(),
  ).toBeVisible()
  await expect(input).toHaveValue('')
} finally {
  await browser.close()
}
