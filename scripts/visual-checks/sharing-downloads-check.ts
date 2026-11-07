// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import assert from 'node:assert/strict'
// IMAGES
import sharp from 'sharp'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://hype.localhost'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(`${origin}/features/ghsRowTA-AgP`, {
      waitUntil: 'domcontentloaded',
    })
    for (let index = 0; index < 4; index++) {
      await page
        .getByRole('button', { name: 'Share', exact: true })
        .click({ timeout: 90_000 })
      const metadata = page.waitForResponse(
        response =>
          response.url().includes('/api/share/') && !response.url().includes('?'),
      )
      await page.getByRole('menuitem').nth(index).click()
      const resource = (await (await metadata).json()) as { kind: string; id: string }
      const downloaded = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download image', exact: true }).click()
      const download = await downloaded
      assert.equal(await download.failure(), null)
      assert(
        download.suggestedFilename().startsWith(`${resource.kind}-${resource.id}.`),
      )
      const path = await download.path()
      assert(path)
      await sharp(path).raw().toBuffer()
      await page.getByRole('button', { name: 'Downloaded', exact: true }).waitFor()
      assert.equal(
        await page
          .getByRole('button', { name: 'Download failed', exact: true })
          .count(),
        0,
      )
      console.log(name, resource.kind, 'download and decoded image passed')
      await page.getByRole('button', { name: 'Back to photos', exact: true }).click()
    }
  } finally {
    await browser.close()
  }
}
