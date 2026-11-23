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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('response', async response => {
  if (response.status() >= 400)
    errors.push(
      `${response.status()} ${response.url()} ${await response.text().catch(() => '')}`,
    )
})
try {
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
  await expect(banner.getByRole('link', { name: 'Catalog', exact: true })).toBeVisible()
  await expect(banner.getByRole('link', { name: 'Brands', exact: true })).toBeVisible()
  await locations.click()
  await expect(page).toHaveURL(/facet=locations/)
  const view = page.locator('[data-brand-locations]')
  const filters = page.getByRole('group', { name: 'Location filters', exact: true })
  await expect(view).toBeVisible()
  await expect(
    view.getByRole('button', { name: /^Search (Hype|SaanSeoi)$/ }),
  ).toHaveCount(0)
  await expect(
    banner.getByPlaceholder('Search locations').filter({ visible: true }),
  ).toBeVisible()
  const boxes = await Promise.all([
    features.boundingBox(),
    locations.boundingBox(),
    banner.getByPlaceholder('Search locations').filter({ visible: true }).boundingBox(),
  ])
  expect(boxes.every(Boolean)).toBe(true)
  const [featuresBox, locationsBox, searchBox] = boxes
  if (!featuresBox || !locationsBox || !searchBox)
    throw new Error('Missing header control')
  expect(featuresBox.x).toBeLessThan(locationsBox.x)
  expect(locationsBox.x).toBeLessThan(searchBox.x)
  await expect(
    view.getByText('Branches found · name matches require confirmation'),
  ).toHaveCount(0)
  const filterToggle = banner.getByRole('button', { name: 'Filters', exact: true })
  await filterToggle.click()
  await expect(filters).toBeHidden()
  await filterToggle.click()
  await expect(filters).toBeVisible()
  await expect(filters.getByText('Record @ HYPE', { exact: true })).toBeVisible()
  await expect(filters.getByText('Record @ SaanSeoi', { exact: true })).toBeVisible()
  await expect(filters.getByText('Has Linked Features', { exact: true })).toBeVisible()
  const labelBounds = await filters
    .locator('.bits-resource-filter-bar__tri-toggle-label')
    .evaluateAll(labels =>
      labels.map(label => {
        const rect = label.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      }),
    )
  for (let i = 1; i < labelBounds.length; i++) {
    expect(labelBounds[i].left - labelBounds[i - 1].right).toBeGreaterThanOrEqual(16)
  }

  await expect(
    page.getByRole('combobox', { name: 'Search term', exact: true }),
  ).toHaveCount(0)
  await expect(
    filters.getByRole('combobox', { name: 'Filter by category', exact: true }),
  ).toBeAttached()
  const categoryFilter = filters.getByRole('combobox', {
    name: 'Filter by category',
    exact: true,
  })
  await categoryFilter.click()
  await expect(
    page.getByRole('option', { name: 'All categories', exact: true }),
  ).toBeVisible()
  await categoryFilter.fill('Bakery')
  await categoryFilter.press('ArrowDown')
  await categoryFilter.press('Enter')
  await expect(categoryFilter).toHaveValue(/bakery/i)
  await categoryFilter.fill('All categories')
  await categoryFilter.press('ArrowDown')
  await categoryFilter.press('Enter')
  await expect(categoryFilter).toHaveValue('All categories')
  // Read-only local query exercises real state filters without depending on provider availability.
  await filters
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ has: page.getByText('Record @ HYPE', { exact: true }) })
    .getByRole('button', { name: 'Yes', exact: true })
    .click()
  await filters
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ has: page.getByText('Record @ SaanSeoi', { exact: true }) })
    .getByRole('button', { name: 'No', exact: true })
    .click()
  await expect(
    view.getByRole('status', { name: 'Loading locations', exact: true }),
  ).toHaveCount(0)
  await expect(view.getByRole('alert')).toHaveCount(0)
  await expect(
    view
      .locator('.bits-resource-row--resource')
      .first()
      .or(view.getByRole('status', { name: 'No matching locations', exact: true })),
  ).toBeVisible()
  await filters
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ has: page.getByText('Has Linked Features', { exact: true }) })
    .getByRole('button', { name: 'Yes', exact: true })
    .click()
  await expect(
    view.getByRole('status', { name: 'Loading locations', exact: true }),
  ).toHaveCount(0)
  await expect(view.getByRole('alert')).toHaveCount(0)
  const currentRows = view.locator('.bits-resource-row--resource')
  const retainedCount = await currentRows.count()
  const linkedYes = filters
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ has: page.getByText('Has Linked Features', { exact: true }) })
    .getByRole('button', { name: 'Yes', exact: true })
  await linkedYes.click()
  if (retainedCount) {
    await expect(currentRows).toHaveCount(retainedCount)
    await expect(view.locator('[data-location-row-skeleton]')).toHaveCount(0)
  }
  await expect(
    view.getByRole('status', { name: 'Loading locations', exact: true }),
  ).toHaveCount(0)
  await linkedYes.click()
  await expect(
    view.getByRole('status', { name: 'Loading locations', exact: true }),
  ).toHaveCount(0)
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
  await filters
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ has: page.getByText('Record @ HYPE', { exact: true }) })
    .getByRole('button', { name: 'No', exact: true })
    .click()
  await filters
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ has: page.getByText('Record @ SaanSeoi', { exact: true }) })
    .getByRole('button', { name: 'Yes', exact: true })
    .click()
  await filters
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ has: page.getByText('Has Linked Features', { exact: true }) })
    .getByRole('button', { name: 'Yes', exact: true })
    .click()
  await expect(
    view.getByRole('status', { name: 'Loading locations', exact: true }),
  ).toHaveCount(0, { timeout: 60000 })
  await expect(view.getByRole('alert')).toHaveCount(0)
  await expect(
    view
      .locator('.bits-resource-row--resource')
      .first()
      .or(view.getByRole('status', { name: 'No matching locations', exact: true })),
  ).toBeVisible()
  expect(await view.textContent()).not.toContain('\u001f')
  if (await view.getByRole('button', { name: 'Add Location', exact: true }).count())
    await expect(view.locator('.bits-resource-row--resource').first()).toBeVisible()
  await expect(view.getByRole('button', { name: /More from|More Hype/ })).toHaveCount(0)
  const addAction = view
    .getByRole('button', { name: 'Add Location', exact: true })
    .first()
  if (await addAction.count()) {
    const resultRow = addAction.locator(
      'xpath=ancestor::*[contains(@class,"bits-resource-row--resource")][1]',
    )
    await expect(resultRow).not.toHaveAttribute('role', 'button')
    await expect(resultRow).not.toHaveAttribute('tabindex', /.+/)
    await addAction.focus()
    expect(
      await resultRow.evaluate(element => getComputedStyle(element).outlineStyle),
    ).toBe('none')
  }
  const sentinel = view.locator('[data-location-continuation]')
  if (await sentinel.count()) {
    const before = await view.locator('.bits-resource-row--resource').count()
    await sentinel.scrollIntoViewIfNeeded()
    await expect
      .poll(
        async () =>
          (await view.locator('.bits-resource-row--resource').count()) > before ||
          !(await sentinel.count()),
        { timeout: 60000 },
      )
      .toBe(true)
  }
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
} catch (error) {
  await page.screenshot({
    path: resolve(artifacts, 'brand-locations-failure.png'),
    fullPage: true,
  })
  await writeFile(
    resolve(artifacts, 'brand-locations-failure.json'),
    JSON.stringify({ errors, text: await page.locator('body').innerText() }, null, 2),
  )
  throw error
} finally {
  await browser.close()
}
