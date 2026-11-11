// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const featureId = process.env.HYPE_TEST_FEATURE_ID
if (!featureId) throw Error('Set HYPE_TEST_FEATURE_ID to a linked local Feature')
if (!['127.0.0.1', 'localhost', 'hype.localhost'].includes(new URL(origin).hostname))
  throw Error('Local origins only')
const output = 'output/playwright/location-field-modes'
await mkdir(output, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    for (const width of [1200, 1920]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      await page.goto(`${origin}/admin/features/${encodeURIComponent(featureId)}`)
      await page
        .locator('header')
        .getByRole('button', { name: 'Location', exact: true })
        .first()
        .click()
      await page
        .locator('header')
        .getByRole('button', { name: 'Edit', exact: true })
        .first()
        .click()
      const phone = page.getByLabel('Phone edits', { exact: true })
      await phone.waitFor()
      await phone.selectOption('community')
      const modes = JSON.parse(
        await page.locator('input[name^="data.locationFieldModes"]').inputValue(),
      )
      if (modes.phoneNumber !== 'community')
        throw Error('Missing serialized field choice')
      for (const label of [
        'Names edits',
        'Phone edits',
        'Brands edits',
        'Address edits',
      ]) {
        const control = page.getByLabel(label, { exact: true })
        const box = await control.boundingBox()
        if (!box || box.x < 0 || box.x + box.width > width)
          throw Error(`${label} clipped at ${width}`)
      }
      await page
        .locator('[data-draft-location-name]')
        .locator('button:enabled')
        .first()
        .click()
      await page
        .getByRole('textbox', { name: 'Name', exact: true })
        .fill('Community name check')
      const names = JSON.parse(
        await page.locator('input[name^="data.locationNames"]').inputValue(),
      )
      if (names.en !== 'Community name check') throw Error('Linked name missing')
      await phone.focus()
      await page.screenshot({ path: `${output}/${name}-${width}.png` })
      let submitted = ''
      await page.route('**/*', async route => {
        if (route.request().method() === 'POST') {
          submitted += route.request().postData() ?? ''
          await route.abort()
        } else await route.continue()
      })
      await page
        .locator('header')
        .getByRole('button', { name: 'Save', exact: true })
        .first()
        .click()
      await page.waitForTimeout(1500)
      if (
        !submitted.includes('locationFieldModes') ||
        !submitted.includes('community') ||
        !submitted.includes('locationNames')
      )
        throw Error('Submission missing field modes or linked names')
      console.log(
        `${name} ${width}: controls visible, Community serialized and present in intercepted submission`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
