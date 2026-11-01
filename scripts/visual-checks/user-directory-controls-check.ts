// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, firefox, webkit } from 'playwright'

const origin = process.env.USER_DIRECTORY_CHECK_URL ?? 'http://127.0.0.1:4173'
const engines = [
  ['chromium', chromium, undefined],
  ['firefox', firefox, undefined],
  ['webkit', webkit, process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE],
] as const

for (const [name, engine, executablePath] of engines) {
  const browser = await engine.launch({ executablePath })
  try {
    for (const width of [1280, 600, 420, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 400 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__user-controls.html', route => route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="hype-black"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/userDirectoryControlsCheck.ts"></script></body></html>',
      }))
      await page.goto(`${origin}/__user-controls.html`)
      // Keyboard opening also exercises a narrow row before its filter menu collapses.
      await page.getByRole('button', { name: 'Sort', exact: true }).focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(450)
      const boxes = await page.locator(
        '.bits-resource-sort__controls-wrap, .bits-resource-sort__direction, .bits-resource-sort__direction svg, [aria-label="Results: 1689"]',
      ).evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect()
        return { left: box.left, right: box.right, width: box.width, height: box.height }
      }))
      const [controls, direction, icon, count] = boxes
      assert(direction.width >= direction.height - 1, 'Direction button must retain its square size')
      assert(icon.left >= controls.left && icon.right <= controls.right, 'Direction icon must not be clipped')
      assert(direction.right <= count.left, 'Direction and result count must not overlap')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow')
      await page.getByRole('button', { name: 'Field', exact: true }).focus()
      await page.keyboard.press('Tab')
      assert(await page.getByRole('button', { name: 'asc', exact: true }).evaluate(element => element === document.activeElement))
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => document.querySelector('[aria-label="Sort state"]')?.textContent === 'createdAt:desc')
      await page.getByRole('button', { name: 'desc', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('[aria-label="Sort state"]')?.textContent === 'createdAt:asc')
      await page.screenshot({ path: `output/playwright/${name}-user-directory-sort-${width}.png` })
      await page.getByRole('button', { name: 'Sort By', exact: true }).click()
      await page.getByRole('button', { name: 'Filter By', exact: true }).waitFor({ state: 'visible' })
      assert.deepEqual(errors, [])
      console.log(`${name} ${width}px: arrow visible, no overlap, keyboard and pointer direction toggles pass`)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
