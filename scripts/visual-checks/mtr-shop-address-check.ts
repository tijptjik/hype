// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium } from '@playwright/test'

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
  const response = await page.goto(`${origin}/admin/locations/OjBRKeRp2q00`)
  assert(response?.ok())
  assert.equal(new URL(page.url()).pathname, '/admin/locations/OjBRKeRp2q00')
  const unit = page.getByText('Shop 19', { exact: true })
  await unit.first().waitFor({ state: 'visible', timeout: 30000 })
  assert(!(await page.locator('body').innerText()).includes('Shop 19, 19,'))
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor()
  assert(!(await page.locator('body').innerText()).includes('Shop 19, 19,'))
  assert(
    await page
      .locator('input')
      .evaluateAll(inputs => inputs.some(input => input.value === '19')),
  )
  await page.screenshot({ path: `${artifacts}/mtr-shop-edit.png` })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await unit.first().waitFor({ state: 'visible' })
  await page.screenshot({ path: `${artifacts}/mtr-shop-display.png` })
  console.log(
    'PASS: authenticated location display and edit preview show Shop 19 once; cancel preserves source.',
  )
} finally {
  await browser.close()
}
