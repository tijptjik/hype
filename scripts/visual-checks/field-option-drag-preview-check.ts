// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, type Page } from 'playwright'

/** Check option actions remain attached to their heading within the available width.
 * @param page Fields fixture page. @returns Resolves after the proximity check.
 */
async function checkActionProximity(page: Page): Promise<void> {
  const offset = await page.locator('[data-property-options]').evaluate(section => {
    const add = section.querySelector('[data-property-value-action="add"]')
    const remove = section.querySelector('[data-property-value-action="remove-toggle"]')
    if (!add || !remove) throw new Error('Missing option actions')
    const bounds = section.getBoundingClientRect()
    return {
      leading: add.getBoundingClientRect().left - bounds.left,
      trailing: remove.getBoundingClientRect().right - bounds.right,
    }
  })
  assert(
    offset.leading < 100 && offset.trailing <= 1,
    'Actions must stay beside Options and within its bounds',
  )
}

const directory = 'output/playwright/field-option-drag-preview'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1360, 700, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__field-option-preview.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/fieldOptionsPanelCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__field-option-preview.html')
      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      const cards = page.locator('[data-dnd-item]')
      const handle = cards.first().locator('[data-option-drag-handle]')
      await handle.evaluate(element =>
        element.scrollIntoView({ block: 'center', inline: 'nearest' }),
      )
      await checkActionProximity(page)
      await cards.nth(1).scrollIntoViewIfNeeded()
      const sourceBox = await cards.first().boundingBox()
      const grip = await handle.boundingBox()
      assert(sourceBox && grip)
      await page.mouse.move(grip.x + grip.width - 8, grip.y + 8)
      await page.mouse.down()
      await page.mouse.move(grip.x + grip.width + 8, grip.y + 10, { steps: 4 })
      const preview = page.locator('[data-option-drag-preview]')
      await preview.waitFor()
      const target = await cards.nth(1).boundingBox()
      assert(target)
      const pointer = {
        x: target.x + target.width - 5,
        y: target.y + target.height / 2,
      }
      await page.mouse.move(pointer.x, pointer.y, { steps: 8 })
      await page.waitForFunction(({ x, y }) => {
        const preview = document.querySelector('[data-option-drag-preview]')
        if (!preview) return false
        const box = preview.getBoundingClientRect()
        return (
          Math.abs(box.left + box.width / 2 - x) < 1 && Math.abs(box.top - y - 12) < 1
        )
      }, pointer)
      const previewBox = await preview.boundingBox()
      assert(previewBox)
      assert(Math.abs(previewBox.width - sourceBox.width) < 1)
      assert(Math.abs(previewBox.height - sourceBox.height) < 1)
      assert.equal(await preview.locator('input, [name], [form], [id]').count(), 0)
      assert.equal(await preview.locator('[data-dnd-item]').count(), 0)
      assert.equal(await preview.getAttribute('aria-hidden'), null)
      assert.equal(await preview.locator('..').getAttribute('aria-hidden'), 'true')
      await page.locator('[data-option-drop-indicator="after"]').waitFor()
      await checkActionProximity(page)
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      )
      await page.screenshot({ path: `${directory}/${name}-${width}-dragging.png` })
      await page.mouse.up()
      await preview.waitFor({ state: 'detached' })
      await page.waitForFunction(() => {
        const state = document
          .querySelector('[data-property-state]')
          ?.getAttribute('data-property-state')
        return state && JSON.parse(state).properties[0].values[1].id === 'option-0'
      })
      assert.equal(await cards.count(), 7)
      await checkActionProximity(page)
      // Native drag takeover cancels pointer events; its preview must survive until dragend.
      const canceledSource = cards.first()
      const canceledHandle = canceledSource.locator('[data-option-drag-handle]')
      await canceledHandle.evaluate(element =>
        element.scrollIntoView({ block: 'center', inline: 'nearest' }),
      )
      const canceledBox = await canceledHandle.boundingBox()
      assert(canceledBox)
      const start = { x: canceledBox.x + canceledBox.width / 2, y: canceledBox.y + 8 }
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      const transfer = await page.evaluateHandle(() => new DataTransfer())
      await canceledSource.dispatchEvent('dragstart', {
        dataTransfer: transfer,
        clientX: start.x,
        clientY: start.y,
        bubbles: true,
      })
      await preview.waitFor()
      await canceledSource.dispatchEvent('pointercancel', {
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
      })
      assert.equal(await preview.count(), 1)
      await canceledSource.dispatchEvent('dragend', { bubbles: true })
      await preview.waitFor({ state: 'detached' })
      await page.mouse.up()
      await transfer.dispose()
      assert.equal(await cards.count(), 7)
      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}: centred preview, visible target, unchanged form registration, correct drop, native cancellation cleanup and attached option controls passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
