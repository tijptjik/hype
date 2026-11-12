// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// BROWSER
import { chromium } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
if (!origin || !artifacts) throw new Error('Run through dev-remote --port PORT chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1568, height: 1100 } })
  page.setDefaultTimeout(60000)
  await page.goto(`${origin}/admin`, { waitUntil: 'load' })
  const sessionResponse = await page.request.get(`${origin}/api/auth/get-session`)
  const session = await sessionResponse.json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  assert(new URL(page.url()).pathname.startsWith('/admin'))
  await page.goto(`${origin}/admin/features/new#location`, {
    waitUntil: 'domcontentloaded',
  })
  await page
    .getByRole('button', { name: 'HKFoodWorks Breadline Donors', exact: true })
    .click()
  for (const name of [/^Place(?:\s|$)/, /^Donor(?:\s|$)/, /^Establishment(?:\s|$)/]) {
    const choice = page.getByRole('button', { name }).first()
    if (await choice.isVisible()) await choice.click()
  }
  await page
    .getByRole('textbox', {
      name: 'Search for a Business, Venue, Building, or Address',
      exact: true,
    })
    .fill('Sheung Wan')
  await page.locator('[data-result-source="saanseoi"]').first().waitFor()
  for (const width of [1568, 1200]) {
    await page.setViewportSize({ width, height: 1100 })
    for (const source of ['hype', 'saanseoi']) {
      const badge = page.locator(`[data-result-source="${source}"]`).first()
      if (!(await badge.count())) continue
      const row = badge.locator('..')
      await row.scrollIntoViewIfNeeded()
      const before = await badge.boundingBox()
      assert(before)
      await row.locator('[data-result-id]').click()
      const actions = row.locator('[data-result-actions]')
      await actions.waitFor()
      const after = await badge.boundingBox()
      const buttons = await actions.boundingBox()
      assert(after && buttons)
      assert(
        Math.abs(after.x - before.x) < 1,
        `Source mark moved at ${width}: ${source}`,
      )
      assert(
        buttons.x + buttons.width <= after.x,
        'Actions must be inside the source mark',
      )
      assert(
        Math.abs(after.y + after.height / 2 - (buttons.y + buttons.height / 2)) < 1,
      )
      console.log(
        JSON.stringify({ width, source, sourceFixed: true, actionsInside: true }),
      )
      await page.screenshot({
        path: `${artifacts}/source-actions-${width}-${source}.png`,
      })
    }
  }
} finally {
  await browser.close()
}
