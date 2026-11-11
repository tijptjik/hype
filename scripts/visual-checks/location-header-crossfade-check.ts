import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'
// Run against an authenticated local admin server. Draft edits are reset, never saved.
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Manual check outside Turbo.
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Manual check outside Turbo.
const locationId = process.env.HYPE_TEST_LOCATION_ID ?? '5aX_GWxjoSjr'
assert(['127.0.0.1', 'localhost', 'hype.localhost'].includes(new URL(origin).hostname))
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    for (const width of [1200, 1560]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      await page.goto(`${origin}/admin/locations/${encodeURIComponent(locationId)}`)
      const header = page.locator('header').first()
      await header.getByRole('button', { name: 'Edit', exact: true }).click()
      const field = page.locator('[data-location-locale-field=Branch]')
      await field.getByRole('button').first().click()
      const floor = field.locator('input')
      await floor.fill('Navigation draft')
      await floor.press('Tab')
      await floor.evaluate(el => el.setAttribute('data-proof-retained', 'yes'))
      for (const facet of ['Relationships', 'Profile']) {
        await header.getByRole('button', { name: facet, exact: true }).click()
        await page.waitForTimeout(250)
        assert.equal(
          await page.locator('[role=tabpanel][aria-hidden=true]:not([inert])').count(),
          0,
        )
      }
      assert.equal(await floor.inputValue(), 'Navigation draft')
      assert.equal(await floor.getAttribute('data-proof-retained'), 'yes')
      await page
        .locator('[role=tabpanel]')
        .first()
        .evaluate(el => el.setAttribute('data-proof-panel', 'yes'))
      await header.getByRole('button', { name: 'Reset', exact: true }).click()
      for (const facet of ['Features', 'Profile']) {
        await header.getByRole('button', { name: facet, exact: true }).click()
        await page.waitForTimeout(250)
      }
      assert.equal(await page.locator('[data-proof-panel]').count(), 1)
      await page
        .getByRole('button', { name: 'Filter By', exact: true })
        .waitFor({ state: 'hidden' })
      await page
        .locator('[role=tabpanel][aria-hidden=false]')
        .first()
        .evaluate(el => {
          for (let node = el; node; node = node.parentElement) node.scrollTop = 0
        })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      assert.equal(
        await page
          .locator('[role=tabpanel][aria-hidden=false]')
          .first()
          .evaluate(el => getComputedStyle(el).transitionProperty),
        'none',
      )

      console.log(
        name,
        width,
        'draft retained, hidden panels inert, reduced motion honoured',
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
