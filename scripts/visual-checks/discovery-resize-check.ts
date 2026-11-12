// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// BROWSER
import { chromium } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
if (!origin || !artifacts) throw new Error('Run through dev-remote --port PORT chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1568, height: 1100 } })
  page.setDefaultTimeout(60000)
  await page.goto(`${origin}/admin/features/new#location`, {
    waitUntil: 'domcontentloaded',
  })
  await page
    .getByRole('button', { name: 'HKFoodWorks Breadline Donors', exact: true })
    .click()
  await page
    .getByRole('textbox', {
      name: 'Search for a Business, Venue, Building, or Address',
      exact: true,
    })
    .fill('Sheung Wan')
  await page.locator('[data-result-source="saanseoi"]').first().waitFor()
  assert.equal(await page.locator('[data-result-source="hype"]').count(), 4)
  const handle = page.getByRole('separator', { name: /resize map and image section/i })
  await handle.waitFor()
  // Expand then shrink using real pointer drags; every rendered marker must fit afterwards.
  for (const delta of [200, -300]) {
    const box = await handle.boundingBox()
    assert(box)
    await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2 + delta, {
      steps: 15,
    })
    await page.mouse.up()
    await page.waitForTimeout(900)
    const geometry = await page
      .locator('[data-location-candidate]')
      .evaluateAll(nodes =>
        nodes
          .filter(n => n.getAttribute('aria-hidden') !== 'true')
          .map(node => {
            const marker = node.getBoundingClientRect()
            const frame = node.closest('.maplibregl-map')!.getBoundingClientRect()
            return {
              left: marker.left - frame.left,
              top: marker.top - frame.top,
              right: frame.right - marker.right,
              bottom: frame.bottom - marker.bottom,
              height: frame.height,
            }
          }),
      )
    assert(geometry.length >= 20)
    assert(
      geometry.every(
        g => g.left >= -1 && g.top >= -1 && g.right >= -1 && g.bottom >= -1,
      ),
      JSON.stringify(geometry),
    )
    console.log(
      JSON.stringify({
        delta,
        markers: geometry.length,
        height: geometry[0].height,
        allInside: true,
      }),
    )
    await page.screenshot({ path: `${artifacts}/discovery-resize-${delta}.png` })
  }
} finally {
  await browser.close()
}
