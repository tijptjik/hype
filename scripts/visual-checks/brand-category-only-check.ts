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

  const response = page.waitForResponse(
    response =>
      response.url().includes('/discoverBrandLocations') && response.status() === 200,
    { timeout: 120000 },
  )
  await page.goto(
    `${origin}/admin/catalog/brand/arome?facet=locations&q=&category=bakery&hype=all&upstream=yes&linked=all&filters=shown&view=map`,
    { timeout: 120000 },
  )
  await response
  await expect(
    page.getByPlaceholder('Search locations').filter({ visible: true }),
  ).toHaveValue('')
  const map = page.locator('[data-brand-location-map]')
  await expect(map).toBeVisible({ timeout: 60000 })
  await expect(map).not.toHaveAttribute('data-point-count', '0', { timeout: 120000 })
  await expect(
    map.getByRole('button', { name: 'Retry search', exact: true }),
  ).toHaveCount(0)
  await expect
    .poll(async () => Number(await map.getAttribute('data-point-count')), {
      timeout: 120000,
    })
    .toBeGreaterThan(600)
  await map.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({
    path: resolve(artifacts, 'category-only-discovery.png'),
    fullPage: true,
  })
  // The count is white on a dark cluster centre; click the rendered count on the canvas.
  const bounds = await map.boundingBox()
  const shot = await page.screenshot()
  const { data, info } = await sharp(shot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let cluster: { x: number; y: number } | undefined
  for (
    let y = Math.ceil(bounds!.y + 60);
    y < bounds!.y + bounds!.height - 150 && !cluster;
    y++
  ) {
    for (let x = Math.ceil(bounds!.x + 60); x < bounds!.x + bounds!.width - 100; x++) {
      const i = (y * info.width + x) * 4
      if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) {
        cluster = { x, y }
        break
      }
    }
  }
  expect(cluster, 'At least one numbered cluster should be visible').toBeDefined()
  const before = await map.locator('canvas').screenshot()
  await page.mouse.click(cluster!.x, cluster!.y)
  await expect
    .poll(async () => (await map.locator('canvas').screenshot()).equals(before))
    .toBe(false)
  await page.waitForTimeout(1000)
  await page.screenshot({
    path: resolve(artifacts, 'category-cluster-expanded.png'),
    fullPage: true,
  })
  expect(errors).toEqual([])
} finally {
  await browser.close()
}
