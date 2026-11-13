// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement) throw new Error('Use dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(origin)
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  await page.goto(`${origin}/admin/catalogue`)
  assert.equal(new URL(page.url()).pathname, '/admin/catalogue')
  const sidebarToggle = page.locator('[data-sidebar-toggle]').first()
  await expect(sidebarToggle).toBeVisible({ timeout: 120000 })
  if ((await sidebarToggle.getAttribute('aria-expanded')) === 'true')
    await sidebarToggle.click()
  for (const section of ['Organisations', 'Projects', 'Layers']) {
    const region = page.getByRole('region', { name: section, exact: true })
    const candidate = region
      .locator('[data-resource-id]')
      .filter({
        has: page.locator('button[aria-pressed="false"]'),
      })
      .first()
    await expect(candidate).toBeVisible({ timeout: 120000 })
    const id = await candidate.getAttribute('data-resource-id')
    const row = region.locator(`[data-resource-id="${id}"]`)
    const dot = row.locator(':scope > button').first()
    const pin = row.locator('button[aria-pressed]')
    await dot.click()
    await expect(dot).toHaveAttribute('aria-current', 'page', { timeout: 120000 })
    await expect(pin).toHaveAttribute('aria-pressed', 'false')
    const detail = page.url()
    await dot.click()
    await expect(pin).toHaveAttribute('aria-pressed', 'true')
    assert.equal(page.url(), detail)
    await dot.click()
    await expect(pin).toHaveAttribute('aria-pressed', 'false')
    assert.equal(page.url(), detail)
    // A selected prism must also deactivate without reopening its detail page.
    await dot.click()
    await expect(pin).toHaveAttribute('aria-pressed', 'true')
    await page
      .getByRole('navigation', { name: 'Admin menu' })
      .getByRole('link', { name: 'Features', exact: true })
      .click()
    await expect(dot).not.toHaveAttribute('aria-current', 'page')
    const elsewhere = page.url()
    await dot.click()
    await expect(pin).toHaveAttribute('aria-pressed', 'false')
    assert.equal(page.url(), elsewhere)
    await page.screenshot({ path: `${artifacts}/compact-${section.toLowerCase()}.png` })
    console.log(
      `PASS: ${section}: detail, pin, unpin; unpin from another page preserves navigation`,
    )
  }
} finally {
  await browser.close()
}
