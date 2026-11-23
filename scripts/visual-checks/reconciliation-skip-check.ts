// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
// NODE
import { createRequire } from 'node:module'
const kitRequire = createRequire(import.meta.resolve('@sveltejs/kit/package.json'))
const { parse, stringify } = await import(kitRequire.resolve('devalue'))
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port 4173 chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-web-security', '--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  expect(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json())?.user?.id,
  ).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  let saved = false
  let attempts = 0
  const skippedAt = '2026-11-15T00:00:00.000Z'
  const feature = {
    id: 'skip-ui-fixture',
    name: 'Unlinked skip fixture',
    modifiedAt: 'v1',
    locationId: null,
    associationVersion: null,
    address: 'Austin MTR',
    phoneNumber: [],
    addressProperties: {},
    geometry: { type: 'Point', coordinates: [114.166, 22.305] },
    brand: '',
    properties: {},
  }
  // Simulate writes and queue persistence while retaining real app authentication and rendering.
  await page.route('**/remote/**/getLocationReconciliation?*', async route => {
    const response = await route.fetch()
    const body = await response.json()
    const data = parse(body.data)
    data._.item = saved ? null : feature
    data._.counts = {
      total: 1,
      matched: 0,
      drafts: 0,
      unavailable: 0,
      skipped: saved ? 1 : 0,
      remaining: saved ? 0 : 1,
    }
    await route.fulfill({ response, json: { ...body, data: stringify(data) } })
  })
  await page.route('**/remote/**/skipReconciliationFeature', async route => {
    attempts++
    if (attempts === 1) {
      await route.fulfill({
        status: 409,
        json: { type: 'error', error: { message: 'Controlled stale state' } },
      })
      return
    }
    saved = true
    await route.fulfill({
      json: { type: 'result', data: stringify({ _: { skippedAt } }) },
    })
  })
  await page.route('**/remote/**/getSkippedReconciliation?*', route =>
    route.fulfill({
      json: {
        type: 'result',
        data: stringify({ _: saved ? [{ ...feature, skippedAt }] : [] }),
      },
    }),
  )
  await page.route('**/remote/**/resetReconciliationSkip', async route => {
    saved = false
    await route.fulfill({
      json: { type: 'result', data: stringify({ _: { id: feature.id } }) },
    })
  })
  await page.goto(`${origin}/admin/projects/UMsz5DHb29Lx/match-locations`, {
    timeout: 120000,
  })
  const skip = page.getByRole('button', { name: 'Skip', exact: true })
  await expect(skip).toBeEnabled({ timeout: 120000 })
  await expect(
    page.getByRole('button', { name: 'Location unavailable', exact: true }),
  ).toBeDisabled()
  await skip.click()
  await expect(
    page.getByText('Could not save this skip. Retry before moving on.'),
  ).toBeVisible()
  expect(saved).toBe(false)
  await skip.click()
  const progress = page.getByRole('region', { name: 'Reconciliation progress' })
  await expect(progress).toContainText('100%')
  await expect(progress).toContainText(/1\s*\/ 1 reviewed/)
  await page.reload()
  await expect(
    progress.getByRole('button', { name: '1 skipped', exact: true }),
  ).toBeVisible({ timeout: 120000 })
  await progress.getByRole('button', { name: '1 skipped', exact: true }).click()
  await expect(page.getByText('Unlinked skip fixture', { exact: true })).toBeVisible()
  await page.screenshot({ path: `${artifacts}/saved-skip-1440.png` })
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByText('No skipped records.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to matching', exact: true }).click()
  await expect(skip).toBeEnabled()
  await expect(progress).toContainText('0%')
  await page.screenshot({ path: `${artifacts}/reset-skip-1200.png` })
  console.log(
    'PASS: unlinked skip failure/retry, saved progress, reload, list and reset at 1440/1200px',
  )
} finally {
  await browser.close()
}
