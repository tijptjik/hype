// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1360, 390, 320]) {
      for (const reducedMotion of ['no-preference', 'reduce'] as const) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion,
        })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.route('**/src/tests/fixtures/fieldEditorCheck.ts', async route => {
          const response = await route.fetch()
          const body = (await response.text()).replace(
            'fieldCount:',
            'panelPadding: true, fieldCount:',
          )
          await route.fulfill({ response, body })
        })
        await page.route('**/__edit-mode.html', route =>
          route.fulfill({
            contentType: 'text/html',
            body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/fieldEditorCheck.ts"></script></body></html>',
          }),
        )
        await page.goto(`${origin}/__edit-mode.html`)
        await page.locator('[data-property-editor]').first().waitFor()
        await page
          .getByRole('combobox', { name: 'Component', exact: true })
          .first()
          .click()
        await page.getByRole('option', { name: 'Text input', exact: true }).click()
        await page.mouse.move(0, 0)
        await page.waitForTimeout(250)
        const settings = page.locator('[data-property-settings]').first()
        const before = await settings.boundingBox()
        const newButton = page.getByRole('button', {
          name: 'New',
          exact: true,
          includeHidden: true,
        })
        const newSlot = newButton.locator('xpath=ancestor::*[@aria-hidden][1]')
        const actionSlot = page
          .locator('.bits-project-fields__actions')
          .locator('xpath=ancestor::*[@aria-hidden][1]')
        assert.ok((await actionSlot.boundingBox())!.width > 0)
        const header = page.locator('.bits-form__section-header').first()
        const headerBefore = await header.boundingBox()
        await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
        assert.equal(await newSlot.getAttribute('inert'), '')
        await page.waitForTimeout(250)
        assert.equal(
          await newSlot.evaluate(element => getComputedStyle(element).opacity),
          '0',
        )
        assert.ok(
          (await actionSlot.boundingBox())!.width < 1,
          'Edit actions do not collapse horizontally',
        )
        const after = await settings.boundingBox()
        assert.ok(
          Math.abs(before!.y - after!.y) < 1,
          'Settings jump when leaving edit mode',
        )
        assert.ok(
          Math.abs(headerBefore!.height - (await header.boundingBox())!.height) < 1,
          'Header changes height',
        )
        await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
        await page.waitForTimeout(250)
        assert.equal(
          await newSlot.evaluate(element => getComputedStyle(element).opacity),
          '1',
        )
        assert.ok(
          Math.abs(before!.y - (await settings.boundingBox())!.y) < 1,
          'Settings jump when entering edit mode',
        )
        assert.equal(
          await settings
            .locator('.bits-form__select-trigger')
            .nth(1)
            .evaluate(element => getComputedStyle(element).backgroundColor),
          'rgba(0, 0, 0, 0)',
        )
        assert.deepEqual(errors, [])
        console.log(
          `${name} ${width}px ${reducedMotion}: edit/view geometry, New fade, inert controls and neutral selects passed`,
        )
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}
