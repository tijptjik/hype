// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// BROWSER
import { chromium } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
if (!origin || !artifacts) throw new Error('Run through dev-remote --port PORT chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1568, height: 1100 } })
  page.setDefaultTimeout(60000)
  await page.goto(`${origin}/admin`, { waitUntil: 'load' })
  const sessionResponse = await page.request.get(`${origin}/api/auth/get-session`)
  const session = await sessionResponse.json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  assert(new URL(page.url()).pathname.startsWith('/admin'))
  await page.goto(`${origin}/admin/features/new#location`, {
    waitUntil: 'domcontentloaded',
  })
  await page
    .getByRole('button', { name: 'HKFoodWorks Breadline Donors', exact: true })
    .click()
  await page.waitForTimeout(2000)
  for (const name of [/^Place(?:\s|$)/, /^Donor(?:\s|$)/, /^Establishment(?:\s|$)/]) {
    const choice = page.getByRole('button', { name }).first()
    if (await choice.isVisible()) {
      await choice.click()
      await page.waitForTimeout(500)
    }
  }
  await page.screenshot({ path: `${artifacts}/setup.png` })
  await page
    .getByRole('textbox', {
      name: 'Search for a Business, Venue, Building, or Address',
      exact: true,
    })
    .fill('Sheung Wan')
  await page.locator('[data-result-source="saanseoi"]').first().waitFor()
  // Recreate the map with a retained selection, which previously skipped its resize handler.
  await page.locator('[data-result-id]').first().click()
  await page.locator('[data-result-actions]').waitFor()
  const stamp = page.locator('[data-result-actions] + [data-result-source]')
  const actionBox = await page.locator('[data-result-actions]').boundingBox()
  const stampBox = await stamp.boundingBox()
  assert(actionBox && stampBox)
  assert.equal(Math.round(stampBox.x - actionBox.x - actionBox.width), 20)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-result-actions]').waitFor()
  await page.locator('[data-location-candidate]').first().waitFor()
  const handle = page.getByRole('separator', { name: /resize map and image section/i })
  await handle.waitFor()
  // Expand then shrink using real pointer drags; every rendered marker must fit afterwards.
  for (const delta of [200, -300]) {
    // Start deliberately zoomed out: mere containment would pass without refitting.
    const mapBox = await page.locator('.maplibregl-map').boundingBox()
    assert(mapBox)
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2)
    await page.mouse.wheel(0, 1100)
    await page.waitForTimeout(900)
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
              width: frame.width,
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
    const horizontalFill =
      1 -
      (Math.min(...geometry.map(g => g.left)) +
        Math.min(...geometry.map(g => g.right))) /
        geometry[0].width
    const verticalFill =
      1 -
      (Math.min(...geometry.map(g => g.top)) +
        Math.min(...geometry.map(g => g.bottom))) /
        geometry[0].height
    assert(
      Math.max(horizontalFill, verticalFill) > 0.55,
      `Markers remain clustered: ${horizontalFill}, ${verticalFill}`,
    )
    console.log(
      JSON.stringify({
        delta,
        markers: geometry.length,
        height: geometry[0].height,
        allInside: true,
        horizontalFill,
        verticalFill,
      }),
    )
    await page.screenshot({ path: `${artifacts}/discovery-resize-${delta}.png` })
  }
} finally {
  await browser.close()
}
