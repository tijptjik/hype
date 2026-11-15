// PLAYWRIGHT
import { chromium } from '@playwright/test'
// NODE
import assert from 'node:assert/strict'

const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!base || !output || !placement) throw Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  await page.goto(`${base}/admin`, { timeout: 120000 })
  const session = await (await page.request.get(`${base}/api/auth/get-session`)).json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  assert.match(new URL(page.url()).pathname, /^\/admin/)
  await page.goto(`${base}/admin/features/blDf6103ca1e`, { timeout: 120000 })
  await page
    .getByRole('button', { name: 'Edit', exact: true })
    .click({ timeout: 60000 })
  const source = page.locator('[data-title-source]').first()
  await source.getByText('Template', { exact: true }).waitFor({ timeout: 60000 })
  assert.equal(await source.getByText(/From location/).count(), 0)
  assert.equal(await source.getByRole('button', { name: 'Go to location' }).count(), 0)
  // Switching facets must not resurrect provenance from the former association.
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.getByText('No Location associated', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await source.getByText('Template', { exact: true }).waitFor()
  assert.equal(await source.getByRole('button', { name: 'Go to location' }).count(), 0)
  for (const width of [1440, 1200]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.equal(await source.isVisible(), true)
    await page.screenshot({ path: `${output}/detached-title-${width}.png` })
  }
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.getByText('No Location associated', { exact: true }).waitFor()
  await page.screenshot({ path: `${output}/detached-location.png` })
} finally {
  await page.screenshot({ path: `${output}/detached-final.png` })
  await browser.close()
}
