// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, type Page } from 'playwright'

const directory = 'output/playwright/field-options-wrap'
await mkdir(directory, { recursive: true })

/** Read option order from the fixture's registered form state.
 * @param page Fields fixture page.
 * @returns Stable option IDs in the current form order.
 */
async function optionIds(page: Page): Promise<string[]> {
  const state = await page
    .locator('[data-property-state]')
    .getAttribute('data-property-state')
  return JSON.parse(state!).properties[0].values.map(
    (value: { id: string }) => value.id,
  )
}

for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1360, 700, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'no-preference',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__field-options-wrap.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/fieldOptionsPanelCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__field-options-wrap.html')
      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      const grid = page.locator('[data-property-options-grid]')
      const cards = grid.locator('[data-dnd-item]')
      await cards.first().waitFor()
      const boxes = await cards.evaluateAll(elements =>
        elements.map(element => {
          const box = element.getBoundingClientRect()
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            right: box.right,
            bottom: box.bottom,
          }
        }),
      )
      const columns = boxes.filter(box => Math.abs(box.y - boxes[0].y) < 1).length
      assert(columns < boxes.length, 'Cards should wrap into multiple rows')
      if (width === 390) assert.equal(columns, 1)
      else assert(columns > 1)
      assert.equal(
        await grid.evaluate(element => element.scrollWidth > element.clientWidth),
        false,
      )
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
      const rule = await cards.first().locator('[data-option-header]').boundingBox()
      assert(Math.abs(rule!.x - boxes[0].x - 1) < 1)
      assert(
        Math.abs(rule!.width - boxes[0].width + 2) < 1,
        'Separator must meet both inner card edges',
      )
      const localeRows = await cards.evaluateAll(elements =>
        elements
          .slice(0, 3)
          .map(element =>
            [...element.querySelectorAll('[data-option-locale]')].map(
              row => row.getBoundingClientRect().top,
            ),
          ),
      )
      for (let index = 1; index < Math.min(columns, 3); index++)
        assert.deepEqual(
          localeRows[index],
          localeRows[0],
          'Locale tracks should align within each visual row',
        )
      await grid.screenshot({ path: `${directory}/${name}-${width}-wrapped.png` })

      // Hover and keyboard focus reveal translation actions without changing card geometry.
      const translationActions = cards.first().locator('[data-option-translations]')
      await page.mouse.move(0, 0)
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector('[data-option-translations]')!)
            .opacity === '0',
      )
      await cards.first().hover()
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector('[data-option-translations]')!)
            .opacity === '1',
      )
      await page.mouse.move(0, 0)
      await translationActions.locator('button').first().focus()
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector('[data-option-translations]')!)
            .opacity === '1',
      )
      await page.locator('[data-property-value-action="remove-toggle"]').click()
      assert.equal(
        await cards.locator('[data-option-translations]').count(),
        0,
        'Deletion mode must remove translation controls',
      )
      await page.locator('[data-property-value-action="remove-toggle"]').click()

      // Capture native animations to distinguish FLIP from an instantaneous DOM reorder.
      await page.evaluate(() => {
        const original = Element.prototype.animate
        const records: number[] = []
        ;(window as unknown as { optionFlipDurations: number[] }).optionFlipDurations =
          records
        Element.prototype.animate = function (
          ...args: Parameters<Element['animate']>
        ): Animation {
          const animation = original.apply(this, args)
          if (
            this.parentElement?.parentElement?.matches('[data-property-options-grid]')
          )
            records.push(Number(animation.effect!.getTiming().duration))
          return animation
        }
      })
      const handle = cards.first().locator('[data-option-drag-handle]')
      await handle.focus()
      await handle.press('Alt+ArrowRight')
      await page.waitForFunction(() => {
        const data = document
          .querySelector('[data-property-state]')!
          .getAttribute('data-property-state')!
        return JSON.parse(data).properties[0].values[1].id === 'option-0'
      })
      await page.waitForFunction(() =>
        (
          window as unknown as { optionFlipDurations: number[] }
        ).optionFlipDurations.some(duration => duration > 0),
      )
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every(
            animation =>
              !(animation.effect instanceof KeyframeEffect) ||
              !animation.effect.target?.closest('[data-property-options-grid]'),
          ),
      )

      // Drop markers stay horizontal in the padding and never change or intersect a card.
      const before = await optionIds(page)
      await cards.nth(columns).scrollIntoViewIfNeeded()
      const grip = await handle.boundingBox()
      const targetCard = cards.nth(columns)
      const target = await targetCard.boundingBox()
      const targetStyle = await targetCard.evaluate(element => {
        const style = getComputedStyle(element)
        return [
          style.borderColor,
          style.backgroundColor,
          style.boxShadow,
          style.outlineStyle,
        ]
      })
      assert(grip && target)
      await page.mouse.move(grip.x + grip.width / 2, grip.y + 8)
      await page.mouse.down()
      // A side approach still advertises a horizontal slot above the card.
      await page.mouse.move(target.x + 4, target.y + target.height / 2, { steps: 10 })
      const beforeMarker = page.locator('[data-option-drop-indicator="before"]')
      await beforeMarker.waitFor()
      const leading = await beforeMarker.boundingBox()
      assert(
        leading &&
          leading.width > leading.height &&
          leading.y + leading.height < target.y,
      )
      await page.mouse.move(target.x + target.width / 2, target.y + target.height - 6, {
        steps: 10,
      })
      const indicator = page.locator('[data-option-drop-indicator="after"]')
      await indicator.waitFor()
      const edge = await indicator.boundingBox()
      await page.screenshot({ path: `${directory}/${name}-${width}-drop.png` })
      assert(
        edge && edge.width > edge.height && edge.y > target.y + target.height,
        'The horizontal marker must remain below the target card',
      )
      const intersections = await cards.evaluateAll(
        (elements, marker) =>
          elements.filter(element => {
            const box = element.getBoundingClientRect()
            return (
              marker.x < box.right &&
              marker.x + marker.width > box.left &&
              marker.y < box.bottom &&
              marker.y + marker.height > box.top
            )
          }).length,
        edge!,
      )
      assert.equal(intersections, 0, 'Insertion markers must not touch any card')
      assert.deepEqual(
        await targetCard.evaluate(element => {
          const style = getComputedStyle(element)
          return [
            style.borderColor,
            style.backgroundColor,
            style.boxShadow,
            style.outlineStyle,
          ]
        }),
        targetStyle,
        'The target card must retain its normal appearance',
      )
      // Release in the padding itself, rather than on the card face.
      await page.mouse.move(target.x + target.width / 2, target.y + target.height + 3)
      await indicator.waitFor()
      await page.mouse.up()
      await page.waitForFunction(
        ({ id, index }) => {
          const data = document
            .querySelector('[data-property-state]')!
            .getAttribute('data-property-state')!
          return JSON.parse(data).properties[0].values[index].id === id
        },
        { id: before[0], index: columns },
      )
      await page.locator('[data-option-drag-preview]').waitFor({ state: 'detached' })

      // Reduced motion keeps the same reorder operation but suppresses FLIP travel.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every(
            animation =>
              !(animation.effect instanceof KeyframeEffect) ||
              !animation.effect.target?.closest('[data-property-options-grid]'),
          ),
      )
      await page.evaluate(() => {
        ;(
          window as unknown as { optionFlipDurations: number[] }
        ).optionFlipDurations.length = 0
      })
      const reducedBefore = await optionIds(page)
      await cards.first().locator('[data-option-drag-handle]').press('Alt+ArrowRight')
      await page.waitForFunction(id => {
        const data = document
          .querySelector('[data-property-state]')!
          .getAttribute('data-property-state')!
        return JSON.parse(data).properties[0].values[1].id === id
      }, reducedBefore[0])
      assert.equal(
        await page.evaluate(() =>
          (
            window as unknown as { optionFlipDurations: number[] }
          ).optionFlipDurations.some(duration => duration > 0),
        ),
        false,
      )

      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[data-option-locale="zh-Hant"]')].every(
          element => element.getBoundingClientRect().height < 1,
        ),
      )
      await grid.screenshot({ path: `${directory}/${name}-${width}-collapsed.png` })
      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}px: wrapping, full-width separators, translation hover/focus and deletion mode, row alignment, FLIP, padding-only drop markers, grid drops and reduced motion passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
