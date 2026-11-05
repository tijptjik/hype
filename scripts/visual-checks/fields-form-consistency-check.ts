// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/fields-form-consistency'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const theme of ['hype-dark', 'breadline-light']) {
      for (const width of [1360, 390]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: 'reduce',
        })
        page.setDefaultTimeout(15000)
        const errors: string[] = []
        page.on('pageerror', error => {
          errors.push(error.message)
          console.log('BROWSER ERROR', error.stack)
        })
        await page.route('**/__fields-form-consistency.html', route =>
          route.fulfill({
            contentType: 'text/html',
            body: `<html lang="en" data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/descriptorProfileCheck.ts"></script></body></html>`,
          }),
        )
        await page.goto('http://127.0.0.1:4173/__fields-form-consistency.html')
        await page.getByRole('button', { name: 'Hub profile', exact: true }).click()
        await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
        await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
        const profileBar = page
          .locator('[data-profile-field="name"] [data-profile-sources]')
          .first()
        const profileStyle = await profileBar.evaluate(element => {
          const style = getComputedStyle(element)
          return [style.fontSize, style.fontWeight, style.color, style.gap]
        })
        await page.getByRole('button', { name: 'Fields tab', exact: true }).click()
        assert.equal(
          await page
            .getByRole('button', { name: 'Multilingual', exact: true })
            .getAttribute('aria-expanded'),
          'true',
        )
        const editor = page.locator('[data-property-editor]').first()
        const fieldBar = editor.locator(
          '[data-property-text-column="label"] [data-profile-sources]',
        )
        assert.match(await fieldBar.innerText(), /Translate from/)
        assert.equal(await fieldBar.locator('button').first().innerText(), 'English')
        assert.deepEqual(
          await fieldBar.evaluate(element => {
            const style = getComputedStyle(element)
            return [style.fontSize, style.fontWeight, style.color, style.gap]
          }),
          profileStyle,
        )
        const option = editor.locator('[data-dnd-item]').first()
        const optionTranslations = option.locator('[data-option-translations]')
        await option.scrollIntoViewIfNeeded()
        await page.mouse.move(0, 0)
        await page.waitForFunction(
          () =>
            getComputedStyle(document.querySelector('[data-option-translations]')!)
              .opacity === '0',
        )
        const normalBox = await option.boundingBox()
        await option.hover()
        await page.waitForFunction(
          () =>
            getComputedStyle(document.querySelector('[data-option-translations]')!)
              .opacity === '1',
        )
        assert.deepEqual(
          await option.boundingBox(),
          normalBox,
          'Hover must preserve card geometry',
        )
        await page.mouse.move(0, 0)
        await optionTranslations.locator('button').first().focus()
        await page.waitForFunction(
          () =>
            getComputedStyle(document.querySelector('[data-option-translations]')!)
              .opacity === '1',
        )
        await editor.locator('[data-property-value-action="remove-toggle"]').click()
        assert.equal(await editor.locator('[data-option-translations]').count(), 0)
        await option.screenshot({
          path: `${directory}/${name}-${theme}-${width}-deletion.png`,
        })
        await editor.locator('[data-property-value-action="remove-toggle"]').click()
        await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
        await page.getByRole('button', { name: 'Profile tab', exact: true }).click()
        assert.equal(
          await page
            .getByRole('button', { name: 'Multilingual', exact: true })
            .getAttribute('aria-expanded'),
          'false',
        )
        await page.getByRole('button', { name: 'Policies tab', exact: true }).click()
        assert.equal(
          await page
            .getByRole('button', { name: 'Multilingual', exact: true })
            .getAttribute('aria-expanded'),
          'false',
        )
        await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
        await page.getByRole('button', { name: 'Fields tab', exact: true }).click()
        assert.equal(
          await page
            .getByRole('button', { name: 'Multilingual', exact: true })
            .getAttribute('aria-expanded'),
          'true',
        )
        await page.getByRole('button', { name: 'Collapse', exact: true }).click()
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.bits-project-field-card__body')].every(
            element => element.getBoundingClientRect().height === 0,
          ),
        )
        const zones = page.locator('[data-property-drop-zone]')
        const target = zones.nth(2)
        await target.scrollIntoViewIfNeeded()
        const grip = await zones
          .first()
          .locator('[data-property-drag-handle]')
          .boundingBox()
        const targetCard = target.locator('article').first()
        const targetBox = await targetCard.boundingBox()
        const previousBox = await zones.nth(1).locator('article').first().boundingBox()
        const normalStyle = await targetCard.evaluate(element => {
          const style = getComputedStyle(element)
          return [
            style.backgroundColor,
            style.borderColor,
            style.boxShadow,
            style.outlineStyle,
          ]
        })
        assert(grip && targetBox && previousBox)
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
        await page.mouse.down()
        await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 5, {
          steps: 8,
        })
        // Native HTML5 drags need a dragover after the target's initial dragenter.
        await page.mouse.move(targetBox.x + targetBox.width / 2 + 1, targetBox.y + 6)
        const indicator = page.locator('[data-property-drop-indicator]')
        await indicator.waitFor().catch(async error => {
          console.log('marker count', await indicator.count())
          console.log(
            await zones.evaluateAll(elements =>
              elements.map(element => ({
                class: element.className,
                active: element.getAttribute('data-dnd-active'),
                box: element.getBoundingClientRect().toJSON(),
              })),
            ),
          )
          await page.screenshot({
            path: `${directory}/${name}-${theme}-${width}-failed-drag.png`,
          })
          throw error
        })
        const line = await indicator.boundingBox()
        const previousBottom = previousBox.y + previousBox.height
        const gapCentre = (previousBottom + targetBox.y) / 2
        await page.screenshot({
          path: `${directory}/${name}-${theme}-${width}-property-gap.png`,
        })
        assert(
          line && Math.abs(line.y + line.height / 2 - gapCentre) < 1,
          `Property gap geometry: ${JSON.stringify({ line, gapCentre, targetBox, previousBox })}`,
        )
        assert(
          line.y > previousBottom && line.y + line.height < targetBox.y,
          'Property marker must not touch either card',
        )
        assert.deepEqual(
          await targetCard.evaluate(element => {
            const style = getComputedStyle(element)
            return [
              style.backgroundColor,
              style.borderColor,
              style.boxShadow,
              style.outlineStyle,
            ]
          }),
          normalStyle,
        )
        assert.equal(
          await target.evaluate(element => getComputedStyle(element).boxShadow),
          'none',
        )
        await page.screenshot({
          path: `${directory}/${name}-${theme}-${width}-property-gap.png`,
        })
        await page.mouse.move(targetBox.x + targetBox.width / 2, gapCentre)
        await page.mouse.move(targetBox.x + targetBox.width / 2 + 1, gapCentre)
        await page.mouse.up()
        await page.waitForFunction(
          () =>
            document
              .querySelectorAll('[data-property-drop-zone]')[1]
              ?.getAttribute('data-property-drop-zone') === 'religion',
        )
        assert.equal(await page.locator('[data-property-drop-indicator]').count(), 0)
        assert.deepEqual(errors, [])
        console.log(
          `${name} ${theme} ${width}px: shared multilingual state, Profile translation styles, hover/focus, deletion mode and gap-only property reorder passed`,
        )
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}
