// NODE
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port PORT chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-web-security', '--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors: string[] = []
  const tileFailures: string[] = []
  page.on('response', response => {
    if (response.status() >= 400)
      tileFailures.push(
        `${response.status()} ${new URL(response.url()).origin}${new URL(response.url()).pathname}`,
      )
  })
  page.on('requestfailed', request =>
    tileFailures.push(
      `${new URL(request.url()).origin}${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
    ),
  )
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  await page.goto(`${origin}/admin/catalog/brand/arome?facet=locations`, {
    timeout: 120000,
  })
  const view = page.locator('[data-brand-locations]')
  const filters = page.getByRole('group', { name: 'Location filters', exact: true })
  await expect(view).toBeVisible({ timeout: 120000 })
  if (!(await filters.isVisible()))
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
  for (const [label, choice] of [
    ['Record @ HYPE', 'Yes'],
    ['Record @ SaanSeoi', 'No'],
  ]) {
    await filters
      .locator('.bits-resource-filter-bar__tri-toggle')
      .filter({ hasText: label })
      .getByRole('button', { name: choice, exact: true })
      .click()
  }
  await page.getByRole('button', { name: 'Show map', exact: true }).click()
  const map = page.locator('[data-brand-location-map]')
  await expect(map).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('map')
  const saved = new URL(page.url()).searchParams
  const fields = ['q', 'category', 'hype', 'upstream', 'linked', 'filters', 'view']
  const expected = Object.fromEntries(fields.map(key => [key, saved.get(key)]))
  await map.evaluate(element => element.setAttribute('data-retained-map', 'yes'))
  for (let index = 0; index < 2; index++) {
    await page.locator('[data-sidebar-toggle]').first().click()
    await expect(map).toBeVisible()
    await expect(map).toHaveAttribute('data-retained-map', 'yes')
    await expect
      .poll(() => {
        const params = new URL(page.url()).searchParams
        return Object.fromEntries(fields.map(key => [key, params.get(key)]))
      })
      .toEqual(expected)
    await expect(filters).toBeVisible()
    await page.waitForTimeout(500)
    await expect(map).toBeVisible()
  }
  await page.screenshot({ path: resolve(artifacts, 'sidebar-preserves-map.png') })
  expect(errors).toEqual([])
} finally {
  await browser.close()
}
