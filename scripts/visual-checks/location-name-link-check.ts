// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const origin = process.argv[2] ?? 'http://127.0.0.1:4173'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    for (const width of [1600, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      // Hold the association response until the toolbar has measured its loading state.
      let delayed = 0
      await page.route('**/_app/remote/**', async route => {
        if (/getFeatureLocation(?:[/?]|$)/.test(route.request().url())) {
          delayed++
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
        await route.continue()
      })
      await page.goto(`${origin}/admin/features/aMRx8c31zdlq#location`)
      const link = page.locator('[data-location-widget] a').first()
      await link.waitFor({ state: 'visible', timeout: 60000 }).catch(async error => {
        console.log(
          page.url(),
          (await page.locator('body').textContent())?.slice(-4000),
        )
        throw error
      })
      await page.waitForFunction(() => {
        const link = document.querySelector('[data-location-widget] a')
        if (!link) return false
        const box = link.getBoundingClientRect()
        return [box.left + 4, box.left + box.width / 2, box.right - 4].every(x =>
          link.contains(document.elementFromPoint(x, box.top + box.height / 2)),
        )
      })
      const href = await link.getAttribute('href')
      assert.equal(href, '/admin/locations/4tcy3iR9yBt4')
      const box = await link.boundingBox()
      assert.ok(box)
      await link.click({ position: { x: box.width - 4, y: box.height / 2 } })
      await page.waitForURL(`${origin}${href}`)
      await page
        .getByRole('heading', { name: 'Address', exact: true })
        .first()
        .waitFor()
      console.log(
        `${name} ${width}px: full name receives clicks; Location opened (delayed requests: ${delayed})`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
