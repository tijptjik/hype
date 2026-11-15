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
  assert.equal(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  for (const [slug, name] of [
    ['admiralty-mtr', 'Admiralty'],
    ['kennedy-town-mtr', 'Kennedy Town'],
  ]) {
    await page.goto(`${origin}/premises/${slug}`)
    await expect(page).toHaveTitle(`ᴰᴱⱽ ${name} · HYPE.HK`, { timeout: 60000 })
    const index = page.getByRole('navigation', { name: 'Indoor levels' })
    await expect(index).toBeVisible({ timeout: 60000 })
    const floor = index.getByRole('button').nth(1)
    const label = await floor.getAttribute('aria-label')
    assert(label)
    await floor.click()
    await expect(page).toHaveTitle(`ᴰᴱⱽ ${name} · ${label} · HYPE.HK`)
    await index.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page).toHaveTitle(`ᴰᴱⱽ ${name} · HYPE.HK`)
    await page.screenshot({ path: `${artifacts}/${slug}-title.png` })
  }
  console.log(
    'PASS: public premises titles, development prefix, selected floor and all-level reset',
  )
} finally {
  await browser.close()
}
