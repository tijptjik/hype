// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Managed Chrome runner environment.
// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(base)
  const session = await (await page.request.get(`${base}/api/auth/get-session`)).json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  for (const [resource, id] of [
    ['hub', '4Jsk5LngvFZq'],
    ['organisation', '2u4orWMxRNbz'],
    ['project', '-z26MuNRTJwi'],
  ]) {
    const response = await page.goto(`${base}/admin/${resource}s/${id}#updates`)
    assert(response?.ok())
    assert(new URL(page.url()).pathname.startsWith('/admin/'))
    const tab = page.getByRole('button', { name: 'Staff roles', exact: true })
    await tab.waitFor({ timeout: 60000 })
    await tab.click()
    const history = page.locator('[data-history-surface]')
    const link = history.locator('article header').getByRole('link').first()
    await link.waitFor({ timeout: 30000 })
    const href = await link.getAttribute('href')
    assert(href?.startsWith('/admin/users/'))
    const article = link.locator('xpath=ancestor::article')
    const disclosure = article.locator('button[aria-expanded]')
    const expanded = (await disclosure.count())
      ? await disclosure.first().getAttribute('aria-expanded')
      : null
    await page.screenshot({ path: `${output}/staff-${resource}.png` })
    // Open the link in a new tab to preserve and inspect the unchanged history disclosure.
    const [profile] = await Promise.all([
      page.waitForEvent('popup'),
      link.click({ modifiers: ['Control'] }),
    ])
    await profile.waitForLoadState('domcontentloaded')
    assert.equal(new URL(profile.url()).pathname, href)
    if (expanded !== null)
      assert.equal(await disclosure.first().getAttribute('aria-expanded'), expanded)
    await profile.close()
    await page
      .getByRole('button', { name: 'Profile and settings', exact: true })
      .click()
    await tab.click()
    await history.getByRole('link').first().waitFor()
    console.log(`Verified ${resource} staff tab and profile navigation`)
  }
} finally {
  await browser.close()
}
