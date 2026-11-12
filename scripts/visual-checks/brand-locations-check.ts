// NODE
import { mkdir, writeFile } from 'node:fs/promises'
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
const errors: string[] = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(30000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  await page.goto(`${origin}/admin/catalog/brand/arome`, { timeout: 120000 })
  const banner = page.getByRole('banner')
  const locations = banner.getByRole('button', { name: 'Locations', exact: true })
  const features = banner.getByRole('button', { name: 'Features', exact: true })
  await expect(locations).toBeVisible({ timeout: 120000 })
  await expect(features).toBeVisible()
  await locations.click()
  await expect(page).toHaveURL(/facet=locations/)
  const view = page.locator('[data-brand-locations]')
  await expect(view).toBeVisible()
  await expect(
    banner.getByPlaceholder('Search locations').filter({ visible: true }),
  ).toBeVisible()
  const boxes = await Promise.all([
    features.boundingBox(),
    locations.boundingBox(),
    banner.getByPlaceholder('Search locations').filter({ visible: true }).boundingBox(),
  ])
  expect(boxes.every(Boolean)).toBe(true)
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x)
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x)
  await expect(view.getByText('Hype', { exact: true })).toBeVisible()
  await expect(view.getByText('Upstream', { exact: true })).toBeVisible()
  await expect(view.getByText('Linked Features', { exact: true })).toBeVisible()
  // Read-only local query exercises real state filters without depending on provider availability.
  await view.getByRole('button', { name: 'Added', exact: true }).click()
  await view.getByRole('button', { name: 'Community only', exact: true }).click()
  await view.getByRole('button', { name: 'Search Hype', exact: true }).click()
  await expect(view.getByRole('status')).toHaveCount(0)
  await expect(view.getByRole('alert')).toHaveCount(0)
  await expect(
    view.getByText(/No matching locations|Brand match/).first(),
  ).toBeVisible()
  await view.getByRole('button', { name: 'Linked', exact: true }).click()
  await view.getByRole('button', { name: 'Search Hype', exact: true }).click()
  await expect(view.getByRole('status')).toHaveCount(0)
  await expect(view.getByRole('alert')).toHaveCount(0)
  await page.screenshot({
    path: resolve(artifacts, 'brand-locations-desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1200, height: 900 })
  await expect(view).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: resolve(artifacts, 'brand-locations-narrow.png'),
    fullPage: true,
  })
  await view.getByRole('button', { name: 'Not added', exact: true }).click()
  await view.getByRole('button', { name: 'Backed', exact: true }).click()
  await view.getByRole('button', { name: 'Linked', exact: true }).click()
  await view.getByRole('button', { name: 'Search SaanSeoi', exact: true }).click()
  await expect(view.getByRole('status')).toHaveCount(0, { timeout: 60000 })
  await expect(view.getByRole('alert')).toHaveCount(0)
  await expect(
    view.getByText(/No matching locations|Name match|Brand match/).last(),
  ).toBeVisible()
  await page.screenshot({
    path: resolve(artifacts, 'brand-locations-upstream.png'),
    fullPage: true,
  })
  await features.click()
  await expect(page).toHaveURL(/facet=features/)
  await expect(view).toHaveCount(0)
  expect(errors).toEqual([])
  await writeFile(
    resolve(artifacts, 'brand-locations.json'),
    JSON.stringify(
      {
        authenticated: true,
        headerOrder: ['Features', 'Locations', 'Search'],
        localFilters: 'passed',
        errors,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
