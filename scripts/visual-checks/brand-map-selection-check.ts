// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
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
  await page.screenshot({
    path: resolve(artifacts, 'brand-location-before-map.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Show map', exact: true }).click()
  const map = page.locator('[data-brand-location-map]')
  await expect(map).toBeVisible()
  await expect(map.locator('canvas')).toBeVisible({ timeout: 60000 })
  await expect(map).not.toHaveAttribute('data-point-count', '0', { timeout: 60000 })
  await expect(map.locator('.maplibregl-marker')).toHaveCount(0)
  await expect(map.getByRole('status')).not.toContainText('Loading', { timeout: 60000 })
  await expect(page.getByLabel('Map legend', { exact: true })).toBeVisible()
  const markerCount = await map.getAttribute('data-point-count')

  await map.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await map.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.waitForTimeout(800)
  const bounds = await map.boundingBox()
  const { data, info } = await sharp(await page.screenshot())
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let marker: { x: number; y: number } | undefined
  for (
    let y = Math.ceil(bounds!.y + 30);
    y < bounds!.y + bounds!.height - 160 && !marker;
    y++
  ) {
    for (let x = Math.ceil(bounds!.x + 30); x < bounds!.x + bounds!.width - 100; x++) {
      const i = (y * info.width + x) * 4
      if (data[i] > 235 && data[i + 1] < 55 && data[i + 2] > 110 && data[i + 2] < 170) {
        marker = { x, y }
        break
      }
    }
  }
  expect(marker).toBeDefined()
  await page.mouse.click(marker!.x, marker!.y + 3)
  const bar = page.locator('[data-map-selection]')
  await expect(
    bar.getByRole('link', { name: 'Show Location', exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 1200, height: 1000 })
  await expect(bar).toHaveText('Show Location')
  expect(await bar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect((await bar.boundingBox())!.height).toBeLessThan(100)
  await page.screenshot({
    path: resolve(artifacts, 'map-selection-compact.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1600, height: 1000 })
  await expect(bar).not.toHaveText('Show Location')
  expect(await bar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({
    path: resolve(artifacts, 'map-selection-wide.png'),
    fullPage: true,
  })
  expect(errors).toEqual([])
} finally {
  await browser.close()
}
