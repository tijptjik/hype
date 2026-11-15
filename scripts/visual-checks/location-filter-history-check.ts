// NODE
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port PORT chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto(`${origin}/admin/locations`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toBe('/admin/locations')
  const kind = page.getByRole('combobox', { name: 'All', exact: true })
  await kind.click()
  await page.getByRole('option', { name: 'Establishment', exact: true }).click()
  await expect
    .poll(() => new URL(page.url()).searchParams.get('kind'))
    .toBe('establishment')
  const lifecycle = page.getByRole('combobox', { name: 'All statuses', exact: true })
  await lifecycle.click()
  await page.getByRole('option', { name: 'Unknown', exact: true }).click()
  await expect
    .poll(() => new URL(page.url()).searchParams.get('lifecycleStatus'))
    .toBe('unknown')
  const saved = page.url()
  await page.locator('a[href^="/admin/locations/"]').first().click()
  await expect.poll(() => new URL(page.url()).pathname).not.toBe('/admin/locations')
  await page.goBack()
  await expect(page).toHaveURL(saved)
  await expect(kind).toHaveText('Establishment')
  await expect(lifecycle).toHaveText('Unknown')
  await page.reload()
  await expect(kind).toHaveText('Establishment')
  await expect(lifecycle).toHaveText('Unknown')
  await page.screenshot({ path: resolve(artifacts, 'location-filter-history.png') })
} finally {
  await browser.close()
}
