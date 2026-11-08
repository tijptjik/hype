// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://localhost:5175'
await mkdir('output/playwright', { recursive: true })
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]] as const) {
  const browser = await engine.launch({ headless: true, ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}) })
  try {
    for (const type of ['standard', 'portal-band', 'breadline']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      let selectedRenderer = false
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      // Exercise each actual renderer with the same public feature; do not mutate saved styles.
      await page.route('**/src/lib/features/cardType.ts*', route => {
        selectedRenderer = true
        return route.fulfill({ contentType: 'text/javascript', body: `export const FEATURE_CARD_TYPES=['standard','portal-band','breadline'];export function resolveFeatureCardType(){return ${JSON.stringify(type)}}` })
      })
      await page.goto(`${origin}/features/06mgoWo87jHo`, { waitUntil: 'domcontentloaded' })
      const share = page.getByRole('button', { name: 'Share', exact: true })
      await share.waitFor({ timeout: 90000 })
      assert(selectedRenderer, 'Renderer override must be exercised')
      if (type === 'portal-band') await page.locator('[data-card-type="portal-band"]').waitFor()
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
        await page.waitForTimeout(350)
        for (const control of [share, page.getByRole('button', { name: 'Feature actions', exact: true })]) {
          assert(await control.evaluate(element => {
            const rect = element.getBoundingClientRect()
            return rect.width >= 44 && rect.height >= 44 && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
          }), `${name}/${type}/${width}: toolbar control must be reachable`)
        }
        await share.click()
        assert.equal(await page.getByRole('menuitem').count(), 4)
        await page.getByRole('menuitem').last().click()
        await page.getByRole('link', { name: 'Facebook', exact: true }).waitFor()
        await page.waitForFunction(() => document.activeElement?.id === 'feature-share-heading')
        await page.waitForTimeout(350)
        const bounds = await page.getByRole('heading', { name: /Share/ }).evaluate(element => {
          const section = element.closest('section')!
          return { client: section.clientHeight, scroll: section.scrollHeight }
        })
        assert(bounds.scroll <= bounds.client + 1, `${name}/${type}/${width}: all default sharing actions must fit without inner scrolling`)
        await page.getByRole('button', { name: 'Instagram', exact: true }).click()
        const copy = page.getByRole('button', { name: 'Copy caption and link', exact: true })
        await copy.scrollIntoViewIfNeeded()
        assert(await copy.evaluate(element => {
          const rect = element.getBoundingClientRect()
          return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
        }), `${name}/${type}/${width}: sharing target must not be clipped`)
        await page.screenshot({ path: `output/playwright/sharing-${name}-${type}-${width}.png` })
        await page.getByRole('button', { name: 'Back to photos', exact: true }).click()
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'feature-share-trigger')
      }
      assert.deepEqual(errors, [])
      console.log(`${name}/${type}: mobile and desktop toolbar, four scopes, sharing panel and focus passed`)
      await page.close()
    }
  } finally { await browser.close() }
}
