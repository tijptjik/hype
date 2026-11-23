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
  let repeatedLocalReads = 0
  page.on('request', request => {
    if (request.url().includes('/getBrandLocations')) repeatedLocalReads++
  })
  const linkedFilter = filters
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ hasText: 'Has Linked Features' })
  await linkedFilter.getByRole('button', { name: 'Yes', exact: true }).click()
  await linkedFilter.getByRole('button', { name: 'No', exact: true }).click()
  await linkedFilter.getByRole('button', { name: 'No', exact: true }).click()
  expect(await map.getAttribute('data-point-count')).toBe(markerCount)
  expect(repeatedLocalReads).toBe(0)

  const bounds = await map.boundingBox()
  expect(bounds).toEqual(await view.boundingBox())
  await expect(page.getByLabel('Map legend', { exact: true })).not.toContainText(
    /\d+ (mapped|locations|results)/,
  )
  // Drag the real canvas, then toggle cached results: the camera must remain untouched.
  const canvas = map.locator('canvas')

  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    bounds!.x + bounds!.width / 2 + 100,
    bounds!.y + bounds!.height / 2 + 50,
    { steps: 8 },
  )
  await page.mouse.up()
  await page.waitForTimeout(8000)
  // Inspect actual GPU output, then select a rendered symbol through the canvas.
  const screenshot = await page.screenshot()
  const { data, info } = await sharp(screenshot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let markerPixel: { x: number; y: number } | undefined
  for (
    let y = Math.ceil(bounds!.y + 30);
    y < bounds!.y + bounds!.height - 160 && !markerPixel;
    y++
  ) {
    for (let x = Math.ceil(bounds!.x + 30); x < bounds!.x + bounds!.width - 30; x++) {
      const offset = (y * info.width + x) * 4
      if (
        data[offset] > 235 &&
        data[offset + 1] < 55 &&
        data[offset + 2] > 110 &&
        data[offset + 2] < 170
      ) {
        markerPixel = { x, y }
        break
      }
    }
  }
  expect(markerPixel, 'Canvas must visibly render the location symbols').toBeDefined()
  await page.mouse.click(markerPixel!.x, markerPixel!.y + 3)
  await expect(
    view.getByRole('link', { name: 'Show Location', exact: true }),
  ).toBeVisible()

  await writeFile(
    resolve(artifacts, 'map-network.json'),
    JSON.stringify(tileFailures, null, 2),
  )
  await page.screenshot({
    path: resolve(artifacts, 'brand-location-map.png'),
    fullPage: true,
  })
  await expect(page).toHaveURL(/view=map/)
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  const transitionGaps = await page.evaluate(async () => {
    const gaps: number[] = []
    for (let i = 0; i < 12; i++) {
      await new Promise(requestAnimationFrame)
      const shell = document.querySelector('.bits-pattern-header__control-bar-shell')!
      const map = document.querySelector('[data-brand-location-map]')!
      gaps.push(
        Math.abs(
          map.getBoundingClientRect().top -
            (shell?.getBoundingClientRect().bottom ??
              map.closest('main')!.getBoundingClientRect().top),
        ),
      )
    }
    return gaps
  })
  expect(Math.max(...transitionGaps)).toBeLessThanOrEqual(1)
  await expect(page).toHaveURL(/filters=hidden/)
  const savedUrl = page.url()
  await page.reload()
  await expect(page.locator('[data-brand-location-map]')).toBeVisible({
    timeout: 60000,
  })
  await expect(page.locator('.bits-pattern-header__control-bar-shell')).toHaveCSS(
    'max-height',
    '0px',
  )
  expect(page.url()).toBe(savedUrl)
  await expect(
    page.getByPlaceholder('Search locations').filter({ visible: true }),
  ).toHaveValue('Arome')
  const canvasHandle = await map.locator('canvas').elementHandle()
  await page.getByRole('button', { name: 'Show list', exact: true }).click()
  await expect(map).toBeHidden()
  await expect(
    view.getByRole('link', { name: 'Show Location', exact: true }).first(),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Show map', exact: true }).click()
  expect(await canvasHandle?.evaluate(element => element.isConnected)).toBe(true)
  await page.route('**/*getBrandLocations*', route => route.abort())
  const searchInput = page
    .getByPlaceholder('Search locations')
    .filter({ visible: true })
  await searchInput.fill('Arome retry check')
  const retry = map.getByRole('button', { name: 'Retry search', exact: true })
  await expect(retry).toBeVisible({ timeout: 60000 })
  expect(await map.boundingBox()).toEqual(await view.boundingBox())
  await page.screenshot({
    path: resolve(artifacts, 'brand-location-map-retry.png'),
    fullPage: true,
  })
  await page.unroute('**/*getBrandLocations*')
  await retry.click()
  await expect(retry).toHaveCount(0, { timeout: 60000 })
  expect(errors).toEqual([])
} finally {
  await browser.close()
}
