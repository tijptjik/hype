// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
const origin = 'http://127.0.0.1:4184'
await mkdir('output/playwright/identity-catalogue', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
    await page.routeWebSocket('**/*', () => {})
    await page.goto(`${origin}/admin/catalogue`)
    await page
      .getByRole('button', { name: 'Link imported brands', exact: true })
      .waitFor()
    if (name === 'chromium') {
      await page
        .getByRole('button', { name: 'Link imported brands', exact: true })
        .click()
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('button')].some(
            button =>
              button.textContent?.trim() === 'Link imported brands' && !button.disabled,
          ) &&
          [...document.querySelectorAll('[role="status"]')].some(node =>
            node.textContent?.includes('inspected'),
          ),
        null,
        { timeout: 180000 },
      )
      if (
        (await page.getByRole('status').allTextContents()).some(
          text => text.includes('inspected') && !/0 need retry/.test(text),
        )
      )
        throw Error('Brand backfill had failures')
    }
    await page.getByLabel('Search', { exact: true }).fill('AROME')
    await page.getByRole('button', { name: 'Arome', exact: true }).click()
    const before = await page
      .getByRole('textbox', { name: 'Name · en', exact: true })
      .inputValue()
    if (before !== 'Arome') throw Error('Imported brand name missing')
    for (const locale of ['en', 'zh-Hant', 'zh-Hans'])
      await page
        .getByRole('textbox', { name: `Name · ${locale}`, exact: true })
        .waitFor()
    if (name === 'chromium') {
      await page
        .getByRole('button', { name: 'Save catalogue record', exact: true })
        .click()
      await page.getByText('Catalogue saved', { exact: true }).waitFor()
    }
    if (name === 'chromium') {
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 8
        canvas.getContext('2d')!.fillRect(0, 0, 8, 8)
        return canvas.toDataURL('image/png').split(',')[1]
      })
      await page.getByLabel('Upload logo', { exact: true }).setInputFiles({
        name: 'local-test-logo.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
      })
      await page.waitForFunction(() => {
        const logo = document.querySelector(
          'img[alt="Catalogue logo"]',
        ) as HTMLImageElement | null
        return logo?.complete && logo.naturalWidth === 8
      })
      // Upload is a draft; reselecting the saved record leaves its original logo unchanged.
      await page.getByRole('button', { name: 'Arome', exact: true }).click()
    }
    await page.screenshot({
      path: `output/playwright/identity-catalogue/${name}.png`,
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({
      path: `output/playwright/identity-catalogue/${name}-narrow.png`,
      fullPage: true,
    })
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw Error('Catalogue overflows narrow viewport')
    console.log(
      `${name}: authenticated catalogue, imported localized names and editing load`,
    )
  } finally {
    await browser.close()
  }
}
