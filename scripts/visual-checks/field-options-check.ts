// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/field-options-final'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const [width, height] of [
      [1360, 1000],
      [1360, 600],
      [390, 1000],
      [390, 600],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__field-options.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/fieldOptionsPanelCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__field-options.html')
      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      const first = page.locator('[data-dnd-item]').first()
      const handle = first.locator('[data-option-drag-handle]')
      await handle.evaluate(element =>
        element.scrollIntoView({ block: 'center', inline: 'nearest' }),
      )
      const box = await handle.boundingBox()
      assert(box)
      // The option name and empty header space both belong to the native handle.
      await page.mouse.move(box.x + box.width - 4, box.y + 4)
      await page.mouse.down()
      assert.equal(await first.getAttribute('data-dnd-active'), 'true')
      await page.mouse.up()
      await page.waitForFunction(
        () =>
          document.querySelector('[data-dnd-item]')?.getAttribute('data-dnd-active') !==
          'true',
      )
      const source = first.getByRole('button', {
        name: 'Translate empty values from English',
        exact: true,
      })
      await source.dispatchEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
      })
      assert.equal(await first.getAttribute('data-dnd-active'), 'false')
      const value = page.getByRole('textbox', { name: 'Option 1 zh-Hant', exact: true })
      await value.click()
      assert.equal(await first.getAttribute('data-dnd-active'), 'false')
      await page.keyboard.press('Tab')
      const clear = page.getByRole('button', {
        name: 'Clear Option 1 zh-Hant',
        exact: true,
      })
      await clear.waitFor()
      assert.equal(await clear.getAttribute('data-tooltip'), null)
      assert.equal(await clear.getAttribute('title'), null)
      await page.keyboard.press('Enter')
      assert.equal(await value.textContent(), '')
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Option 1 en', exact: true })
          .textContent(),
        'Christian',
      )
      await handle.focus()
      await page.keyboard.press('Alt+ArrowRight')
      await page.waitForFunction(() => {
        const data = document
          .querySelector('[data-property-state]')
          ?.getAttribute('data-property-state')
        return data && JSON.parse(data).properties[0].values[1].id === 'option-0'
      })
      const facet = page.locator('[data-facet-id="fields"]')
      const clearance = facet.locator('[data-facet-scroll-clearance]')
      assert(
        (await clearance.evaluate(element => element.getBoundingClientRect().height)) >=
          320,
      )
      await facet.evaluate(element => {
        element.scrollTop = element.scrollHeight
      })
      const lastBottom = await page
        .locator('[data-property-options]')
        .evaluate(element => element.getBoundingClientRect().bottom)
      const navTop = await page
        .getByRole('button', { name: 'Previous tab', exact: true })
        .evaluate(element => element.getBoundingClientRect().top)
      const facetBottom = await facet.evaluate(
        element => element.getBoundingClientRect().bottom,
      )
      assert(
        facetBottom - lastBottom >= 319,
        'Final options should scroll at least 320px above the panel bottom',
      )
      assert(
        navTop > lastBottom,
        'Final options should clear the fixed facet navigation',
      )
      await page.screenshot({
        path: `${directory}/${name}-${width}-${height}-bottom-clearance.png`,
      })
      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      await page.waitForFunction(() => {
        const facet = document.querySelector('[data-facet-id="fields"]')
        const options = facet?.querySelector('[data-property-options]')
        if (!facet || !options) return false
        facet.scrollTop = facet.scrollHeight
        return (
          facet.getBoundingClientRect().bottom -
            options.getBoundingClientRect().bottom >=
          319
        )
      })
      await page.screenshot({
        path: `${directory}/${name}-${width}-${height}-collapsed-clearance.png`,
      })
      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}x${height}: expanded/collapsed clearance, full header handle, excluded controls, keyboard reorder/clear and 320px clearance passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
