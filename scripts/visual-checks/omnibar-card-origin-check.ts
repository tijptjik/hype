// BROWSER
import { chromium } from 'playwright'
// NODE
import assert from 'node:assert/strict'

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 814, height: 1411 } })
  await page.addInitScript(() => {
    const original = Element.prototype.animate
    Object.assign(window, { cardOpenFrames: [] })
    Element.prototype.animate = function (frames, options) {
      if (this.classList.contains('feature-card-chrome')) {
        const rect = this.getBoundingClientRect()
        ;(window as unknown as { cardOpenFrames: unknown[] }).cardOpenFrames.push({
          frames,
          width: rect.width,
          height: rect.height,
        })
      }
      return original.call(this, frames, options)
    }
  })
  await page.goto(process.env.HYPE_CHECK_ORIGIN ?? 'http://hype.localhost')
  await page.getByPlaceholder('Start your journey...').fill('鐵板世家')
  const result = page.locator('[data-omni-section="feature"] [data-omni-entry]').first()
  await result.waitFor({ timeout: 60000 })
  await result.click()
  await page.waitForFunction(
    () =>
      (window as unknown as { cardOpenFrames: unknown[] }).cardOpenFrames.length > 0,
    null,
    { timeout: 60000 },
  )
  const opening = await page.evaluate(
    () =>
      (
        window as unknown as {
          cardOpenFrames: Array<{
            frames: Array<{ transform: string }>
            width: number
            height: number
          }>
        }
      ).cardOpenFrames[0],
  )
  const scale = /scale\(([^,]+),\s*([^)]+)\)/.exec(opening.frames[0].transform)
  assert.ok(scale, 'Omnibar selection must use the marker FLIP animation')
  const width = Number(scale[1]) * opening.width
  const height = Number(scale[2]) * opening.height
  assert.ok(
    width > 0 && width <= 90 && height > 0 && height <= 90,
    'Opening origin must be marker-sized',
  )
  console.log({
    url: page.url(),
    markerOriginWidth: width,
    markerOriginHeight: height,
    transform: opening.frames[0].transform,
  })
} finally {
  await browser.close()
}
