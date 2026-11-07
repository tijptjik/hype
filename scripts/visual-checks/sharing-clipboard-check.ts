// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import assert from 'node:assert/strict'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://hype.localhost'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.addInitScript(() => {
      // Exercise actual browser copy with the async API denied, rather than mocking success.
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new DOMException('Denied', 'NotAllowedError')
          },
        },
      })
      document.addEventListener('copy', () => {
        const active = document.activeElement
        if (active instanceof HTMLTextAreaElement)
          document.documentElement.dataset.copiedText = active.value
      })
    })
    await page.goto(`${origin}/features/ghsRowTA-AgP`, {
      waitUntil: 'domcontentloaded',
    })
    await page
      .getByRole('button', { name: 'Share', exact: true })
      .click({ timeout: 90_000 })
    await page.getByRole('menuitem').last().click()
    const copy = page.getByRole('button', { name: 'Copy link', exact: true })
    await copy.click()
    await page.getByRole('button', { name: 'Link copied', exact: true }).waitFor()
    assert.equal(
      await page.locator('html').getAttribute('data-copied-text'),
      `${origin}/features/ghsRowTA-AgP`,
    )
    assert(
      await page
        .getByRole('button', { name: 'Link copied', exact: true })
        .evaluate(element => element === document.activeElement),
    )
    assert.equal(await page.locator('textarea').count(), 0)
    await copy.waitFor()
    // A browser rejecting both mechanisms must still show failure.
    await page.evaluate(() => {
      document.execCommand = () => false
    })
    await copy.click()
    await page.getByText('Sharing failed. Please try again.', { exact: true }).waitFor()
    assert.equal(await page.locator('textarea').count(), 0)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download image', exact: true }).click()
    const file = await download
    assert.equal(await file.failure(), null)
    assert.equal(file.suggestedFilename(), 'feature-ghsRowTA-AgP.jpg')
    console.log(
      `${name}: clipboard fallback, focus restoration, denied-copy feedback and image download passed`,
    )
  } finally {
    await browser.close()
  }
}
