// NODE
import assert from 'node:assert/strict'
// BROWSER
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 90000 })
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Use dev-remote --port 4173 chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--ozone-platform=x11',
    `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`,
    '--disable-web-security',
  ],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/admin/locations`)
  assert.equal(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  await expect(
    page.getByRole('link', {
      name: 'Match shared Locations with SaanSeoi',
      exact: true,
    }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Locations', exact: true }).click()
  const match = page.getByRole('menuitem', { name: 'Match locations', exact: true })
  await expect(match).toBeVisible()
  await expect(match.locator('svg')).toBeVisible()
  await match.click()
  await expect(
    page.getByRole('complementary', { name: 'Unmatched Hype Locations' }),
  ).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Name or shop code', exact: true })
    .fill('KOT 122')
  await page
    .getByRole('region', { name: 'Location matching progress' })
    .getByRole('button', { name: /No candidates/ })
    .click()
  await expect(
    page
      .getByRole('region', { name: 'Location matching progress' })
      .getByRole('button', { name: /No candidates/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page
    .getByRole('region', { name: 'Location matching progress' })
    .getByRole('button', { name: /All MTR shops/ })
    .click()
  await page
    .getByRole('textbox', { name: 'Name or shop code', exact: true })
    .fill('KOT 122')
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  const local = page
    .getByRole('complementary', { name: 'Unmatched Hype Locations' })
    .getByRole('button', { name: /7-Eleven.*KOT 122/ })
  await expect(local).toBeVisible()
  await local.click()
  const mapPanel = page.locator('[data-location-matcher-map]')
  const map = page.locator('[data-brand-location-map]')
  await expect(map).toBeVisible()
  const panelBox = await mapPanel.boundingBox()
  const mapBox = await map.boundingBox()
  assert.ok(panelBox && mapBox)
  assert.ok(
    Math.abs(panelBox.x - mapBox.x) <= 2 && Math.abs(panelBox.y - mapBox.y) <= 2,
  )
  assert.ok(mapBox.height <= panelBox.height && mapBox.width <= panelBox.width)
  assert.ok(mapBox.height > 500, 'Map should fill the workspace')
  await expect(
    page.getByRole('region', { name: 'Location matching progress' }),
  ).toContainText('Code + name')
  await expect(page.getByRole('slider')).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Hype Location details' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'SaanSeoi candidate details' }),
  ).toBeVisible()

  // Trial clicks verify controls are not covered by the absolutely positioned map.
  await page
    .getByRole('button', { name: 'Search SaanSeoi', exact: true })
    .click({ trial: true })

  await expect(
    page.getByRole('textbox', { name: 'SaanSeoi name or shop code', exact: true }),
  ).toHaveValue('7-Eleven')
  await page.getByRole('button', { name: 'Search SaanSeoi', exact: true }).click()
  const source = page
    .getByRole('region', { name: 'SaanSeoi matching' })
    .getByRole('button', { name: /7-Eleven.*KOT121/ })
    .first()
  await expect(source).toBeVisible()
  // Inspect discovery only: conflicting unit evidence must not be accepted by this check.
  await page.screenshot({
    path: `${output}/location-matcher-desktop.png`,
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await source.scrollIntoViewIfNeeded()
  await expect(source).toBeVisible()
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  )
  await page.screenshot({
    path: `${output}/location-matcher-mobile.png`,
    fullPage: true,
  })
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
