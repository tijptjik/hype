// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 60_000 })
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use the managed Chrome runner')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(60_000)
try {
  await page.goto(`${origin}/admin`, { timeout: 120_000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  // Reproduce missing R2 uploads on the main server while retaining the saved references.
  await page.route('**/api/identity-catalogue/logos/*', route =>
    route.fulfill({ status: 404, body: 'Missing upload' }),
  )
  for (const code of ['wooloomooloo-group', 'cra', 'jc', 'hsh', 'yamazaki-group']) {
    await page.goto(`${origin}/admin/catalog/group/${code}`, { timeout: 120_000 })
    const logo = page.getByAltText('Catalogue logo', { exact: true })
    await expect(logo).toHaveAttribute('src', `/groups/breadline/${code}.svg`)
    await expect
      .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)
    await expect(
      page.getByRole('button', { name: 'Retry image', exact: true }),
    ).toHaveCount(0)
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Edit', exact: true })
      .click()
    await expect(logo).toHaveAttribute('src', `/groups/breadline/${code}.svg`)
    await page.screenshot({
      path: resolve(artifacts, `${code}-fallback.png`),
      fullPage: true,
    })
  }
  await page.unroute('**/api/identity-catalogue/logos/*')
  await page.goto(`${origin}/admin/catalog/brand/arome`, { timeout: 120_000 })
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const matcher = '**/_app/remote/**/discoverBrandLocations*'
  await page.route(matcher, async route => {
    await gate
    await route.continue()
  })
  let skeletonColor = ''
  let skeletonHeight = 0
  try {
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Locations', exact: true })
      .click()
    // Support the explicit-search view as well as the live auto-search development view.
    const search = page.getByRole('button', { name: 'Search SaanSeoi', exact: true })
    if (await search.count()) await search.click()
    const skeleton = page
      .locator('[data-location-row-skeleton] [data-entity-index]')
      .first()
    await expect(skeleton).toBeVisible()
    skeletonColor = await skeleton.evaluate(
      element => getComputedStyle(element).backgroundColor,
    )
    skeletonHeight = (await skeleton.boundingBox())!.height
    await page.screenshot({
      path: resolve(artifacts, 'location-row-skeletons.png'),
      fullPage: true,
    })
  } finally {
    release()
  }
  await expect(page.locator('[data-location-row-skeleton]')).toHaveCount(0)
  const row = page
    .locator('[data-brand-locations] [data-entity-id]')
    .filter({ has: page.getByRole('button', { name: 'Link Location', exact: true }) })
    .first()
  await expect(row).toBeVisible({ timeout: 120_000 })
  expect(await row.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(
    skeletonColor,
  )
  const rowBounds = await row.boundingBox()
  if (!rowBounds) throw new Error('Missing loaded row')
  expect(Math.abs(rowBounds.height - skeletonHeight)).toBeLessThanOrEqual(4)
  const mark = row.getByLabel('Not yet in Hype', { exact: true })
  await expect(mark).toBeVisible()
  const markBounds = await mark.boundingBox()
  expect(markBounds?.width).toBe(20)
  await expect(mark.locator('svg').first()).toHaveAttribute('viewBox', '0 0 20 20')
  await expect(mark.locator('svg').first()).toHaveAttribute('fill', 'none')
  const lastStatus = row.getByLabel('No linked features', { exact: true })
  const iconBounds = await lastStatus.boundingBox()
  const buttonBounds = await row
    .getByRole('button', { name: 'Link Location', exact: true })
    .boundingBox()
  if (!iconBounds || !buttonBounds) throw new Error('Missing row action bounds')
  expect(buttonBounds.x - iconBounds.x - iconBounds.width).toBeGreaterThanOrEqual(32)
  await page.screenshot({
    path: resolve(artifacts, 'loaded-location-rows.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1200, height: 900 })
  await expect(
    row.getByRole('button', { name: 'Add Location', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: resolve(artifacts, 'loaded-location-rows-1200.png'),
    fullPage: true,
  })
  await writeFile(
    resolve(artifacts, 'verification.txt'),
    'Five missing uploaded group images recover to bundled SVGs in view/edit; location skeletons share loaded row color and height; 20px open-center Hype SVG; 32px status/action separation; 1200px layout.\n',
  )
} catch (error) {
  await page
    .screenshot({ path: resolve(artifacts, 'failure.png'), fullPage: true })
    .catch(() => {})
  await writeFile(
    resolve(artifacts, 'failure.txt'),
    await page.locator('body').ariaSnapshot(),
  ).catch(() => {})
  throw error
} finally {
  await browser.close()
}
