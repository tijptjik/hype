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
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  // Prove resilience to the exact missing-upload failure reported on the brand profile.
  await page.route(
    '**/api/identity-catalogue/logos/bc1a9125-baf5-4c5b-ace4-7fc183eb2741*',
    route => route.fulfill({ status: 404, body: 'Missing logo' }),
  )
  await page.goto(`${origin}/admin/catalog/brand/arome`, { timeout: 120000 })
  const logo = page.locator('a[href*="/admin/catalog/group/maxims-group"] img').first()
  await expect(logo).toBeVisible({ timeout: 120000 })
  await expect
    .poll(() => logo.evaluate(image => image.getBoundingClientRect().width))
    .toBe(48)
  await expect(page.getByText('Location discovery', { exact: true })).toHaveCount(0)
  await expect(logo).toHaveAttribute('src', '/groups/breadline/maxims-group.svg')
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await page.screenshot({
    path: resolve(artifacts, 'group-logo-profile.png'),
    fullPage: true,
  })
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await expect(logo).toBeVisible()
  await expect(logo).toHaveAttribute('src', '/groups/breadline/maxims-group.svg')
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await page.setViewportSize({ width: 1200, height: 900 })
  await expect(logo).toBeVisible()
  await page.screenshot({
    path: resolve(artifacts, 'group-logo-editor.png'),
    fullPage: true,
  })
  expect(errors).toEqual([])
} finally {
  await browser.close()
}
