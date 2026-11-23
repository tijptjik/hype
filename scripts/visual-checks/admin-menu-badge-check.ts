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
  const response = await page.goto(`${origin}/admin/catalogue`)
  assert(response?.ok())
  assert.equal(new URL(page.url()).pathname, '/admin/catalogue')
  const nav = page.getByRole('navigation', { name: 'Admin menu' })
  const badge = nav
    .getByRole('link', { name: 'Features', exact: true })
    .locator('span[role="img"]')
  await expect(badge).toBeVisible({ timeout: 120000 })
  await expect(badge).not.toHaveAttribute('aria-busy', 'true')
  const oldCount = await badge.getAttribute('aria-label')
  assert(oldCount)
  const oldBox = await badge.boundingBox()
  // Hold new query responses so the real prism transition can be inspected while pending.
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route('**/*', async route => {
    if (route.request().url().includes('/_app/remote/')) await gate
    await route.continue()
  })
  await page
    .getByRole('region', { name: 'Projects', exact: true })
    .getByRole('button', { name: /Pin Independent Bookstores/i })
    .click()
  try {
    await expect(badge).toHaveAttribute('aria-busy', 'true')
    await expect(badge).toHaveAttribute('aria-label', oldCount)
    await expect(badge).toHaveCSS('opacity', '0.6')
    const pendingBox = await badge.boundingBox()
    assert(oldBox && pendingBox)
    for (const dimension of ['x', 'y', 'width', 'height'] as const)
      assert(Math.abs(pendingBox[dimension] - oldBox[dimension]) < 0.5)
    await page.screenshot({ path: `${artifacts}/badge-pending.png` })
  } finally {
    release()
  }
  await expect(badge).not.toHaveAttribute('aria-busy', 'true', { timeout: 120000 })
  await expect(badge).toHaveCSS('opacity', '1')
  assert.equal(new URL(page.url()).pathname, '/admin/catalogue')
  await expect(badge).not.toHaveAttribute('aria-label', oldCount)
  await page.screenshot({ path: `${artifacts}/badge-settled.png` })
  console.log(
    'PASS: Features count loads on Catalog without opening Features; prism changes retain and dim the old total, then show the new total',
  )
} finally {
  await browser.close()
}
