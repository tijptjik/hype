import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--disable-web-security',
    '--ozone-platform=x11',
    `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`,
  ],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${base}/admin/locations/RX_OHKKw78M2`)
  assert.equal(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 120000 })
  await page.getByRole('button', { name: 'Expand indoor map', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Collapse indoor map', exact: true }),
  ).toBeEnabled()
  for (const theme of [
    'hype-dark',
    'hype-black',
    'hype-light',
    'breadline-light',
    'breadline-dark',
  ]) {
    await page.evaluate(
      theme => document.documentElement.setAttribute('data-theme', theme),
      theme,
    )
    const colors = await page.evaluate(() => {
      const canvas = document.querySelector('[data-location-indoor-canvas]')!
      const levels = document.querySelector('[data-station-level-entries] button')!
      const symbols = document.querySelector('[data-station-legend="symbols"] button')!
      return [canvas, levels, symbols].map(
        node => getComputedStyle(node).backgroundColor,
      )
    })
    assert.equal(colors[0], colors[1], `${theme}: level background`)
    assert.equal(colors[0], colors[2], `${theme}: symbol background`)
    await page.screenshot({ path: `${output}/canvas-${theme}.png` })
  }
} finally {
  await browser.close()
}
