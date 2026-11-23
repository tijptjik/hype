import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage()
  await page.goto(`${base}/admin/locations/4EY5jL6MWVAI`)
  assert.equal(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(
      page.locator('[data-location-indoor-map] [data-station-scene]'),
    ).toBeVisible({ timeout: 120000 })
    await expect(page.locator('[data-location-context-map] canvas')).toBeVisible()
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Map', exact: true }),
    ).toHaveCount(0)
    const indoor = await page.locator('[data-location-indoor-map]').boundingBox()
    const context = await page.locator('[data-location-context-map]').boundingBox()
    assert(indoor && context)
    assert(indoor.x < context.x)
    assert(Math.abs(indoor.y - context.y) < 2)
    assert(context.width > 0 && indoor.width > 0)
    await page
      .locator('[data-location-indoor-map] svg')
      .first()
      .click({ position: { x: 40, y: 40 } })
    assert(page.url().includes('/admin/locations/4EY5jL6MWVAI'))
    const scene = page.locator('[data-location-indoor-map] [data-station-scene]')
    const outdoor = page.locator('[data-location-context-map] canvas')
    await outdoor.focus()
    const before = Number(await scene.getAttribute('data-camera-bearing'))
    await outdoor.press('Shift+ArrowRight')
    await expect
      .poll(async () => Number(await scene.getAttribute('data-camera-bearing')))
      .not.toBe(before)
    await page
      .getByRole('application', { name: 'Station plan controls', exact: true })
      .focus()
    await page.waitForTimeout(500)
    const rotated = Number(await scene.getAttribute('data-camera-bearing'))
    await page
      .getByRole('application', { name: 'Station plan controls', exact: true })
      .press('ArrowRight')
    await expect
      .poll(async () => Number(await scene.getAttribute('data-camera-bearing')))
      .toBeCloseTo(rotated + 10, 1)
    await page.screenshot({ path: `${output}/location-indoor-${width}.png` })
    await page.reload()
  }
  await expect(
    page.locator('[data-location-indoor-map] [data-station-scene]'),
  ).toBeVisible({ timeout: 120000 })
} finally {
  await browser.close()
}
